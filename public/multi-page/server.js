"use strict";

const P = require("../../parsers.js");
const writeFile = require("../../lib/write-file.js");

const writeText = text => (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text"
  });
  res.write(text);
  res.end();
};

module.exports = P.end("")
  .map(_ => writeFile(`${__dirname}/index.html`))
  .or(
    P.end("/").map(_ => (req, res) => {
      res.writeHead(302, { Location: req.url.slice(0, -1) });
      res.end();
    })
  )
  .or(P.end("/123").map(_ => writeText("123 page")))
  .or(P.end("/abc").map(_ => writeText("abc page")));
