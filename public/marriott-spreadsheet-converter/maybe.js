export const just = (x) => ({
  map: (f) => just(f(x)),
  chain: (f) => f(x),
  or: (_) => just(x),
  unwrap: (_) => x,
});

// TODO better error message for [unwrap]
export const nothing = {
  map: (_) => nothing,
  chain: (_) => nothing,
  or: (f) => f(),
};

export const maybe = (value) =>
  value === null || value === undefined ? nothing : just(value);
