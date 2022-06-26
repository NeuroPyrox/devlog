import { assert, ShrinkingList, weakRefUndefined, derefMany } from "./util.js";

import { readSink } from "./push.js"; // Circular dependency

const k = (x) => () => x;

// TODO restrict surface area by making mutations monadic

// The purpose of all these complicated comments is to clarify what could otherwise be vague language.
// Given: strong reference, root object
// (x is garbage) means (the root object doesn't strongly reference x).
// (x is garbage) implies:
//   Anything that strongly references x is garbage.
// (x is not garbage) implies:
//   Anything that x strongly references is not garbage.
//   (x is the root object) or (x is strongly referenced by some y where (y is not garbage)).
// A (weak x) y means a [WeakRef] y where [y.deref() === undefined] or [y.deref()] is an x.
//   ((weak) y) means a (weak x) y.
//   A (weak x) means a (weak x) y.
//   ((weak) x is live) means [x.deref() !== undefined].
//   ((weak) x is dead) means [x.deref() === undefined].
//   ((weak) x is dead) implies ((weak) x will never be live).
//   ((weak) x has garbage) means (x is live and [x.deref()] is garbage).
//   ((weak) x has garbage) implies (x will always (have garbage or be dead)).
//   ((weak) x is strictly live) means ((x is live) and (x doesn't have garbage)).
//   for all (weak) x, ((x is strictly live) xor (x has garbage) xor (x is dead)).
//   ((weak) x has garbage) doesn't equate to (x is garbage).
// (garbage collection) means (some (weak x) that have garbage become dead).
// A sink   means a weak ([EventSink]   or [BehaviorSink]).
// A source means a weak ([EventSource] or [BehaviorSource]).
// (sink   x is a parent of sink   y) means (x is live and y is live and [x.deref().#children] strongly references [y.deref()]).
// (source x is a parent of source y) means (x is live and y is live and [y.deref().#parents]  strongly references [x.deref()]).
// (x is a child  of y) means (y is a parent of x).
// TODO update mentions of "weak"
// TODO sink and source properties
// (sink   x is pushable) means (x is strictly live).
// (source x is pullable) means TODO.
// (x is a nested parent of y) means (y is a nested child of x) means (x is a parent of (y or one of y's nested parents)).
//   (sink   x is a nested parent of sink   y) implies (x and y are both an [EventSink])   xor (x and y are both a [BehaviorSink]).
//   (source x is a nested parent of source y) implies (x and y are both an [EventSource]) xor (x and y are both a [BehaviorSource]).
// (The sink of a live source o) means [o.#weakSink.deref()].
// (The source of a live sink i) means ((the unique live source o where the sink of o is i) or ([undefined] if no such live source exists)).
// (Live sink i is the sink of live source o) iff (o is the source of i).
// (sink i pairs with source o) means (source o pairs with sink i) means ((i is the sink of o) or (o is the source of i)).
//   An [EventSink]      can only pair with a weak [EventSource].
//   An [EventSource]    can only pair with a weak [EventSink].
//   A  [BehaviorSink]   can only pair with a weak [BehaviorSource].
//   A  [BehaviorSource] can only pair with a weak [BehaviorSink].
//   [undefined] can pair with an ([EventSink] or [EventSource] or [BehaviorSink] or [BehaviorSource]).
// An event    (i,o) is a weak [EventSink]    i and a weak [EventSource]    o where i pairs with o.
// A  behavior (i,o) is a weak [BehaviorSink] i and a weak [BehaviorSource] o where i pairs with o.
// A reactive (i,o) is an event (i,o) or a behavior (i,o).
//   Equivalently, ((i,o) is a reactive) iff (i is a sink, o is a source, and i pairs with o).
// TODO what about source references?
// TODO Possible parent relationships:
//   ([undefined], unpullable) parent of ([undefined], unpullable)
//   ([undefined],   pullable) parent of ([undefined],   pullable)
// (reactive (i,o) is a parent    of reactive (j,p)) means (i.#children strongly references j and j is not [undefined]).
// (reactive (i,o) is a modulator of reactive (j,p)) means (i.#poll     strongly references j and j is not [undefined]).
// (reactive x is a modulatee of reactive y) means (y is a modulator of x)
// TODO update comment
// (reactive x strongly references reactive y) implies (x is a parent of y) xor (x is a modulator of y).
// (reactive x is a parent    of reactive y) implies (x and y are both events) xor (x and y are both behaviors).
// (reactive x is a modulator of reactive y) implies:
//   x is an event.
//   x is the only modulator of y.
//   y is the only modulatee of x.
//   x has no children.
//   x has no modulators.
//   x has one parent.
// (reactive x is a nested parent of reactive y) implies:
//   (x and y are both events) xor (x and y are both behaviors).
//   y isn't a nested parent of x.
// (A chain of reactives) means (a finite strict total order of reactives) where:
//   x<y means x is a parent of y.
//   The first reactive means the least    element in the order.
//   The last  reactive means the greatest element in the order.
// In a chain of reactives, (every reactive is an event) xor (every reactive is a behavior).
// TODO when do we use this definition?
// (x weakly references y) means ((x strongly references (weak) y) or (x weakly references (weak) y)).

