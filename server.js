"use strict";

const http = require("http");

// HARDCODED
const paths = {
  "/": require("./2020/5/20/homepage/server.js"),
  "/2020/6/14/didnt-solve-agi": require("./2020/6/14/didnt-solve-agi/server.js")
}

const handle404error = res => {
  res.writeHead(404, { "Content-Type": "text/html" });
  res.write("404 not found");
  res.end();
};

const isMayUrl = url => url.startsWith("/2020/5/");

const handleMayUrl = require("./2020/5/server.js")("/2020/5/");

const main = async () => {
  http
    .createServer(async (req, res) => {
      // HARDCODED: this if statement
      if (isMayUrl(req.url)) {
        (await handleMayUrl)(req, res);
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
};

main();
