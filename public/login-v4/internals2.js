import { assert, ShrinkingList, derefMany, memoize, nothing } from "./util.js";
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

const inherit = Symbol();
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
      [weakParents],
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
    },
  },
  private: {
    *iterateActiveChildren() {
      for (const sink of this[k].activeChildren) {
        assertLazy();
        yield { priority: sink[k].getPriority(), sink };
      }
    },
  },
}));

const behaviorSink = sink.privateSubclass((k) => ({
  constructor(parentSources, evaluate) {
    return [
      [parentSources.map((parentSource) => parentSource.getWeakSink())],
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
        // If [this] is not a [stepper].
        if (evaluate !== undefined) {
          this[k].initializeThunk();
        }
      },
    ];
  },
  public: {
    // Not used for [stepper]s.
    *push() {
      assertLazy();
      if (this[k].weakVariable.deref() === undefined) {
        this[k].weakVariable = new WeakRef({});
      } else {
        assert(this[k].weakVariable.deref().thunk.computed);
      }
      this[k].initializeThunk();
      yield* this[k].dequeueComputedChildren();
    },
    getWeakVariable(mk) {
      assert(mk === moduleKey);
      return this[k].weakVariable;
    },
    // Dequeue instead of iterating in order to prevent [push]
    // from being called twice on any [BehaviorSink].
    *dequeueComputedChildren() {
      for (const sink of this[k].computedChildren) {
        assertLazy();
        // Mutating [this[k].computedChildren] while iterating over it.
        sink[k].removeFromComputedChildren();
        yield { priority: sink[k].getPriority(), sink };
      }
    },
    forgetLeftParentVariable(mk) {
      assert(mk === moduleKey);
      assert(this[k].rememberedParentVariables.length === 2);
      assert(this[k].rememberedParentVariables[0]);
      this[k].rememberedParentVariables[0] = null;
    },
    forgetRightParentVariable(mk) {
      assert(mk === moduleKey);
      assert(this[k].rememberedParentVariables.length === 2);
      assert(this[k].rememberedParentVariables[1]);
      this[k].rememberedParentVariables[1] = null;
    },
    // Removes all strong references to [this].
    // [removeFromParents] and [removeFromComputedChildren] take care of the strong references from parents.
    // We don't need to worry about the strong references from modulators because
    // the unpullability of [this] implies the unpullability of any modulators.
    // It doesn't matter how long you wait to call this method
    // because pushing an unpullable sink has no side effects.
    destroy(mk) {
      assert(mk === moduleKey);
      this[k].removeFromComputedChildren();
      this[k].removeFromParents();
    },
  },
  private: {
    // Not used for [stepper]s.
    initializeThunk() {
      assert(this[k].computedChildRemovers.length === 0);
      assert(this[k].rememberedParentVariables.length !== 0);
      assert(this[k].evaluate !== undefined);
      const parentVariables = this[k].getParentVariables();
      // The point of these 2 lines is to avoid capturing [this] in the closure.
      const evaluate = this[k].evaluate;
      const weakThisK = new WeakRef(this[k]);
      // Assign to instead of replacing [weakVariable] because we want to
      // propagate the changes to any uncomputed children and to the source.
      this[k].weakVariable.deref().thunk = memoize(() => {
        weakThisK.deref()?.addToComputedChildren();
        return evaluate(
          ...parentVariables.map((parentVariable) => parentVariable.thunk())
        );
      });
    },
    // Not used for [stepper]s.
    // We can be sure that the [deref]s work because the non-remembered [weakParent]s were just pushed.
    // This is a separate method because we need to avoid accidentally capturing [this] in neighboring closures.
    getParentVariables() {
      return this[k].mapWeakParents(
        (weakParent, i) =>
          this[k].rememberedParentVariables[i] ??
          weakParent.deref()[k].weakVariable.deref()
      );
    },
    // Not used for [stepper]s.
    addToComputedChildren() {
      this[k].forEachParent((parent) => {
        this[k].computedChildRemovers.push(
          new WeakRef(parent[k].computedChildren.add(this))
        );
      });
    },
    // Not needed for [stepper]s.
    removeFromComputedChildren() {
      for (const remover of this[k].computedChildRemovers) {
        remover.deref()?.removeOnce();
      }
      this[k].computedChildRemovers = [];
    },
  },
}));

const stepperSink = behaviorSink.privateSubclass((k) => ({
  constructor(initialValue) {
    return [[[]], () => {
      // The strong references are from [BehaviorSource], uncomputed children, and children with more than one pushable parent,
      // which will need to access the value in the future.
      this[k].weakVariable = new WeakRef({});
      this[k].initializeValue(initialValue);
    }];
  },
  public: {
    // Must only be called once per [Push.push], but idk of any non-clunky ways to assert this.
    *pushValue(value) {
      assertLazy();
      if (this[k].weakVariable.deref() === undefined) {
        this[k].weakVariable = new WeakRef({});
      }
      this[k].initializeValue(value);
      yield* this[k].dequeueComputedChildren();
    },
    getWeakVariable(mk) {
      assert(mk === moduleKey);
      return this[k].weakVariable;
    },
    // We don't need a [destroy] method because the only strong reference to [this] is from a modulator,
    // but the unpullability of [this] implies the unpullability of the modulator.
  },
  private: {
    initializeValue(value) {
      // Assign to instead of replacing [weakVariable] because we want to
      // propagate the changes to any uncomputed children and to the source.
      this[k].weakVariable.deref().thunk = () => value;
    },
  }
}));