// None of these finalizers will interrupt [Push.push]
const sinkFinalizers = new FinalizationRegistry((weakSource) =>
  weakSource.deref()?.onUnpushable()
);
const sourceFinalizers = new FinalizationRegistry((weakSink) =>
  weakSink.deref()?.onUnpullable()
);
const sourceLinkFinalizers = new FinalizationRegistry((weakChildLink) =>
  weakChildLink.deref()?.removeOnce()
);

class EventSinkLinks {
  #weakParents;
  #weakParentLinks;
  #children;
  #unsubscribe;

  constructor(weakParents, unsubscribe) {
    this.#setWeakParents(weakParents);
    this.#children = new ShrinkingList();
    this.#unsubscribe = unsubscribe; // Only used for input events
  }

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
    for (const weakParent of this.#weakParents) {
      const parent = weakParent.deref();
      if (parent !== undefined) {
        f(parent);
      }
    }
  }

  // Guarantees the garbage collection of this sink because the only strong references
  // to it are from the parents' [#children], unpullable modulators, and input callbacks.
  onUnpullable() {
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
class EventSinkActivation extends EventSinkLinks {
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
  onUnpullable() {
    this.deactivate(); // Modulators are an example of a sink that will only deactivate once it's unpullable.
    super.onUnpullable();
  }
}

// We split this class up into an inheritance chain because the variable interactions cluster together,
// and it's easier for me to keep it all in my head this way.
// The reason we use inheritance instead of composition is because the elements of
// [#weakParents], [#weakParentLinks], [#children], and [#activeChildren] are instances of [EventSink].
// [EventSink]s can either be pushable, lazily unpushable, or eagerly unpushable.
//   Unpushable ones are either lazily unpushable or eagerly unpushable.
//   Pushable ones are strongly referenced by at least one pushable [EventSink] parent or a push callback.
//     Pushable ones become lazily unpushable when all the sinks that reference them become unpushable,
//     or when [onUnpullable] is called.
//   Lazily unpushable ones are not pushable, but haven't been garbage collected yet.
//     They may be strongly referenced only by lazily unpushable sinks.
//     Lazily unpushable sinks become eagerly unpushable when they're garbage collected.
//   Eagerly unpushable
// [EventSink] A pushes [EventSink] B only if A is a parent of B or A pushes a parent of B.
class EventSink extends EventSinkActivation {
  #priority;
  #poll;

  constructor(weakParents, poll, unsubscribe) {
    super(weakParents, unsubscribe);
    this.#priority =
      Math.max(
        -1,
        ...derefMany(weakParents).map((parent) => parent.getPriority())
      ) + 1;
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
    // Ensures [onUnpushable] cleans up all [#parents] and [#weakChildLinks].
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

  onUnpushable() {
    // Ensures no more [_weakParentLinks] or [#parents] will be added to [this].
    assert(!this.#isPushable());
    // Remove elements from  childrens' [#parents].
    for (const weakChildLink of this.#weakChildLinks) {
      weakChildLink.deref()?.remove();
    }
    // [#weakChildLinks] will be cleaned up by [sourceLinkFinalizers].
    // [#parents] will be cleaned up when [onUnpushable] gets called on each element of [#parents].
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
  sinkFinalizers.register(sink, new WeakRef(source));
  sourceFinalizers.register(source, source.getWeakSink());
  return [sink, source];
};

// TODO semantics of pushability and pullability
// [BehaviorSink]s can either be pushable, lazily unpushable, or eagerly unpushable.
//   Unpushable ones are either lazily unpushable or eagerly unpushable.
//   Pushable ones are strongly referenced by at least one pushable [BehaviorSink] parent or pushable [EventSink] modulator.
//     Pushable ones become lazily unpushable when all the sinks that reference them become unpushable,
//     or when [onUnpullable] is called.
//   Lazily unpushable ones are not pushable, but haven't been garbage collected yet.
//     They may be strongly referenced only by lazily unpushable sinks.
//     Lazily unpushable sinks become eagerly unpushable when they're garbage collected.
//   Eagerly unpushable
// Behaviors can be split up unto 4 types: input, hidden, output, input-output.
// TODO eager vs lazy pushability
// There can be an unpullable sink whose variable is still referenced
class BehaviorSink {
  constructor(weakParents, initialValue, poll) {
    const parents = weakParents.map((weakParent) => weakParent.deref());
    this._children = new ShrinkingList();
    this._weakParents = weakParents;
    this._weakParentLinks = parents.map(
      (parent) => new WeakRef(parent._children.add(this))
    );
    this._priority =
      parents.length === 0
        ? 0
        : Math.max(...parents.map((parent) => parent.getPriority())) + 1;
    this._poll = poll;
    this._weakVariable = new WeakRef({ thunk: () => initialValue });
  }

  onUnpullable() {
    for (const weakParentLink of this._weakParentLinks) {
      weakParentLink.deref()?.removeOnce();
    }
    this._weakParents = [];
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
  sinkFinalizers.register(sink, new WeakRef(source));
  sourceFinalizers.register(source, source.getWeakSink());
  return [sink, source];
};

export { newEventPair, newBehaviorPair };
