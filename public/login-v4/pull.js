import { assert, createGeneratorMonad, once } from "./util.js";
import {
  lazyLoop,
  delayConstructionDuring,
} from "./lazyConstructors.js";

// This file used to be much bigger, but the semantic purpose of keeping it separate remains.

const key = Symbol();

const context = {
  loop: lazyLoop,
  getKey: () => key,
};

const [runPullMonad, monadicMethod] = createGeneratorMonad();
export const loop = monadicMethod("loop")();
const getKey = monadicMethod("getKey")();

export function* assertPullMonad() {
  assert((yield getKey) === key);
}

// Only used by [start] and [Combinators.observeE].
export const pull = (monadicValue) => runPullMonad(context, monadicValue());
export const start = once((monadicValue) =>
  delayConstructionDuring(() => pull(monadicValue))
);
