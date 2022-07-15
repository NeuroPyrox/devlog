import { assert, ShrinkingList, weakRefUndefined, derefMany } from "./util.js";

import { readSink } from "./push.js"; // Circular dependency

const k = (x) => () => x;

// TODO restrict surface area by making mutations monadic
// TODO rename "poll"
// TODO update "EventSink", "EventSource", "BehaviorSink", "BehaviorSource" comments

// The purpose of all these complicated comments is to clarify what could otherwise be vague language.
// There's still a lot of vagueness remaining, but I think the exact meanings can be inferred.
// TODO rigorously define these properties:
//   No infinite loops.
//   Only modulators, parents, and pushers can strongly reference a sink.
//   Only children and and lazy constructors can strongly reference a source.
//   The graph of sources lines up with the graph of sinks.
//   Sink destructors remove all strong references to the object.
//   Source destructors remove all strong references to the objecct except from lazy constructors.
//   Destructors can be called in any order with arbitrary delay.
//   Unpullable sinks won't do anything when you push them.
//   Behavior variables are only strongly referenced from places that might want their value.
//   When a behavior is computed, all its parents are computed.
//   When a behavior becomes uncomputed, all its children become uncomputed.
//   Only computed behaviors get pushed.
//   Only computed behaviors can have computed children.
//   Only uncomputed behaviors can have uncomputed parents.
// 1. (A [WeakRef] of x) means (y where (at all points in time [(y.deref() === x) !== (y.deref() === undefined)])).
//   A. At some point in time [y.deref() === x].
//   B. [y.deref() === x]         implies (always in the past   [y.deref() === x]).
//   C. [y.deref() === undefined] implies (always in the future [y.deref() === undefined]). (Deducible from 1, B)
//   D. (z is a [WeakRef] of x) implies (at all points in time [y.deref() === x.deref()]).
// 2. ((x strongly references y) and (y strongly references z)) implies (x strongly references z).
// 3. for all x, exactly one is true: (x is live), (x is garbage), (x is dead).
//   We don't consider the case of x being uninitialized because all the logic works without it.
//   A. (x is live) means ((the root object) strongly references x).
//   B. (x is dead) means ((y is a [WeakRef] of x) implies [y.deref() === undefined]).
//   C. (x is garbage) means (x is neither dead nor live).
//   D. (x is live) implies:
//     I. (y is a [WeakRef] of x) implies [y.deref() === x]. (Deducible from 1.D, 3, B)
//     II. (x strongly references y) implies (y is live).    (Deducible from 2, A)
//     III. x was always live.
//   E. (x is garbage) implies:
//     I. (y is a [WeakRef] of x) implies [y.deref() === x]. (Deducible from 3, B, 1.D)
//     II. (y strongly references x) implies (y is garbage).
//     III. x was always (live or garbage).
//     IV. x will always be (garbage or dead).
//   F. (x is dead) implies:
//     I. nothing strongly references x.
//     II. x strongly references nothing.
//     III. x will always be dead.
// (Garbage collection) means (some garbage x become dead).
// A sink   means a ([EventSink]   or [BehaviorSink]).
// A source means a ([EventSource] or [BehaviorSource]).
// TODO delay parent definitions
// (Sink   x is a parent of sink   y) means (x is live and [x.#children] contains y).
// (Source x is a parent of source y) means (y is live and [y.#parents]  contains x).
// (x is a child  of y) means (y is a parent of x).
// (x is a nested parent of y) means (y is a nested child of x) means (x is a parent of (y or one of y's nested parents)).
//   (sink   x is a nested parent of sink   y) implies (x and y are both an [EventSink])   xor (x and y are both a [BehaviorSink]).
//   (source x is a nested parent of source y) implies (x and y are both an [EventSource]) xor (x and y are both a [BehaviorSource]).
// (the sink of source o) means (i where (o is live and [o.#weakSink] is a [WeakRef] of i) or (o is dead and i was the sink of o)).
//   (j is the sink of o) iff [i === j].
//   (i is the sink of p) iff [o === p].
//   (o is a [EventSource] and i is a [EventSink]) xor (o is a [BehaviorSource] and i is a [BehaviorSink]).
// An event    (i,o) is a [EventSink]    i and a [EventSource]    o where (i is the sink of o).
// A  behavior (i,o) is a [BehaviorSink] i and a [BehaviorSource] o where (i is the sink of o).
// A reactive (i,o) is an event (i,o) or a behavior (i,o).
//   Equivalently, ((i,o) is a reactive) iff ((i is a sink) and (o is a source) and (i is the sink of o)).
//   (the sink   of (i,o)) means i.
//   (the source of (i,o)) means o.
// TODO sink and source properties
// TODO do we need to specify strong and weak?
// (Reactive r is            pushable) means (the sink   of r is live).
// (Reactive r is weakly   unpushable) means (the sink   of r is garbage).
// (Reactive r is strongly unpushable) means (the sink   of r is dead).
// (Reactive r is            pullable) means (the source of r is live).
// (Reactive r is weakly   unpullable) means (the source of r is garbage).
// (Reactive r is strongly unpullable) means (the source of r is dead).
// TODO How to tell between a modulator and a parent? TODO make rigorous.
//   The way one sink references the other
//   What if the sink is dead?
//     Then the parents of the source couldn't have changed and we rewind to when the sink was still alive.
// TODO input/output reactives
// TODO empty
// TODO parents
// (Reactive (i,o) gets polled) means ([i.deref().poll] gets called).
// (x gets destroyed) means ([x.destroy] gets called).
// (Reactive r get polled) implies (r is pushable).
// (The sink   of reactive r gets destroyed) implies (r is unpullable).
// (The source of reactive r gets destroyed) implies (r is unpushable).
// TODO what about source references?
// TODO Possible parent relationships:
//   ([undefined], unpullable) parent of ([undefined], unpullable)
//   ([undefined],   pullable) parent of ([undefined],   pullable)
// (Reactive (i,o) is a parent    of reactive (j,p)) means (i.#children strongly references j and j is not [undefined]).
// (Reactive (i,o) is a modulator of reactive (j,p)) means (i.#poll     strongly references j and j is not [undefined]).
// (Reactive x is a modulatee of reactive y) means (y is a modulator of x)
// TODO update comment
// (Reactive x strongly references reactive y) implies (x is a parent of y) xor (x is a modulator of y).
// (Reactive x is a parent    of reactive y) implies (x and y are both events) xor (x and y are both behaviors).
// (Reactive x is a modulator of reactive y) implies:
//   x is an event.
//   x is the only modulator of y.
//   y is the only modulatee of x.
//   x has no children.
//   x has no modulators.
//   x has one parent.
// (Reactive x is a nested parent of reactive y) implies:
//   (x and y are both events) xor (x and y are both behaviors).
//   y isn't a nested parent of x.
// (A chain of reactives) means (a finite strict total order of reactives) where:
//   x<y means x is a parent of y.
//   The first reactive means the least    element in the order.
//   The last  reactive means the greatest element in the order.
// In a chain of reactives, (every reactive is an event) xor (every reactive is a behavior).
// TODO when do we use this definition?
// (x weakly references y) means ((x strongly references (weak) y) or (x weakly references (weak) y)).

