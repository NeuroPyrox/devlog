"use strict";

const fs = require("fs");

module.exports = (res, filePath) => {
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    "Content-Type": "text/html",
    "Content-Length": stat.size
  });
  const readStream = fs.createReadStream(filePath);
  readStream.pipe(res);
}
