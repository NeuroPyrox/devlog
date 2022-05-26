// TODO which exports are only used in one other module?

const assert = (condition) => {
  if (!condition) {
    throw new Error("Assertion failed");
  }
};

class ShrinkingList {
  constructor() {
    this._prev = this;
    this._next = this;
  }

  add(value) {
    const result = new ShrinkingListNode(this._prev, value, this);
    this._prev._next = result;
    this._prev = result;
    return result;
  }

  isEmpty() {
    return this._next === this;
  }

  getFirst() {
    return this._next;
  }

  getLast() {
    return this._prev;
  }

  // Assumes no nodes will be removed while iterating
  [Symbol.iterator]() {
    let current = this._next;
    return {
      next: () => {
        if (current === this) {
          return { done: true };
        }
        const value = current._value;
        current = current._next;
        return { done: false, value };
      },
    };
  }
}

class ShrinkingListNode {
  constructor(prev, value, next) {
    this._prev = prev;
    this._value = value;
    this._next = next;
  }

  set(value) {
    this._value = value;
  }

  get() {
    return this._value;
  }

  remove() {
    if (this._value !== null) {
      this.removeOnce();
    }
  }

  removeOnce() {
    assert(this._value !== null);
    assert(this._prev._next === this);
    assert(this._next._prev === this);
    this._prev._next = this._next;
    this._next._prev = this._prev;
    this._value = null;
  }
}

const weakRefUndefined = { deref: () => undefined };

const monadicMutator = Symbol();

const runMonad = (context, generator) => {
  let step = generator.next();
  while (!step.done) {
    step = generator.next(step.value[monadicMutator](context));
  }
  return step.value;
};

// TODO make even more private by requiring a reference to the class
// TODO maybe a makeMonad function that takes a class and a list of methods?
const monadicMethod =
  (field) =>
  (...args) => ({
    [monadicMutator]: (context) => context[field](...args),
  });

// Used when we want nullable values, but don't want the library user to create a null value.
const nothing = Symbol();

const unnestable = (f) => {
  let running = false;
  return (...args) => {
    // TODO better error message
    assert(!running);
    running = true;
    const result = f(...args);
    running = false;
    return result;
  };
};

const memoize = (f) => () => {
  if (!f.done) {
    // Overwrite [f] to free memory. TODO test if it actually frees memory.
    f = { done: true, value: f() };
  }
  return f.value;
};

const log = (x) => {
  console.log(x);
  return x;
};

export {
  assert,
  ShrinkingList,
  weakRefUndefined,
  runMonad,
  monadicMethod,
  nothing,
  unnestable,
  memoize,
  log,
};
