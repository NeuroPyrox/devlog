"use strict";

const path = require("path");
const writeFile = require("../17/writeFile.js");

const handlers = {
  "": (req, res) => {
    writeFile(res, path.join(__dirname, "index.html"));
  },
  "postsUI": require("./postsUI/server.js")
};

module.exports = handlers;
