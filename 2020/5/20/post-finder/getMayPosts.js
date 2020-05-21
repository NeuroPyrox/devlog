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
  const mayDays = await fs.readdir("2020/5");
  const posts = await Promise.all(
    mayDays.map(async day => {
      const nestedDirs = await getNestedDirs(`2020/5/${day}`);
      return nestedDirs.map(title => ({day: day, title: title}));
    })
  );
  return [].concat(...posts);
};
