"use strict";

const P = require("../parsers.js");

const writeText = text => (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text"
  });
  res.write(text);
  res.end();
};

// TODO add a required slash
module.exports = P.end("")
  .map(_ => writeText("Try adding stuff to the end of the url"))
  .or(P.any.map(writeText));
