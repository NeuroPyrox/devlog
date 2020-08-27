"use strict";

const getMayPosts = require("./getMayPosts.js");

module.exports = async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "application/json"
  });
  res.write(JSON.stringify(await getMayPosts()));
  res.end();
};
