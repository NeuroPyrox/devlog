// TODO use classes
export const just = (x) => ({
  map: (f) => just(f(x)),
  chain: (f) => f(x),
  or: () => just(x),
  unwrap: () => x,
});

// TODO better error message for [unwrap]
export const nothing = {
  map: () => nothing,
  chain: () => nothing,
  or: (f) => f(),
};

export const maybe = (value) =>
  value === null || value === undefined ? nothing : just(value);
