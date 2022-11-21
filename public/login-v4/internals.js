import { assert, ShrinkingList, weakRefUndefined, derefMany } from "./util.js";

const k = (x) => () => x;

// TODO restrict surface area by making mutations monadic
// TODO rename "poll"
// TODO update "EventSink", "EventSource", "BehaviorSink", "BehaviorSource" comments

// TODO
// Surface area:
//   Constructing:
//     EventSink.activate
//     EventSink.deactivate
//     EventSink.switch
//     EventSource.switch
//     EventSource.addParent
//   Lazy:
//     EventSink.iterateActiveChildren
//     EventSink.poll
// Private EventSink methods: readParents, isFirstParent, forEachParent, destroy, getPriority

// Used to make methods private to this module.
// I'd name the variable "private", but that keyword is reserved.
const priv = Symbol();

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

// "EventSink" is left off variable names, but it's implied.
class EventSinkChildren {
  #weakParents;
  #weakParentLinks;
  #children;
  #unsubscribe;

  // [unsubscribe] is highly coupled. It's only used for [input] events
  constructor(weakParents, unsubscribe) {
    this.#setWeakParents(weakParents);
    this.#children = new ShrinkingList();
    this.#unsubscribe = unsubscribe;
  }

  // TODO can we use this both for behaviors and events?
  readParents(read) {
    return this.#weakParents.map((weakParent) => read(weakParent.deref()));
  }

  // First parent is [undefined] if not found.
  // Used for early exits from [EventSink.switch]
  isFirstParent(parent) {
    return parent === this.#weakParents[0]?.deref();
  }

  switch(weakParent) {
    assert(this.#weakParents.length <= 1);
    this.#removeFromParents();
    // TODO why do we need this branching?
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
      (parent) => new WeakRef(parent[private].#children.add(this))
    );
  }

  #removeFromParents() {
    for (const weakParentLink of this.#weakParentLinks) {
      weakParentLink.deref()?.removeOnce();
    }
  }
}

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
  readParents(readEvent) {
    return this.#weakParents.map((weakParent) => readEvent(weakParent.deref()));
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

  // TODO can this be private?
  getPriority() {
    return this.#priority;
  }

  poll(readEvent) {
    return this.#poll(...this.readParents(readEvent));
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
export const newEventPair = (parentSources, poll, unsubscribe = () => {}) => {
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
export const newBehaviorPair = (parentSources, initialValue, poll) => {
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
