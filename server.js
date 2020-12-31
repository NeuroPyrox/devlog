"use strict";

// TODO use specialized parsers for urls to prevent namespace collisions

// TODO combine into single source of truth for urls:
//  server.lisp
//  2020/9/21/homepage.v4.lisp
//  2020/8/25/homepageV3.lisp
//  2020/6/27/get-posts/getPosts.js
//  2020/6/27/get-june-posts/getJunePosts.js

const fs = require("fs");
const P = require("./parsers.js");

// Each value maps a file path to a parser of url tails to handlers
const handlerTypes = {
  html: filePath =>
    P.end("").map(_ => async (req, res) => {
      const stat = await fs.promises.stat(filePath);
      res.writeHead(200, {
        "Content-Type": "text/html",
        "Content-Length": stat.size
      });
      fs.createReadStream(filePath).pipe(res);
    }),
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
  handlerMap: filePath =>
    Object.entries(require(filePath)).reduce(
      (total, [key, value]) =>
        P.end(key)
          .map(_ => value)
          .or(total),
      P.fail
    ),
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
  P.skipString("server").skipLeft(
    P.many(
      P.skipString("\n  ").skipLeft(
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
            .skipRight(P.skipSpaces1)
            .apply(P.simpleString)
            .skipRight(P.skipSpaces1)
            .apply(P.simpleString)
        )
      )
    )
  )
)
  .skipRight(P.end(""))
  .map(handlers =>
    P.skipString("/").skipLeft(
      handlers.reduce(
        (total, [key, value]) =>
          P.skipString(key)
            .skipLeft(value)
            .or(total),
        P.pure(handle404error)
      )
    )
  );

const handlersPromise = fs.promises
  .readFile("server.lisp", "utf8")
  .then(string => handlersParser.parseWhole(string));

require("http")
  .createServer(async (req, res) =>
    (await handlersPromise).parseWhole(req.url)(req, res)
  )
  .listen(process.env.PORT, () =>
    console.log(`Your app is listening on port ${process.env.PORT}`)
  );
