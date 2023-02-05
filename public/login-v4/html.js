import { createGeneratorMonad } from "./util.js";
import * as Pull from "./pull.js";
import { inputValues, getClicks } from "./reactives.js";

// TODO GC outputs.
// TODO exports.

class Context {
  constructor() {
    this.elements = [];
  }

  pull(monadicPullValue) {
    Pull.pull(monadicPullValue);
  }

  createElement(type) {
    const element = document.createElement(type);
    this.push(element);
    return element;
  }
}

const [runHtmlMonad, monadicMethod] = createGeneratorMonad();
export const pull = monadicMethod("pull");
const createElement = monadicMethod("createElement");

export function* textInput({ setValue }) {
  const node = yield createElement("input");
  node.type = "text";
  Pull.pull(() => setValue.output((value) => (node.value = value)));
  // TODO construct the [stepper] manually.
  return {
    inputValues: () => inputValues(node),
  };
}

export function* button(textContent) {
  const node = yield createElement("button");
  node.textContent = textContent;
  // TODO inline [getClicks].
  return {
    onClick: () => getClicks(node),
  };
}

// TODO use splice.
// TODO use objects instead of arrays to pass arguments.
// TODO synchronize outputs.
export function* tbody({ insertChildren, removeChild, setInnerHtml }) {
  const node = this.createElement("tbody");
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

export function* td(a, b) {
  const node = this.createElement("td");
  const [properties, children] =
    b === undefined ? [{}, a ?? function* () {}] : [a, b];
  if (typeof children === "string") {
    node.textContent = children;
  } else {
    const childContext = new Context();
    runHtmlMonad(childContext, children());
    for (const child of childContext.nodes) {
      node.appendChild(child);
    }
  }
  if (properties.setTextContent) {
    Pull.pull(() =>
      properties.setTextContent.output(
        (textContent) => (node.textContent = textContent)
      )
    );
  }
}

const observeHtml = undefined;
