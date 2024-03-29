import { assert, memoize, unnestable } from "./util.js";

// TODO Use another method for privacy.
const construct = Symbol();

let state = "eager";
let constructors = [];

export const assertLazy = () => assert(state === "lazy");
export const assertConstructing = () => assert(state === "constructing");

// TODO remove return value when we have an html monad.
// Only called on startup and wrapping the [Push] monad.
// It's important to keep [unnestable] on the outside instead of within a lambda
//   so that [Pull.start] and [Push.push] are mutually unnestable.
// It's important to use [unnestable((f) => {...})] instead of [unnestable((f) => (...args) => {...})]
//   so that the blocking occurs while [f] is being called.
//   [unnestable((f, ...args) => {...})] would work, but that would be awkward.
export const delayConstructionDuring = unnestable((f) => {
  state = "lazy";
  const result = f();
  state = "constructing";
  constructors.forEach((constructor) => constructor[construct]());
  constructors = [];
  state = "eager";
  return result;
});

// TODO is this necessary?
export const constConstructor = (x) => ({
  [construct]: () => x,
});

export const eagerConstructor = (f, ...args) => {
  assert(state === "eager");
  state = "constructing";
  const value = f(...args);
  state = "eager";
  return constConstructor(value);
};

// Like an applicative [queueMicrotask],
// but the tasks only get delayed during [delayConstructionDuring].
export const lazyConstructor = (f, ...args) => {
  args.forEach((arg) => assert(arg[construct]));
  // We allow construction outside of [delayConstructionDuring] to improve garbage collection.
  if (state === "eager") {
    return eagerConstructor(f, ...args);
  }
  assertLazy();
  // The order of composition between [memoize] and [unnestable] doesn't matter,
  // but [memoize(unnestable(...))] heuristically seems like it'd be more efficient.
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
export const lazyLoop = () => {
  assertLazy();
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
