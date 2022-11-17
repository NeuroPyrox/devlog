import * as Util from "./util.js";
import {
  constConstructor,
  lazyConstructor,
  lazyLoop,
} from "./lazyConstructors.js";
import { assertPullMonad } from "./pull.js";
import * as Push from "./push.js";
import { newEventPair, newBehaviorPair } from "./internals.js";

// TODO use freeze and seal to make things more functional
// TODO what are the atomic operations on the graph?
// TODO make topology changes more explicit.

// Approximate lifecycle:
//   while(waitingForStart()) {
//     codeFromOutsideTheLibrary();
//     eagerlyCreateTimeIndependentReactives();
//     doNothingOnInput();
//     codeFromOutsideTheLibrary();
//   }
//   lazilyCreateReactivesWithinPullMonad();
//   constructReactives();
//   while(true) {
//     while(waitingForInput()) {
//       codeFromOutsideTheLibrary();
//       eagerlyCreateTimeIndependentReactive();
//       codeFromOutsideTheLibrary();
//     }
//     while(pushingInput()) {
//       writeEventValues();
//       enqueueBehaviorValues();
//       lazilyCreateReactivesWithinPullMonad();
//       lazilyCreateTimeIndependentReactives();
//       propagateEventValues();
//     }
//     dequeueBehaviorValues();
//     propagateBehaviorValues();
//     constructReactives();
//     doOutputCommands();
//   }

// For clarity, "input" only ever refers to [input] reactives,
// and "parent" refers to the reactives that feed into another reactive.
// "Reactive" means an event or a behavior.

// Reactives are either time-dependent or not.
//   Time-dependent:   [switchE, stepper, mergeBind, output, loop]
//   Time-independent: [input, never, map, filter, merge, mapTag, tag, observeE, getClicks]
// Time-dependent reactives act differently depending on when you initialized them,
//   but time-independent reactives don't care when you initialize them.
// In other words, time-independent reactives obey referential transparency
//   whereas time-dependent reactives violate it.
// A third way of saying it is:
//   Time-dependent reactives depend on the history of their parents.
//   Time-independent reactives only depend on their parents' current values.
// To deal with this, we wrap time-dependent reactives in the Pull monad
//   so that semantically (but not implementationally) we're dealing with behaviors of reactives,
//   different versions of the same reactives that were initialized at different times.
// We sample from such a semantic behavior using [observeE].
// The Pull monad is basically the same as the Behavior monad,
//   but I separated them for ease of implementation,
//   and Behavior only has an applicative interface.
//   It might be useful to remove the separation between the Pull and Behavior monads,
//   but right now it only seems like an intellectual exercise without practical applications.

// Some time-dependent reactives are loopable: [switchE, stepper, mergeBind]
// This means that you're able to create a loop using one of these.
//   A loop of reactives is legal if and only if there's at least one loopable reactive in the loop.
//   We check the legality of loops whenever reactives are initialized or they get new parents.
//   To anyone else reading this, it would be an interesting project to make a type system for legal loops.
// To be loopable, a reactive's parent must use an [output] or something equivalent to modify the child reactive.
// The crucial property that makes loops legal is that the parent's modifications get delayed
//   until the end of the Push monad, so a loopable reactive can only depend on its own past values.
//   In contrast, a loop of time-independent reactives would depend on its own current values,
//   causing infinite recursion unless I implemented some unnecessary black-magic laziness.

// [output] is time-dependent because consider an app where you use an [output] to display text.
//   If the [output] gets initialized too late, the text won't be displayed.
// [loop] isn't really time-dependent, but the Pull monad is the only place you need to use it,
//   so why not restrict its interface by treating it as time-dependent?
// [input]'s time-independence is contractual. I'm trusting the library user to ensure it.

// Note to self: Avoid the temptation to reduce the LOC in this file by refactoring!

export const input = (subscribe) =>
  lazyConstructor(() => {
    let sink, source;
    // Memory leak if [unsubscribe] doesn't remove all strong references to [push].
    // Error if [push] is called before [subscribe] ends.
    // Error if [push] is called during another [push], even from a different [input].
    // Error if [push] is called during [start].
    // [push] does nothing if called before [start].
    // [push] does nothing if called during [unsubscribe], but it may be computationally expensive,
    //   and I don't care to optimize it because why in the world would you use the library that way?
    const push = (x) => Push.push(sink, x);
    const unsubscribe = subscribe(push);
    [sink, source] = newEventPair([], null, unsubscribe);
    return source;
  });

