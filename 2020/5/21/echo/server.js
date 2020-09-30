"use strict";

const fs = require("fs");
const P = require("../../../../parsers.js");

module.exports = P.end("")
  .map(_ => async (req, res) => {
    const stat = await fs.promises.stat(`${__dirname}/index.html`);
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Content-Length": stat.size
    });
    fs.createReadStream(`${__dirname}/index.html`).pipe(res);
  })
  .or(
    P.any.map(echo => (req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/plain"
      });
      res.write(echo);
      res.end();
    })
  );
