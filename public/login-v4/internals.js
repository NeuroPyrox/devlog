import {
  assert,
  ShrinkingList,
  weakRefUndefined,
  derefMany,
  memoize,
  nothing
} from "./util.js";
import {
  assertLazy,
  assertConstructing,
  eagerConstructor,
} from "./lazyConstructors.js";

const k = (x) => () => x;

// TODO clarify "sink" vs [Sink] and "source" vs [EventSource].
// TODO update all comments.

// Don't mentally overcomplicate garbage collection. We only need these guarantees:
//   Strong references to a [Sink]s can only be held by parents, a modulator, or an input callback.
//   Strong references to a [Sink] can't exist after [destroy] is called.
//   When a [Sink] gets finalized, it calls [destroy] on its [EventSource].
//   Strong references to an [EventSource]s can only be held by children, a modulatee, or the library caller.
//   Strong references to an [EventSource] can't exist after [destroy] is called, except those from the library user.
//   When an [EventSource] gets finalized, it calls [destroy] on its [Sink].

// "Pushable" means the [Sink] is strongly referenced.
// "Pullable" means the [EventSource] is strongly referenced.

// Methods that are private to this module.
const mapWeakParents = Symbol();
const isFirstParent = Symbol();
const forEachParent = Symbol();
const getPriority = Symbol();
const removeFromParents = Symbol();
const destroy = Symbol();
const getWeakSink = Symbol();
const getWeakVariable = Symbol();
const getVariable = Symbol();

const incrementPriority = (weakParents) =>
  Math.max(
    -1,
    ...derefMany(weakParents).map((parent) => parent[getPriority]())
  ) + 1;

// Neither of these will interrupt [Push.push]
const finalizers = new FinalizationRegistry(
  (weakRef) => eagerConstructor(() => weakRef.deref()?.[destroy]()) // Wrap in [eagerConstructor] to meet an assertion in [deactivate].
);
const sourceLinkFinalizers = new FinalizationRegistry((weakChildLink) =>
  weakChildLink.deref()?.removeOnce()
);

class Sink {
  // These 3 variables interact with each other a lot.
  #weakParents;
  #weakParentLinks;
  #children;
  // This variable is largely independent of the other ones,
  // but refactoring it into its own class would expose more methods.
  #priority;

  constructor(weakParents) {
    this.#setWeakParents(weakParents);
    this.#children = new ShrinkingList();
    this.#priority = incrementPriority(weakParents);
  }

  switch(weakParent) {
    assert(this.#weakParents.length <= 1);
    this[removeFromParents]();
    this.#setWeakParents([weakParent]);
    weakParent.deref()?.#switchPriority(this.#priority);
  }

  // These symbol methods are only used by derived classes,
  // but making protected methods is too confusing in JavaScript.

  [mapWeakParents](f) {
    return this.#weakParents.map(f);
  }

  // Used for early exits from [EventSink.switch]
  [isFirstParent](weakParent) {
    return weakParent.deref() === this.#weakParents[0]?.deref();
  }

  [forEachParent](f) {
    derefMany(this.#weakParents).forEach(f);
  }

  [getPriority]() {
    return this.#priority;
  }

  // Removes all strong references from the [#children] of [#weakParents].
  [removeFromParents]() {
    for (const weakParentLink of this.#weakParentLinks) {
      weakParentLink.deref()?.removeOnce();
    }
  }

  #setWeakParents(weakParents) {
    this.#weakParents = weakParents;
    this.#weakParentLinks = derefMany(weakParents).map(
      (parent) => new WeakRef(parent.#children.add(this))
    );
  }

  // TODO custom error message for infinite recursion
  #switchPriority(childPriority) {
    if (childPriority <= this.#priority) {
      this.#priority = childPriority - 1;
      this[forEachParent]((parent) => parent.#switchPriority(this.#priority));
    }
  }
}

// There's an efficiency tradeoff for long chains of events of size s that only rarely get pushed.
//   In     the current   implementation,      pushing an event implies pushing its active children.
//   There's an alternate implementation where pushing an event implies pushing its        children.
//   Case a means (we push a parent of the first event) while (the first event is inactive).
//   Case b means (we [activate]       the last  event) while (the first event is inactive).
//   Case c means (we [deactivate]     the last  event) while
//     (the first event's active nested children are all
//       ((a nested parent of the last event) or (equal to the last event))).
//   Computation costs of each case in each implementation:
//            Current Alternate
//     Case a    O(1)      O(s)
//     Case b    O(s)      O(1)
//     Case c    O(s)      O(1)
//   I prefer the current implementation because:
//     The costs of pushing may dwarf the costs of activation and deactivations, making case a more important.
//     I can't think of any non-contrived examples where this tradeoff would matter.
//     Long chains of events can typically be refactored into state machines anyways.
// The reason we use inheritance instead of composition is so that the elements of
// [#weakParents], [#weakParentLinks], [#children], and [#activeChildren] are instances of [EventSink].
class EventSink extends Sink {
  #activeChildren;
  #activeChildRemovers;
  #enforceManualDeactivation;
  // These variables are independent of the other ones,
  // but they're too small to refactor into their own classes.
  #push;
  #unsubscribe;

