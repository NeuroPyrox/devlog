import { assert, ShrinkingList, derefMany, memoize, nothing } from "./util.js";
import {
  assertLazy,
  assertConstructing,
  lazyConstructor,
} from "./lazyConstructors.js";

// Sink:         switch mapWeakParents isFirstParent forEachParent getPriority removeParents
// EventSink:    switch                                                                          activate deactivate pushValue push
//   Input:                                                                                                          pushValue
//   Middle:                                                                                                                   push
//   Output:                                                                                     activate deactivate           push
// BehaviorSink:                                                                                                     pushValue push
//   Input:                                                                                                          pushValue
//   Else:                                                                                                                     push

// I'm organizing methods by which class the variables come from.
// I tried moving methods only to the subclasses that use them, but the result was messy.
// To get the benefits of both worlds, I reimplemented C++'s feature of friends.
// This is probably overengineering, but it satisfies my itch for encapsulation.

// [eventSinkWaiters] is a different class from [behaviorSinkWaiters] because
// even though they have the same variables and semantics, they don't share any methods.

const abstractClass = undefined;
const generateScopes = undefined;
const globalScope = undefined;

const [
  sinkScope,
  eventSinkWaitersScope,
  neverSinkScope,
  inputSinkScope,
  mapEventSinkScope,
  filterEventSinkScope,
  mergeEventSinkScope,
  outputEventSinkScope,
  switchEventModulateeSinkScope,
  switchEventModulatorSinkScope,
  stepperBehaviorModulatorSinkScope,
  eventSinkScope,
  behaviorSinkWaitersScope,
  behaviorSinkScope,
  stepperSinkScope,
  nonStepperSinkScope,
] = generateScopes();

// It might seem inefficient to have subclasses with no [weakParents],
// but the only alternatives I could think of were messy.
const sink = abstractClass(sinkScope, (k) => ({
  constructor(weakParents) {
    k(this).setParents(weakParents);
    k(this).children = new ShrinkingList();
    k(this).priority =
      Math.max(
        -1,
        ...derefMany(weakParents).map((parent) => k(parent).getPriority())
      ) + 1;
  },
  methods: {
    setParents(weakParents) {
      k(this).weakParents = weakParents;
      k(this).weakParentsChildRemovers = derefMany(weakParents).map(
        (parent) => new WeakRef(k(parent).children.add(this))
      );
    },
    // Removes [this] from the [children] of [weakParents].
    removeParents() {
      for (const weakChildRemover of k(this).weakParentsChildRemovers) {
        weakChildRemover.deref()?.removeOnce();
      }
      // Left out as an optimization because [setParents] and GC make this redundant:
      // k(this).weakParents = [];
      // k(this).weakParentsChildRemovers = [];
    },
    mapWeakParents(f) {
      return k(this).weakParents.map(f);
    },
    readEventParents(context) {
      return k(this).weakParents.map((weakParent) =>
        context.readEvent(weakParent.deref())
      );
    },
    forEachParent(f) {
      derefMany(k(this).weakParents).forEach(f);
    },
    getPriority() {
      return k(this).priority;
    },
    // Used for early exits from [switch].
    isFirstParent(weakParent) {
      return weakParent.deref() === k(this).weakParents[0]?.deref();
    },
    switchParent(weakParent) {
      assert(k(this).weakParents.length <= 1);
      k(this).removeParents();
      k(this).setParents([weakParent]);
      k(weakParent.deref())?.switchPriority(k(this).priority);
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
    removeParents: [eventSinkScope, nonStepperSinkScope],
    mapWeakParents: [nonStepperSinkScope],
    readEventParents: [
      mapEventSinkScope,
      filterEventSinkScope,
      mergeEventSinkScope,
    ],
    forEachParent: [eventSinkWaitersScope, behaviorSinkWaitersScope],
    getPriority: [eventSinkWaitersScope, behaviorSinkWaitersScope],
    isFirstParent: [eventSinkWaitersScope],
    switchParent: [eventSinkWaitersScope],
  },
}));

const eventSinkWaiters = sink.abstractSubclass(eventSinkWaitersScope, (k) => ({
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
    *iterateWaitingChildren() {
      for (const sink of k(this).waitingChildren) {
        assertLazy();
        yield { priority: k(sink).getPriority(), sink };
      }
    },
    recursivelyWait() {
      assertConstructing();
      if (k(this).isWaiting()) {
        return;
      }
      k(this).forEachParent((parent) => {
        k(parent).recursivelyWait();
        k(this).weakParentsWaitingChildRemovers.push(
          new WeakRef(k(parent).waitingChildren.add(this))
        );
      });
    },
    recursivelyUnwait() {
      assertConstructing();
      for (const weakChildToPushRemover of k(this)
        .weakParentsWaitingChildRemovers) {
        weakChildToPushRemover.deref()?.removeOnce();
      }
      k(this).weakParentsWaitingChildRemovers = [];
      k(this).forEachParent((parent) => {
        if (k(parent).waitingChildren.isEmpty()) {
          // From one to zero children.
          k(parent).recursivelyUnwait();
        }
      });
    },
    isWaiting() {
      return k(this).weakParentsWaitingChildRemovers.length !== 0;
    },
    switch(parentSource) {
      assertConstructing();
      const weakParent = parentSource.getWeakSink();
      // This early exit is an O(# of nested parents) optimization.
      if (k(this).isFirstParent(weakParent)) {
        return;
      }
      k(this).recursivelyUnwait();
      k(this).switchParent(weakParent);
      // Setting the value of [k(this).isWaiting()].
      const isWaiting = !k(this).waitingChildren.isEmpty();
      if (isWaiting) {
        k(this).recursivelyWait();
      }
    },
  },
  friends: {
    iterateWaitingChildren: [inputSinkScope, eventSinkScope],
    isWaiting: [eventSinkScope],
    switch: [switchEventModulateeSinkScope],
  },
}));

