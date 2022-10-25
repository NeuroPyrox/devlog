import { assert, memoize, unnestable } from "./util.js";

const construct = Symbol();

let state = "eager";

let constructors = [];

const constConstructor = (x) => ({
  [construct]: () => x,
});

// Kind of like an applicative [queueMicrotask],
// but the tasks only get delayed during [delayConstructionDuring].
const lazyConstructor = (f, ...args) => {
  // TODO remove this assertion if needed for behaviors
  assert(state !== "constructing");
  args.forEach((arg) => assert(arg[construct]));
  // We allow construction outside of [delayConstructionDuring] to improve garbage collection.
  if (state === "eager") {
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
  assert(state !== "constructing");
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
  state = "constructing";
  constructors.forEach((constructor) => constructor[construct]());
  constructors = [];
  state = "eager";
};

// TODO remove return value when we have an html monad.
// Only called on startup and wrapping the [Push] monad.
// It's important to keep [unnestable] on the outside instead of within a lambda
//   so that [Pull.start] and [Push.push] are mutually unnestable.
// It's important to use [unnestable((f) => {...})] instead of [unnestable((f) => (...args) => {...})]
//   so that the blocking occurs while [f] is being called.
//   [unnestable((f, ...args) => {...})] would work, but that would be awkward.
const delayConstructionDuring = unnestable((f) => {
  state = "lazy";
  const result = f();
  constructAll();
  return result;
});

export { constConstructor, lazyConstructor, lazyLoop, delayConstructionDuring };
