"use strict";

const fs = require("fs");
const P = require("./parsers.js");

// Each value maps a file path (resource) to a parser of url tails to handlers
const handlerTypes = {
  html: resource =>
    P.end("").map(_ => async (req, res) => {
      const stat = await fs.promises.stat(resource);
      res.writeHead(200, {
        "Content-Type": "text/html",
        "Content-Length": stat.size
      });
      fs.createReadStream(resource).pipe(res);
    }),
  htmlBuilder: resource => {
    const htmlBuilder = require(resource);
    return P.end("").map(_ => async (req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/html"
      });
      res.write(await htmlBuilder());
      res.end();
    });
  },
  json: resource => {
    const jsonBuilder = require(resource);
    return P.end("").map(_ => async (req, res) => {
      res.writeHead(200, {
        "Content-Type": "application/json"
      });
      res.write(JSON.stringify(await jsonBuilder()));
      res.end();
    });
  },
  handlerMap: resource =>
    Object.entries(require(resource)).reduce(
      (total, [key, value]) =>
        P.end(key)
          .map(_ => value)
          .or(total),
      P.fail
    ),
  server: require
};

const handle404error = (req, res) => {
  res.writeHead(404, { "Content-Type": "text/html" });
  res.write("404 not found");
  res.end();
};

// A doubly nested parser: parser(server.lisp -> parser(url -> ((req, res) -> void)))
// It's probably better to encode server.lisp as json, but I wanted to have fun
const handlersParser = P.inParentheses(
  P.skipString("handlers").skipLeft(
    P.many(
      P.skipString("\n  ").skipLeft(
        P.inParentheses(
          P.stringOf(
            char => ("a" <= char && char <= "z") || ("A" <= char && char <= "Z")
          )
            .map(type => source => path => [
              path,
              handlerTypes[type](
                source[0] === "/"
                  ? `.${path}${source}`
                  : `.${path.slice(0, path.lastIndexOf("/"))}/${source}`
              )
            ])
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
    handlers.reduce(
      (total, [key, value]) =>
        P.skipString(key)
          .skipLeft(value)
          .or(total),
      P.pure(handle404error)
    )
  );

const handlersPromise = fs.promises
  .readFile("server.lisp", "utf8")
  .then(string => handlersParser.parse(string, 0).unwrap()[0]);

require("http")
  .createServer(async (req, res) =>
    (await handlersPromise)
      .parse(req.url, 0)
      .unwrap()[0](req, res)
  )
  .listen(process.env.PORT, () =>
    console.log(`Your app is listening on port ${process.env.PORT}`)
  );