  constructor(
    weakParents,
    push,
    { unsubscribe = () => {}, enforceManualDeactivation = false }
  ) {
    super(weakParents);
    this.#activeChildren = new ShrinkingList();
    this.#activeChildRemovers = [];
    this.#enforceManualDeactivation = enforceManualDeactivation; // Only used for output events.
    this.#push = push;
    this.#unsubscribe = unsubscribe; // Only used for input events.
  }

  activate() {
    assertConstructing();
    if (this.#activeChildRemovers.length !== 0) {
      // Filters out all sinks that are already active, except for inputs.
      return;
    }
    this[forEachParent]((parent) => {
      parent.activate();
      this.#activeChildRemovers.push(
        new WeakRef(parent.#activeChildren.add(this))
      );
    });
  }

  deactivate() {
    assertConstructing();
    for (const deactivator of this.#activeChildRemovers) {
      deactivator.deref()?.removeOnce();
    }
    this.#activeChildRemovers = [];
    this[forEachParent]((parent) => {
      if (parent.#activeChildren.isEmpty()) {
        // From one to zero children.
        parent.deactivate();
      }
    });
  }

  switch(parentSource) {
    assertConstructing();
    const weakParent = parentSource[getWeakSink]();
    // This early exit is an O(# of nested parents) optimization.
    if (this[isFirstParent](weakParent)) {
      return;
    }
    this.deactivate();
    super.switch(weakParent);
    const hasActiveChild = !this.#activeChildren.isEmpty();
    if (hasActiveChild) {
      this.activate();
    }
  }
  
  *pushValue(context, value) {
    assertLazy();
    context.writeEvent(this, value);
    yield* this.#iterateActiveChildren();
  }

  *push(context) {
    assertLazy();
    // TODO update this guard to account for [filter]s and [output]s.
    if (context.readEvent(this) !== nothing) {
      // Guards against being called more than once.
      return;
    }
    const action = this.#push(
      ...this[mapWeakParents]((weakParent) => context.readEvent(weakParent.deref()))
    );
    const value = context.doAction(action);
    if (value === nothing) {
      return [];
    }
    context.writeEvent(this, value);
    yield* this.#iterateActiveChildren();
  }

  *#iterateActiveChildren() {
    for (const sink of this.#activeChildren) {
      assertLazy();
      yield { priority: sink[getPriority](), sink };
    }
  }

  // Removes all strong references to [this].
  // [removeFromParents] and [deactivate] take care of the strong references from parents.
  // [unsubscribe] contractually takes care of the strong references from input callbacks.
  // We don't need to worry about the strong references from modulators because
  // the unpullability of [this] implies the unpullability of any modulators.
  // It doesn't matter how long you wait to call this method
  // because pushing an unpullable sink has no side effects.
  [destroy]() {
    if (this.#enforceManualDeactivation) {
      assert(this.#activeChildRemovers.length === 0);
    } else {
      this.deactivate();
    }
    this.#unsubscribe();
    super[removeFromParents]();
  }
}

class EventSource {
  #weakChildLinks;
  #parents;
  #weakSink;

