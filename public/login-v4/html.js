import { createGeneratorMonad } from "./util.js";
import * as Pull from "./pull.js";
import { inputValues, getClicks } from "./reactives.js";

// TODO GC outputs.
// TODO encapsulation by turning [yield*] into [yield].

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

const [runHtmlMonadWithContext, monadicMethod] = createGeneratorMonad();
export const pull = monadicMethod("pull");
const createElement = monadicMethod("createElement");

// TODO restrict callsites with an assertion.
const runHtmlMonad = (htmlGenerator) => {
  const context = new Context();
  const result = runHtmlMonadWithContext(context, htmlGenerator());
  return [result, context.elements];
};

export const startHtml = (root, childHtmlGenerator) =>
  Pull.start(function* () {
    for (const child of runHtmlMonad(childHtmlGenerator)[1]) {
      root.appendChild(child);
    }
  });

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
  const node = yield createElement("tbody");
  let afterInsertChildren;
  Pull.pull(function* () {
    // It's important to call [runHtmlMonad] within a [map] instead of an [output]. TODO why?
    insertChildren = insertChildren.map(([index, htmlGenerator]) => [
      ...runHtmlMonad(htmlGenerator),
      index,
    ]);
    yield* insertChildren.output(([, children, index]) => {
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

    yield* setInnerHtml.map(runHtmlMonad).output(([, children]) => {
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
  const node = yield createElement("td");
  const [properties, children] =
    b === undefined ? [{}, a ?? function* () {}] : [a, b];
  if (typeof children === "string") {
    node.textContent = children;
  } else {
    for (const child of runHtmlMonad(children)[1]) {
      node.appendChild(child);
    }
  }
  if (properties.setTextContent) {
    // TODO assert monadic context.
    Pull.pull(() =>
      properties.setTextContent.output(
        (textContent) => (node.textContent = textContent)
      )
    );
  }
}

export function* th(textContent) {
  const node = yield createElement("th");
  node.textContent = textContent;
}

const container = (type) =>
  function* (childHtmlGenerator) {
    const node = yield createElement(type);
    for (const child of runHtmlMonad(childHtmlGenerator)[1]) {
      node.appendChild(child);
    }
  };

export const table = container("table");
export const thead = container("thead");
export const tr = container("tr");
