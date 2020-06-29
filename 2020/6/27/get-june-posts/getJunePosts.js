"use strict";

const fs = require("fs").promises;

const getJuneDays = async () => fs.readdir(__dirname + "/../..");

const getPostFoldersFromDay = async day => {
  const folders = await fs.readdir(__dirname + "/../../" + day);
  const nested = await Promise.all(
    folders.map(folder => fs.readdir(`${__dirname}/../../${day}/${folder}`))
  );
  const isEmpty = nested.map(items => items.length === 0);
  return folders.filter((_, i) => !isEmpty[i]);
};

const getPostsOnDay = async (juneUrl, day) => {
  const folders = await getPostFoldersFromDay(day);
  return folders.map(name => ({
    date: `${day} June 2020`,
    title: name,
    href: `${juneUrl}/${day}/${name}`
  }));
};

module.exports = async juneUrl => {
  const juneDays = await getJuneDays();
  const posts = await Promise.all(
    juneDays.map(day => getPostsOnDay(juneUrl, day))
  );
  return posts.flat();
};
