import { nothing, createGeneratorMonad, once } from "./util.js";
import {
  lazyConstructor,
  lazyLoop,
  delayConstructionDuring,
} from "./lazyConstructors.js";

import { newEventPair } from "./internals.js"; // Circular dependency

// TODO garbage collection.
const outputs = [];

const context = {
  // TODO update comments
  // To stop the output, call [source.getWeakSink().deref()?.deactivate()].
  // When the return value loses all its references,
  // we assert that the sink is not active,
  // and later the output gets garbage collected.
  // Implementation-wise, there's no need to put this function
  // in the Pull monad, but we do it to make the semantics cleaner
  // and for the ability to control when the output starts.
  output: (parent, handle) =>
    lazyConstructor((parentSource) => {
      const [sink, source] = newEventPair([parentSource], function* (value) {
        lazyConstructor(() => handle(value));
        return nothing;
      });
      sink.activate();
      outputs.push(source); // TODO remove
      return source;
    }, parent),
  loop: lazyLoop,
};

const [runPullMonad, monadicMethod] = createGeneratorMonad();
const output = monadicMethod("output");
const loop = monadicMethod("loop")();

// Only used by [start] and [Combinators.observeE].
const pull = (monadicValue) => runPullMonad(context, monadicValue());
const start = once((monadicValue) =>
  delayConstructionDuring(() => pull(monadicValue))
);

export { output, loop, pull, start };
