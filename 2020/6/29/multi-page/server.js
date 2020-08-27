"use strict";

const path = require("path");
const writeFile = require("../../../5/17/writeFile.js");

const handleHome = res => writeFile(res, path.join(__dirname, "index.html"));

const redirect = (res, urlHead) => {
  res.writeHead(302, { Location: urlHead });
  res.end();
};

const writeText = (res, text) => {
  res.writeHead(200, {
    "Content-Type": "text"
  });
  res.write(text);
  res.end();
}

const handle404error = res => {
  res.writeHead(404, { "Content-Type": "text/html" });
  res.write("404 not found");
  res.end();
};

module.exports = baseUrl => (req, res) => {
  const urlTail = req.url.slice(baseUrl.length);
  if (urlTail === "") {
    return handleHome(res);
  }
  if (urlTail === "/") {
    return redirect(res, baseUrl);
  }
  if (urlTail === "/123") {
    return writeText(res, "123 page");
  }
  if (urlTail === "/abc") {
    return writeText(res, "abc page");
  }
  handle404error(res);
};