  constructor(parents, sink) {
    this.#weakSink = new WeakRef(sink);
    this.#weakChildLinks = new ShrinkingList();
    this.#parents = new ShrinkingList();
    // [this.#isPushable()] is true because we have a strong reference to [sink], even if temporarily.
    parents.forEach((parent) => this.addParent(parent));
  }

  // Not used in derived class [BehaviorSource], but enforcing this boundary would just complicate things.
  addParent(parent) {
    assertConstructing();
    // An unpushable source won't get new parents because then the sink would have to get new parents too,
    // which is impossible because the sink was supposed to be garbage collected.
    assert(this.#isPushable());
    // Ensures [parent] doesn't recieve new strong references after it's [destroy]ed.
    if (!parent.#isPushable()) {
      return;
    }
    const parentLink = this.#parents.add(parent);
    const childLink = parent.#weakChildLinks.add(new WeakRef(parentLink));
    // Removal of [#parents] triggers GC of parents' [#weakChildLinks]
    sourceLinkFinalizers.register(parentLink, new WeakRef(childLink));
  }

  // Sets or removes the 2nd parent of an [EventSource] that has 1 or 2 parents,
  // [this.#isPushable()] must be guaranteed by the caller.
  // Not used in derived class [BehaviorSource], but enforcing this boundary would just complicate things.
  switch(parent) {
    assertConstructing();
    // There's a lot of coupling here, but basically [switchE]s can either have 1 or 2 parents.
    // The first parent is the modulator and the second parent
    // if it exists is the parent that pushes [this.#weakSink].
    // If there's more than one parent, remove the last one.
    if (this.#parents.getLast() !== this.#parents.getFirst()) {
      this.#parents.getLast().removeOnce();
    }
    assert(
      !this.#parents.isEmpty() &&
        this.#parents.getLast() === this.#parents.getFirst()
    ); // One parent
    this.addParent(parent);
  }

  [getWeakSink]() {
    return this.#weakSink;
  }

  [destroy]() {
    // Ensures no more [#parents] will be added to [this].
    assert(!this.#isPushable());
    // Remove elements from  childrens' [#parents].
    for (const weakChildLink of this.#weakChildLinks) {
      weakChildLink.deref()?.remove();
    }
    // [#weakChildLinks] will be cleaned up by [sourceLinkFinalizers].
    // [#parents] will be cleaned up when [destroy] gets called on each element of [#parents].
  }

  #isPushable() {
    return this.#weakSink.deref() !== undefined;
  }
}

// Some of the event's parents may not be passed into this function but added via [EventSource.addParent].
// The only parents passed here are the ones that [EventSink.push] immediately depends on.
export const newEventPair = (parentSources, push, options = {}) => {
  assertConstructing();
  const sink = new EventSink(
    parentSources.map((source) => source[getWeakSink]()),
    push,
    options
  );
  const source = new EventSource(parentSources, sink);
  finalizers.register(sink, new WeakRef(source));
  finalizers.register(source, source[getWeakSink]());
  return [sink, source];
};

// This class desperately wants to be refactored into 2 subclasses,
// but to keep the code style consistent I'd have to turn every combinator
// into a subclass of [Sink], which would be hard without metaprogramming.
class BehaviorSink extends Sink {
  #computedChildren;
  #computedChildRemovers; // Not used for [stepper]s.
  #weakVariable;
  #rememberedParentVariables; // Not used for [stepper]s.
  #evaluate; // Not used for [stepper]s.

  constructor(parentSources, { evaluate, initialValue }) {
    super(parentSources.map((parentSource) => parentSource[getWeakSink]()));
    this.#computedChildren = new ShrinkingList();
    this.#computedChildRemovers = [];
    // The strong references are from [BehaviorSource], uncomputed children, and children with more than one pushable parent,
    // which will need to access the value in the future.
    this.#weakVariable = new WeakRef({});
    this.#rememberedParentVariables =
      1 < parentSources.length
        ? parentSources.map((parentSource) => parentSource[getVariable]())
        : Array(parentSources.length);

    this.#evaluate = evaluate;
    // If [this] is a [stepper].
    if (evaluate === undefined) {
      this.#initializeValue(initialValue);
    } else {
      assert(initialValue === undefined);
      this.#initializeThunk();
    }
  }

