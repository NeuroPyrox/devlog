"use strict";

const getMayPosts = require("./getMayPosts.js");

module.exports = async res => {
  res.writeHead(200, {
    "Content-Type": "application/json"
  });
  res.write(JSON.stringify(await getMayPosts()));
  res.end();
};
