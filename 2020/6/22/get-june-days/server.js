"use strict";

const fs = require("fs").promises;

module.exports = _ => async res => {
  const dir = await fs.readdir(__dirname + "/../..");
  const paths = dir.map(item => `${__dirname}/../../${item}`);
  const stats = await Promise.all(paths.map(path => fs.lstat(path)));
  const days = dir.filter((_, i) => stats[i].isDirectory());
  res.writeHead(200, {
    "Content-Type": "application/json"
  });
  res.write(JSON.stringify(days));
  res.end();
}
