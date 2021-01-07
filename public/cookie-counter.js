"use strict";

// TODO make the parser deal with several cookies in the header
// TODO go over my security checklist

const P = require("../parsers.js");

// I could've used a library, but I'm doing things from scratch for educational purposes
const cookieParser = P.string("__Secure-counter=")
  .skipLeft(P.any)
  .map(parseInt);

module.exports = P.end("").map(_ => (req, res) => {
  console.log(req.headers)
  const counter =
    req.headers.cookie === undefined
      ? 0
      : cookieParser.parseWhole(req.headers.cookie) + 1;
  res.writeHead(200, {
    "Set-Cookie": `__Secure-counter=${counter}; path=/cookie-counter; HttpOnly; Secure; SameSite=Lax`,
    "Content-Type": "application/json"
  });
  res.write(JSON.stringify(counter));
  res.end();
});
