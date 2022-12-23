import { assert, ShrinkingList, derefMany } from "./util.js";

// Sink:         switch mapWeakParents isFirstParent forEachParent getPriority removeFromParents
// EventSink:    switch                                                                          activate deactivate pushValue push
//   Input:                                                                                                          pushValue
//   Middle:                                                                                                                   push
//   Output:                                                                                     activate deactivate           push
// BehaviorSink:                                                                                                     pushValue push
//   Input:                                                                                                          pushValue
//   Else:                                                                                                                     push

const { newSink } = (() => {
  const p = Symbol();

  class Sink {
    constructor(weakParents) {
      this.#setWeakParents(weakParents);
      this.children = new ShrinkingList();
      this.priority =
        Math.max(
          -1,
          ...derefMany(weakParents).map((parent) => parent[p].getPriority())
        ) + 1;
    }

    switch(weakParent) {
      assert(this.weakParents.length <= 1);
      this.removeFromParents();
      this.#setWeakParents([weakParent]);
      weakParent.deref()?.[p]?.#switchPriority(this.priority);
    }

    mapWeakParents(f) {
      return this.weakParents.map(f);
    }

    // Used for early exits from [EventSink.switch]
    isFirstParent(weakParent) {
      return weakParent.deref() === this.weakParents[0]?.deref();
    }

    forEachParent(f) {
      derefMany(this.weakParents).forEach(f);
    }

    getPriority() {
      return this.priority;
    }

    // Removes all strong references from the [children] of [weakParents].
    removeFromParents() {
      for (const weakParentLink of this.weakParentLinks) {
        weakParentLink.deref()?.removeOnce();
      }
    }

    #setWeakParents(weakParents) {
      this.weakParents = weakParents;
      this.weakParentLinks = derefMany(weakParents).map(
        (parent) => new WeakRef(parent[p].children.add(this))
      );
    }

    // TODO custom error message for infinite recursion
    #switchPriority(childPriority) {
      if (childPriority <= this.priority) {
        this.priority = childPriority - 1;
        this.forEachParent((parent) =>
          parent[p].#switchPriority(this.priority)
        );
      }
    }
  }

  class Wrapper {
    constructor(...args) {
      this[p] = new Sink(...args);
    }
  }

  return { newSink: (...args) => new Wrapper(...args) };
})();
