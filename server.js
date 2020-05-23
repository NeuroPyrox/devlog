"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const requireFile = filePath => require(path.join(__dirname, filePath));

const paths = requireFile("2020/5/oldHandlers.js");
paths["/"] = requireFile("2020/5/20/homepage/server.js");
for (const page of [
  "progress-report",
  "previous-blog",
  "file-structure",
  "echo",
  "graph"
]) {
  const urlPath = `/2020/5/21/${page}`;
  const filePath = `2020/5/21/${page}/server.js`;
  paths[urlPath] = requireFile(filePath);
}
for (const page of [
  "nested-hover", "s-expression-sprites"
]) {
  const urlPath = `/2020/5/22/${page}`;
  const filePath = `2020/5/22/${page}/server.js`;
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
