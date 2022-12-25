import { assert, ShrinkingList, derefMany } from "./util.js";

// Sink:         switch mapWeakParents isFirstParent forEachParent getPriority removeFromParents
// EventSink:    switch                                                                          activate deactivate pushValue push
//   Input:                                                                                                          pushValue
//   Middle:                                                                                                                   push
//   Output:                                                                                     activate deactivate           push
// BehaviorSink:                                                                                                     pushValue push
//   Input:                                                                                                          pushValue
//   Else:                                                                                                                     push

const sink = (() => {
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

  return {};
})();

const eventSink = sink.privateSubclass((k) => ({
  constructor(
    weakParents,
    push,
    { unsubscribe = () => {}, enforceManualDeactivation = false }
  ) {
    super(weakParents);
    this[k].activeChildren = new ShrinkingList();
    this[k].activeChildRemovers = [];
    this[k].enforceManualDeactivation = enforceManualDeactivation; // Only used for output events.
    this[k].push = push;
    this[k].unsubscribe = unsubscribe; // Only used for input events.
  },
  public: {
    activate() {
      assertConstructing();
      if (this[k].activeChildRemovers.length !== 0) {
        // Filters out all sinks that are already active, except for inputs.
        return;
      }
      this[k].forEachParent((parent) => {
        parent[k].activate();
        this[k].activeChildRemovers.push(
          new WeakRef(parent[k].activeChildren.add(this))
        );
      });
    },
    deactivate() {
      assertConstructing();
      for (const deactivator of this[k].activeChildRemovers) {
        deactivator.deref()?.removeOnce();
      }
      this[k].activeChildRemovers = [];
      this[k].forEachParent((parent) => {
        if (parent[k].activeChildren.isEmpty()) {
          // From one to zero children.
          parent[k].deactivate();
        }
      });
    },
    switch(parentSource) {
      assertConstructing();
      const weakParent = parentSource.getWeakSink();
      // This early exit is an O(# of nested parents) optimization.
      if (this[k].isFirstParent(weakParent)) {
        return;
      }
      this[k].deactivate();
      this[k].switch(weakParent); // TODO resolve shadowing
      const hasActiveChild = !this[k].activeChildren.isEmpty();
      if (hasActiveChild) {
        this[k].activate();
      }
    },
    *pushValue(context, value) {
      assertLazy();
      context.writeEvent(this, value);
      yield* this[k].iterateActiveChildren();
    },
    *push(context) {
      assertLazy();
      if (context.isWritten(this)) {
        // Guards against being called more than once.
        // We don't need any fancy algorithmic optimizations
        // because [EventSink]s have at most 2 parents.
        return;
      }
      const action = this[k].push(
        ...this[k].mapWeakParents((weakParent) =>
          context.readEvent(weakParent.deref())
        )
      );
      const value = context.doAction(action);
      context.writeEvent(this, value);
      if (value !== nothing) {
        yield* this[k].iterateActiveChildren();
      }
    },
  },
  private: {},
}));
