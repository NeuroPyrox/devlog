"use strict";

const http = require("http");

const mayUrl = "/2020/5";
const juneUrl = "/2020/6";

const mayPosts = require("./2020/5/getPostLocations.js")();

const juneContext = { juneUrl: juneUrl, mayPosts: mayPosts, mayUrl: mayUrl };

const paths = {"/": require("./2020/6/27/homepage/server.js")(juneContext)};

const handle404error = res => {
  res.writeHead(404, { "Content-Type": "text/html" });
  res.write("404 not found");
  res.end();
};

const isMayUrl = url => url.startsWith(mayUrl);
const isJuneUrl = url => url.startsWith(juneUrl);

const handleMayUrl = require("./2020/5/server.js")(mayUrl);
const handleJuneUrl = require("./2020/6/server.js")({ juneUrl: juneUrl, mayPosts: mayPosts, mayUrl: mayUrl });

const main = async () => {
  http
    .createServer((req, res) => {
      // HARDCODED: these if statements
      if (isMayUrl(req.url)) {
        return handleMayUrl(req, res);
      }
      if (isJuneUrl(req.url)) {
        return handleJuneUrl(req, res);
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
