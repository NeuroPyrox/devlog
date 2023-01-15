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
const sink = abstractClass(sinkScope, (_) => ({
  constructor(weakParents) {
    _(this).setParents(weakParents);
    _(this).children = new ShrinkingList();
    _(this).priority =
      Math.max(
        -1,
        ...derefMany(weakParents).map((parent) => _(parent).getPriority())
      ) + 1;
  },
  methods: {
    setParents(weakParents) {
      _(this).weakParents = weakParents;
      _(this).weakParentsChildRemovers = derefMany(weakParents).map(
        (parent) => new WeakRef(_(parent).children.add(this))
      );
    },
    // Removes [this] from the [children] of [weakParents].
    removeParents() {
      for (const weakChildRemover of _(this).weakParentsChildRemovers) {
        weakChildRemover.deref()?.removeOnce();
      }
      // Left out as an optimization because [setParents] and GC make this redundant:
      // _(this).weakParents = [];
      // _(this).weakParentsChildRemovers = [];
    },
    mapWeakParents(f) {
      return _(this).weakParents.map(f);
    },
    readEventParents(context) {
      assertLazy();
      return _(this).weakParents.map((weakParent) =>
        context.readEvent(weakParent.deref())
      );
    },
    forEachParent(f) {
      derefMany(_(this).weakParents).forEach(f);
    },
    getPriority() {
      return _(this).priority;
    },
    // Used for early exits from [switch].
    isFirstParent(weakParent) {
      return weakParent.deref() === _(this).weakParents[0]?.deref();
    },
    switchParent(weakParent) {
      assert(_(this).weakParents.length <= 1);
      _(this).removeParents();
      _(this).setParents([weakParent]);
      _(weakParent.deref())?.switchPriority(_(this).priority);
    },
    // TODO custom error message for infinite recursion
    switchPriority(childPriority) {
      if (childPriority <= _(this).priority) {
        _(this).priority = childPriority - 1;
        _(this).forEachParent((parent) =>
          _(parent).switchPriority(_(this).priority)
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

const eventSinkWaiters = sink.abstractSubclass(eventSinkWaitersScope, (_) => ({
  constructor(weakParents) {
    return [
      [weakParents],
      () => {
        _(this).waitingChildren = new ShrinkingList();
        _(this).weakParentsWaitingChildRemovers = [];
      },
    ];
  },
  methods: {
    *iterateWaitingChildren() {
      for (const sink of _(this).waitingChildren) {
        assertLazy();
        yield { priority: _(sink).getPriority(), sink };
      }
    },
    recursivelyWait() {
      assertConstructing();
      if (_(this).isWaiting()) {
        return;
      }
      _(this).forEachParent((parent) => {
        _(parent).recursivelyWait();
        _(this).weakParentsWaitingChildRemovers.push(
          new WeakRef(_(parent).waitingChildren.add(this))
        );
      });
    },
    recursivelyUnwait() {
      assertConstructing();
      for (const weakChildToPushRemover of _(this)
        .weakParentsWaitingChildRemovers) {
        weakChildToPushRemover.deref()?.removeOnce();
      }
      _(this).weakParentsWaitingChildRemovers = [];
      _(this).forEachParent((parent) => {
        if (_(parent).waitingChildren.isEmpty()) {
          // From one to zero children.
          _(parent).recursivelyUnwait();
        }
      });
    },
    isWaiting() {
      return _(this).weakParentsWaitingChildRemovers.length !== 0;
    },
    switch(parentSource) {
      assertConstructing();
      const weakParent = parentSource.getWeakSink();
      // This early exit is an O(# of nested parents) optimization.
      if (_(this).isFirstParent(weakParent)) {
        return;
      }
      _(this).recursivelyUnwait();
      _(this).switchParent(weakParent);
      // Setting the value of [_(this).isWaiting()].
      const isWaiting = !_(this).waitingChildren.isEmpty();
      if (isWaiting) {
        _(this).recursivelyWait();
      }
    },
  },
  friends: {
    iterateWaitingChildren: [inputSinkScope, eventSinkScope],
    isWaiting: [eventSinkScope],
    switch: [switchEventModulateeSinkScope],
  },
}));

const neverSink = eventSinkWaiters.finalSubclass(neverSinkScope, (_) => ({
  constructor() {
    return [[[]], () => {}];
  },
}));

const inputSink = eventSinkWaiters.finalSubclass(inputSinkScope, (_) => ({
  constructor(unsubscribe) {
    return [
      [[]],
      () => {
        _(this).unsubscribe = unsubscribe;
      },
    ];
  },
  methods: {
    *pushValue(context, value) {
      context.writeEvent(this, value);
      yield* _(this).iterateWaitingChildren();
    },
    destroy() {
      _(this).unsubscribe();
    },
  },
}));

const mapEventSink = eventSinkWaiters.finalSubclass(mapEventSinkScope, (_) => ({
  constructor(weakParent, f) {
    return [
      [[weakParent]],
      () => {
        _(this).f = f;
      },
    ];
  },
  methods: {
    *push(context) {
      const [parentValue] = _(this).readEventParents(context);
      // TODO remove [_(this)] access from [f].
      context.writeEvent(this, _(this).f(parentValue));
      yield* _(this).iterateWaitingChildren();
    },
    destroy() {
      _(this).deactivate();
      _(this).removeParents();
    },
  },
}));

const filterEventSink = eventSinkWaiters.finalSubclass(
  filterEventSinkScope,
  (_) => ({
    constructor(weakParent, predicate) {
      return [
        [[weakParent]],
        () => {
          _(this).predicate = predicate;
        },
      ];
    },
    methods: {
      *push(context) {
        const [parentValue] = _(this).readEventParents(context);
        if (_(this).predicate(parentValue)) {
          context.writeEvent(this, parentValue);
          yield* _(this).iterateWaitingChildren();
        }
      },
      destroy() {
        _(this).deactivate();
        _(this).removeParents();
      },
    },
  })
);

const mergeEventSink = eventSinkWaiters.finalSubclass(
  mergeEventSinkScope,
  (_) => ({
    constructor(weakParentA, weakParentB, fAB, fA, fB) {
      return [
        [[weakParentA, weakParentB]],
        () => {
          _(this).fAB = fAB;
          _(this).fA = fA;
          _(this).fB = fB;
        },
      ];
    },
    methods: {
      *push(context) {
        if (context.isWritten(this)) {
          // We need this guard because there's more than one parent.
          return;
        }
        const [parentAValue, parentBValue] = _(this).readEventParents(context);
        const value =
          parentAValue === nothing
            ? _(this).fB(parentBValue)
            : parentBValue === nothing
            ? _(this).fA(parentAValue)
            : _(this).fAB(parentAValue, parentBValue);
        context.writeEvent(this, value);
        yield* _(this).iterateWaitingChildren();
      },
      destroy() {
        _(this).deactivate();
        _(this).removeParents();
      },
    },
  })
);

const outputEventSink = eventSinkWaiters.finalSubsclass(
  outputEventSinkScope,
  (_) => ({
    constructor(weakParent, handle) {
      return [
        [[weakParent]],
        () => {
          _(this).handle = handle;
        },
      ];
    },
    methods: {
      *push(context) {
        const [parentValue] = _(this).readEventParents(context);
        lazyConstructor(() => _(this).handle(parentValue));
      },
      destroy() {
        assert(!_(this).isWaiting());
        _(this).removeParents();
      },
    },
  })
);

const switchEventModulateeSink = eventSinkWaiters.finalSubclass(
  switchEventModulateeSinkScope,
  (_) => ({
    constructor() {
      return [[[]], () => {}];
    },
    methods: {
      *push(context) {
        const [parentValue] = _(this).readEventParents(context);
        context.writeEvent(this, parentValue);
        yield* _(this).iterateWaitingChildren();
      },
      destroy() {
        _(this).deactivate();
        _(this).removeParents();
      },
    },
  })
);

const switchEventModulatorSink = eventSinkWaiters.finalSubclass(
  switchEventModulatorSinkScope,
  (_) => ({
    constructor(weakParent, weakModulateeSource, modulatee) {
      return [
        [[weakParent]],
        () => {
          // Weakness prevents memory leaks of unpullable but pushable [source]s.
          _(this).weakModulateeSource = weakModulateeSource;
          _(this).modulatee = modulatee;
        },
      ];
    },
    methods: {
      *push(context) {
        const [newModulateeParent] = _(this).readEventParents(context);
        const modulateeSource = _(this).weakModulateeSource.deref();
        if (modulateeSource !== undefined) {
          // It's important to call [lazyConstructor] within the [if] statement
          // because we want to avoid unneeded evaluations of [newModulateeParentSource].
          lazyConstructor((newModulateeParentSource) => {
            // It's not possible to switch to an unpullable [newModulateeParentSource].
            // If [newModulateeParentSource] is unpushable or [modulateeSource] is unpullable,
            // garbage collection still continues in its normal course.
            modulateeSource.switch(newModulateeParentSource);
            _(this).modulatee.switch(newModulateeParentSource);
          }, newModulateeParent);
        }
      },
      destroy() {
        _(this).deactivate();
        _(this).removeParents();
      },
    },
  })
);

const stepperBehaviorModulatorSink = eventSinkWaiters.finalSubclass(
  stepperBehaviorModulatorSinkScope,
  (_) => ({
    constructor(weakParent, modulatee) {
      return [
        [[weakParent]],
        () => {
          _(this).modulatee = modulatee;
        },
      ];
    },
    methods: {
      *push(context) {
        const [modulateeValue] = _(this).readEventParents(context);
        context.enqueueBehaviorValue(_(this).modulatee, modulateeValue);
      },
      destroy() {
        _(this).deactivate();
        _(this).removeParents();
      },
    },
  })
);

const behaviorSinkWaiters = sink.abstractSubclass(
  behaviorSinkWaitersScope,
  (_) => ({
    constructor(weakParents) {
      return [
        [weakParents],
        () => {
          _(this).waitingChildren = new ShrinkingList();
          _(this).weakParentsWaitingChildRemovers = [];
        },
      ];
    },
    methods: {
      *dequeueWaitingChildren() {
        for (const sink of _(this).waitingChildren) {
          assertLazy();
          // Mutating [_(this).waitingChildren] while iterating over it.
          // Prevents any [sink] from being yielded twice.
          _(sink).unwait();
          yield { priority: _(sink).getPriority(), sink };
        }
      },
      wait() {
        _(this).forEachParent((parent) => {
          _(this).weakParentsWaitingChildRemovers.push(
            new WeakRef(_(parent).waitingChildren.add(this))
          );
        });
      },
      unwait() {
        for (const weakChildToPushRemover of _(this)
          .weakParentsWaitingChildRemovers) {
          weakChildToPushRemover.deref()?.removeOnce();
        }
        _(this).weakParentsWaitingChildRemovers = [];
      },
    },
    friends: {
      dequeueWaitingChildren: [behaviorSinkScope],
    },
  })
);

const behaviorSink = behaviorSinkWaiters.abstractSubclass((_) => ({
  constructor(parentSources) {
    return [
      [parentSources.map((parentSource) => parentSource.getWeakSink())],
      () => {
        // The strong references are from [BehaviorSource], uncomputed children, and children with more than one pushable parent,
        // which will need to access the value in the future.
        _(this).weakVariable = new WeakRef({});
      },
    ];
  },
  methods: {
    getWeakVariable() {
      return _(this).weakVariable;
    },
  },
  friends: {},
}));

const stepperSink = behaviorSink.finalSubclass((_) => ({
  constructor(initialValue) {
    return [
      [[]],
      () => {
        _(this).initializeValue(initialValue);
      },
    ];
  },
  methods: {
    // Must only be called once per [Push.push], but idk of any clean ways to assert this.
    *pushValue(value) {
      assertLazy();
      if (_(this).weakVariable.deref() === undefined) {
        _(this).weakVariable = new WeakRef({});
      }
      _(this).initializeValue(value);
      yield* _(this).dequeueWaitingChildren();
    },
    initializeValue(value) {
      // Assign to instead of replacing [weakVariable] because we want to
      // propagate the changes to any uncomputed children and to the source.
      _(this).weakVariable.deref().thunk = () => value;
    },
    // We don't need a [destroy] method because the only strong reference to [this] is from a modulator,
    // but the unpullability of [this] implies the unpullability of the modulator.
  },
}));

const nonStepperBehaviorSink = behaviorSink.finalSubclass((_) => ({
  constructor(parentSources, evaluate) {
    return [
      [parentSources],
      () => {
        assert(parentSources.length === 1 || parentSources.length === 2);
        _(this).rememberedParentVariables =
          1 < parentSources.length
            ? parentSources.map((parentSource) => parentSource.getVariable())
            : Array(parentSources.length);
        _(this).evaluate = evaluate;
        _(this).initializeThunk();
      },
    ];
  },
  methods: {
    *push() {
      assertLazy();
      if (_(this).weakVariable.deref() === undefined) {
        _(this).weakVariable = new WeakRef({});
      } else {
        assert(_(this).weakVariable.deref().thunk.computed);
      }
      _(this).initializeThunk();
      yield* _(this).dequeueWaitingChildren();
    },
    forgetLeftParentVariable() {
      assert(_(this).rememberedParentVariables.length === 2);
      assert(_(this).rememberedParentVariables[0]);
      _(this).rememberedParentVariables[0] = null;
    },
    forgetRightParentVariable() {
      assert(_(this).rememberedParentVariables.length === 2);
      assert(_(this).rememberedParentVariables[1]);
      _(this).rememberedParentVariables[1] = null;
    },
    // Removes all strong references to [this].
    // [removeParents] and [removeFromComputedChildren] take care of the strong references from parents.
    // We don't need to worry about the strong references from modulators because
    // the unpullability of [this] implies the unpullability of any modulators.
    // It doesn't matter how long you wait to call this method
    // because pushing an unpullable sink has no side effects.
    destroy() {
      _(this).removeFromComputedChildren();
      _(this).removeParents();
    },
    initializeThunk() {
      assert(_(this).childToPushRemovers.length === 0);
      assert(_(this).rememberedParentVariables.length !== 0);
      assert(_(this).evaluate !== undefined);
      const parentVariables = _(this).getParentVariables();
      // The point of these 2 lines is to avoid capturing [this] in the closure.
      const evaluate = _(this).evaluate;
      const weakThisK = new WeakRef(_(this));
      // Assign to instead of replacing [weakVariable] because we want to
      // propagate the changes to any uncomputed children and to the source.
      _(this).weakVariable.deref().thunk = memoize(() => {
        weakThisK.deref()?.addToComputedChildren();
        return evaluate(
          ...parentVariables.map((parentVariable) => parentVariable.thunk())
        );
      });
    },
    // We can be sure that the [deref]s work because the non-remembered [weakParent]s were just pushed.
    // This is a separate method because we need to avoid accidentally capturing [this] in neighboring closures.
    getParentVariables() {
      return _(this).mapWeakParents(
        (weakParent, i) =>
          _(this).rememberedParentVariables[i] ??
          _(weakParent.deref()).weakVariable.deref()
      );
    },
  },
}));
