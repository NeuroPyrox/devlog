"use strict";

const handleHome = require("../../../5/21/htmlResponse.js")(__dirname);

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

module.exports = ({ juneUrl }) => (req, res) => {
  // HARDCODED: "/29/multi-page"
  const urlHead = juneUrl + "/29/multi-page";
  const urlTail = req.url.slice(urlHead.length);
  if (urlTail === "") {
    return handleHome(res);
  }
  if (urlTail === "/") {
    return redirect(res, urlHead);
  }
  if (urlTail === "/123") {
    return writeText(res, "123 page");
  }
  if (urlTail === "/abc") {
    return writeText(res, "abc page");
  }
  handle404error(res);
};
