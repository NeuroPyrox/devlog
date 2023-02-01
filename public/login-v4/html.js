import { createGeneratorMonad } from "./util.js";
import * as Pull from "./pull.js";

// TODO GC outputs.

class Context {
  constructor() {
    this.nodes = [];
  }
  
  pull(monadicPullValue) {
    Pull.pull(monadicPullValue);
  }
  
  textInput({setValue}) {
    const node = document.createElement("input");
    node.type = "text";
    Pull.pull(() => setValue.output(value => node.value = value));
    this.nodes.push(node);
  }
}
const [runHtmlMonad, monadicMethod] = createGeneratorMonad();
export const pull = monadicMethod("pull");
export const textInput = monadicMethod("textInput");
