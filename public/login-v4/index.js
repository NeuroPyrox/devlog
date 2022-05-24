"use strict";

const fs = require("fs");
const P = require("../../parsers.js");
const htmlHandler = require("../../lib/html-handler.js");

const moduleHandler = (moduleName) =>
  P.endIn(`/${moduleName}.js`).map(() => async (req, res) => {
    const fileName = `${__dirname}/${moduleName}.js`;
    const stat = await fs.promises.stat(fileName);
    res.writeHead(200, {
      "Content-Type": "text/javascript",
      "Content-Length": stat.size,
    });
    fs.createReadStream(fileName).pipe(res);
  });

module.exports = P.end
  .map(() => (req, res) => {
    console.log(req);
    res.writeHead(307, {
      Location: req.url + "/",
    });
    res.end();
  })
  .or(P.endIn("/").map(() => htmlHandler(`${__dirname}/index.html`)))
  .or(moduleHandler("util"))
  .or(moduleHandler("lazyConstructors"))
  .or(moduleHandler("pull"));
