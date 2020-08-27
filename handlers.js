"use strict";

const fs = require("fs");

const assert = condition => {
  if (!condition) {
    throw "Assertion Error!";
  }
}

const isLetter = letter => (
  letter.length === 1
  && (("a" <= letter && letter <= "z")
      || ("A" <= letter && letter <= "Z")))

const parseLetters = (offset, letters) => {
  var end = offset;
  while (isLetter(letters[end])) {
    ++end;
  }
  const result = letters.slice(offset, end);
  offset = end;
  return {offset, result};
}

const parseString = (offset, string) => {
  assert(string[offset++] === "\"");
  var end = offset;
  while (string[end] !== "\"") {
    ++end;
  }
  const result = string.slice(offset, end);
  offset = ++end;
  return {offset, result};
}

const parseSpaces = (offset, spaces) => {
  assert(spaces[offset++] === " ");
  while (spaces[offset] === " ") {
    ++offset;
  }
  return {offset};
}

const parseHandler = (offset, post) => {
  assert(post[offset++] === "(");
  var {offset, result: type} = parseLetters(offset, post);
  var {offset} = parseSpaces(offset, post);
  var {offset, result: source} = parseString(offset, post);
  var {offset} = parseSpaces(offset, post);
  var {offset, result: path} = parseString(offset, post);
  assert(post[offset++] === ")");
  return {offset, result: [type, source, path]};
}

const parseHandlers = handlers => {
  assert(handlers.slice(0, 12) === "(handlers\n  ");
  var {offset, result: handler} = parseHandler(12, handlers);
  const result = [handler];
  while (handlers[offset] !== ")") {
    assert(handlers[offset++] === "\n");
    assert(handlers[offset++] === " ");
    assert(handlers[offset++] === " ");
    var {offset, result: handler} = parseHandler(offset, handlers);
    result.push(handler);
  }
  assert(++offset === handlers.length);
  return result;
}

module.exports = (() => {
  const promise = (async () => {
    const handlersList = parseHandlers(await fs.promises.readFile("handlers.lisp", "utf8"));
    const endpoints = {};
    const servers = {};
    for (const [type, source, path] of handlersList) {
      assert(path[0] === "/");
      const resource = (source[0] === "/") ?
            `.${path}${source}` : `.${path.slice(0, path.lastIndexOf("/"))}/${source}`;
      switch(type) {
        case "html":
          endpoints[path] = async (req, res) => {
            const stat = await fs.promises.stat(resource);
            res.writeHead(200, {
              "Content-Type": "text/html",
              "Content-Length": stat.size
            });
            fs.createReadStream(resource).pipe(res);
          }
          break;
        case "htmlBuilder":
          const htmlBuilder = require(resource);
          endpoints[path] = async (req, res) => {
            res.writeHead(200, {
              "Content-Type": "text/html"
            });
            res.write(await htmlBuilder());
            res.end();
          }
          break;
        case "json":
          const jsonBuilder = require(resource);
          endpoints[path] = async (req, res) => {
            res.writeHead(200, {
              "Content-Type": "application/json"
            });
            res.write(JSON.stringify(await jsonBuilder()));
            res.end();
          }
          break;
        case "handlerMap":
          for (const [key, value] of Object.entries(require(resource))) {
            endpoints[path + key] = value;
          }
          break;
        case "server":
          servers[path] = require(resource)(path);
          break;
        default:
          assert(false);
      }
    }
    return [endpoints, servers];
  })();
  return async (req, res, handle404error) => {
    const [endpoints, servers] = await promise;
    const endpoint = endpoints[req.url];
    if (endpoint !== undefined) {
      return endpoint(req, res);
    }
    for (const [key, value] of Object.entries(servers)) {
      if (req.url.startsWith(key)) {
        return value(req, res);
      }
    }
    handle404error(req, res);
  };
})();
