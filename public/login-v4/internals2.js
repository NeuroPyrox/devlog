import { assert, ShrinkingList, derefMany, nothing } from "./util.js";
import { assertLazy, assertConstructing } from "./lazyConstructors.js";

// Sink:         switch mapWeakParents isFirstParent forEachParent getPriority removeFromParents
// EventSink:    switch                                                                          activate deactivate pushValue push
//   Input:                                                                                                          pushValue
//   Middle:                                                                                                                   push
//   Output:                                                                                     activate deactivate           push
// BehaviorSink:                                                                                                     pushValue push
//   Input:                                                                                                          pushValue
//   Else:                                                                                                                     push

const privatelyInheritableClass = undefined;

const moduleKey = Symbol();

const sink = privatelyInheritableClass((k) => ({
  constructor(weakParents) {
    this[k].setWeakParents(weakParents);
    this[k].children = new ShrinkingList();
    this[k].priority =
      Math.max(
        -1,
        ...derefMany(weakParents).map((parent) => parent[k].getPriority())
      ) + 1;
  },
  public: {
    switchParent(weakParent) {
      assert(this[k].weakParents.length <= 1);
      this[k].removeFromParents();
      this[k].setWeakParents([weakParent]);
      weakParent.deref()?.[k]?.switchPriority(this[k].priority);
    },
    mapWeakParents(f) {
      return this[k].weakParents.map(f);
    },
    // Used for early exits from [EventSink.switch]
    isFirstParent(weakParent) {
      return weakParent.deref() === this[k].weakParents[0]?.deref();
    },
    forEachParent(f) {
      derefMany(this[k].weakParents).forEach(f);
    },
    getPriority() {
      return this[k].priority;
    },
    // Removes all strong references from the [children] of [weakParents].
    removeFromParents() {
      for (const weakParentLink of this[k].weakParentLinks) {
        weakParentLink.deref()?.removeOnce();
      }
    },
  },
  private: {
    setWeakParents(weakParents) {
      this[k].weakParents = weakParents;
      this[k].weakParentLinks = derefMany(weakParents).map(
        (parent) => new WeakRef(parent[k].children.add(this))
      );
    },
    // TODO custom error message for infinite recursion
    switchPriority(childPriority) {
      if (childPriority <= this[k].priority) {
        this[k].priority = childPriority - 1;
        this[k].forEachParent((parent) =>
          parent[k].switchPriority(this[k].priority)
        );
      }
    },
  },
}));

const eventSink = sink.privateSubclass((k) => ({
  // We don't use an arrow function because glitch.com won't parse it correctly.
  // TODO test in browser if using an arrow function is just a syntax error.
  constructor(
    weakParents,
    push,
    { unsubscribe = () => {}, enforceManualDeactivation = false }
  ) {
    return [
      weakParents,
      () => {
        this[k].activeChildren = new ShrinkingList();
        this[k].activeChildRemovers = [];
        this[k].enforceManualDeactivation = enforceManualDeactivation; // Only used for output events.
        this[k].push = push;
        this[k].unsubscribe = unsubscribe; // Only used for input events.
      },
    ];
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
    destroy(mk) {
      assert(mk === moduleKey);
      if (this[k].enforceManualDeactivation) {
        assert(this[k].activeChildRemovers.length === 0);
      } else {
        this[k].deactivate();
      }
      this[k].unsubscribe();
      this[k].removeFromParents();
    }
  },
  private: {
    *iterateActiveChildren() {
      for (const sink of this[k].activeChildren) {
        assertLazy();
        yield { priority: sink[k].getPriority(), sink };
      }
    }
  },
}));

const behaviorSink = sink.privateSubclass((k) => ({
  constructor(parentSources, { evaluate, initialValue }) {
    return [
      parentSources.map((parentSource) => parentSource.getWeakSink()),
      () => {
        this[k].computedChildren = new ShrinkingList();
        this[k].computedChildRemovers = [];
        // The strong references are from [BehaviorSource], uncomputed children, and children with more than one pushable parent,
        // which will need to access the value in the future.
        this[k].weakVariable = new WeakRef({});
        this[k].rememberedParentVariables =
          1 < parentSources.length
            ? parentSources.map((parentSource) => parentSource.getVariable())
            : Array(parentSources.length);

        this[k].evaluate = evaluate;
        // If [this] is a [stepper].
        if (evaluate === undefined) {
          this[k].initializeValue(initialValue);
        } else {
          assert(initialValue === undefined);
          this[k].initializeThunk();
        }
      },
    ];
  },
}));