const incrementPriority = (weakParents) =>
  Math.max(
    -1,
    ...derefMany(weakParents).map((parent) => parent.getPriority())
  ) + 1;

// Neither of these will interrupt [Push.push]
const finalizers = new FinalizationRegistry((weakRef) =>
  weakRef.deref()?.destroy()
);
const sourceLinkFinalizers = new FinalizationRegistry((weakChildLink) =>
  weakChildLink.deref()?.removeOnce()
);

class ReactiveSink {
  #weakParents;
  #weakParentLinks;
  #children;
  #unsubscribe;

  constructor(weakParents, unsubscribe) {
    this.#setWeakParents(weakParents);
    this.#children = new ShrinkingList();
    this.#unsubscribe = unsubscribe; // Only used for input events
  }

  // TODO can we use this both for behaviors and events?
  *readParents() {
    const parentValues = [];
    for (const weakParent of this.#weakParents) {
      parentValues.push(yield readSink(weakParent.deref()));
    }
    return parentValues;
  }

  // First parent is [undefined] if not found.
  // Used for early exits from [EventSink.switch]
  isFirstParent(parent) {
    return parent === this.#weakParents[0]?.deref();
  }

  switch(weakParent) {
    assert(this.#weakParents.length <= 1);
    this.#removeFromParents();
    this.#setWeakParents(weakParent.deref() === undefined ? [] : [weakParent]);
  }

  forEachParent(f) {
    derefMany(this.#weakParents).forEach(f);
  }

  // Guarantees the garbage collection of this sink because the only strong references
  // to it are from the parents' [#children], unpullable modulators, and input callbacks.
  destroy() {
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
}

// TODO define "active"
// TODO define "inactive"
// TODO define "push"
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
//   We prefer the current implementation because:
//     Case a in the alternate implementation may be cost much more than O(s) if some events are expensive to compute.
//     I can't think of any non-contrived examples where this tradeoff would matter.
//     Long chains of events can typically be refactored into state machines anyways.
class EventSinkActivation extends ReactiveSink {
  #activeChildren;
  #deactivators;

  constructor(weakParents, unsubscribe) {
    super(weakParents, unsubscribe);
    this.#activeChildren = new ShrinkingList();
    this.#deactivators = [];
  }

  // Iterate instead of returning the list itself because we don't
  // want the function caller to add or remove any children.
  *iterateActiveChildren() {
    yield* this.#activeChildren;
  }

  activate() {
    if (this.#deactivators.length !== 0) {
      // Filters out all sinks that are already active, except for inputs.
      return;
    }
    this.forEachParent((parent) => {
      parent.activate();
      this.#deactivators.push(new WeakRef(parent.#activeChildren.add(this)));
    });
  }

  deactivate() {
    for (const deactivator of this.#deactivators) {
      deactivator.deref()?.removeOnce();
    }
    this.#deactivators = [];
    this.forEachParent((parent) => {
      if (parent.#activeChildren.isEmpty()) {
        // From one to zero children.
        parent.deactivate();
      }
    });
  }

  switch(weakParent) {
    this.deactivate();
    super.switch(weakParent);
    const hasActiveChild = !this.#activeChildren.isEmpty();
    if (hasActiveChild) {
      this.activate();
    }
  }

  // Guarantees the garbage collection of this sink because [#activeChildren]
  // has the only strong references that [super] doesn't account for.
  // It doesn't matter how long you wait to call this method
  // because pushing an unpullable sink has no side effects.
  destroy() {
    this.deactivate(); // Modulators are an example of a sink that will only deactivate once it's unpullable.
    super.destroy();
  }
}

// We split this class up into an inheritance chain because the variable interactions cluster together,
// and it's easier for me to keep it all in my head this way.
// The reason we use inheritance instead of composition is because the elements of
// [#weakParents], [#weakParentLinks], [#children], and [#activeChildren] are instances of [EventSink].
class EventSink extends EventSinkActivation {
  #priority;
  #poll;

  constructor(weakParents, poll, unsubscribe) {
    super(weakParents, unsubscribe);
    this.#priority = incrementPriority(weakParents);
    this.#poll = poll;
  }

  getPriority() {
    return this.#priority;
  }

  *poll() {
    return yield* this.#poll(...(yield* this.readParents()));
  }

  // TODO when can this be called?
  switch(weakParent) {
    const parent = weakParent.deref();
    if (this.isFirstParent(parent)) {
      return;
    }
    super.switch(weakParent);
    parent?.#switchPriority(this.#priority);
  }

  // TODO custom error message for infinite recursion
  #switchPriority(childPriority) {
    if (childPriority <= this.#priority) {
      this.#priority = childPriority - 1;
      this.forEachParent((parent) => parent.#switchPriority(this.#priority));
    }
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
    // [this.#isPushable()] because we have a strong reference to [sink], even if temporary.
    parents.forEach((parent) => this.addParent(parent));
  }

  // TODO when can this be called?
  getWeakSink() {
    return this.#weakSink;
  }

  // TODO when can this be called?
  addParent(parent) {
    // By definition, an unpushable source won't be assigned new parents.
    // If we do assign an unpushable source new parents,
    // either [this] will keep [parent] alive even when [parent] won't push to [this],
    // or [parent] will push to [this], contradicting [this] being unpushable.
    assert(this.#isPushable());
    // Ensures [destroy] cleans up all [#parents] and [#weakChildLinks].
    if (!parent.#isPushable()) {
      return;
    }
    const parentLink = this.#parents.add(parent);
    const childLink = parent.#weakChildLinks.add(new WeakRef(parentLink));
    // Removal of [#parents] triggers GC of parents' [#weakChildLinks]
    sourceLinkFinalizers.register(parentLink, new WeakRef(childLink));
  }

  // TODO when can this be called?
  // Sets or removes the 2nd parent of an [EventSource] that has 1 or 2 parents,
  // [this.#isPushable()] must be guaranteed by the caller.
  switch(parent) {
    // There's a lot of coupling here, but basically [switchE]s can either have 1 or 2 parents.
    // The first parent is the modulator and the second parent
    // if it exists is the parent that pushes [this.#weakSink].
    // Check if there's more than one parent.
    if (this.#parents.getLast() !== this.#parents.getFirst()) {
      this.#parents.getLast().removeOnce();
    }
    assert(
      !this.#parents.isEmpty() &&
        this.#parents.getLast() === this.#parents.getFirst()
    ); // One parent
    this.addParent(parent);
  }

  destroy() {
    // Ensures no more [_weakParentLinks] or [#parents] will be added to [this].
    assert(!this.#isPushable());
    // Remove elements from  childrens' [#parents].
    for (const weakChildLink of this.#weakChildLinks) {
      weakChildLink.deref()?.remove();
    }
    // [#weakChildLinks] will be cleaned up by [sourceLinkFinalizers].
    // [#parents] will be cleaned up when [destroy] gets called on each element of [#parents].
  }

  // In theory this isn't private because of [this.getWeakSink], but I don't want to pollute the interface.
  #isPushable() {
    return this.#weakSink.deref() !== undefined;
  }
}

// Some of the event's parents may not be passed into this function but added via [EventSource.addParent].
// The only parents passed here are the ones that [EventSink.poll] immediately depends on.
// Possible O(1) optimization: similar function that has a special case for all [parentSources] being unpushable.
const newEventPair = (parentSources, poll, unsubscribe = () => {}) => {
  const sink = new EventSink(
    parentSources.map((source) => source.getWeakSink()),
    poll,
    unsubscribe
  );
  const source = new EventSource(parentSources, sink);
  finalizers.register(sink, new WeakRef(source));
  finalizers.register(source, source.getWeakSink());
  return [sink, source];
};

class BehaviorSink extends ReactiveSink {
  #priority;

  constructor(weakParents, initialValue, poll) {
    super(weakParents, () => {});
    this.#priority = incrementPriority(weakParents);
    this._poll = poll;
    this._weakVariable = new WeakRef({ thunk: () => initialValue });
  }

  getPriority() {
    return this.#priority;
  }
  
  setValue(value) {
    // The change gets propagated to the source because the source has a reference to [this._weakVariable.deref()].
    this._weakVariable.deref().thunk = () => value;
  }
}

class BehaviorSource extends EventSource {
  constructor(parents, sink) {
    super(parents, sink);
    this._variable = sink._weakVariable.deref();
  }

  getCurrentValue() {
    return this._variable.thunk();
  }
}

// TODO factor out similarities with [newEventPair].
const newBehaviorPair = (parentSources, initialValue, poll) => {
  const sink = new BehaviorSink(
    parentSources.map((source) => source.getWeakSink()),
    initialValue,
    poll
  );
  const source = new BehaviorSource(parentSources, sink);
  finalizers.register(sink, new WeakRef(source));
  finalizers.register(source, source.getWeakSink());
  return [sink, source];
};

export { newEventPair, newBehaviorPair };
