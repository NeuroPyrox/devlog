"use strict";

const just = x => ({
  map: f => just(f(x)),
  chain: f => f(x),
  or: _ => just(x),
  unwrap: _ => x
});

const nothing = { map: _ => nothing, chain: _ => nothing, or: f => f() };

const maybe = value =>
  value === null || value === undefined ? nothing : just(value)

module.exports = {just, nothing, maybe};
