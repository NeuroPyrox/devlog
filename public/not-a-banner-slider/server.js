import * as fs from "fs";
import * as P from "../../parsers.js";
import htmlHandler from "../../lib/html-handler.js";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default P.end
  .map(() => htmlHandler(`${__dirname}/index.html`))
  .or(P.endIn(`/index.css`).map(() => async (req, res) => {
    const fileName = `${__dirname}/index.css`;
    const stat = await fs.promises.stat(fileName);
    res.writeHead(200, {
      "Content-Type": "text/css",
      "Content-Length": stat.size,
    });
    fs.createReadStream(fileName).pipe(res);
  }));
