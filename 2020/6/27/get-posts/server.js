"use strict";

const getPosts = require("./getPosts.js");

module.exports = (juneUrl, mayPosts, mayUrl) => async res => {
  const junePosts = await getPosts(juneUrl, mayPosts, mayUrl);
  res.writeHead(200, {
    "Content-Type": "application/json"
  });
  res.write(JSON.stringify(junePosts));
  res.end();
};