const neverSink = eventSinkWaiters.finalSubclass(neverSinkScope, (k) => ({
  constructor() {
    return [[[]], () => {}];
  },
}));

const inputSink = eventSinkWaiters.finalSubclass(inputSinkScope, (k) => ({
  constructor(unsubscribe) {
    return [
      [[]],
      () => {
        k(this).unsubscribe = unsubscribe;
      },
    ];
  },
  methods: {
    *pushValue(context, value) {
      assertLazy();
      context.writeEvent(this, value);
      yield* k(this).iterateWaitingChildren();
    },
    destroy() {
      k(this).unsubscribe();
    },
  },
}));

const mapEventSink = eventSinkWaiters.finalSubclass(mapEventSinkScope, (k) => ({
  constructor(weakParent, f) {
    return [
      [[weakParent]],
      () => {
        k(this).f = f;
      },
    ];
  },
  methods: {
    *push(context) {
      assertLazy();
      const [parentValue] = k(this).readEventParents(context);
      // TODO remove [k(this)] access from [f].
      context.writeEvent(this, k(this).f(parentValue));
      yield* k(this).iterateWaitingChildren();
    },
    destroy() {
      k(this).deactivate();
      k(this).removeParents();
    },
  },
}));

const filterEventSink = eventSinkWaiters.finalSubclass(
  filterEventSinkScope,
  (k) => ({
    constructor(weakParent, predicate) {
      return [
        [[weakParent]],
        () => {
          k(this).predicate = predicate;
        },
      ];
    },
    methods: {
      *push(context) {
        assertLazy();
        const [parentValue] = k(this).readEventParents(context);
        if (k(this).predicate(parentValue)) {
          context.writeEvent(this, parentValue);
          yield* k(this).iterateWaitingChildren();
        }
      },
      destroy() {
        k(this).deactivate();
        k(this).removeParents();
      },
    },
  })
);

const mergeEventSink = eventSinkWaiters.finalSubclass(
  mergeEventSinkScope,
  (k) => ({
    constructor(weakParentA, weakParentB, fAB, fA, fB) {
      return [
        [[weakParentA, weakParentB]],
        () => {
          k(this).fAB = fAB;
          k(this).fA = fA;
          k(this).fB = fB;
        },
      ];
    },
    methods: {
      *push(context) {
        assertLazy();
        if (context.isWritten(this)) {
          // We need this guard because there's more than one parent.
          return;
        }
        const [parentAValue, parentBValue] = k(this).readEventParents(context);
        const value =
          parentAValue === nothing
            ? k(this).fB(parentBValue)
            : parentBValue === nothing
            ? k(this).fA(parentAValue)
            : k(this).fAB(parentAValue, parentBValue);
        context.writeEvent(this, value);
        yield* k(this).iterateWaitingChildren();
      },
      destroy() {
        k(this).deactivate();
        k(this).removeParents();
      },
    },
  })
);

