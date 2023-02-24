"use strict";

// TODO ES modules
// TODO upload libraries to github instead of making a monorepo
// TODO google discoverability
// TODO move parts of server.lisp to homepage.lisp
// TODO add icon headers to more pages
// TODO use specialized parsers for urls to prevent namespace collisions
// TODO add url collision errors during initialization
// TODO combine into single source of truth for urls:
//  get-june-days
//  get-june-posts
//  get-may-days
//  get-may-posts
//  post-finder
//  post-locations

import * as fs from "fs";
import * as P from "./parsers.js";
import htmlHandler from "./lib/html-handler.js";
import { createServer } from "http";

// Each value maps a file path to a parser of url tails to handlers
const handlerTypes = {
  html: (filePath) => P.end.map(() => htmlHandler(filePath)),
  htmlBuilder: async (filePath) => {
    const htmlBuilder = (await import(filePath)).default;
    return P.end.map(() => async (req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/html",
      });
      res.write(await htmlBuilder());
      res.end();
    });
  },
  json: async (filePath) => {
    const jsonBuilder = (await import(filePath)).default;
    return P.end.map(() => async (req, res) => {
      res.writeHead(200, {
        "Content-Type": "application/json",
      });
      res.write(JSON.stringify(await jsonBuilder()));
      res.end();
    });
  },
  router: async (x) => (await import(x)).default,
};

const handle404error = (req, res) => {
  res.writeHead(404, { "Content-Type": "text/html" });
  res.write("404 not found");
  res.end();
};

const typeParser = P.string("htmlBuilder")
  .or(P.string("html"))
  .or(P.string("json"))
  .or(P.string("router"));

const handlerParser = P.inParentheses(
  typeParser
    .map((type) => (path) => (suffix) => [
      path,
      handlerTypes[type](`./public${path}${suffix}`),
    ])
    .or(
      P.string("redirect").map(() => (from) => (to) => [
        from,
        P.end.map(() => (req, res) => {
          res.writeHead(301, {
            Location: to,
          });
          res.end();
        }),
      ])
    )
    .skipRight(P.spaces1)
    .apply(P.untilChar(" "))
    .skipRight(P.spaces1)
    .apply(P.untilChar(")"))
);

// A doubly nested parser: parser(server.lisp -> parser(url -> ((req, res) -> unit)))
// It's probably better to encode server.lisp as json, but I wanted to have fun
const handlersParser = P.inParentheses(
  P.string("server").skipLeft(P.many(P.string("\n  ").skipLeft(handlerParser)))
)
  .skipRight(P.end)
  .map((handlers) =>
    handlers.reduce(
      async (total, [key, value]) => P.string(key).skipLeft(await value).or(await total),
      P.constant(handle404error)
    )
  );

const handlersPromise = fs.promises
  .readFile("server.lisp", "utf8")
  .then((string) => handlersParser.parseWhole(string));

const secureHeaders = (req, res, next) => {
  // This can be done with helmet.js, but I wanted to minimize dependencies for the learning experience
  res.setHeader("Referrer-Policy", "no-referrer");
  //res.setHeader("X-Frame-Options", "deny");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none"); // TODO I still don't understand what this does
  res.setHeader("X-XSS-Protection", "0");
  // 31536000 seconds is one non-leap year
  res.setHeader("Strict-Transport-Security", "max-age=31536000");
  res.setHeader("Expect-CT", "max-age=31536000, enforce"); // TODO reporting
  next();
};

const redirectHttpToHttps = (req, res, next) => {
  const protocol = req.headers["x-forwarded-proto"].split(",")[0];
  if (protocol === "https") {
    next();
  } else {
    // Redirect all http requests to https
    // We're trusting glitch.com as a proxy and they can still view all of our internet trafic unencrypted
    // TODO test if we can use the https module
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    res.end();
  }
};

const errorMiddleware = async (req, res, next) => {
  try {
    next();
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/html" });
    res.write("Internal server error");
    res.end();
  }
};

const composeMiddleware = (a, b) => (req, res, next) =>
  a(req, res, () => b(req, res, next));

createServer(
  composeMiddleware(
    errorMiddleware,
    composeMiddleware(
      redirectHttpToHttps,
      composeMiddleware(secureHeaders, async (req, res) =>
        (await handlersPromise).parseWhole(req.url)(req, res)
      )
    )
  )
).listen(process.env.PORT, () =>
  console.log(`Your app is listening on port ${process.env.PORT}`)
);
