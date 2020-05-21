"use strict";

const path = require("path");

const requireFile = filePath => require(path.join(__dirname, filePath));

const writeFile = requireFile("17/writeFile.js");

const handle14 = res => {
  const filePath = path.join(__dirname, "14/hello-world.html");
  writeFile(res, filePath);
};

const handle15 = async res => {
  res.writeHead(200, {
    "Content-Type": "text/html"
  });
  const mayFolders = await requireFile("15/getMayFolders.js")();
  res.write(String(mayFolders));
  res.end();
};

const handle16 = requireFile("16/server.js");

const paths = {
  "/2020/5/14/": handle14,
  "/2020/5/15/": handle15,
  "/2020/5/16/": handle16
};

for (const day of ["17", "19", "20"]) {
  const serverPath = `${day}/server.js`;
  const handlers = requireFile(serverPath);
  for (const [key, value] of Object.entries(handlers)) {
    const url = `/2020/5/${day}/${key}`;
    paths[url] = value;
  }
}

module.exports = paths;
