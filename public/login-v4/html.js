import { createGeneratorMonad } from "./util.js";
import * as Pull from "./pull.js";

class Context {
  pull(pullMonadValue) {
    Pull.pull(pullMonadValue);
  }
}
const [runHtmlMonad, monadicMethod] = createGeneratorMonad();
export const pull = monadicMethod("pull");
