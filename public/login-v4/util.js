const assert = (condition) => {
  if (!condition) {
    throw new Error("Assertion failed");
  }
};

// TODO private variables
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

// TODO private variables
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

const createGeneratorMonad = () => {
  const key = Symbol();
  const runMonad = (context, generator) => {
    let step = generator.next();
    while (!step.done) {
      step = generator.next(step.value[key](context));
    }
    return step.value;
  };
  const monadicMethod =
    (field) =>
    (...args) => ({
      [key]: (context) => context[field](...args),
    });
  return [runMonad, monadicMethod];
};

// Used when we want nullable values, but don't want the library user to create a null value.
const nothing = Symbol();

// TODO remove [result] and [...args] once they're no longer needed
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

const memoize = (f) => {
  let done = false;
  let value;
  return () => {
    if (!done) {
      done = true;
      value = f();
      // Free memory
      f = null;
    }
    return value;
  };
};

// Idk how to force GC, so this function logs every second whether [garbage] was collected yet.
// Idk how to automate it without false positives, but it passed last time I ran it.
// The reason for all the indirection is to avoid unintentional strong references to [garbage].
// This is why I hate JavaScript!
const testGarbageCollectionInMemoize = () => {
  const createGarbageWasCollectedFunction = (garbage) => {
    const weak = new WeakRef(garbage);
    return () => weak.deref() === undefined;
  };
  const [memoized, garbageWasCollected] = (() => {
    const garbage = {};
    const garbageWasCollected = createGarbageWasCollectedFunction(garbage);
    // [memoized] strongly references [garbage].
    const memoized = memoize(() => {
      assert(!garbage.nonExistantField);
    });
    return [memoized, garbageWasCollected];
  })();
  // [memoized] should no longer strongly refernce [garbage].
  // Another test you can do is commenting out this code and making sure "false" is always logged.
  memoized();
  const weakMemoized = new WeakRef(memoized);
  setInterval(() => {
    // Keep a strong reference to [memoized].
    assert(!memoized.nonExistantField);
    // Make sure the above line of code is doing its job.
    assert(weakMemoized.deref() !== undefined);
    console.log(garbageWasCollected());
  }, 1000);
};

const log = (x) => {
  console.log(x);
  return x;
};

const derefMany = (weakRefs) =>
  weakRefs.map((weakRef) => weakRef.deref()).filter((ref) => ref !== undefined);

// TODO remove [result] and [...args] once they're no longer needed
const once = (f) => {
  let hasRun = false;
  return (...args) => {
    assert(!hasRun);
    hasRun = true;
    return f(...args);
  };
};

export {
  assert,
  ShrinkingList,
  weakRefUndefined,
  createGeneratorMonad,
  nothing,
  unnestable,
  memoize,
  log,
  derefMany,
  once,
};
