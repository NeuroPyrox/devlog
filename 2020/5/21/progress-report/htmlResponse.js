"use strict";

const path = require("path");
const writeFile = require("../../17/writeFile.js");

module.exports = dirname => {
  const page = path.join(dirname, "index.html");
  return res => {
    writeFile(res, page);
  };
};
