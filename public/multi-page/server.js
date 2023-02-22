// TODO remove strict mode declarations
"use strict";

import * as P from "../../parsers.js";
import * as htmlHandler from "../../lib/html-handler.js";

const textHandler = text => (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text"
  });
  res.write(text);
  res.end();
};

export default P.end
  .map(_ => htmlHandler(`${__dirname}/index.html`))
  .or(
    P.endIn("/").map(_ => (req, res) => {
      res.writeHead(302, { Location: req.url.slice(0, -1) });
      res.end();
    })
  )
  .or(P.endIn("/123").map(_ => textHandler("123 page")))
  .or(P.endIn("/abc").map(_ => textHandler("abc page")));
