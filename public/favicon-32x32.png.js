"use strict";

const P = require("../parsers.js");

module.exports = P.end.map(_ => (req, res) => {
  res.writeHead(302, {
    Location: `https://cdn.glitch.com/ef6d7e3d-88ee-4914-a43c-ca8be9bdf01f%2Ffavicon-32x32.png?v=1610405093448`
  });
  res.end();
});
