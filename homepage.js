"use strict";

const fs = require("fs");
const P = require("./parsers.js");

const homepageParser = P.inParentheses(
  P.string("homepage").skipLeft(
    P.many(
      P.string("\n  ").skipLeft(
        P.inParentheses(
          P.constant(title => date => href => ({ title, date, href }))
            .apply(P.simpleString)
            .skipRight(P.spaces1)
            .apply(P.simpleString)
            .skipRight(P.spaces1)
            .apply(P.simpleString)
        )
      )
    )
  )
).skipRight(P.end);

let homepage;

module.exports = async () => {
  if (homepage === undefined) {
    homepage = homepageParser.parseWhole(
      await fs.promises.readFile("./homepage.lisp", "utf8")
    );
  }
  return homepage;
};
