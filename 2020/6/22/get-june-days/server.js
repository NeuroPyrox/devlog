"use strict";

const fs = require("fs").promises;

module.exports = async () => {
  const dir = await fs.readdir(__dirname + "/../..");
  const paths = dir.map(item => `${__dirname}/../../${item}`);
  const stats = await Promise.all(paths.map(path => fs.lstat(path)));
  return dir.filter((_, i) => stats[i].isDirectory());
}
