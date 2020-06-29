"use strict";

const http = require("http");

const mayUrl = "/2020/5";
const juneUrl = "/2020/6";

const mayPosts = require("./2020/5/getPostLocations.js")();

const juneContext = { juneUrl: juneUrl, mayPosts: mayPosts, mayUrl: mayUrl };

// HARDCODED
const paths = {
  "/": require("./2020/6/27/homepage/server.js")(juneContext),
  "/2020/6/14/didnt-solve-agi": require("./2020/6/14/didnt-solve-agi/server.js")(
    juneContext
  ),
  "/2020/6/15/post-locations": require("./2020/6/15/post-locations/server.js")(
    juneContext
  ),
  "/2020/6/22/get-june-days": require("./2020/6/22/get-june-days/server.js")(
    juneContext
  ),
  "/2020/6/27/get-june-posts": require("./2020/6/27/get-june-posts/server.js")(
    juneContext
  ),
  "/2020/6/27/get-posts": require("./2020/6/27/get-posts/server.js")(
    juneContext
  ),
  "/2020/6/27/homepage": require("./2020/6/27/homepage/server.js")(juneContext),
  "/2020/6/28/actor-rules": require("./2020/6/28/actor-rules/server.js")(
    juneContext
  )
};

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
        return handleMayUrl(req, res);
      }

      // HARDCODED: these if statements
      if (req.url === "/2020/6/27/echo-ip") {
        return require("./2020/6/27/echo-ip/server.js")(juneContext)(req, res);
      }
      if (req.url.startsWith("/2020/6/29/url-tail")) {
        return require("./2020/6/29/url-tail/server.js")(juneContext)(req, res);
      }
      if (req.url.startsWith("/2020/6/29/multi-page")) {
        return require("./2020/6/29/multi-page/server.js")(juneContext)(req, res);
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
