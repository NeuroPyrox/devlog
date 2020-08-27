"use strict";

const fs = require("fs");

module.exports = baseUrl => async (req, res) => {
  console.log(baseUrl);
  const echo = req.url.slice(baseUrl.length);
  if (echo === "") {
    const stat = await fs.promises.stat(`${__dirname}/index.html`);
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Content-Length": stat.size
    });
    fs.createReadStream(`${__dirname}/index.html`).pipe(res);
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });
  res.write(echo);
  res.end();
};
