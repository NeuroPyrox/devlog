"use strict";

module.exports = baseUrl => (req, res) => {
  let text = req.url.slice(baseUrl.length);
  if (text === "") {
    text = "Try adding stuff to the end of the url";
  }
  res.writeHead(200, {
    "Content-Type": "text"
  });
  res.write(text);
  res.end();
};
