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

const callMethod =
  (field) =>
  (...args) =>
  (object) =>
    object[field](...args);

const runMonad = (context, generator) => {
  let step = generator.next();
  while (!step.done) {
    step = generator.next(step.value(context));
  }
  return step.value;
};

// Used when we want nullable values, but don't want the library user to create a null value.
const nothing = Symbol();

export {
  assert,
  ShrinkingList,
  weakRefUndefined,
  callMethod,
  runMonad,
  nothing,
};
