"use strict";

import * as P from "../../parsers.js";
import * as htmlHandler from "../../lib/html-handler.js";

export default P.end
  .map(() => htmlHandler(`${__dirname}/index.html`))
  .or(
    P.string("/").skipLeft(
      P.any.map((echo) => (req, res) => {
        res.writeHead(200, {
          "Content-Type": "text/plain",
        });
        res.write(echo);
        res.end();
      })
    )
  );
