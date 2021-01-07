"use strict";

const P = require("../parsers.js");

const textHandler = text => (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text"
  });
  res.write(text);
  res.end();
};

// TODO add a required slash
module.exports = P.end("")
  .map(_ => textHandler("Try adding stuff to the end of the url"))
  .or(P.any.map(textHandler));
