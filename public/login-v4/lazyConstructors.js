import * as Util from "./util.js";

const construct = Symbol();

let constructors = "eager";

const constConstructor = (x) => ({
  [construct]: () => x,
});

// Kind of like [queueMicrotask], but the tasks only get delayed during [delayConstructionDuring].
const lazyConstructor = (f, ...args) => {
  Util.assert(constructors !== "constructing");
  args.forEach((arg) => Util.assert(arg[construct], arg));
  // We allow construction outside of [delayConstructionDuring] to improve garbage collection.
  if (constructors === "eager") {
    return constConstructor(f(...args));
  }
  // The order of composition between [Util.memoize] and [Util.unnestable] doesn't matter,
  // but [Util.memoize(Util.unnestable(...))] seems like it'd be more efficient.
  const result = {
    [construct]: Util.memoize(
      Util.unnestable(() => f(...args.map((arg) => arg[construct]())))
    ),
  };
  constructors.push(result);
  return result;
};

const lazyLoop = () => {
  Util.assert(constructors !== "constructing");
  Util.assert(constructors !== "eager");
  const result = {
    [construct]: () => {
      throw new Error("Must call [loop.loop] on every [loop]!");
    },
  };
  result.loop = (setTo) => {
    Util.assert(setTo[construct]);
    result[construct] = setTo[construct];
  };
  return result;
};

// Only has one callsite, but we make it a separate function so we can refer to it in comments.
const constructAll = () => {
  const temp = constructors;
  constructors = "constructing";
  temp.forEach((constructor) => constructor[construct]());
  constructors = "eager";
};

// TODO assertions on lifecycle
// Only called on startup and in the [Push] monad.
const delayConstructionDuring =
  (f) =>
  (...args) => {
    constructors = [];
    const result = f(...args);
    constructAll();
    return result;
  };

export { constConstructor, lazyConstructor, lazyLoop, delayConstructionDuring };
