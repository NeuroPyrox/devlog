"use strict";

const P = require("../../parsers.js");
const fs = require("fs").promises;

const templateList = listHtml => `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <title>NeuroPyrox's Devlog</title>
      <meta charset="utf-8" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        @import url("https://fonts.googleapis.com/css2?family=Nova+Mono&display=swap");

        body {
          background-color: black;
          font-family: "Nova Mono", monospace;
        }

        a, p {
          color: #0D0;
        }

        a {
          text-decoration: none;
        }

        .post {
          border-radius: 20px;
          padding: 10px;
        }

        .post:hover {
          background-color: #020;
          cursor: pointer;
        }

        h2 {
          margin: 0;
        }

        h3 {
          margin: 0;
          text-align: right;
        }

        .list {
          max-width: 700px;
          margin: 0 auto;
        }
      </style>
    </head>
    <body>
      <div class="list">
        <p>
          If you start with too big a problem,
          you may never quite be able to encompass it.
          So if you need to write a big, complex program,
          the best way to begin may not be to write a spec for it,
          but to write a prototype that solves a subset of the problem.
          Whatever the advantages of planning,
          they're often outweighed by the advantages of being able to keep a program in your head. 
        </p>
        <p>- Paul Graham</p>
        <br><br>
        ${listHtml}
      </div>
    </body>
  </html>
`;

const postParser = P.inParentheses(
  P.constant(title => date => href => `
      <a href="${href}">
        <div class="post">
          <h2>
            ${title}
          </h2>
          <h3>
            ${date}
          </h3>
        </div>
      </a>`)
    .apply(P.simpleString)
    .skipRight(P.spaces1)
    .apply(P.simpleString)
    .skipRight(P.spaces1)
    .apply(P.simpleString)
);

const homepageParser = P.inParentheses(
  P.string("homepage").skipLeft(P.many(P.string("\n  ").skipLeft(postParser)))
)
  .skipRight(P.end(""))
  .map(list => templateList(list.join()));

module.exports = (() => {
  let homepage;
  return async () => {
    if (homepage === undefined) {
      homepage = homepageParser.parseWhole(
        await fs.readFile(`${__dirname}/index.lisp`, "utf8")
      );
    }
    return homepage;
  };
})();
