"use strict";

// We differentiate post locations from http handlers in May because some posts have more than one http handler

const getMayPosts = require("./20/post-finder/getMayPosts.js");

const oldPosts = [
  { day: 20, title: "20th", href: "20/" },
  { day: 19, title: "19th", href: "19/" },
  { day: 17, title: "17th", href: "17/" },
  { day: 17, title: "Pills", href: "17/pills" },
  { day: 17, title: "Drag N Drop", href: "17/dragNDrop" },
  { day: 17, title: "Mobile Drag N Drop", href: "17/mobileDragNDrop" },
  { day: 17, title: "Follow Mouse", href: "17/followMouse" },
  { day: 16, title: "Simple Homepage", href: "16/" },
  { day: 15, title: "May Folders", href: "15/" },
  { day: 14, title: "Hello World", href: "14/" }
];

module.exports = async () => {
  const mayPosts = (await getMayPosts())
    .map(({ day, title }) => ({
      day: day,
      title: title,
      href: `${day}/${title}`
    }))
    .reverse();
  return mayPosts.concat(oldPosts);
};
