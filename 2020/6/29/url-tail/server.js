"use strict";

module.exports = ({ juneUrl }) => (req, res) => {
  // HARDCODED: "/29/url-tail"
  const urlHead = juneUrl + "/29/url-tail";
  let text = req.url.slice(urlHead.length);
  if (text === "") {
    text = "Try adding stuff to the end of the url";
  }
  res.writeHead(200, {
    "Content-Type": "text"
  });
  res.write(text);
  res.end();
};
