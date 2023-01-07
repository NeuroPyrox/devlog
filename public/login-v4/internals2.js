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

const abstractClass = undefined;
const generateScopes = undefined;

const [
  sinkParentsAndChildrenScope,
  sinkScope,
  eventSinkScope,
  behaviorSinkScope,
  stepperSinkScope,
  nonStepperSinkScope,
] = generateScopes();

// This class has too many responsibilities, but the only solutions I can think of run into diamond inheritance.
const sinkParentsAndChildren = abstractClass(
  sinkParentsAndChildrenScope,
  (k) => ({
    constructor(weakParents) {
      k(this).setWeakParents(weakParents);
      k(this).children = new ShrinkingList();
      k(this).priority =
        Math.max(
          -1,
          ...derefMany(weakParents).map((parent) => k(parent).getPriority())
        ) + 1;
    },
    methods: {
      switchParent(weakParent) {
        assert(k(this).weakParents.length <= 1);
        k(this).removeFromParents();
        k(this).setWeakParents([weakParent]);
        k(weakParent.deref())?.switchPriority(k(this).priority);
      },
      mapWeakParents(f) {
        return k(this).weakParents.map(f);
      },
      forEachParent(f) {
        derefMany(k(this).weakParents).forEach(f);
      },
      // Used for early exits from [EventSink.switch]
      isFirstParent(weakParent) {
        return weakParent.deref() === k(this).weakParents[0]?.deref();
      },
      getPriority() {
        return k(this).priority;
      },
      // Removes all strong references from the [children] of [weakParents].
      removeFromParents() {
        for (const weakChildRemover of k(this).weakParentsChildRemovers) {
          weakChildRemover.deref()?.removeOnce();
        }
      },
      setWeakParents(weakParents) {
        k(this).weakParents = weakParents;
        k(this).weakParentsChildRemovers = derefMany(weakParents).map(
          (parent) => new WeakRef(k(parent).children.add(this))
        );
      },
      // TODO custom error message for infinite recursion
      switchPriority(childPriority) {
        if (childPriority <= k(this).priority) {
          k(this).priority = childPriority - 1;
          k(this).forEachParent((parent) =>
            k(parent).switchPriority(k(this).priority)
          );
        }
      },
    },
    friends: {
      switchParent: [eventSinkScope],
      mapWeakParents: [eventSinkScope, nonStepperSinkScope],
      forEachParent: [sinkScope, eventSinkScope, nonStepperSinkScope],
      isFirstParent: [eventSinkScope],
      getPriority: [eventSinkScope, behaviorSinkScope],
      removeFromParents: [eventSinkScope, nonStepperSinkScope],
    },
  })
);

const sink = sinkParentsAndChildren.abstractSubclass((k) => ({
  constructor(weakParents) {
    return [
      [weakParents],
      () => {
        k(this).waitingChildren = new ShrinkingList();
        k(this).weakParentsWaitingChildRemovers = [];
      },
    ];
  },
  methods: {
    wait() {
      k(this).forEachParent((parent) => {
        k(this).weakParentsWaitingChildRemovers.push(
          new WeakRef(k(parent).waitingChildren.add(this))
        );
      });
    },
    unwait() {
      for (const weakChildToPushRemover of k(this)
        .weakParentsWaitingChildRemovers) {
        weakChildToPushRemover.deref()?.removeOnce();
      }
      k(this).weakParentsWaitingChildRemovers = [];
    },
    isWaiting() {
      return k(this).weakParentsWaitingChildRemovers.length !== 0;
    },
    recursivelyWait() {
      assertConstructing();
      if (k(this).isWaiting()) {
        return;
      }
      k(this).forEachParent((parent) => {
        k(parent).recursivelyWait();
      });
      k(this).wait();
    },
    recursivelyUnwait() {
      assertConstructing();
      k(this).unwait();
      k(this).forEachParent((parent) => {
        if (k(parent).waitingChildren.isEmpty()) {
          // From one to zero children.
          k(parent).recursivelyUnwait();
        }
      });
    },
  },
  friends: {
    wait: [],
    unwait: [],
    isWaiting: [eventSinkScope],
    recursivelyWait: [eventSinkScope],
    recursivelyUnwait: [eventSinkScope],
  },
}));

const eventSink = sink.finalSubclass((k) => ({
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
        k(this).enforceManualDeactivation = enforceManualDeactivation; // Only used for output events.
        k(this).push = push;
        k(this).unsubscribe = unsubscribe; // Only used for input events.
      },
    ];
  },
  methods: {
    switch(parentSource) {
      assertConstructing();
      const weakParent = parentSource.getWeakSink();
      // This early exit is an O(# of nested parents) optimization.
      if (k(this).isFirstParent(weakParent)) {
        return;
      }
      k(this).deactivate();
      k(this).switchParent(weakParent);
      // TODO use base class
      const hasActiveChild = !k(this).childrenToPush.isEmpty();
      if (hasActiveChild) {
        k(this).activate();
      }
    },
    *pushValue(context, value) {
      assertLazy();
      context.writeEvent(this, value);
      yield* k(this).iterateActiveChildren();
    },
    *push(context) {
      assertLazy();
      if (context.isWritten(this)) {
        // Guards against being called more than once.
        // We don't need any fancy algorithmic optimizations
        // because [EventSink]s have at most 2 parents.
        return;
      }
      const action = k(this).push(
        ...k(this).mapWeakParents((weakParent) =>
          context.readEvent(weakParent.deref())
        )
      );
      const value = context.doAction(action);
      context.writeEvent(this, value);
      if (value !== nothing) {
        yield* k(this).iterateActiveChildren();
      }
    },
    destroy() {
      if (k(this).enforceManualDeactivation) {
        assert(!k(this).isAChildToPush());
      } else {
        k(this).deactivate();
      }
      k(this).unsubscribe();
      k(this).removeFromParents();
    },
    // TODO move to base class
    *iterateActiveChildren() {
      for (const sink of k(this).childrenToPush) {
        assertLazy();
        yield { priority: k(sink).getPriority(), sink };
      }
    },
  },
}));

