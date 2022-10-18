import * as Util from "./util.js";
import {
  constConstructor,
  lazyConstructor,
  lazyLoop,
} from "./lazyConstructors.js";
import { output } from "./pull.js";
import * as Push from "./push.js";
import { newEventPair, newBehaviorPair } from "./internals.js";

// TODO make a graph over time of the call stack and which functions are callable.
// TODO consolidate all lifecycle assertions under one module.
// TODO update comments with [constructEvents].
// TODO what are the atomic operations on the graph?
// TODO add assertions on which functions can be called during which stages.
// TODO factor behaviors into the lifecycle.
// TODO make topology changes more explicit.
// Lifecycle: out, pull, constructEvents, repeat(out, push, constructEvents)

// Combinators are either time-dependent or not.
//   Time-dependent:   [switchE, stepper, mergeBind, output, loop]
//   Time-independent: [input, never, map, filter, merge, mapTag, tag, observeE, getClicks]
// Time-dependent combinators act differently depending on when you initialized them,
//   but time-independent combinators don't care when you initialize them.
// In other words, time-independent combinators obey referential transparency
//   whereas time-dependent combinators violate it.
// A third way of saying it is:
//   Time-dependent combinators depend on the history of their inputs.
//   Time-independent combinators only depend on their inputs' current values.
// To deal with this, we wrap time-dependent combinators in the Pull monad
//   so that semantically we're dealing with streams of combinators,
//   different versions of the same combinator that were initialized at different times.
// We sample from such a semantic stream using [observeE].

// [output] is time-dependent because consider an app where you use an [output] to display text.
//   If the [output] gets initialized too late, the text won't be displayed.
// [loop] isn't really time-dependent, but the Pull monad is the only place you need to use it,
//   so why not restrict its interface by treating it as time-dependent?
// [input]'s time-independence is contractual. I'm trusting the library user to ensure it.

const input = (subscribe) =>
  lazyConstructor(() => {
    let sink, source;
    // [unsubscribe] must remove all strong references of the push callback passed to [subscribe],
    // or there will be a memory leak.
    // The push callback can't be called until [subscribe] ends.
    // Other than that, the requirements for [subscribe] and [unsubscribe] are surprisingly lenient.
    // For example, you could push the input during [unsubscribe] before discarding the callback,
    // although the event wouldn't reach any outputs.
    const unsubscribe = subscribe((x) => Push.push(sink, x));
    [sink, source] = newEventPair([], null, unsubscribe);
    return source;
  });

const never = input(() => {});

const mapSource = (parentSource, f) =>
  newEventPair([parentSource], function* (value) {
    return f(value);
  })[1];
const map = (parent, f) =>
  lazyConstructor((parentSource) => mapSource(parentSource, f), parent);

const filter = (parent, predicate) =>
  map(parent, (value) => (predicate(value) ? value : Util.nothing));

const merge = (
  parentA,
  parentB,
  ABtoC = (a, b) => a,
  AtoC = (a) => a,
  BtoC = (b) => b
) =>
  lazyConstructor(
    (parentASource, parentBSource) =>
      newEventPair(
        [parentASource, parentBSource],
        function* (parentAValue, parentBValue) {
          if (parentAValue === Util.nothing) {
            return BtoC(parentBValue);
          }
          if (parentBValue === Util.nothing) {
            return AtoC(parentAValue);
          }
          return ABtoC(parentAValue, parentBValue);
        }
      )[1],
    parentA,
    parentB
  );

// TODO
// TODO are there any possible short circuits based on [behavior]'s state?
const mapTagB = (event, behavior, combine) =>
  lazyConstructor(
    (eventSource, behaviorSource) =>
      mapSource(eventSource, (x) =>
        combine(x, behaviorSource.getCurrentValue())
      ),
    event,
    behavior
  );
const mapTag = (parent, latchGet, combine) =>
  map(parent, (x) => combine(x, latchGet()));

// TODO
const tagB = (event, behavior) => mapTagB(event, behavior, (e, b) => b);
const tag = (parent, latchGet) => map(parent, () => latchGet());

const observeE = (parent) =>
  lazyConstructor(
    (parentSource) =>
      newEventPair([parentSource], function* (value) {
        return yield Push.liftPull(value);
      })[1],
    parent
  );

// Loopable
function* switchE(newParents) {
  // We're safe evaluating the event pair eagerly instead of using [lazyConstructor]
  // because there are no parents yet.
  const [sink, source] = newEventPair([], function* (value) {
    return value;
  });
  lazyConstructor((newParentsSource) => {
    const weakSource = new WeakRef(source);
    // Strongly references [sink] but weakly references [source] because
    // [modSinks]'s pushability implies [sink]'s pushability.
    // We put the reference in the poll function instead of [modSink]'s children
    // because [modSink] doesn't directly push to [sink].
    const [modSink, modSource] = newEventPair(
      [newParentsSource],
      function* (newParent) {
        const source = weakSource.deref(); // Weakness prevents memory leaks of unpullable but pushable [source]s.
        if (source !== undefined) {
          lazyConstructor((newParentSource) => {
            // It's not possible to switch to an unpullable [newParentSource].
            // If [newParentSource] is unpushable, [source.switch] has a case that deals with it.
            source.switch(newParentSource);
            // If we switch to an unpushable sink that's not GC'd yet,
            // then it will still get GC'd properly.
            sink.switch(newParentSource.getWeakSink());
          }, newParent);
        }
        return Util.nothing;
      }
    );
    // The order of these 2 statements doesn't matter because
    // the branching in both only depends on whether [parentSource] is pushable.
    modSink.activate();
    // [source]'s pullability implies [modSource]'s pullability.
    source.addParent(modSource);
  }, newParents);
  return constConstructor(source);
}

// TODO lift boundary cases up the call stack
function* stepper(initialValue, newValues) {
  // TODO define poll
  // We're safe evaluating the behavior pair eagerly instead of using [lazyConstructor]
  // because there are no parents yet.
  const [sink, source] = newBehaviorPair([], initialValue, undefined);
  lazyConstructor((parentSource) => {
    const [modSink, modSource] = newEventPair(
      [parentSource],
      function* (value) {
        yield Push.setBehavior(sink, value);
        return Util.nothing;
      }
    );
    // The order of these 2 statements doesn't matter because
    // the branching in both only depends on whether [parentSource] is pushable.
    modSink.activate();
    // [source]'s pullability implies [modSource]'s pullability.
    source.addParent(modSource);
  }, newValues);
  return constConstructor(source);
}

// TODO optimize with binary tree
function* mergeBind(eventOfEvent, f) {
  let current = never;
  const next = map(eventOfEvent, (event) => merge(f(event), current));
  yield output(next, (event) => (current = event));
  return yield* switchE(next);
}

const getClicks = (domNode) =>
  input((push) => domNode.addEventListener("click", push));

// TODO replace with behavior
const getInputValues = (domNode) => () => domNode.value;

export { output, loop, start } from "./pull.js";

export {
  never,
  input,
  map,
  filter,
  merge,
  mapTagB,
  mapTag,
  tagB,
  tag,
  observeE,
  switchE,
  stepper,
  mergeBind,
  getClicks,
  getInputValues,
};
