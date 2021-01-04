"use strict";

// We differentiate post locations from http handlers in May because some posts have more than one http handler

const postFinder = require("../post-finder.js");

module.exports = async () =>
  (await postFinder())
    .map(({ day, href }) => ({
      date: `${day} May 2020`,
      title: href,
      href
    }))
    .reverse();
