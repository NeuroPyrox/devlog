import { assert, ShrinkingList, weakRefUndefined, derefMany } from "./util.js";

import { readSink } from "./push.js"; // Circular dependency

const k = (x) => () => x;

// TODO restrict surface area by making mutations monadic

// None of these finalizers will interrupt [Push.push]
const sinkFinalizers = new FinalizationRegistry((weakSource) =>
  weakSource.deref()?._onUnpushable()
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

// We split this class up into an inheritance tree because the variable interactions cluster together,
// and it's easier for me to keep it all in my head this way.
// The reason we use inheritance instead of composition is because the elements of
// [#weakParents], [#weakParentLinks], [#children], and [#activeChildren] are instances of [EventSink].
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
    this.#weakChildLinks = new ShrinkingList();
    this.#parents = new ShrinkingList();
    this.#weakSink = new WeakRef(sink);
    // [this.isPushable()] because we have a strong reference to [sink], even if temporary.
    parents.forEach((parent) => this.addParent(parent));
  }

  // TODO when can this be called?
  addParent(parent) {
    // By definition, an unpushable source won't be assigned new parents.
    // If we do assign an unpushable source new parents,
    // either [this] will keep [parent] alive even when [parent] won't push to [this],
    // or [parent] will push to [this], contradicting [this] being unpushable.
    assert(this.isPushable());
    // Ensures [_onUnpushable] cleans up all [#parents] and [#weakChildLinks].
    if (!parent.isPushable()) {
      return;
    }
    const parentLink = this.#parents.add(parent);
    const childLink = parent.#weakChildLinks.add(new WeakRef(parentLink));
    // Removal of [#parents] triggers GC of parents' [#weakChildLinks]
    sourceLinkFinalizers.register(parentLink, new WeakRef(childLink));
  }

  isPushable() {
    return this.#weakSink.deref() !== undefined;
  }

  // TODO when can this be called?
  getWeakSink() {
    return this.#weakSink;
  }

  // TODO when can this be called?
  // [this.isPushable()] must be guaranteed by the caller.
  switch(parent) {
    // There's a lot of coupling here, but basically [switchE]s can either have 1 or 2 parents.
    // The first parent is the modulator and the second parent
    // if it exists is the parent that pushes [this.#weakSink].
    // Check if there's more than one parent.
    if (this.#parents.getLast() !== this.#parents.getFirst()) {
      this.#parents.getLast().removeOnce();
    }
    assert(this.#parents.getLast() === this.#parents.getFirst()); // One or zero parents.
    assert(!this.#parents.isEmpty()); // Possibilities eliminated to one parent.
    this.addParent(parent);
  }

  _onUnpushable() {
    // Ensures no more [_weakParentLinks] or [#parents] will be added to [this].
    assert(!this.isPushable());
    // Remove elements from  childrens' [#parents].
    for (const weakChildLink of this.#weakChildLinks) {
      weakChildLink.deref()?.remove();
    }
    // [#weakChildLinks] will be cleaned up by [sourceLinkFinalizers].
    // [#parents] will be cleaned up when [_onUnpushable] gets called on each element of [#parents].
  }
}

// TODO special case if all [parentSources] are unpushable.
// TODO update comment
// Some of the event's parents may not be passed into this function but added later.
// The only parents passed here are the ones that [poll] immediately depends on.
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

class BehaviorSource {
  #weakChildLinks;
  #parents;
  #weakSink;
  
  constructor(parents, sink) {
    this.#weakChildLinks = new ShrinkingList();
    this.#parents = new ShrinkingList();
    this.#weakSink = new WeakRef(sink);
    parents.forEach((parent) => parent.addChild(this));
    this._variable = sink._weakVariable.deref();
  }

  addChild(child) {
    assert(this.isPushable() && child.isPushable());
    const parentLink = child.#parents.add(this);
    const childLink = this.#weakChildLinks.add(new WeakRef(parentLink));
    sourceLinkFinalizers.register(parentLink, new WeakRef(childLink));
  }

  isPushable() {
    return this.#weakSink.deref() !== undefined;
  }

  getWeakSink() {
    return this.#weakSink;
  }

  getCurrentValue() {
    return this._variable.thunk();
  }

  _onUnpushable() {
    assert(!this.isPushable());
    for (const weakChildLink of this.#weakChildLinks) {
      weakChildLink.deref()?.remove();
    }
    // [#weakChildLinks] will be cleaned up by [sourceLinkFinalizers].
    // [#parents] will be cleaned up when [_onUnpushable] gets called on each element of [#parents].
  }
}

const newBehaviorPair = (parentSources, initialValue, poll) => {
  // TODO why do we have this assertion?
  assert(parentSources.every((parentSource) => parentSource.isPushable()));
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

const neverSource = {
  isPushable: k(false),
  getWeakSink: k(weakRefUndefined),
};

export { newEventPair, newBehaviorPair, neverSource };
