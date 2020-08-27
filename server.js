"use strict";

const handlers = require("./handlers.js");
const http = require("http");

const handle404error = (req, res) => {
  res.writeHead(404, { "Content-Type": "text/html" });
  res.write("404 not found");
  res.end();
};

const main = async () => {
  http
    .createServer((req, res) => {
      handlers(req, res, handle404error);
    })
    .listen(process.env.PORT, () => {
      console.log(`Your app is listening on port ${process.env.PORT}`);
    });
};

main();
