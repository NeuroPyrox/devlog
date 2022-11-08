import Heap from "https://cdn.jsdelivr.net/gh/NeuroPyrox/heap/heap.js";
import { nothing, createGeneratorMonad } from "./util.js";
import { delayConstructionDuring } from "./lazyConstructors.js";

import { pull } from "./pull.js"; // Circular dependency

// We create a new instance of [Context] during every [push] so we can garbage collect [_values].
class Context {
  constructor() {
    this._values = new WeakMap();
    this._behaviorValues = [];
  }

  // TODO rename to reflect the fact that this is only for events
  writeSink(sink, value) {
    // Store an object so that we can differentiate between
    // an unwritten sink and a sink that had [undefined] written to it.
    this._values.set(sink, { value });
  }

  readSink(sink) {
    const value = this._values.get(sink);
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
    this._behaviorValues.push([sink, value]);
  }

  dequeueBehaviorValues() {
    for (const [sink, value] of this._behaviorValues) {
      sink.setValue(value);
    }
  }
}

const [runPushMonad, monadicMethod] = createGeneratorMonad();
const readSink = monadicMethod("readSink");
const liftPull = monadicMethod("liftPull");
const enqueueBehavior = monadicMethod("enqueueBehavior");

// Delay construction because we don't want to visit newly created reactives.
const push = (sink, value) =>
  delayConstructionDuring(() => {
    const context = new Context();
    context.writeSink(sink, value);
    const heap = new Heap((a, b) => a.getPriority() < b.getPriority());
    for (const childSink of sink.iterateActiveChildren()) {
      heap.push(childSink);
    }
    for (const sink of heap) {
      const value = runPushMonad(context, sink.poll());
      if (value !== nothing) {
        context.writeSink(sink, value);
        for (const child of sink.iterateActiveChildren()) {
          // Mutating the heap while iterating over it.
          heap.push(child);
        }
      }
    }
    context.dequeueBehaviorValues();
  });

export { readSink, liftPull, enqueueBehavior, push };
