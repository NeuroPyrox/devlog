"use strict";

import * as fs from "fs";

export const htmlHandler = (fileName) => async (req, res) => {
  const stat = await fs.promises.stat(fileName);
  res.writeHead(200, {
    "Content-Type": "text/html",
    "Content-Length": stat.size,
  });
  fs.createReadStream(fileName).pipe(res);
};
