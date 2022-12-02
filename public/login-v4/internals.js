import { assert, ShrinkingList, weakRefUndefined, derefMany } from "./util.js";
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
const readParents = Symbol();
const isFirstParent = Symbol();
const forEachParent = Symbol();
const destroy = Symbol();
const getPriority = Symbol();
const getWeakSink = Symbol();

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

// TODO implied variable name prefixes
class Sink {
  // These 3 variables interact with each other a lot.
  #weakParents;
  #weakParentLinks;
  #children;
  // These 2 variables are largely independent of the other ones.
  // I'd refactor them into their own classes, but
  //   if I factored out [priority] it'd expose more class methods,
  //   and [unsubscribe] is just to small to factor out.
  #priority;
  #unsubscribe; // TODO is this needed for behaviors?

  constructor(weakParents, unsubscribe) {
    this.#setWeakParents(weakParents);
    this.#children = new ShrinkingList();
    this.#priority = incrementPriority(weakParents);
    this.#unsubscribe = unsubscribe; // Only used for input events
  }

  switch(weakParent) {
    assert(this.#weakParents.length <= 1);
    this.#removeFromParents();
    this.#setWeakParents([weakParent]);
    weakParent.deref()?.#switchPriority(this.#priority);
  }

  // TODO can we use this both for behaviors and events?
  [readParents](read) {
    return this.#weakParents.map((weakParent) => read(weakParent));
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

  // Guarantees the garbage collection of this sink because the only strong references
  // to it are from the parents' [#children], unpullable modulators, and input callbacks.
  [destroy]() {
    this.#removeFromParents();
    this.#unsubscribe(); // Contractually removes strong references from input callbacks.
  }

  #setWeakParents(weakParents) {
    this.#weakParents = weakParents;
    this.#weakParentLinks = derefMany(weakParents).map(
      (parent) => new WeakRef(parent.#children.add(this))
    );
  }

  #removeFromParents() {
    for (const weakParentLink of this.#weakParentLinks) {
      weakParentLink.deref()?.removeOnce();
    }
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
  #deactivators;
  #enforceManualDeactivation;
  // This variable is independent of the other ones,
  // but it's too small to factor into its own class.
  #push;

  constructor(
    weakParents,
     push,
    { unsubscribe = () => {}, enforceManualDeactivation = false }
  ) {
    super(weakParents, push, unsubscribe);
    this.#activeChildren = new ShrinkingList();
    this.#deactivators = [];
    this.#enforceManualDeactivation = enforceManualDeactivation; // Only used for output events.
    this.#push = push;
  }

  // Iterate instead of returning the list itself for the sake of encapsulation.
  *iterateActiveChildren() {
    for (const sink of this.#activeChildren) {
      assertLazy();
      yield { priority: sink[getPriority](), sink };
    }
  }

  activate() {
    assertConstructing();
    if (this.#deactivators.length !== 0) {
      // Filters out all sinks that are already active, except for inputs.
      return;
    }
    this[forEachParent]((parent) => {
      parent.activate();
      this.#deactivators.push(new WeakRef(parent.#activeChildren.add(this)));
    });
  }

  deactivate() {
    assertConstructing();
    for (const deactivator of this.#deactivators) {
      deactivator.deref()?.removeOnce();
    }
    this.#deactivators = [];
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

  // This function is pure, but we name it "push" because
  // it returns an imperative command that the caller executes.
  push(read) {
    assertLazy();
    return this.#push(...this[readParents](read));
  }

  // Guarantees the garbage collection of this sink because [#activeChildren]
  // has the only strong references that [super] doesn't account for.
  // Such deativation is only be needed for modulators or their nested parents.
  // It doesn't matter how long you wait to call this method
  // because pushing an unpullable sink has no side effects.
  [destroy]() {
    if (this.#enforceManualDeactivation) {
      assert(this.#deactivators.length === 0);
    } else {
      this.deactivate();
    }
    super[destroy]();
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

class BehaviorSink extends Sink {
  constructor(weakParents, initialValue, push) {
    super(weakParents, () => {});
    // TODO make truly private.
    this._push = push;
    this._weakVariable = new WeakRef({ thunk: () => initialValue });
  }

  setValue(value) {
    assertLazy();
    // The change gets propagated to the source because the source has a reference to [this._weakVariable.deref()].
    this._weakVariable.deref().thunk = () => value;
  }
}

class BehaviorSource extends EventSource {
  constructor(parents, sink) {
    super(parents, sink);
    // TODO make truly private.
    this._variable = sink._weakVariable.deref();
  }

  getCurrentValue() {
    assertLazy();
    return this._variable.thunk();
  }
}

// TODO factor out similarities with [newEventPair].
export const newBehaviorPair = (parentSources, initialValue, push) => {
  const sink = new BehaviorSink(
    parentSources.map((source) => source[getWeakSink]()),
    initialValue,
    push
  );
  const source = new BehaviorSource(parentSources, sink);
  finalizers.register(sink, new WeakRef(source));
  finalizers.register(source, source[getWeakSink]());
  return [sink, source];
};
