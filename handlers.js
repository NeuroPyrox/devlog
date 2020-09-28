"use strict";

const just = x => ({
  map: f => just(f(x)),
  chain: f => f(x),
  or: _ => just(x),
  unwrap: _ => x
});

const nothing = { map: _ => nothing, chain: _ => nothing, or: f => f() };

// Parse returns a maybe monad of a parse result and the next index
const parser = parse => ({
  parse,
  map: f =>
    parser((string, index) =>
      parse(string, index).map(([result, index]) => [f(result), index])
    ),
  apply: other =>
    parser((string, index) =>
      parse(string, index).chain(([f, indexF]) =>
        other.parse(string, indexF).map(([x, indexX]) => [f(x), indexX])
      )
    ),
  applyLeft: other =>
    parser(parse)
      .map(a => b => a)
      .apply(other),
  applyRight: other =>
    parser(parse)
      .map(a => b => b)
      .apply(other),
  or: other =>
    parser((string, index) =>
      parse(string, index).or(() => other.parse(string, index))
    )
});

const returnParser = x => parser((_, index) => just([x, index]));

const skipCharParser = predicate =>
  parser((string, index) =>
    index < string.length && predicate(string[index])
      ? just([null, index + 1])
      : nothing
  );

const skipManyCharParser = predicate => {
  // Recursive object definition
  const result = {};
  return Object.assign(
    result,
    skipCharParser(predicate)
      .applyLeft(result)
      .or(returnParser(null))
  );
};

const manyCharParser = predicate =>
  parser((string, start) =>
    skipManyCharParser(predicate)
      .parse(string, start)
      .map(([, end]) => [string.slice(start, end), end])
  );

const manyLetterParser = manyCharParser(
  char => ("a" <= char && char <= "z") || ("A" <= char && char <= "Z")
);

const stringParser = skipCharParser(char => char === '"')
  .applyRight(manyCharParser(char => char !== '"'))
  .applyLeft(skipCharParser(_ => true));

const skipManySpaceParser = skipManyCharParser(char => char === " ");

const handlerParser = skipCharParser(char => char === "(")
  .applyRight(manyLetterParser)
  .map(type => source => path => [type, source, path])
  .applyLeft(skipManySpaceParser)
  .apply(stringParser)
  .applyLeft(skipManySpaceParser)
  .apply(stringParser)
  .applyLeft(skipCharParser(char => char === ")"));

const skipStringParser = skipString => parser((string, start) => {
  const end = start + skipString.length;
  return (end < string.length && string.slice(start, end) === skipString) ? just([null, end]) : nothing
})

const fs = require("fs");

const assert = condition => {
  if (!condition) {
    throw "Assertion Error!";
  }
};

const handlersParser = skipStringParser("(handlers\n  ")

const parseHandlers = handlers => {
  assert(handlers.slice(0, 12) === "(handlers\n  ");
  var [handler, offset] = handlerParser.parse(handlers, 12).unwrap();
  const result = [handler];
  while (handlers[offset] !== ")") {
    assert(handlers[offset++] === "\n");
    assert(handlers[offset++] === " ");
    assert(handlers[offset++] === " ");
    var [handler, offset] = handlerParser.parse(handlers, offset).unwrap();
    result.push(handler);
  }
  assert(++offset === handlers.length);
  return result;
};

const createHtmlEndpoint = resource => async (req, res) => {
  const stat = await fs.promises.stat(resource);
  res.writeHead(200, {
    "Content-Type": "text/html",
    "Content-Length": stat.size
  });
  fs.createReadStream(resource).pipe(res);
};

const createHtmlBuilderEndpoint = resource => {
  const htmlBuilder = require(resource);
  return async (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/html"
    });
    res.write(await htmlBuilder());
    res.end();
  };
};

const createJsonEndpoint = resource => {
  const jsonBuilder = require(resource);
  return async (req, res) => {
    res.writeHead(200, {
      "Content-Type": "application/json"
    });
    res.write(JSON.stringify(await jsonBuilder()));
    res.end();
  };
};

module.exports = (() => {
  const promise = (async () => {
    const handlersList = parseHandlers(
      await fs.promises.readFile("handlers.lisp", "utf8")
    );
    const endpoints = {};
    const servers = {};
    for (const [type, source, path] of handlersList) {
      assert(path[0] === "/");
      const resource =
        source[0] === "/"
          ? `.${path}${source}`
          : `.${path.slice(0, path.lastIndexOf("/"))}/${source}`;
      switch (type) {
        case "html":
          endpoints[path] = createHtmlEndpoint(resource);
          break;
        case "htmlBuilder":
          endpoints[path] = createHtmlBuilderEndpoint(resource);
          break;
        case "json":
          endpoints[path] = createJsonEndpoint(resource);
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
