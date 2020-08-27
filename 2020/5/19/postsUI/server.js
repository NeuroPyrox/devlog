"use strict";

const path = require("path");
const writeFile = require("../../17/writeFile.js");

module.exports = (req, res) => {
  writeFile(res, path.join(__dirname, "index.html"));
}
