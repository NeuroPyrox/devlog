"use strict";

// We differentiate post locations from http handlers in May because some posts have more than one http handler

const postFinder = require("../post-finder.js");

// TODO single source of truth
const oldPosts = [
  { day: "19 May 2020", title: "19th", href: "/2020/5/19/" },
  { day: "17 May 2020", title: "17th", href: "/2020/5/17/" },
  { day: "17 May 2020", title: "Pills", href: "/2020/5/17/pills" },
  { day: "17 May 2020", title: "Drag N Drop", href: "/2020/5/17/dragNDrop" },
  { day: "17 May 2020", title: "Mobile Drag N Drop", href: "/2020/5/17/mobileDragNDrop" },
  { day: "17 May 2020", title: "Follow Mouse", href: "/2020/5/17/followMouse" },
  { day: "16 May 2020", title: "Simple Homepage", href: "/2020/5/16/" },
  { day: "15 May 2020", title: "May Folders", href: "/2020/5/15/" },
  { day: "14 May 2020", title: "Hello World", href: "/2020/5/14/" }
];

module.exports = async () => {
  const mayPosts = (await postFinder())
    .map(({ day, title }) => ({
      date: `${day} May 2020`,
      title,
      href: day <= 19 ? `/2020/5/${day}/${title}` : `/${title}`
    }))
    .reverse();
  return mayPosts.concat(oldPosts);
};
