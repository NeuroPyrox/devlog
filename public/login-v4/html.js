import { assert, createGeneratorMonad } from "./util.js";
import * as Pull from "./pull.js";
import { inputValues, getClicks } from "./reactives.js";

// TODO GC outputs.
// TODO encapsulation by turning [yield*] into [yield].

class Context {
  constructor() {
    this.elements = [];
  }

  createElement(type) {
    const element = document.createElement(type);
    this.elements.push(element);
    return element;
  }

  pull(monadicPullValue) {
    return Pull.pull(monadicPullValue);
  }

  text(string) {
    this.elements.push(string);
  }
}

const [runHtmlMonadWithContext, monadicMethod] = createGeneratorMonad();
const createElement = monadicMethod("createElement");
export const pull = monadicMethod("pull");
export const text = monadicMethod("text");

// TODO restrict callsites more directly with an assertion.
// lazyConstructors.js will throw an error if we call this function within an [output] because
// this prevents lazy constructors from becoming monadic and complicating things.
const runHtmlMonad = (htmlGenerator) => {
  const context = new Context();
  const result = runHtmlMonadWithContext(context, htmlGenerator());
  return [result, context.elements];
};

const appendHtml = (root, htmlGenerator) => {
  root.append(...runHtmlMonad(htmlGenerator)[1]);
};

const container = (type) =>
  function* (childHtmlGenerator) {
    const node = yield createElement(type);
    appendHtml(node, childHtmlGenerator);
  };

export const startHtml = (root, htmlGenerator) =>
  Pull.start(function* () {
    appendHtml(root, htmlGenerator);
  });

export function* button(textContent) {
  const node = yield createElement("button");
  node.textContent = textContent;
  // TODO inline [getClicks].
  return {
    onClick: () => getClicks(node),
  };
}

export function* div({ setInnerHtml }, childHtmlGenerator) {
  const node = yield createElement("div");
  appendHtml(node, childHtmlGenerator);
  let afterSetInnerHtml;
  Pull.pull(function* () {
    setInnerHtml = setInnerHtml.map(runHtmlMonad);
    yield* setInnerHtml.output(([, children]) => {
      node.innerHTML = "";
      node.append(...children);
    });
    afterSetInnerHtml = setInnerHtml.map(([result]) => result);
  });
  return {
    afterSetInnerHtml: () => afterSetInnerHtml,
  };
}

export function* p({ setTextContent }) {
  const node = yield createElement("p");
  // TODO assert monadic context.
  Pull.pull(() =>
    setTextContent.output((textContent) => (node.textContent = textContent))
  );
}

export const table = container("table");

// TODO use objects instead of arrays to pass arguments.
// TODO synchronize outputs.
export function* tbody({ insertChildren, removeChild, setInnerHtml }) {
  const node = yield createElement("tbody");
  let afterInsertChildren;
  Pull.pull(function* () {
    insertChildren = insertChildren.map(([index, htmlGenerator]) => [
      ...runHtmlMonad(htmlGenerator),
      index,
    ]);
    yield* insertChildren.output(([, children, index]) => {
      if (index === node.children.length) {
        assert(children.length === 1);
        node.appendChild(...children);
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
      node.append(...children);
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
    appendHtml(node, children);
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

export function* textInput(params) {
  const node = yield createElement("input");
  node.type = "text";
  if (params) {
    Pull.pull(() => params.setValue.output((value) => (node.value = value)));
  }
  // TODO construct the [stepper] manually.
  return {
    inputValues: () => inputValues(node),
  };
}

export function* th(textContent) {
  const node = yield createElement("th");
  node.textContent = textContent;
}
export const thead = container("thead");

export const tr = container("tr");
