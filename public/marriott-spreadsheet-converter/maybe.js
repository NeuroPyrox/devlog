
class Just {
  #value;
  
  constructor(value) {
    this.#value = value;
  }
  
  map(f) {
    return new Just(f(this.#value));
  }
  
  chain(f) {
    return f(this.#value);
  }
  
  or(thunk) {
    return this;
  }
  
  unwrap() {
    return this.#value;
  }
}

export const nothing = {
  map: () => nothing,
  chain: () => nothing,
  or: (thunk) => thunk(),
  unwrap: () => nothing
}

export const just = (x) => new Just(x);
