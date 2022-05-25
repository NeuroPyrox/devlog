import Heap from "https://cdn.jsdelivr.net/gh/NeuroPyrox/heap/heap.js";
import { nothing, monadicMethod, runMonad } from "./util.js";
import { delayConstructionDuring } from "./lazyConstructors.js";

import { pullLazy } from "./pull.js"; // Circular dependency

class Context {
  constructor() {
    this._values = new WeakMap();
  }

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
    // TODO have the recent changes made this outdated?
    return pullLazy(monadicValue);
  }

  // TODO make separate PushEvents and PushBehaviors monads
  setBehavior(target, value) {
    throw "Not implemented";
  }
}

const readSink = monadicMethod("readSink");
const liftPull = monadicMethod("liftPull");
const setBehavior = monadicMethod("setBehavior");

const push = delayConstructionDuring((sink, value) => {
  const context = new Context();
  context.writeSink(sink, value);
  const heap = new Heap((a, b) => a.getPriority() < b.getPriority());
  for (const childSink of sink.iterateActiveChildren()) {
    heap.push(childSink);
  }
  // Construction is unsafe while iterating over active children.
  for (const sink of heap) {
    const value = runMonad(context, sink.poll());
    if (value !== nothing) {
      context.writeSink(sink, value);
      for (const child of sink.iterateActiveChildren()) {
        // Mutating the heap while iterating over it.
        heap.push(child);
      }
    }
  }
});

export { readSink, liftPull, setBehavior, push };
