import * as fs from "fs";
import * as P from "../../parsers.js";
import htmlHandler from "../../lib/html-handler.js";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const moduleHandler = (moduleName) =>
  P.endIn(`/${moduleName}.js`).map(() => async (req, res) => {
    const fileName = `${__dirname}/${moduleName}.js`;
    const stat = await fs.promises.stat(fileName);
    res.writeHead(200, {
      "Content-Type": "text/javascript",
      "Content-Length": stat.size,
    });
    fs.createReadStream(fileName).pipe(res);
  });

export default P.end
  .map(() => (req, res) => {
    console.log(req);
    res.writeHead(307, {
      Location: req.url + "/",
    });
    res.end();
  })
  .or(P.endIn("/").map(() => htmlHandler(`${__dirname}/index.html`)))
  .or(moduleHandler("chronomancy"))
  .or(moduleHandler("html"))
  .or(moduleHandler("internals"))
  .or(moduleHandler("lazyConstructors"))
  .or(moduleHandler("pull"))
  .or(moduleHandler("push"))
  .or(moduleHandler("reactives"))
  .or(moduleHandler("util"));
