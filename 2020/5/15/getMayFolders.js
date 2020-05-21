"use strict";

const fs = require("fs");

const getMayFolders = () =>
  new Promise((resolve, reject) => {
    fs.readdir("2020/5", (err, files) => {
      if (err !== null) {
        reject(err);
      } else {
        resolve(files);
      }
    });
  });

module.exports = getMayFolders;
