"use strict";

const fs = require("fs").promises;
const path = require("path");

const isDir = async dir => {
  const stat = await fs.stat(dir);
  return stat.isDirectory();
};

const getAllFilePaths = async dir => {
  const items = await fs.readdir(dir);
  const nestedList = await Promise.all(
    items.map(async item => {
      const itemPath = path.join(dir, item);
      if (await isDir(itemPath)) {
        return getAllFilePaths(itemPath);
      } else {
        return [itemPath];
      }
    })
  );
  return [].concat(...nestedList);
};

module.exports = async () => {
  return await getAllFilePaths("/app");
};
