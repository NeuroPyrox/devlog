import * as Util from "./util.js";

// TODO use symbol for [_construct]

let eventConstructors = "eager";
const constConstructor = (x) => ({
  _construct: () => x,
});

// Kind of like [queueMicrotask], but the tasks only get delayed during [delayConstructionDuring].
const lazyConstructor = (f, ...args) => {
  Util.assert(eventConstructors !== "constructing");
  args.forEach((arg) => Util.assert(arg._construct, arg));
  // We allow construction outside of [delayConstructionDuring] to improve garbage collection.
  if (eventConstructors === "eager") {
    return constConstructor(f(...args));
  }
  // The order of composition between [Util.memoize] and [Util.unnestable] doesn't matter,
  // but [Util.memoize(Util.unnestable(...))] seems like it'd be more efficient.
  const result = {
    _construct: Util.memoize(
      Util.unnestable(() => f(...args.map((arg) => arg._construct())))
    ),
  };
  eventConstructors.push(result);
  return result;
};

const lazyLoop = () => {
  Util.assert(eventConstructors !== "constructing");
  Util.assert(eventConstructors !== "eager");
  const result = {
    _construct: () => {
      throw new Error("Must call [loop.loop] on every [loop]!");
    },
  };
  result.loop = (setTo) => {
    Util.assert(setTo._construct);
    result._construct = setTo._construct;
  };
  return result;
};

const construct = () => {
  const temp = eventConstructors;
  eventConstructors = "constructing";
  temp.forEach((constructor) => constructor._construct());
  eventConstructors = "eager";
};

// Only called on startup and in the [Push] monad.
const delayConstructionDuring =
  (f) =>
  (...args) => {
    eventConstructors = [];
    const result = f(...args);
    construct();
    return result;
  };

export { constConstructor, lazyConstructor, lazyLoop, delayConstructionDuring };
