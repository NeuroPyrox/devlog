"use strict";

const assert = condition => {
  if (!condition) {
    throw "Assertion Error!";
  }
};

const initialSexprs = ["S", "K"];

const allMutations = sexpr => {
  const mutations = initialSexprs
    .map(i => [i, sexpr])
    .concat(initialSexprs.map(i => [sexpr, i]));
  if (typeof sexpr === "string") {
    assert(initialSexprs.includes(sexpr));
    return mutations;
  }
  assert(Array.isArray(sexpr));
  assert(sexpr.length === 2);
  const [a, b] = sexpr;
  if (typeof b === "string") {
    mutations.push(a);
  }
  if (typeof a === "string") {
    mutations.push(b);
  }
  return mutations
    .concat(allMutations(a).map(ma => [ma, b]))
    .concat(allMutations(b).map(mb => [a, mb]));
};

module.exports = () => {
  let sexprs = initialSexprs.slice();
  for (let i = 0; i < 100; i++) {
    const sexpr = sexprs.shift();
    sexprs = sexprs.concat(allMutations(sexpr));
  }
  return sexprs;
}
