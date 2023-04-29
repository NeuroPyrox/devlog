import { just, nothing } from "./maybe.js";

// In this module, [str] refers to a string and [string] refers to the parser combinator

// TODO use class
// [parse] returns a maybe monad of a parse result and the next index
const parser = (parse) => ({
  parse,
  parseWhole: (str) => parse(str, 0).map(([x]) => x),
  map: (f) =>
    parser((str, index) =>
      parse(str, index).map(([result, index]) => [f(result), index])
    ),
  apply: (other) =>
    parser((str, index) =>
      parse(str, index).chain(([f, indexF]) =>
        other.parse(str, indexF).map(([x, indexX]) => [f(x), indexX])
      )
    ),
  skipLeft: (other) =>
    parser(parse)
      .map((a) => (b) => b)
      .apply(other),
  skipRight: (other) =>
    parser(parse)
      .map((a) => (b) => a)
      .apply(other),
  or: (other) =>
    parser((str, index) => parse(str, index).or(() => other.parse(str, index))),
  filter: (predicate) =>
    parser((str, index) =>
      parse(str, index).chain(([result, index]) =>
        predicate(result) ? just([result, index]) : nothing
      )
    ),
  nest: (other) =>
    parser((str, index) =>
      parse(str, index).chain(([a, index]) =>
        other
          .skipRight(end)
          .parse(a)
          .map(([b]) => [b, index])
      )
    ),
});

export const constant = (x) => parser((_, index) => just([x, index]));

const lazy = (p) => parser((str, index) => p().parse(str, index));

export const fail = parser(() => nothing);

export const any = parser((str, index) => just([str.slice(index), str.length]));

export const end = parser((str, index) =>
  str.length === index ? just([null, index]) : nothing
);

export const endIn = (rest) =>
  parser((str, index) =>
    str.slice(index) === rest ? just([null, str.length]) : nothing
  );

export const string = (expected) =>
  parser((str, start) => {
    const end = start + expected.length;
    return end <= str.length && expected === str.slice(start, end)
      ? just([expected, end])
      : nothing;
  });

export const charClass = (predicate) =>
  parser((str, index) =>
    index < str.length && predicate(str[index])
      ? just([str[index], index + 1])
      : nothing
  );

export const regex = (r) => {
  if (!r.sticky) {
    throw new Error("{r} must be a sticky regex!");
  }
  return parser((str, index) => {
    r.lastIndex = index;
    return r.test(str)
      ? just([str.substring(index, r.lastIndex), r.lastIndex])
      : nothing;
  });
};

export const inParentheses = (p) =>
  string("(").skipLeft(p).skipRight(string(")"));

export const many = (p) =>
  parser((str, index) => {
    const result = [];
    while (true) {
      const current = p.parse(str, index).unwrap();
      if (current === nothing) {
        return just([result, index]);
      }
      result.push(current[0]);
      index = current[1];
    }
  });

// TODO push end instead of beginning
export const many1 = (p) =>
  p.map((head) => (tail) => [head, ...tail]).apply(many(p));

export const repeat = (p, count) =>
  parser((str, index) => {
    const result = [];
    while (result.length < count) {
      const current = p.parse(str, index).unwrap();
      if (current === nothing) {
        return nothing;
      }
      result.push(current[0]);
      index = current[1];
    }
    return just([result, index]);
  });

export const spaces1 = many1(charClass((char) => char === " "));

export const simpleString = string('"')
  .skipLeft(
    many(charClass((char) => char !== '"')).map((chars) => chars.join(""))
  )
  .skipRight(string('"'));

export const untilChar = (endChar) =>
  many(charClass((char) => char !== endChar)).map((chars) => chars.join(""));

export const apply = (f, ...args) =>
  args.reduce((result, arg) => result.apply(arg), constant(f));

export const separated = (p, separator) =>
  many(p.skipRight(separator))
    .map((start) => (last) => {
      start.push(last);
      return start;
    })
    .apply(p);
