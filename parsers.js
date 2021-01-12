"use strict";

const { just, nothing } = require("./maybe.js");

// In this module, "str" refers to a string and "string" refers to the parser conbinator

// Parse returns a maybe monad of a parse result and the next index
const parser = parse => ({
  parse,
  parseWhole: str => parse(str, 0).unwrap()[0],
  map: f =>
    parser((str, index) =>
      parse(str, index).map(([result, index]) => [f(result), index])
    ),
  apply: other =>
    parser((str, index) =>
      parse(str, index).chain(([f, indexF]) =>
        other.parse(str, indexF).map(([x, indexX]) => [f(x), indexX])
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
    parser((str, index) =>
      parse(str, index).or(() => other.parse(str, index))
    )
});

const constant = x => parser((_, index) => just([x, index]));

const lazy = p => parser((str, index) => p().parse(str, index));

const fail = parser(() => nothing);

const any = parser((str, index) =>
  just([str.slice(index), str.length])
);

const end = parser((str, index) =>
    str.length === index ? just([null, index]) : nothing
  );

const endIn = rest =>
  parser((str, index) =>
    str.slice(index) === rest ? just([null, str.length]) : nothing
  );

const string = expected =>
  parser((str, start) => {
    const end = start + expected.length;
    return end <= str.length && expected === str.slice(start, end)
      ? just([expected, end])
      : nothing;
  });

const charClass = predicate =>
  parser((str, index) =>
    index < str.length && predicate(str[index])
      ? just([str[index], index + 1])
      : nothing
  );

const inParentheses = p =>
  string("(")
    .skipLeft(p)
    .skipRight(string(")"));

const many = p => many1(p).or(constant([]));

const many1 = p =>
  p.map(head => tail => [head, ...tail]).apply(lazy(() => many(p)));

const stringOf = predicate =>
  parser((str, start) =>
    many(charClass(predicate))
      .parse(str, start)
      .map(([, end]) => [str.slice(start, end), end])
  );

const spaces1 = many1(charClass(char => char === " "));

const simpleString = string('"')
  .skipLeft(many(charClass(char => char !== '"')).map(chars => chars.join("")))
  .skipRight(string('"'));

module.exports = {
  constant,
  fail,
  any,
  end,
  endIn,
  string,
  inParentheses,
  many,
  spaces1,
  simpleString
};
