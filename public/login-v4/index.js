"use strict";

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
  .or(P.endIn("/util.js").map(() => htmlHandler(`${__dirname}/util.js`)));
