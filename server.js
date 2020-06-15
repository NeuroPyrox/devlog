"use strict";

const http = require("http");

const mayUrl = "/2020/5";
const juneUrl = "/2020/6";

const mayPosts = require("./2020/5/getPostLocations.js")();

// HARDCODED
const paths = {
  "/": require("./2020/5/20/homepage/server.js")(mayUrl),
  "/2020/6/14/didnt-solve-agi": require("./2020/6/14/didnt-solve-agi/server.js"),
  "/2020/6/15/post-locations": require("./2020/6/15/post-locations/server.js")(juneUrl, mayPosts, mayUrl)
}

const handle404error = res => {
  res.writeHead(404, { "Content-Type": "text/html" });
  res.write("404 not found");
  res.end();
};

const isMayUrl = url => url.startsWith(mayUrl);

const handleMayUrl = require("./2020/5/server.js")(mayUrl);

const main = async () => {
  http
    .createServer((req, res) => {
      // HARDCODED: this if statement
      if (isMayUrl(req.url)) {
        handleMayUrl(req, res);
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
