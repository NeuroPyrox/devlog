"use strict";

const fs = require("fs").promises;
const path = require("path");

const isDir = async dir => {
  const stat = await fs.stat(dir);
  return stat.isDirectory();
};

const getNestedDirs = async dir => {
  const items = await fs.readdir(dir);
  const whichAreDirs = await Promise.all(
    items.map(item => isDir(path.join(dir, item)))
  );
  const nestedDirs = items.filter((_, index) => whichAreDirs[index]);
  return nestedDirs;
};

module.exports = async () => {
  // HARDCODED: "2020/5"
  const mayDays = await getNestedDirs("2020/5");
  const posts = await Promise.all(
    mayDays.map(async day => {
      const nestedDirs = await getNestedDirs(`2020/5/${day}`);
      // TODO The filter is an ugly hack to ignore a ghost folder that I can't seem to delete
      return nestedDirs
        .filter(title => title !== "file-structure")
        .map(title => ({ day, title }));
    })
  );
  return [].concat(...posts);
};
