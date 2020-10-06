"use strict";

const {just, nothing} = require("./maybe.js");

// Parse returns a maybe monad of a parse result and the next index
const parser = parse => ({
  parse,
  parseWhole: string => parse(string, 0).unwrap()[0],
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
  skipLeft: other =>
    parser(parse)
      .map(a => b => b)
      .apply(other),
  skipRight: other =>
    parser(parse)
      .map(a => b => a)
      .apply(other),
  or: other =>
    parser((string, index) =>
      parse(string, index).or(() => other.parse(string, index))
    )
});

const pure = x => parser((_, index) => just([x, index]));

const lazy = p => parser((string, index) => p().parse(string, index));

const fail = parser(() => nothing);

const any = parser((string, index) =>
  just([string.slice(index), string.length])
);

const end = rest =>
  parser((string, index) =>
    string.slice(index) === rest ? just([null, string.length]) : nothing
  );

const skipString = skipMe =>
  parser((string, start) => {
    const end = start + skipMe.length;
    return end <= string.length && skipMe === string.slice(start, end)
        ? just([null, end])
        : nothing
  });

const skipCharClass = predicate =>
  parser((string, index) =>
      index < string.length && predicate(string[index])
        ? just([null, index + 1])
        : nothing
  );

const inParentheses = p =>
  skipString("(")
    .skipLeft(p)
    .skipRight(skipString(")"));

const many = p => many1(p).or(pure([]));

const many1 = p =>
  p.map(head => tail => [head, ...tail]).apply(lazy(() => many(p)));

const stringOf = predicate =>
  parser((string, start) =>
    many(skipCharClass(predicate))
      .parse(string, start)
      .map(([, end]) =>
        [string.slice(start, end), end]
      )
  );

const skipSpaces1 = many1(skipCharClass(char => char === " "));

const simpleString = skipString('"')
  .skipLeft(stringOf(char => char !== '"'))
  .skipRight(skipString('"'));

module.exports = {
  pure,
  fail,
  any,
  end,
  skipString,
  inParentheses,
  many,
  stringOf,
  skipSpaces1,
  simpleString
};
