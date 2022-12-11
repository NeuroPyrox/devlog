import Heap from "https://cdn.jsdelivr.net/gh/NeuroPyrox/heap/heap.js";
import { nothing } from "./util.js";
import { delayConstructionDuring } from "./lazyConstructors.js";
import { pull } from "./pull.js";

// This is supposed to be an encapsulated sum type for context mutators.
// The encapsulation prevents new types of mutators from being made.
const key = Symbol();
export const pure = (value) => ({ [key]: (context) => value });
export const liftPull = (monadicValue) => ({
  [key]: (context) => context.liftPull(monadicValue),
});
export const enqueueBehaviorValue = (sink, value) => ({
  [key]: (context) => context.enqueueBehaviorValue(sink, value),
});

// We create a new instance of [Context] during every [push] so we can garbage collect [eventValues].
class Context {
  #eventValues;
  #behaviorValues;

  constructor() {
    this.#eventValues = new WeakMap();
    this.#behaviorValues = [];
  }

  writeEvent(sink, value) {
    assert(!this.isWritten(sink));
    // Store an object so that we can differentiate between
    // an unwritten sink and a sink that had [undefined] written to it.
    this.#eventValues.set(sink, { value });
  }

  // Takes [undefined] to mean an unpushable sink.
  readEvent(sink) {
    const value = this.#eventValues.get(sink);
    if (value === undefined) {
      return nothing;
    }
    return value.value;
  }
  
  // We need this instead of [this.readEvent(sink) !== nothing] because
  // we need to avoid visiting a sink twice if it had [nothing] written to it.
  isWritten(sink) {
    return this.#eventValues.get(sink) !== undefined;
  }
  
  doAction(action) {
    return action[key](this);
  }

  // We use "lift" in the name of this method because [Context] resembles a monad.
  // In fact, it used to be a monad before I refactored it.
  liftPull(monadicValue) {
    return pull(monadicValue);
  }

  enqueueBehaviorValue(sink, value) {
    this.#behaviorValues.push([sink, value]);
    return nothing;
  }

  dequeueBehaviorValues() {
    const heap = new Heap((a, b) => a.priority < b.priority);
    for (const [sink, value] of this.#behaviorValues) {
      for (const child of sink.pushValue(value)) {
        heap.push(child);
      }
    }
    for (const { sink } of heap) {
      for (const child of sink.push()) {
        // Mutating the heap while iterating over it.
        heap.push(child);
      }
    }
  }
}

// Delay construction because we don't want to visit newly created reactives.
export const push = (sink, value) =>
  delayConstructionDuring(() => {
    const context = new Context();
    const heap = new Heap((a, b) => a.priority < b.priority);
    for (const child of sink.pushValue(context, value)) {
      heap.push(child);
    }
    for (const { sink } of heap) {
      for (const child of sink.push(context)) {
        // Mutating the heap while iterating over it.
        heap.push(child);
      }
    }
    context.dequeueBehaviorValues();
  });
