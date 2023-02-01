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

  textInput({ setValue }) {
    const node = document.createElement("input");
    node.type = "text";
    Pull.pull(() => setValue.output((value) => (node.value = value)));
    this.nodes.push(node);
  }

  // TODO synchronize outputs.
  tbody({ insertChildren, removeChild, setInnerHtml }) {
    const node = document.createElement("tbody");
    let afterInsertChildren;
    Pull.pull(function* () {
      insertChildren = insertChildren.map(([index, monadicHtmlValue]) => {
        const nestedContext = new Context();
        const result = runHtmlMonad(nestedContext, monadicHtmlValue());
        return [result, index, nestedContext.nodes];
      });
      insertChildren.output(([, index, children]) => {
        if (index === node.children.length) {
          for (const child of children) {
            node.appendChild(child);
          }
        } else {
          const end = node.children[index];
          for (const child of children) {
            node.insertBefore(child, end);
          }
        }
      });
      afterInsertChildren = insertChildren.map(([result]) => result);
    });
  }
}
const [runHtmlMonad, monadicMethod] = createGeneratorMonad();
export const pull = monadicMethod("pull");
export const textInput = monadicMethod("textInput");