  // Only used for [stepper]s.
  // Must only be called once per call of [this.#weakVariable.deref().thunk],
  // though we don't have any assertions for it right now.
  *pushValue(value) {
    assertLazy();
    if (this.#weakVariable.deref() === undefined) {
      this.#weakVariable = new WeakRef({});
    }
    this.#initializeValue(value);
    yield* this.#dequeueComputedChildren();
  }

  // Not used for [stepper]s.
  // TODO add asserion.
  // Must only be called once per call of [this.#weakVariable.deref().thunk],
  // though we don't have any assertions for it right now.
  *push() {
    assertLazy();
    if (this.#weakVariable.deref() === undefined) {
      this.#weakVariable = new WeakRef({});
    }
    this.#initializeThunk();
    yield* this.#dequeueComputedChildren();
  }

  [getWeakVariable]() {
    return this.#weakVariable;
  }

  // Only used for [stepper]s.
  #initializeValue(value) {
    assert(this.#computedChildRemovers.length === 0);
    assert(this.#rememberedParentVariables.length === 0);
    assert(this.#evaluate === undefined);
    // Assign to instead of replacing [weakVariable] because we want to
    // propagate the changes to any uncomputed children and to the source.
    this.#weakVariable.deref().thunk = () => value;
  }

  // Not used for [stepper]s.
  #initializeThunk() {
    assert(this.#computedChildRemovers.length === 0);
    assert(this.#rememberedParentVariables.length !== 0);
    assert(this.#evaluate !== undefined);
    const parentVariables = this.#getParentVariables();
    // The point of these 2 lines is to avoid capturing [this] in the closure.
    const evaluate = this.#evaluate;
    const weakThis = new WeakRef(this);
    // Assign to instead of replacing [weakVariable] because we want to
    // propagate the changes to any uncomputed children and to the source.
    this.#weakVariable.deref().thunk = memoize(() => {
      weakThis.deref()?.#addToComputedChildren();
      return evaluate(
        ...parentVariables.map((parentVariable) => parentVariable.thunk())
      );
    });
  }

  // Not used for [stepper]s.
  // We can be sure that the [deref]s work because the non-remembered [weakParent]s were just pushed.
  // This is a separate method because we need to avoid accidentally capturing [this] in neighboring closures.
  #getParentVariables() {
    return this[mapWeakParents](
      (weakParent, i) =>
        this.#rememberedParentVariables[i] ??
        weakParent.deref().#weakVariable.deref()
    );
  }

  // Not used for [stepper]s.
  #addToComputedChildren() {
    this[forEachParent]((parent) => {
      this.#computedChildRemovers.push(
        new WeakRef(parent.#computedChildren.add(this))
      );
    });
  }

  // Not needed for [stepper]s.
  #removeFromComputedChildren() {
    for (const remover of this.#computedChildRemovers) {
      remover.deref()?.removeOnce();
    }
    this.#computedChildRemovers = [];
  }
  
  *#dequeueComputedChildren() {
    for (const sink of this.#computedChildren) {
      assertLazy();
      // Mutating [this.#computedChildren] while iterating over it.
      sink.#removeFromComputedChildren();
      yield {priority: sink[getPriority](), sink};
    }
  }

  // Removes all strong references to [this].
  // [removeFromParents] and [removeFromComputedChildren] take care of the strong references from parents.
  // We don't need to worry about the strong references from modulators because
  // the unpullability of [this] implies the unpullability of any modulators.
  // It doesn't matter how long you wait to call this method
  // because pushing an unpullable sink has no side effects.
  [destroy]() {
    this.#removeFromComputedChildren();
    super[removeFromParents]();
  }
}

class BehaviorSource extends EventSource {
  #variable;

  constructor(parents, sink) {
    super(parents, sink);
    this.#variable = sink[getWeakVariable]().deref();
  }

  getCurrentValue() {
    assertLazy();
    return this.#variable.thunk();
  }

  [getVariable]() {
    return this.#variable;
  }
}

export const newBehaviorPair = (parentSources, options) => {
  assertConstructing();
  const sink = new BehaviorSink(parentSources, options);
  const source = new BehaviorSource(parentSources, sink);
  finalizers.register(sink, new WeakRef(source));
  finalizers.register(source, source[getWeakSink]());
  return [sink, source];
};
