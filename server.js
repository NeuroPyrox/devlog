"use strict";

const http = require("http");
const fs = require("fs");

const paths = {
  "/": require("./2020/8/25/homepage_v3.js"),
  "/2020/7/5/ideas": async (req, res) => {
    const filePath = "./2020/7/5/ideas.html";
    const stat = await fs.promises.stat(filePath);
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Content-Length": stat.size
    });
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  }
};

const handle404error = res => {
  res.writeHead(404, { "Content-Type": "text/html" });
  res.write("404 not found");
  res.end();
};

const oldHandlerAdapter = require("./2020/8/oldHandlerAdapter.js");

const main = async () => {
  http
    .createServer((req, res) => {
      const handler = paths[req.url];
      if (handler === undefined) {
        oldHandlerAdapter(req, res, handle404error);
      } else {
        handler(req, res);
      }
    })
    .listen(process.env.PORT, () => {
      console.log(`Your app is listening on port ${process.env.PORT}`);
    });
};

main();
