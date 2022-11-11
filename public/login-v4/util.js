export const assert = (condition) => {
  if (!condition) {
    throw new Error("Assertion failed");
  }
};

// Used when we want nullable values, but don't want the library user to create a null value.
export const nothing = Symbol();

// Use symbols instead of plain private fields because
// [ShrinkingList] and [ShrinkingListNode] need to access these fields from each other.
const prev = Symbol();
const next = Symbol();

// We use a doubly linked list because if it was singly linked, then [ShrinkingListNode.remove] couldn't be idempotent.
// The list is a loop because otherwise we'd have to add more [if] statements.
export class ShrinkingList {
  constructor() {
    this[prev] = this;
    this[next] = this;
  }

  add(value) {
    const result = new ShrinkingListNode(this[prev], value, this);
    this[prev][next] = result;
    this[prev] = result;
    return result;
  }

  isEmpty() {
    return this[next] === this;
  }

  getFirst() {
    return this[next];
  }

  getLast() {
    return this[prev];
  }

  // If you edit the list while iterating, the iterator will still terminate,
  // but it may continue visiting removed nodes and/or ignoring added nodes.
  *[Symbol.iterator]() {
    let current = this[next];
    while (current !== this) {
      yield current.get();
      current = current[next];
    }
  }
}

class ShrinkingListNode {
  #value;

  constructor(prevNode, value, nextNode) {
    this[prev] = prevNode;
    this.#value = value;
    this[next] = nextNode;
  }

  set(value) {
    this.#value = value;
  }

  get() {
    return this.#value;
  }

  remove() {
    if (this.#value !== nothing) {
      this.removeOnce();
    }
  }

  removeOnce() {
    assert(this.#value !== nothing);
    assert(this[prev][next] === this);
    assert(this[next][prev] === this);
    this[prev][next] = this[next];
    this[next][prev] = this[prev];
    this.#value = nothing;
    // Don't overwrite [this[next]] in case an iterator is visiting this node.
  }
}

export const weakRefUndefined = { deref: () => undefined };

export const createGeneratorMonad = () => {
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

// TODO remove [result] and [...args] once they're no longer needed
export const unnestable = (f) => {
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

export const memoize = (f) => {
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

export const log = (x) => {
  console.log(x);
  return x;
};

export const derefMany = (weakRefs) =>
  weakRefs.map((weakRef) => weakRef.deref()).filter((ref) => ref !== undefined);

// TODO remove [result] and [...args] once they're no longer needed
export const once = (f) => {
  let hasRun = false;
  return (...args) => {
    assert(!hasRun);
    hasRun = true;
    return f(...args);
  };
};
