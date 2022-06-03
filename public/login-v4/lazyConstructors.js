import { assert, memoize, unnestable } from "./util.js";

const construct = Symbol();

let constructors = "eager";

const constConstructor = (x) => ({
  [construct]: () => x,
});

// Kind of like an applicative [queueMicrotask],
// but the tasks only get delayed during [delayConstructionDuring].
const lazyConstructor = (f, ...args) => {
  // TODO remove this assertion if needed for behaviors
  assert(constructors !== "constructing");
  args.forEach((arg) => assert(arg[construct]));
  // We allow construction outside of [delayConstructionDuring] to improve garbage collection.
  if (constructors === "eager") {
    return constConstructor(f(...args));
  }
  // The order of composition between [Util.memoize] and [Util.unnestable] doesn't matter,
  // but [Util.memoize(Util.unnestable(...))] seems like it'd be more efficient.
  const result = {
    [construct]: memoize(
      unnestable(() => f(...args.map((arg) => arg[construct]())))
    ),
  };
  constructors.push(result);
  return result;
};

// Unusable outside of [delayConstructionDuring] because you'd need to
// call the [loop] method before passing it to [lazyConstructor].
// We don't need assertions for that because eager evaluation will throw an error.
const lazyLoop = () => {
  // TODO remove this assertion if needed for behaviors
  assert(constructors !== "constructing");
  const result = {
    [construct]: () => {
      throw new Error("Must call [lazyLoop.loop] on every [lazyLoop]!");
    },
  };
  result.loop = (setTo) => {
    assert(setTo[construct]);
    result[construct] = setTo[construct];
  };
  return result;
};

// Only has one callsite, but it's helpful to think of it as a separate function.
const constructAll = () => {
  const temp = constructors;
  constructors = "constructing";
  temp.forEach((constructor) => constructor[construct]());
  constructors = "eager";
};

// Only called on startup and in the [Push] monad.
const delayConstructionDuring = (f) =>
  unnestable((...args) => {
    constructors = [];
    const result = f(...args);
    constructAll();
    return result;
  });

export { constConstructor, lazyConstructor, lazyLoop, delayConstructionDuring };
