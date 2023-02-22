"use strict";

import * as P from "../parsers.js";

const textHandler = (text) => (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text",
  });
  res.write(text);
  res.end();
};

export default P.end
  .map((_) => textHandler("Try adding stuff to the end of the url"))
  .or(P.string("/").skipLeft(P.any.map(textHandler)));
