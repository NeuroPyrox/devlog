import { createGeneratorMonad } from "./util.js";
import * as Pull from "./pull.js";
import { inputValues, getClicks } from "./reactives.js";

// TODO GC outputs.
// TODO exports.

class Context {
  constructor() {
    this.nodes = [];
  }

  pull(monadicPullValue) {
    Pull.pull(monadicPullValue);
  }

  textInput({ setValue }) {
    const node = document.createElement("input");
    this.nodes.push(node);
    node.type = "text";
    Pull.pull(() => setValue.output((value) => (node.value = value)));
    // TODO construct the [stepper] manually.
    return {
      inputValues: () => inputValues(node),
    };
  }

  button(textContent) {
    const node = document.createElement("button");
    this.nodes.push(node);
    node.textContent = textContent;
    // TODO inline [getClicks].
    return {
      onClick: () => getClicks(node),
    };
  }

  // TODO use splice.
  // TODO use objects instead of arrays to pass arguments.
  // TODO synchronize outputs.
  tbody({ insertChildren, removeChild, setInnerHtml }) {
    const node = document.createElement("tbody");
    this.nodes.push(node);
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

  td(a, b) {
    const [properties, monadicChildren] =
      b === undefined ? [{}, a ?? function* () {}] : [a, b];
    const childContext = new Context();
    runHtmlMonad(childContext, monadicChildren());
    const node = document.createElement("td");
    this.nodes.push(node);
    for (const child of childContext.nodes) {
      node.appendChild(child);
    }
    if (properties.setTextContent) {
      Pull.pull(() =>
        properties.setTextContent.output(
          (textContent) => (node.textContent = textContent)
        )
      );
    }
  }
}

const [runHtmlMonad, monadicMethod] = createGeneratorMonad();
export const pull = monadicMethod("pull");
export const textInput = monadicMethod("textInput");

const observeHtml = undefined;
