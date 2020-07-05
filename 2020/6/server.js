"use strict";

const handle404error = res => {
  res.writeHead(404, { "Content-Type": "text/html" });
  res.write("404 not found");
  res.end();
};

module.exports = juneContext => {
  const {juneUrl} = juneContext;
  
  const paths = {};

  // HARDCODED: this array
  [
    "14/didnt-solve-agi",
    "15/post-locations",
    "22/get-june-days",
    "27/get-june-posts",
    "27/get-posts",
    "27/homepage",
    "28/actor-rules"
  ].forEach(post => {
    const handler = require(`./${post}/server.js`)(juneContext);
    // MUTATION
    paths[`${juneUrl}/${post}`] = handler;
  });
  
  return (req, res) => {
    // HARDCODED: these if statements
    if (req.url === "/2020/6/27/echo-ip") {
      return require("./27/echo-ip/server.js")(juneContext)(req, res);
    }
    if (req.url.startsWith("/2020/6/29/url-tail")) {
      return require("./29/url-tail/server.js")(juneContext)(req, res);
    }
    if (req.url.startsWith("/2020/6/29/multi-page")) {
      return require("./29/multi-page/server.js")(juneContext)(
        req,
        res
      );
    }
    
    const handler = paths[req.url];
    if (handler === undefined) {
      handle404error(res);
    } else {
      handler(res);
    }
  }
}
