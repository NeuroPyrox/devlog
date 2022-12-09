import Heap from "https://cdn.jsdelivr.net/gh/NeuroPyrox/heap/heap.js";
import { nothing } from "./util.js";
import { delayConstructionDuring } from "./lazyConstructors.js";
import { pull } from "./pull.js";

// We create a new instance of [Context] during every [push] so we can garbage collect [eventValues].
class Context {
  #eventValues;
  #behaviorValues;

  constructor() {
    this.#eventValues = new WeakMap();
    this.#behaviorValues = [];
  }

  writeEvent(sink, value) {
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
      sink.setValue(value);
      for (const child of sink.iterateComputedChildren()) {
        heap.push(child);
      }
    }
    for (const { sink } of heap) {
      // The [if] statement guards against [sink]s that appear more than once in [heap].
      if (sink.push()) {
        for (const child of sink.iterateComputedChildren()) {
          // Mutating the heap while iterating over it.
          heap.push(child);
        }
      }
    }
  }
}

const key = Symbol();
export const pure = (value) => ({ [key]: (context) => value });
export const liftPull = (monadicValue) => ({
  [key]: (context) => context.liftPull(monadicValue),
});
export const enqueueBehaviorValue = (sink, value) => ({
  [key]: (context) => context.enqueueBehaviorValue(sink, value),
});

// Delay construction because we don't want to visit newly created reactives.
export const push = (sink, value) =>
  delayConstructionDuring(() => {
    const context = new Context();
    const readEvent = (sink) => context.readEvent(sink);
    context.writeEvent(sink, value);
    const heap = new Heap((a, b) => a.priority < b.priority);
    for (const child of sink.iterateActiveChildren()) {
      heap.push(child);
    }
    for (const { sink } of heap) {
      const value = sink.push(readEvent)[key](context);
      if (value === nothing) {
        continue;
      }
      context.writeEvent(sink, value);
      for (const child of sink.iterateActiveChildren()) {
        // Mutating the heap while iterating over it.
        heap.push(child);
      }
    }
    context.dequeueBehaviorValues();
  });
