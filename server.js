"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const requireFile = filePath => require(path.join(__dirname, filePath));

const paths = requireFile("2020/5/oldHandlers.js");
paths["/"] = requireFile("2020/5/20/homepage/server.js");

const directory = [
  [21, "progress-report"],
  [21, "previous-blog"],
  [21, "file-structure"],
  [21, "echo"],
  [21, "graph"],
  [22, "nested-hover"],
  [22, "s-expression-sprites"],
  [27, "progress-report"]
];

for (const [day, page] of directory) {
  const urlPath = `/2020/5/${day}/${page}`;
  const filePath = `2020/5/${day}/${page}/server.js`;
  paths[urlPath] = requireFile(filePath);
}

const handle404error = res => {
  res.writeHead(404, { "Content-Type": "text/html" });
  res.write("404 not found");
  res.end();
};

const isEchoUrl = url => url.startsWith("/2020/5/21/echo/");
const handleEcho = (req, res) => {
  const echo = req.url.slice(16);
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });
  res.write(echo);
  res.end();
};

http
  .createServer((req, res) => {
    if (isEchoUrl(req.url)) {
      handleEcho(req, res);
      return;
    }

    const handler = paths[req.url];
    if (handler === undefined) {
      handle404error(res);
    } else {
      handler(res);
    }
  })
  .listen(process.env.PORT, () => {
    console.log(`Your app is listening on port ${process.env.PORT}`);
  });
