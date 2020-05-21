"use strict";

const getMayFolders = require("../15/getMayFolders.js");

const makeHtml = async () => {
  const mayFolders = await getMayFolders();
  const links = mayFolders.map(day => ` <a href="/2020/5/${day}/">${day}</a> `);
  const page = links.join("");
  return page;
};

const handler = async res => {
  res.writeHead(200, {
    "Content-Type": "text/html"
  });
  res.write(await makeHtml());
  res.end();
}

module.exports = handler;
