"use strict";

const getMayFolders = require("../15/getMayFolders.js");

const makeHtml = async mayUrl => {
  const mayFolders = await getMayFolders();
  const links = mayFolders.map(day => ` <a href="${mayUrl}/${day}/">${day}</a> `);
  const page = links.join("");
  return page;
};

module.exports = mayUrl => async res => {
  res.writeHead(200, {
    "Content-Type": "text/html"
  });
  res.write(await makeHtml(mayUrl));
  res.end();
};
