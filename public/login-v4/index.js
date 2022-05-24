"use strict";

const fs = require("fs");
const P = require("../../parsers.js");
const htmlHandler = require("../../lib/html-handler.js");

module.exports = P.end
  .map(() => (req, res) => {
    console.log(req);
    res.writeHead(307, {
      Location: req.url + "/",
    });
    res.end();
  })
  .or(P.endIn("/").map(() => htmlHandler(`${__dirname}/index.html`)))
  .or(P.endIn("/util.js").map(() => async (req, res) => {
    const fileName = `${__dirname}/util.js`;
    const stat = await fs.promises.stat(fileName);
    res.writeHead(200, {
      "Content-Type": "text/javascript",
      "Content-Length": stat.size
    });
    fs.createReadStream(fileName).pipe(res);
  }))
  .or(P.endIn("/lazyConstructors.js").map(() => async (req, res) => {
    const fileName = `${__dirname}/lazyConstructors.js`;
    const stat = await fs.promises.stat(fileName);
    res.writeHead(200, {
      "Content-Type": "text/javascript",
      "Content-Length": stat.size
    });
    fs.createReadStream(fileName).pipe(res);
  }));
