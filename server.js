"use strict";

// TODO check
// TODO use specialized parsers for urls to prevent namespace collisions
// TODO add url collision errors during initialization
// TODO combine into single source of truth for urls:
//  server.lisp
//  2020/9/21/homepage.v4.lisp
//  2020/8/25/homepageV3.lisp
//  2020/6/27/get-posts/getPosts.js
//  2020/6/27/get-june-posts/getJunePosts.js

const fs = require("fs");
const P = require("./parsers.js");
const htmlHandler = require("./lib/html-handler.js");

// Each value maps a file path to a parser of url tails to handlers
const handlerTypes = {
  html: filePath => P.end("").map(_ => htmlHandler(filePath)),
  htmlBuilder: filePath => {
    const htmlBuilder = require(filePath);
    return P.end("").map(_ => async (req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/html"
      });
      res.write(await htmlBuilder());
      res.end();
    });
  },
  json: filePath => {
    const jsonBuilder = require(filePath);
    return P.end("").map(_ => async (req, res) => {
      res.writeHead(200, {
        "Content-Type": "application/json"
      });
      res.write(JSON.stringify(await jsonBuilder()));
      res.end();
    });
  },
  router: require
};

const handle404error = (req, res) => {
  res.writeHead(404, { "Content-Type": "text/html" });
  res.write("404 not found");
  res.end();
};

// A doubly nested parser: parser(server.lisp -> parser(url -> ((req, res) -> unit)))
// It's probably better to encode server.lisp as json, but I wanted to have fun
const handlersParser = P.inParentheses(
  P.string("server").skipLeft(
    P.many(
      P.string("\n  ").skipLeft(
        P.inParentheses(
          P.pure(type => source => path => [
            path,
            handlerTypes[type](`./${source}`)
          ])
            .apply(
              P.stringOf(
                char =>
                  ("a" <= char && char <= "z") || ("A" <= char && char <= "Z")
              )
            )
            .skipRight(P.spaces1)
            .apply(P.simpleString)
            .skipRight(P.spaces1)
            .apply(P.simpleString)
        )
      )
    )
  )
)
  .skipRight(P.end(""))
  .map(handlers =>
    P.string("/").skipLeft(
      handlers.reduce(
        (total, [key, value]) =>
          P.string(key)
            .skipLeft(value)
            .or(total),
        P.pure(handle404error)
      )
    )
  );

const handlersPromise = fs.promises
  .readFile("server.lisp", "utf8")
  .then(string => handlersParser.parseWhole(string));

const handleHttps = async (req, res) => {
  res.setHeader("x-frame-options", "deny");
  // 31536000 seconds is one non-leap year
  res.setHeader("strict-transport-security", "max-age=31536000");
  res.setHeader("expect-ct", "max-age=31536000, enforce");
  (await handlersPromise).parseWhole(req.url)(req, res);
};

// TODO server-side error middleware

require("http")
  .createServer(async (req, res) => {
    const protocol = req.headers["x-forwarded-proto"].split(",")[0];
    if (protocol === "https") {
      await handleHttps(req, res);
    } else {
      // Redirect all http requests to https
      // We're trusting glitch.com as a proxy and they can still view all of our internet trafic unencrypted
      // TODO test if we can use the https module
      res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
      res.end();
    }
  })
  .listen(process.env.PORT, () =>
    console.log(`Your app is listening on port ${process.env.PORT}`)
  );
