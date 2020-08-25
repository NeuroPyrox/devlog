"use strict";

const mayUrl = "/2020/5";
const juneUrl = "/2020/6";

const mayPosts = require("../5/getPostLocations.js")();

const juneContext = { juneUrl: juneUrl, mayPosts: mayPosts, mayUrl: mayUrl };

const isMayUrl = url => url.startsWith(mayUrl);
const isJuneUrl = url => url.startsWith(juneUrl);

const handleMayUrl = require("../5/server.js")(mayUrl);
const handleJuneUrl = require("../6/server.js")({
  juneUrl: juneUrl,
  mayPosts: mayPosts,
  mayUrl: mayUrl
});

module.exports = (req, res, handle404error) => {
  // HARDCODED: these if statements
  if (isMayUrl(req.url)) {
    return handleMayUrl(req, res);
  }
  if (isJuneUrl(req.url)) {
    return handleJuneUrl(req, res);
  }
  handle404error(res);
};
