"use strict";

const fs = require("fs");

let html;

module.exports = async () => 
  fs.promises.readFile(`${__dirname}/index.html`, "utf8")
