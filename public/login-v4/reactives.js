import { nothing } from "./util.js";
import { constConstructor, lazyConstructor } from "./lazyConstructors.js";
import { assertPullMonad } from "./pull.js";
import * as Push from "./push.js";
import { pull } from "./pull.js";
import { newEventPair, newBehaviorPair } from "./internals.js";

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
//   Time-independent: [input, never, mapE, filter, merge, mapTag, tag, observeE, getClicks]
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

export const input = (subscribe) =>
  lazyConstructor(() => {
    let sink, source;
    // Memory leak if [unsubscribe] doesn't remove all strong references to [push].
    // Error if [push] is called before [subscribe] ends.
    // Error if [push] is called during another [push], even from a different [input].
    // Error if [push] is called during [start].
    // Error if reactives are created during [unsubscribe].
    // [push] does nothing if called before [start].
    // [push] does nothing if called during [unsubscribe], but it may be computationally expensive,
    //   and I don't care to optimize it because why in the world would you use the library that way?
    const push = (x) => Push.push(sink, x);
    const unsubscribe = subscribe(push);
    [sink, source] = newEventPair([], null, { unsubscribe });
    return source;
  });

export const never = input(() => () => {});

export const mapE = (parent, f) =>
  lazyConstructor(
    (parentSource) =>
      newEventPair([parentSource], (value) => Push.pure(f(value)))[1],
    parent
  );

export const filter = (parent, predicate) =>
  mapE(parent, (value) => (predicate(value) ? value : nothing));

export const merge = (
  parentA,
  parentB,
  ABtoC = () => {
    throw "Shouldn't be simultaneous!";
  },
  AtoC = (a) => a,
  BtoC = (b) => b
) =>
  lazyConstructor(
    (parentASource, parentBSource) =>
      newEventPair(
        [parentASource, parentBSource],
        (parentAValue, parentBValue) => {
          if (parentAValue === nothing) {
            return Push.pure(BtoC(parentBValue));
          }
          if (parentBValue === nothing) {
            return Push.pure(AtoC(parentAValue));
          }
          return Push.pure(ABtoC(parentAValue, parentBValue));
        }
      )[1],
    parentA,
    parentB
  );

export const mapB = (parent, f) =>
  lazyConstructor(
    (parentSource) => newBehaviorPair([parentSource], { evaluate: f })[1],
    parent
  );

export const apply = (parentA, parentB, f) =>
  lazyConstructor(
    (parentASource, parentBSource) =>
      newBehaviorPair([parentASource, parentBSource], { evaluate: f })[1],
    parentA,
    parentB
  );

export const mapTag = (event, behavior, combine) =>
  lazyConstructor(
    (eventSource, behaviorSource) =>
      newEventPair([eventSource], (value) =>
        Push.pure(combine(value, behaviorSource.getCurrentValue()))
      )[1],
    event,
    behavior
  );

export const tag = (event, behavior) => mapTag(event, behavior, (e, b) => b);

export const observeE = (parent) =>
  lazyConstructor(
    (parentSource) =>
      newEventPair([parentSource], (x) => Push.pure(pull(x)))[1],
    parent
  );

// TODO remove and replace with proper garbage collection.
const outputs = [];

// Don't make this a monadic method because we'd still to call [assertPullMonad] anyways.
// To deactivate it, call [source.getWeakSink().deref()?.deactivate()].
// TODO does the deactivation need to be in a [lazyConstructor]?
function* eagerOutput(parent, handle, enforceManualDeactivation) {
  yield* assertPullMonad();
  return lazyConstructor((parentSource) => {
    const [sink, source] = newEventPair([parentSource], handle, {
      enforceManualDeactivation,
    });
    sink.activate();
    outputs.push(source); // TODO remove.
    return source;
  }, parent);
}

// TODO deactivateability.
export function* output(parent, handle) {
  yield* eagerOutput(
    parent,
    (value) => {
      lazyConstructor(() => handle(value));
      return Push.pure(nothing);
    },
    true
  );
}

// [handle] must strongly reference the target's sink to enforce pushability.
// [handle] must not strong reference to [targetSource] because pushability doesn't imply pullability.
// [modulator] doesn't store the target as a child because it doesn't directly push to the target,
//   only adds new parents to it or modifies it in other ways through [handle].
// Garbage collection is guaranteed by pairing each modulator with exactly one modulatee,
//   because then the job of the modulatee sink's [destroy] method is done by the modulator sink's [destroy] method.
function* modulate(targetSource, parent, handle) {
  const modulator = yield* eagerOutput(parent, handle, false);
  // [targetSource]'s pullability implies [modulatorSource]'s pullability.
  lazyConstructor(
    (modulatorSource) => targetSource.addParent(modulatorSource),
    modulator
  );
  return constConstructor(targetSource);
}

export function* switchE(newParents) {
  // We're safe evaluating the event pair eagerly instead of using [lazyConstructor]
  // because there are no parents yet.
  const [sink, source] = newEventPair([], Push.pure);
  const weakSource = new WeakRef(source);
  // Weakly references [source] because we can't access it from [sink],
  // and it's weak because pushability doesn't imply pullability.
  return yield* modulate(source, newParents, (newParent) => {
    const source = weakSource.deref(); // Weakness prevents memory leaks of unpullable but pushable [source]s.
    if (source !== undefined) {
      // It's important to call [lazyConstructor] within the [if] statement
      // because we want to avoid unneeded evaluations of [newParentSource].
      lazyConstructor((newParentSource) => {
        // It's not possible to switch to an unpullable [newParentSource].
        // If [newParentSource] is unpushable or [source] is unpullable,
        // garbage collection still continues in its normal course.
        source.switch(newParentSource);
        sink.switch(newParentSource);
      }, newParent);
    }
    return Push.pure(nothing);
  });
}

export function* stepper(initialValue, newValues) {
  // We're safe evaluating the behavior pair eagerly instead of using [lazyConstructor]
  // because there are no parents yet.
  const [sink, source] = newBehaviorPair([], { initialValue });
  return yield* modulate(source, newValues, (value) =>
    Push.enqueueBehaviorValue(sink, value)
  );
}

// TODO optimize with binary tree
export function* mergeBind(eventOfEvent, f) {
  let current = never;
  const next = mapE(eventOfEvent, (event) => merge(f(event), current));
  // TODO memory management
  yield* output(next, (event) => (current = event));
  return yield* switchE(next);
}

export const getClicks = (domNode) =>
  input((push) => {
    domNode.addEventListener("click", push);
    return () => domNode.removeEventListener("click", push);
  });

// This use of [pull] is an ugly hack. TODO get rid of it.
export const inputValues = (domNode) =>
  pull(function* () {
    return yield* stepper(
      domNode.value,
      input((push) => {
        domNode.addEventListener("input", (e) => push(e.target.value));
        return () => domNode.removeEventListener("input", push);
      })
    );
  });
