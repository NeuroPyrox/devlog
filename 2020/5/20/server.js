"use strict";

const path = require("path");
const writeFile = require("../17/writeFile.js");

const handlers = {
  "": res => {
    writeFile(res, path.join(__dirname, "index.html"));
  },
  "interaction-sprites": require("./interaction-sprites/server.js"),
  "post-finder": require("./post-finder/server.js"),
  "homepage": require("./homepage/server.js"),
  "dannys-page": require("./dannys-page/server.js")
};

module.exports = handlers;
