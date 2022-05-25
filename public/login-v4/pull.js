import * as Util from "./util.js";
import {
  lazyConstructor,
  lazyLoop,
  delayConstructionDuring,
} from "./lazyConstructors.js";
import {neverSource, newEventPair} from "./internals.js";

// TODO garbage collection.
const outputs = [];

const context = {
  // To stop the output, call [source.getWeakSink().deref()?.deactivate()].
  // When the return value loses all its references,
  // we assert that the sink is not active,
  // and later the output gets garbage collected.
  // Implementation-wise, there's no need to put this function
  // in the Pull monad, but we do it to make the semantics cleaner
  // and for the ability to control when the output starts.
  output: (parent, handle) =>
    lazyConstructor((parentSource) => {
      if (!parentSource.isPushable()) {
        return neverSource;
      }
      const [sink, source] = newEventPair([parentSource], function* (value) {
        lazyConstructor(() => handle(value));
        return Util.nothing;
      });
      sink.activate();
      outputs.push(source); // TODO remove
      return source;
    }, parent),
  loop: lazyLoop,
};
const output = Util.monadicMethod("output");
const loop = Util.monadicMethod("loop")();

// TODO add assertions on lifecycle
// The return value is used by [observeE].
const pullLazy = (monadicValue) => Util.runMonad(context, monadicValue());
// TODO once we implement the html monad, remove the return value.
const pull = delayConstructionDuring(pullLazy);

export { output, loop, pullLazy, pull };