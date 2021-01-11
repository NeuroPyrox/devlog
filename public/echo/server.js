"use strict";

const P = require("../../parsers.js");
const htmlHandler = require("../../lib/html-handler.js");

module.exports = P.end
  .map(_ => htmlHandler(`${__dirname}/index.html`))
  .or(
    P.string("/").skipLeft(
      P.any.map(echo => (req, res) => {
        res.writeHead(200, {
          "Content-Type": "text/plain"
        });
        res.write(echo);
        res.end();
      })
    )
  );
