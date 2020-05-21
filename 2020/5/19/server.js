"use strict";

const path = require("path");
const writeFile = require("../17/writeFile.js");

const handlers = {
  "": res => {
    writeFile(res, path.join(__dirname, "index.html"));
  },
  "postsUI": require("./postsUI/server.js")
};

module.exports = handlers;
