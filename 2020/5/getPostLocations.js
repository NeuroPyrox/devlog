"use strict";

// We differentiate post locations from http handlers in May because some posts have more than one http handler

const getMayPosts = require("./20/post-finder/getMayPosts.js");

// TODO single source of truth
const oldPosts = [
  { day: 20, title: "20th", href: "/2020/5/20/" },
  { day: 19, title: "19th", href: "/2020/5/19/" },
  { day: 17, title: "17th", href: "/2020/5/17/" },
  { day: 17, title: "Pills", href: "/2020/5/17/pills" },
  { day: 17, title: "Drag N Drop", href: "/2020/5/17/dragNDrop" },
  { day: 17, title: "Mobile Drag N Drop", href: "/2020/5/17/mobileDragNDrop" },
  { day: 17, title: "Follow Mouse", href: "/2020/5/17/followMouse" },
  { day: 16, title: "Simple Homepage", href: "/2020/5/16/" },
  { day: 15, title: "May Folders", href: "/2020/5/15/" },
  { day: 14, title: "Hello World", href: "/2020/5/14/" }
];

module.exports = async () => {
  const mayPosts = (await getMayPosts())
    .map(({ day, title }) => ({
      day,
      title,
      href: `/${title}`
    }))
    .reverse();
  return mayPosts.concat(oldPosts);
};
