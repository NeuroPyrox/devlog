"use strict";

// HARDCODED: this whole file

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

module.exports = baseUrl => {
  const paths = {};
  paths[`${baseUrl}/14/`] = handle14;
  paths[`${baseUrl}/15/`] = handle15;
  paths[`${baseUrl}/16/`] = handle16(baseUrl);
  
  for (const day of ["17", "19", "20"]) {
    const serverPath = `${day}/server.js`;
    const handlers = requireFile(serverPath);
    for (const [key, value] of Object.entries(handlers)) {
      const url = `${baseUrl}/${day}/${key}`;
      paths[url] = value;
    }
  }

  paths[`${baseUrl}/20/homepage`] = require("./20/homepage/server.js")(baseUrl);
  return paths;
};
