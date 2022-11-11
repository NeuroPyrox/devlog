import Heap from "https://cdn.jsdelivr.net/gh/NeuroPyrox/heap/heap.js";
import { nothing, createGeneratorMonad } from "./util.js";
import { delayConstructionDuring } from "./lazyConstructors.js";

import { pull } from "./pull.js"; // Circular dependency

// TODO don't use a monad

// We create a new instance of [Context] during every [push] so we can garbage collect [#eventValues].
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

  readEvent(sink) {
    const value = this.#eventValues.get(sink);
    if (value === undefined) {
      return nothing;
    }
    return value.value;
  }

  liftPull(monadicValue) {
    return pull(monadicValue);
  }

  // TODO make separate PushEvents and PushBehaviors monads
  enqueueBehavior(sink, value) {
    this.#behaviorValues.push([sink, value]);
    return nothing;
  }

  dequeueBehaviorValues() {
    for (const [sink, value] of this.#behaviorValues) {
      sink.setValue(value);
    }
  }
}

const [runPushMonad, monadicMethod] = createGeneratorMonad();
export const readEvent = monadicMethod("readEvent");

const key = Symbol();
export const pure = (value) => ({ [key]: (context) => value });
export const liftPull = (monadicValue) => ({
  [key]: (context) => context.liftPull(monadicValue),
});
export const enqueueBehavior = (sink, value) => ({
  [key]: (context) => context.enqueueBehavior(sink, value),
});

// Delay construction because we don't want to visit newly created reactives.
export const push = (sink, value) =>
  delayConstructionDuring(() => {
    const context = new Context();
    context.writeEvent(sink, value);
    const heap = new Heap((a, b) => a.getPriority() < b.getPriority());
    for (const childSink of sink.iterateActiveChildren()) {
      heap.push(childSink);
    }
    for (const sink of heap) {
      const value = runPushMonad(context, sink.poll())[key](context);
      if (value !== nothing) {
        context.writeEvent(sink, value);
        for (const child of sink.iterateActiveChildren()) {
          // Mutating the heap while iterating over it.
          heap.push(child);
        }
      }
    }
    context.dequeueBehaviorValues();
  });
