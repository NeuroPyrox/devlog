"use strict";

const fs = require("fs").promises;

module.exports = async res => {
  const days = await fs.readdir(__dirname + "/../..");
  res.writeHead(200, {
    "Content-Type": "application/json"
  });
  res.write(JSON.stringify(days));
  res.end();
}
