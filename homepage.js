"use strict";

const fs = require("fs");
const P = require("./parsers.js");

const renderPost = title => date => href => `
  <a href="${href}">
    <div class="post">
      <h2>
        ${title}
      </h2>
      <h3>
        ${date}
      </h3>
    </div>
  </a>`;

const homepageParser = P.inParentheses(
  P.string("homepage").skipLeft(
    P.many(
      P.string("\n  ").skipLeft(
        P.inParentheses(
          P.constant(renderPost)
            .apply(P.simpleString)
            .skipRight(P.spaces1)
            .apply(P.simpleString)
            .skipRight(P.spaces1)
            .apply(P.simpleString)
        )
      )
    )
  )
)
  .skipRight(P.end)
  .map(list => list.join(""));

let homepage;

module.exports = async () => {
  if (homepage === undefined) {
    homepage = homepageParser.parseWhole(
      await fs.promises.readFile("./homepage.lisp", "utf8")
    );
  }
  return homepage;
};
