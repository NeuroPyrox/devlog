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
  weakSink.deref()?._onUnpullable()
);
const sourceLinkFinalizers = new FinalizationRegistry((weakChildLink) =>
  weakChildLink.deref()?.removeOnce()
);

class EventSinkLinks {
  #container;
  
  // All [weakParents] are assumed to be alive, but we pass it like this
  // because we use both the dereffed and non-dereffed versions.
  constructor(container, weakParents, unsubscribe) {
    this.#container = container; // Keeps the poll function alive.
    // TODO remove underscores from names
    this.setWeakParents(weakParents);
    this._children = new ShrinkingList();
    this._unsubscribe = unsubscribe; // Only used for input events
  }

  *readParents() {
    const parentValues = [];
    for (const weakParent of this._weakParents) {
      parentValues.push(yield readSink(weakParent.deref()));
    }
    return parentValues;
  }

  // First parent is [undefined] if not found.
  // Used for early exits from [this.#container.switch]
  isFirstParent(parent) {
    return parent === this._weakParents[0]?.deref();
  }

  switch(weakParent) {
    assert(this._weakParents.length <= 1);
    this.removeFromParents();
    this.setWeakParents(weakParent.deref() === undefined ? [] : [weakParent]);
  }

  // All [weakParents] are assumed to be alive, but we pass it like this
  // because we use both the dereffed and non-dereffed versions.
  setWeakParents(weakParents) {
    this._weakParents = weakParents;
    this._weakParentLinks = weakParents.map(
      (weakParent) => new WeakRef(weakParent.deref().activation.links._children.add(this))
    );
  }

  // In both callsites, [_weakParents] is modified immediately afterward,
  // ensuring that each of [_weakParents] corresponds to each of [_weakParentLinks].
  removeFromParents() {
    for (const weakParentLink of this._weakParentLinks) {
      weakParentLink.deref()?.removeOnce();
    }
  }

  _onUnpullable() {
    this.removeFromParents();
    this._weakParents = []; // TODO why do we have this statement?
    this._unsubscribe();
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

  // Can call more than once if [this._weakParents.length === 0].
  _activateOnce() {
    assert(this._deactivators.length === 0);
    for (const weakParent of this.links._weakParents) {
      const parent = weakParent.deref();
      if (parent !== undefined) {
        if (parent.activation._activeChildren.isEmpty()) {
          // From zero to one child.
          parent.activation._activateOnce();
        }
        this._deactivators.push(new WeakRef(parent.activation._activeChildren.add(this.#container)));
      }
    }
  }
}

// The only variables that are used for something other than resource management are:
//   [_activeChildren, _priority, _poll]
// There are 2 clusters of subtly interconnected logic:
//   [_children, _weakParents, _weakParentLinks]
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
    yield* this.activation._activeChildren;
  }

  getPriority() {
    return this._priority;
  }

  *poll() {
    return yield* this._poll(...(yield* this.activation.links.readParents()));
  }

  // TODO when can this be called?
  // Must only call on inactive [output] sinks.
  // The assertions only weakly enforce this.
  activate() {
    assert(this.activation.links._children.isEmpty());
    this.activation._activateOnce();
  }

  // TODO when can this be called?
  // Must only call on active [output] sinks.
  // The assertions only weakly enforce this.
  deactivate() {
    assert(this.activation.links._children.isEmpty());
    this._deactivateOnce();
  }

  // TODO when can this be called?
  // [weakParent] is assumed to be alive, but we pass it like this
  // because we use both the dereffed and non-dereffed versions.
  switch(weakParent) {
    const parent = weakParent.deref();
    if (this.activation.links.isFirstParent(parent)) {
      return;
    }
    this._deactivate();
    this.activation.links.switch(weakParent);
    // Upwards propagate activeness and priority.
    const isActive = !this.activation._activeChildren.isEmpty();
    if (isActive) {
      this.activation._activateOnce();
    }
    parent?._switchPriority(this._priority);
  }

  _activate() {
    if (this.activation._deactivators.length === 0) {
      this.activation._activateOnce();
    }
  }

  _deactivate() {
    if (this.activation._deactivators.length !== 0) {
      this._deactivateOnce();
    }
  }

  _deactivateOnce() {
    assert(this.activation._deactivators.length !== 0);
    for (const deactivator of this.activation._deactivators) {
      deactivator.deref()?.removeOnce();
    }
    this.activation._deactivators = [];
    for (const weakParent of this.activation.links._weakParents) {
      const parent = weakParent.deref();
      if (
        parent !== undefined &&
        parent.activation._activeChildren.isEmpty() &&
        parent.activation.links._weakParents.length !== 0
      ) {
        // From one to zero children.
        parent._deactivateOnce();
      }
    }
  }

  _switchPriority(childPriority) {
    if (childPriority <= this._priority) {
      this._priority = childPriority - 1;
      for (const weakParent of this.activation.links._weakParents) {
        weakParent.deref()?._switchPriority(this._priority);
      }
    }
  }

  _onUnpullable() {
    this._deactivate();
    this.activation.links._onUnpullable();
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

  _onUnpullable() {
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
