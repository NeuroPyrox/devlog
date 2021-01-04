"use strict";

// TODO single source of truth for homepageV3.lisp

const fs = require("fs").promises;

const templateList = listHtml => `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <title>NeuroPyrox's Blog</title>
      <meta charset="utf-8" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        @import url("https://fonts.googleapis.com/css2?family=Nova+Mono&display=swap");

        body {
          background-color: black;
          font-family: "Nova Mono", monospace;
        }

        a:link,
        a:visited {
          color: #0D0;
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
        ${listHtml}
      </div>
    </body>
  </html>
`;

const assert = condition => {
  if (!condition) {
    throw "Assertion Error!";
  }
}

const parseString = (offset, string) => {
  assert(string[offset++] === "\"");
  var end = offset;
  while (string[end] !== "\"") {
    ++end;
  }
  const result = string.slice(offset, end);
  offset = ++end;
  return {offset, result};
}

const parseSpaces = (offset, spaces) => {
  assert(spaces[offset++] === " ");
  while (spaces[offset] === " ") {
    ++offset;
  }
  return {offset};
}

const parsePost = (offset, post) => {
  assert(post[offset++] === "(");
  var {offset, result: title} = parseString(offset, post);
  var {offset} = parseSpaces(offset, post);
  var {offset, result: date} = parseString(offset, post);
  var {offset} = parseSpaces(offset, post);
  var {offset, result: href} = parseString(offset, post);
  assert(post[offset++] === ")");
  return {offset, result: `
    <a href="${href}">
      <div class="post">
        <h2>
          ${title}
        </h2>
        <h3>
          ${date}
        </h3>
      </div>
    </a>`};
}

const parseHomepage = homepage => {
  assert(homepage.slice(0, 12) === "[homepage\n  ");
  var {offset, result: post} = parsePost(12, homepage);
  const result = [post];
  while (homepage[offset] !== "]") {
    assert(homepage[offset++] === "\n");
    assert(homepage[offset++] === " ");
    assert(homepage[offset++] === " ");
    var {offset, result: post} = parsePost(offset, homepage);
    result.push(post);
  }
  assert(++offset === homepage.length);
  return templateList(result.join());
}

module.exports = (() => {
  let homepage;
  return async () => {
    if (homepage === undefined) {
      homepage = parseHomepage(await fs.readFile(`${__dirname}/index.lisp`, "utf8"));
    }
    return homepage;
  }
})();
