import * as P from "../../parsers.js";
import htmlHandler from "../../lib/html-handler.js";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
