"use strict";

const getMayFolders = require("../15/getMayFolders.js");

module.exports = async () => {
  const mayFolders = await getMayFolders();
  const links = mayFolders.map(day => ` <a href="/2020/5/${day}/">${day}</a> `);
  const page = links.join("");
  return page;
};