const behaviorSink = sink.abstractSubclass((k) => ({
  constructor(parentSources) {
    return [
      [parentSources.map((parentSource) => parentSource.getWeakSink())],
      () => {
        // The strong references are from [BehaviorSource], uncomputed children, and children with more than one pushable parent,
        // which will need to access the value in the future.
        k(this).weakVariable = new WeakRef({});
      },
    ];
  },
  methods: {
    // Dequeue instead of iterating in order to prevent [push]
    // from being called twice on any [BehaviorSink].
    *dequeueComputedChildren() {
      for (const sink of k(this).childrenToPush) {
        assertLazy();
        // Mutating [k(this).childrenToPush] while iterating over it.
        k(sink).removeFromComputedChildren();
        yield { priority: k(sink).getPriority(), sink };
      }
    },
    getWeakVariable() {
      return k(this).weakVariable;
    },
  },
  friends: {
    dequeueComputedChildren: [stepperSinkScope, nonStepperSinkScope],
  },
}));

const stepperSink = behaviorSink.finalSubclass((k) => ({
  constructor(initialValue) {
    return [
      [[]],
      () => {
        k(this).initializeValue(initialValue);
      },
    ];
  },
  methods: {
    // Must only be called once per [Push.push], but idk of any clean ways to assert this.
    *pushValue(value) {
      assertLazy();
      if (k(this).weakVariable.deref() === undefined) {
        k(this).weakVariable = new WeakRef({});
      }
      k(this).initializeValue(value);
      yield* k(this).dequeueComputedChildren();
    },
    initializeValue(value) {
      // Assign to instead of replacing [weakVariable] because we want to
      // propagate the changes to any uncomputed children and to the source.
      k(this).weakVariable.deref().thunk = () => value;
    },
    // We don't need a [destroy] method because the only strong reference to [this] is from a modulator,
    // but the unpullability of [this] implies the unpullability of the modulator.
  },
}));

const nonStepperBehaviorSink = behaviorSink.finalSubclass((k) => ({
  constructor(parentSources, evaluate) {
    return [
      [parentSources],
      () => {
        assert(parentSources.length === 1 || parentSources.length === 2);
        k(this).rememberedParentVariables =
          1 < parentSources.length
            ? parentSources.map((parentSource) => parentSource.getVariable())
            : Array(parentSources.length);
        k(this).evaluate = evaluate;
        k(this).initializeThunk();
      },
    ];
  },
  methods: {
    *push() {
      assertLazy();
      if (k(this).weakVariable.deref() === undefined) {
        k(this).weakVariable = new WeakRef({});
      } else {
        assert(k(this).weakVariable.deref().thunk.computed);
      }
      k(this).initializeThunk();
      yield* k(this).dequeueComputedChildren();
    },
    forgetLeftParentVariable() {
      assert(k(this).rememberedParentVariables.length === 2);
      assert(k(this).rememberedParentVariables[0]);
      k(this).rememberedParentVariables[0] = null;
    },
    forgetRightParentVariable() {
      assert(k(this).rememberedParentVariables.length === 2);
      assert(k(this).rememberedParentVariables[1]);
      k(this).rememberedParentVariables[1] = null;
    },
    // Removes all strong references to [this].
    // [removeFromParents] and [removeFromComputedChildren] take care of the strong references from parents.
    // We don't need to worry about the strong references from modulators because
    // the unpullability of [this] implies the unpullability of any modulators.
    // It doesn't matter how long you wait to call this method
    // because pushing an unpullable sink has no side effects.
    destroy() {
      k(this).removeFromComputedChildren();
      k(this).removeFromParents();
    },
    initializeThunk() {
      assert(k(this).childToPushRemovers.length === 0);
      assert(k(this).rememberedParentVariables.length !== 0);
      assert(k(this).evaluate !== undefined);
      const parentVariables = k(this).getParentVariables();
      // The point of these 2 lines is to avoid capturing [this] in the closure.
      const evaluate = k(this).evaluate;
      const weakThisK = new WeakRef(k(this));
      // Assign to instead of replacing [weakVariable] because we want to
      // propagate the changes to any uncomputed children and to the source.
      k(this).weakVariable.deref().thunk = memoize(() => {
        weakThisK.deref()?.addToComputedChildren();
        return evaluate(
          ...parentVariables.map((parentVariable) => parentVariable.thunk())
        );
      });
    },
    // We can be sure that the [deref]s work because the non-remembered [weakParent]s were just pushed.
    // This is a separate method because we need to avoid accidentally capturing [this] in neighboring closures.
    getParentVariables() {
      return k(this).mapWeakParents(
        (weakParent, i) =>
          k(this).rememberedParentVariables[i] ??
          k(weakParent.deref()).weakVariable.deref()
      );
    },
  },
}));