const outputEventSink = eventSinkWaiters.finalSubsclass(
  outputEventSinkScope,
  (k) => ({
    constructor(weakParent, handle) {
      return [
        [[weakParent]],
        () => {
          k(this).handle = handle;
        },
      ];
    },
    methods: {
      *push(context) {
        assertLazy();
        const [parentValue] = k(this).readEventParents(context);
        lazyConstructor(() => k(this).handle(parentValue));
      },
      destroy() {
        assert(!k(this).isWaiting());
        k(this).removeParents();
      },
    },
  })
);

const switchEventModulateeSink = eventSinkWaiters.finalSubclass(
  switchEventModulateeSinkScope,
  (k) => ({
    constructor() {
      return [[[]], () => {}];
    },
    methods: {
      *push(context) {
        assertLazy();
        const [parentValue] = k(this).readEventParents(context);
        context.writeEvent(this, parentValue);
        yield* k(this).iterateWaitingChildren();
      },
      destroy() {
        k(this).deactivate();
        k(this).removeParents();
      },
    },
  })
);

const switchEventModulatorSink = eventSinkWaiters.finalSubclass(
  switchEventModulatorSinkScope,
  (k) => ({
    constructor(weakParent, weakModulateeSource, modulatee) {
      return [
        [[weakParent]],
        () => {
          // Weakness prevents memory leaks of unpullable but pushable [source]s.
          k(this).weakModulateeSource = weakModulateeSource;
          k(this).modulatee = modulatee;
        },
      ];
    },
    methods: {
      *push(context) {
        assertLazy();
        const [newModulateeParent] = k(this).readEventParents(context);
        const modulateeSource = k(this).weakModulateeSource.deref();
        if (modulateeSource !== undefined) {
          // It's important to call [lazyConstructor] within the [if] statement
          // because we want to avoid unneeded evaluations of [newModulateeParentSource].
          lazyConstructor((newModulateeParentSource) => {
            // It's not possible to switch to an unpullable [newModulateeParentSource].
            // If [newModulateeParentSource] is unpushable or [modulateeSource] is unpullable,
            // garbage collection still continues in its normal course.
            modulateeSource.switch(newModulateeParentSource);
            k(this).modulatee.switch(newModulateeParentSource);
          }, newModulateeParent);
        }
      },
      destroy() {
        k(this).deactivate();
        k(this).removeParents();
      },
    },
  })
);

const stepperBehaviorModulatorSink = eventSinkWaiters.finalSubclass(
  stepperBehaviorModulatorSinkScope,
  (k) => ({
    constructor(weakParent, modulatee) {
      return [
        [[weakParent]],
        () => {
          k(this).modulatee = modulatee;
        },
      ];
    },
    methods: {
      *push(context) {
        assertLazy();
        const [modulateeValue] = k(this).readEventParents(context);
        context.enqueueBehaviorValue(k(this).modulatee, modulateeValue);
      },
      destroy() {
        k(this).deactivate();
        k(this).removeParents();
      },
    },
  })
);

const eventSink = eventSinkWaiters.finalSubclass(eventSinkScope, (k) => ({
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
        yield* k(this).iterateWaitingChildren();
      }
    },
    // TODO update
    destroy() {
      if (k(this).enforceManualDeactivation) {
        assert(!k(this).isWaiting());
      } else {
        k(this).deactivate();
      }
      k(this).unsubscribe();
      k(this).removeParents();
    },
  },
}));

const behaviorSinkWaiters = sink.abstractSubclass(
  behaviorSinkWaitersScope,
  (k) => ({
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
      *dequeueWaitingChildren() {
        for (const sink of k(this).waitingChildren) {
          assertLazy();
          // Mutating [k(this).waitingChildren] while iterating over it.
          // Prevents any [sink] from being yielded twice.
          k(sink).unwait();
          yield { priority: k(sink).getPriority(), sink };
        }
      },
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
    },
    friends: {
      dequeueWaitingChildren: [behaviorSinkScope],
    },
  })
);

const behaviorSink = behaviorSinkWaiters.abstractSubclass((k) => ({
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
    getWeakVariable() {
      return k(this).weakVariable;
    },
  },
  friends: {},
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
      yield* k(this).dequeueWaitingChildren();
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
      yield* k(this).dequeueWaitingChildren();
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
    // [removeParents] and [removeFromComputedChildren] take care of the strong references from parents.
    // We don't need to worry about the strong references from modulators because
    // the unpullability of [this] implies the unpullability of any modulators.
    // It doesn't matter how long you wait to call this method
    // because pushing an unpullable sink has no side effects.
    destroy() {
      k(this).removeFromComputedChildren();
      k(this).removeParents();
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
