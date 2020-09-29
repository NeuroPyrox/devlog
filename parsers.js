"use strict";

const maybe = require("./maybe.js");

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

const pure = x => parser((_, index) => maybe([x, index]));

const lazy = p => parser((string, index) => p().parse(string, index));

const skipString = skipMe =>
  parser((string, start) => {
    const end = start + skipMe.length;
    return maybe(
      end <= string.length && skipMe === string.slice(start, end)
        ? [null, end]
        : null
    );
  });

const skipCharClass = predicate =>
  parser((string, index) =>
    maybe(
      index < string.length && predicate(string[index])
        ? [null, index + 1]
        : null
    )
  );

const inParentheses = p =>
  skipString("(")
    .applyRight(p)
    .applyLeft(skipString(")"));

const many = p => many1(p).or(pure([]));

const many1 = p =>
  p.map(head => tail => [head, ...tail]).apply(lazy(() => many(p)));

const stringOf = predicate =>
  parser((string, start) =>
    many(skipCharClass(predicate))
      .parse(string, start)
      .chain(([, end]) =>
        maybe(start === end ? null : [string.slice(start, end), end])
      )
  );

const skipSpaces1 = many1(skipCharClass(char => char === " "));

const simpleString = skipString('"')
  .applyRight(stringOf(char => char !== '"'))
  .applyLeft(skipString('"'));

module.exports = {
  skipString,
  inParentheses,
  many,
  stringOf,
  skipSpaces1,
  simpleString,
};
