"use strict";

const P = require("../../../../parsers.js");

module.exports = P.end("").map(_ => (req, res) => {
  const ip = req.headers["x-forwarded-for"].split(",")[0];
  res.writeHead(200, {
    "Content-Type": "text"
  });
  res.write("Your ip: " + ip);
  res.end();
});
