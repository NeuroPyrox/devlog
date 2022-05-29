import { assert, ShrinkingList, weakRefUndefined } from "./util.js";

import { readSink } from "./push.js"; // Circular dependency

const k = (x) => () => x;

// TODO Encapsulation

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
  #container;
  #weakParents;
  #weakParentLinks;
  #children;
  #unsubscribe;

  // All [weakParents] are assumed to be alive, but we pass it like this
  // because we use both the dereffed and non-dereffed versions.
  constructor(container, weakParents, unsubscribe) {
    this.#container = container; // Keeps the poll function alive.
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
  // Used for early exits from [this.#container.switch]
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
      (weakParent) =>
        new WeakRef(weakParent.deref().activation.links.#children.add(this))
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

class EventSinkActivation {
  #container;

  // All [weakParents] are assumed to be alive, but we pass it like this
  // because we use both the dereffed and non-dereffed versions.
  constructor(container, weakParents, unsubscribe) {
    this.#container = container;
    this.links = new EventSinkLinks(container, weakParents, unsubscribe);
    this._activeChildren = new ShrinkingList();
    this._deactivators = [];
  }

  // Iterate instead of returning the list itself because we don't
  // want the function caller to add or remove any children.
  *iterateActiveChildren() {
    yield* this._activeChildren;
  }

  activate() {
    if (this._deactivators.length !== 0) {
      // Filters out all sinks that are already active, except for inputs.
      return;
    }
    this.links.forEachParent((parent) => {
      parent.activation.activate();
      this._deactivators.push(
        new WeakRef(parent.activation._activeChildren.add(this.#container))
      );
    });
  }

  deactivate() {
    for (const deactivator of this._deactivators) {
      deactivator.deref()?.removeOnce();
    }
    this._deactivators = [];
    this.links.forEachParent((parent) => {
      if (parent.activation._activeChildren.isEmpty()) {
        // From one to zero children.
        parent.activation.deactivate();
      }
    });
  }

  // [weakParent] is assumed to be alive, but we pass it like this
  // because we use both the dereffed and non-dereffed versions.
  switch(weakParent) {
    this.deactivate();
    this.links.switch(weakParent);
    const hasActiveChild = !this._activeChildren.isEmpty();
    if (hasActiveChild) {
      this.activate();
    }
  }

  onUnpullable() {
    // [switchE]'s modulator is an example of a sink that will only deactivate once it's unpullable.
    this.deactivate();
    this.links.onUnpullable();
  }
}

// The only variables that are used for something other than resource management are:
//   [_activeChildren, _priority, _poll]
// There are 2 clusters of subtly interconnected logic:
//   [#children, #weakParents, #weakParentLinks]
//   [_activeChildren, _deactivators]
class EventSink {
  // All [weakParents] are assumed to be alive, but we pass it like this
  // because we use both the dereffed and non-dereffed versions.
  constructor(weakParents, poll, unsubscribe) {
    const parents = weakParents.map((weakParent) => weakParent.deref());
    this.activation = new EventSinkActivation(this, weakParents, unsubscribe);
    this._priority =
      parents.length === 0
        ? 0
        : Math.max(...parents.map((parent) => parent.getPriority())) + 1;
    this._poll = poll;
  }

  *iterateActiveChildren() {
    yield* this.activation.iterateActiveChildren();
  }

  getPriority() {
    return this._priority;
  }

  *poll() {
    return yield* this._poll(...(yield* this.activation.links.readParents()));
  }

  // TODO when can this be called?
  activate() {
    this.activation.activate();
  }

  // TODO when can this be called?
  deactivate() {
    this.activation.deactivate();
  }

  // TODO when can this be called?
  // [weakParent] is assumed to be alive, but we pass it like this
  // because we use both the dereffed and non-dereffed versions.
  switch(weakParent) {
    const parent = weakParent.deref();
    if (this.activation.links.isFirstParent(parent)) {
      return;
    }
    this.activation.switch(weakParent);
    parent?._switchPriority(this._priority);
  }

  // TODO custom error message for infinite recursion
  _switchPriority(childPriority) {
    if (childPriority <= this._priority) {
      this._priority = childPriority - 1;
      this.activation.links.forEachParent((parent) =>
        parent._switchPriority(this._priority)
      );
    }
  }

  onUnpullable() {
    this.activation.onUnpullable();
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
