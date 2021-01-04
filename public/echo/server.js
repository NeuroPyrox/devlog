"use strict";

const P = require("../../parsers.js");
const writeFile = require("../../lib/write-file.js");

module.exports = P.end("")
  .map(_ => writeFile(`${__dirname}/index.html`))
  .or(
    P.skipString("/").skipLeft(
      P.any.map(echo => (req, res) => {
        res.writeHead(200, {
          "Content-Type": "text/plain"
        });
        res.write(echo);
        res.end();
      })
    )
  );