export const never = input(() => () => {});

export const map = (parent, f) =>
  lazyConstructor(
    (parentSource) =>
      newEventPair([parentSource], (value) => Push.pure(f(value)))[1],
    parent
  );

export const filter = (parent, predicate) =>
  map(parent, (value) => (predicate(value) ? value : Util.nothing));

export const merge = (
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
        (parentAValue, parentBValue) => {
          if (parentAValue === Util.nothing) {
            return Push.pure(BtoC(parentBValue));
          }
          if (parentBValue === Util.nothing) {
            return Push.pure(AtoC(parentAValue));
          }
          return Push.pure(ABtoC(parentAValue, parentBValue));
        }
      )[1],
    parentA,
    parentB
  );

// TODO
// TODO are there any possible short circuits based on [behavior]'s state?
export const mapTagB = (event, behavior, combine) =>
  lazyConstructor(
    (eventSource, behaviorSource) =>
      newEventPair([eventSource], (value) =>
        Push.pure(combine(value, behaviorSource.getCurrentValue()))
      )[1],
    event,
    behavior
  );
export const mapTag = (parent, latchGet, combine) =>
  map(parent, (x) => combine(x, latchGet()));

// TODO
export const tagB = (event, behavior) => mapTagB(event, behavior, (e, b) => b);
export const tag = (parent, latchGet) => map(parent, () => latchGet());

export const observeE = (parent) =>
  lazyConstructor(
    (parentSource) => newEventPair([parentSource], Push.liftPull)[1],
    parent
  );

// TODO remove and replace with proper garbage collection.
const outputs = [];

function* modulate(parent, handle) {
  yield* assertPullMonad();
  return lazyConstructor((parentSource) => {
    const [sink, source] = newEventPair([parentSource], (value) => {
      handle(value);
      return Push.pure(Util.nothing);
    });
    sink.activate();
    outputs.push(source); // TODO remove.
    return source;
  }, parent);
}

// TODO update comments
// To stop the output, call [source.getWeakSink().deref()?.deactivate()].
// When the return value loses all its references,
// we assert that the sink is not active,
// and later the output gets garbage collected.
// Implementation-wise, there's no need to put this function
// in the Pull monad, but we do it to make the semantics cleaner
// and for the ability to control when the output starts.
export function* output(parent, handle) {
  yield* assertPullMonad();
  return lazyConstructor((parentSource) => {
    const [sink, source] = newEventPair([parentSource], (value) => {
      lazyConstructor(() => handle(value));
      return Push.pure(Util.nothing);
    });
    sink.activate();
    outputs.push(source); // TODO remove.
    return source;
  }, parent);
}

export function* switchE(newParents) {
  // We're safe evaluating the event pair eagerly instead of using [lazyConstructor]
  // because there are no parents yet.
  const [sink, source] = newEventPair([], Push.pure);
  const weakSource = new WeakRef(source);
  // Strongly references [sink] because [modulator]'s pushability implies [sink]'s pushability.
  // Weakly references [source] because we can't access it from [sink],
  // and it's weak because pushability doesn't imply pullability.
  // We reference [sink] in the poll function instead of [modulator]'s children
  // because [modulator] doesn't directly push to [sink].
  const modulator = yield* modulate(newParents, (newParent) => {
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
    return Push.pure(Util.nothing);
  });
  // [source]'s pullability implies [modulatorSource]'s pullability.
  lazyConstructor(
    (modulatorSource) => source.addParent(modulatorSource),
    modulator
  );
  return constConstructor(source);
}

// TODO lift boundary cases up the call stack
export function* stepper(initialValue, newValues) {
  yield* assertPullMonad();
  // We're safe evaluating the behavior pair eagerly instead of using [lazyConstructor]
  // because there are no parents yet.
  const [sink, source] = newBehaviorPair([], initialValue, undefined);
  lazyConstructor((parentSource) => {
    const [modSink, modSource] = newEventPair([parentSource], (value) =>
      Push.enqueueBehavior(sink, value)
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
export function* mergeBind(eventOfEvent, f) {
  let current = never;
  const next = map(eventOfEvent, (event) => merge(f(event), current));
  // TODO memory management
  yield* output(next, (event) => (current = event));
  return yield* switchE(next);
}

export const getClicks = (domNode) =>
  input((push) => {
    domNode.addEventListener("click", push);
    return () => domNode.removeEventListener("click", push);
  });

// TODO replace with behavior
export const getInputValues = (domNode) => () => domNode.value;

export { loop, start } from "./pull.js";
