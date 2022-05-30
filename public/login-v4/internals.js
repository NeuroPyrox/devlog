import { assert, ShrinkingList, weakRefUndefined } from "./util.js";

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

  // All [weakParents] are assumed to be alive, but we pass it like this
  // because we use both the dereffed and non-dereffed versions.
  constructor(weakParents, unsubscribe) {
    // TODO remove underscores from names
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

  onUnpullable() {
    this.#removeFromParents();
    this.#weakParents = []; // TODO why do we have this statement?
    this.#unsubscribe();
  }

  // All [weakParents] are assumed to be alive, but we pass it like this
  // because we use both the dereffed and non-dereffed versions.
  #setWeakParents(weakParents) {
    this.#weakParents = weakParents;
    this.#weakParentLinks = weakParents.map(
      (weakParent) => new WeakRef(weakParent.deref().#children.add(this))
    );
  }

  // In both callsites, [#weakParents] is modified immediately afterward,
  // ensuring that each of [#weakParents] corresponds to each of [#weakParentLinks].
  #removeFromParents() {
    for (const weakParentLink of this.#weakParentLinks) {
      weakParentLink.deref()?.removeOnce();
    }
  }
}

class EventSinkActivation extends EventSinkLinks {
  #activeChildren;
  #deactivators;

  // All [weakParents] are assumed to be alive, but we pass it like this
  // because we use both the dereffed and non-dereffed versions.
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

  // [weakParent] is assumed to be alive, but we pass it like this
  // because we use both the dereffed and non-dereffed versions.
  switch(weakParent) {
    this.deactivate();
    super.switch(weakParent);
    const hasActiveChild = !this.#activeChildren.isEmpty();
    if (hasActiveChild) {
      this.activate();
    }
  }

  onUnpullable() {
    // [switchE]'s modulator is an example of a sink that will only deactivate once it's unpullable.
    this.deactivate();
    super.onUnpullable();
  }
}

// We split this class up into an inheritance tree because the variable interactions cluster together,
// and it's easier for me to keep it all in my head this way.
class EventSink extends EventSinkActivation {
  #priority;
  #poll;

  // All [weakParents] are assumed to be alive, but we pass it like this
  // because we use both the dereffed and non-dereffed versions.
  constructor(weakParents, poll, unsubscribe) {
    super(weakParents, unsubscribe);
    this.#priority =
      weakParents.length === 0
        ? 0
        : Math.max(
            ...weakParents.map((weakParent) => weakParent.deref().getPriority())
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
  // [weakParent] is assumed to be alive, but we pass it like this
  // because we use both the dereffed and non-dereffed versions.
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
  constructor(parents, sink) {
    this._weakChildLinks = new ShrinkingList();
    this._parents = new ShrinkingList();
    this._weakSink = new WeakRef(sink);
    parents.forEach((parent) => parent.addChild(this));
  }

  // TODO when can this be called?
  addChild(child) {
    assert(this.isPushable() && child.isPushable());
    const parentLink = child._parents.add(this);
    const childLink = this._weakChildLinks.add(new WeakRef(parentLink));
    sourceLinkFinalizers.register(parentLink, new WeakRef(childLink));
  }

  isPushable() {
    return this._weakSink.deref() !== undefined;
  }

  // TODO when can this be called?
  getWeakSink() {
    return this._weakSink;
  }

  // TODO when can this be called?
  switch(parent) {
    // Check if there's more than one parent.
    if (this._parents.getLast() !== this._parents.getFirst()) {
      this._parents.getLast().removeOnce();
    }
    if (parent.isPushable()) {
      parent.addChild(this);
    }
  }

  _onUnpushable() {
    assert(!this.isPushable());
    for (const weakChildLink of this._weakChildLinks) {
      weakChildLink.deref()?.remove();
    }
    // [this._weakChildLinks] will soon get cleared by [this._parentLinkFinalizers].
  }
}

// Some of the event's parents may not be passed into this function but added later.
// The only parents passed here are the ones that [poll] immediately depends on.
const newEventPair = (parentSources, poll, unsubscribe = () => {}) => {
  // TODO why do we have this assertion?
  assert(parentSources.every((parentSource) => parentSource.isPushable()));
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
  constructor(parents, sink) {
    this._weakChildLinks = new ShrinkingList();
    this._parents = new ShrinkingList();
    this._weakSink = new WeakRef(sink);
    parents.forEach((parent) => parent.addChild(this));
    this._variable = sink._weakVariable.deref();
  }

  addChild(child) {
    assert(this.isPushable() && child.isPushable());
    const parentLink = child._parents.add(this);
    const childLink = this._weakChildLinks.add(new WeakRef(parentLink));
    sourceLinkFinalizers.register(parentLink, new WeakRef(childLink));
  }

  isPushable() {
    return this._weakSink.deref() !== undefined;
  }

  getWeakSink() {
    return this._weakSink;
  }

  getCurrentValue() {
    return this._variable.thunk();
  }

  _onUnpushable() {
    assert(!this.isPushable());
    for (const weakChildLink of this._weakChildLinks) {
      weakChildLink.deref()?.remove();
    }
    // [this._weakChildLinks] will soon get cleared by [this._parentLinkFinalizers].
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
