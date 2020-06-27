"use strict";

const fs = require("fs").promises;

const getJuneDays = async () => fs.readdir(__dirname + "/../..");

const getPostFilesFromDay = async day =>
  fs.readdir(__dirname + "/../../" + day);

const getPostsOnDay = async (juneUrl, day) => {
  const files = await getPostFilesFromDay(day);
  return files.map(fileName => ({
    date: `${day} June 2020`,
    title: fileName,
    href: `${juneUrl}/${day}/${fileName}`
  }));
};

const getJunePosts = async juneUrl => {
  const juneDays = await getJuneDays();
  const posts = await Promise.all(
    juneDays.map(day => getPostsOnDay(juneUrl, day))
  );
  return posts.flat();
}

module.exports = juneUrl => async res => {
  const junePosts = await getJunePosts(juneUrl);
  res.writeHead(200, {
    "Content-Type": "application/json"
  });
  res.write(JSON.stringify(junePosts));
  res.end();
};
