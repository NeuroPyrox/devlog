"use strict";

const fs = require("fs");
const P = require("./parsers.js");

// Each function here returns a list of pairs [[path, handler], ...]
const handlerTypes = {
  html: (path, resource) => [
    [
      path,
      async (req, res) => {
        const stat = await fs.promises.stat(resource);
        res.writeHead(200, {
          "Content-Type": "text/html",
          "Content-Length": stat.size
        });
        fs.createReadStream(resource).pipe(res);
      }
    ]
  ],
  htmlBuilder: (path, resource) => {
    const htmlBuilder = require(resource);
    return [
      [
        path,
        async (req, res) => {
          res.writeHead(200, {
            "Content-Type": "text/html"
          });
          res.write(await htmlBuilder());
          res.end();
        }
      ]
    ];
  },
  json: (path, resource) => {
    const jsonBuilder = require(resource);
    return [
      [
        path,
        async (req, res) => {
          res.writeHead(200, {
            "Content-Type": "application/json"
          });
          res.write(JSON.stringify(await jsonBuilder()));
          res.end();
        }
      ]
    ];
  },
  handlerMap: (path, resource) =>
    Object.entries(require(resource)).map(([key, value]) => [
      path + key,
      value
    ]),
  server: (path, resource) => [[path, require(resource)(path)]]
};

// It's probably better to encode handlers.lisp as json, but I wanted to have fun
const handlersParser = P.inParentheses(
  P.skipString("handlers").skipLeft(
    P.many(
      P.skipString("\n  ").skipLeft(
        P.inParentheses(
          P.stringOf(
            char => ("a" <= char && char <= "z") || ("A" <= char && char <= "Z")
          )
            .map(type => source => path =>
              handlerTypes[type](
                path,
                source[0] === "/"
                  ? `.${path}${source}`
                  : `.${path.slice(0, path.lastIndexOf("/"))}/${source}`
              )
            )
            .skipRight(P.skipSpaces1)
            .apply(P.simpleString)
            .skipRight(P.skipSpaces1)
            .apply(P.simpleString)
        )
      )
    ).map(listOfListOfPairs => listOfListOfPairs.flat())
  )
);

const handlersPromise = fs.promises
  .readFile("handlers.lisp", "utf8")
  .then(string => {
    const [result, index] = handlersParser.parse(string, 0).unwrap();
    if (index !== string.length) {
      throw "Didn't parse whole file";
    }
    return result;
  });

module.exports = async (req, res, handle404error) => {
  const handlers = await handlersPromise;
  // This is inefficient
  for (const [key, value] of handlers) {
    if (req.url === key) {
      return value(req, res);
    }
  }
  for (const [key, value] of handlers) {
    if (req.url.startsWith(key)) {
      return value(req, res);
    }
  }
  handle404error(req, res);
};
