"use strict";

const getJunePosts = require("./getJunePosts.js");

module.exports = ({juneUrl}) => async res => {
  const junePosts = await getJunePosts(juneUrl);
  res.writeHead(200, {
    "Content-Type": "application/json"
  });
  res.write(JSON.stringify(junePosts));
  res.end();
};
