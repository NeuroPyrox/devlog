"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const requireFile = filePath => require(path.join(__dirname, filePath));

const writeFile = requireFile("2020/5/17/writeFile.js");

const handle14 = res => {
  const filePath = path.join(__dirname, "2020/5/14/hello-world.html");
  writeFile(res, filePath);
};

const handle15 = async res => {
  res.writeHead(200, {
    "Content-Type": "text/html"
  });
  const mayFolders = await requireFile("2020/5/15/getMayFolders.js")();
  res.write(String(mayFolders));
  res.end();
};

const handle16 = requireFile("2020/5/16/server.js");

const handle404error = res => {
  res.writeHead(404, { "Content-Type": "text/html" });
  res.write("404 not found");
  res.end();
};

const paths = {
  "/": handle16,
  "/2020/5/14/": handle14,
  "/2020/5/15/": handle15,
  "/2020/5/16/": handle16
};

for (const day of ["17", "19", "20"]) {
  const serverPath = `2020/5/${day}/server.js`;
  const handlers = requireFile(serverPath);
  for (const [key, value] of Object.entries(handlers)) {
    const url = `/2020/5/${day}/${key}`;
    paths[url] = value;
  }
}

paths["/2020/5/21/progress-report"] = requireFile("2020/5/21/progress-report/server.js");

http
  .createServer((req, res) => {
    const handler = paths[req.url];
    if (handler === undefined) {
      handle404error(res);
    } else {
      handler(res);
    }
  })
  .listen(process.env.PORT, () => {
    console.log(`Your app is listening on port ${process.env.PORT}`);
  });
