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

  // TODO use objects instead of arrays to pass arguments.
  // TODO synchronize outputs.
  tbody({ insertChildren, removeChild, setInnerHtml }) {
    const node = document.createElement("tbody");
    let afterInsertChildren;
    Pull.pull(function* () {
      const observedInsertedChildren = yield* observeHtml(
        insertChildren.map(([, monadicHtmlValue]) => monadicHtmlValue)
      );
      insertChildren = insertChildren.merge(
        observedInsertedChildren,
        ([index], [result, children]) => [result, index, children]
      );
      yield* insertChildren.output(([, index, children]) => {
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

      yield* removeChild.output((index) => node.children[index].remove());

      yield* (yield* observeHtml(setInnerHtml)).output(([, children]) => {
        node.innerHTML = "";
        for (const child of children) {
          node.appendChild(child);
        }
      });
    });
    return {
      afterInsertChildren: () => afterInsertChildren,
    };
  }
}

const [runHtmlMonad, monadicMethod] = createGeneratorMonad();
export const pull = monadicMethod("pull");
export const textInput = monadicMethod("textInput");

const observeHtml = undefined;
