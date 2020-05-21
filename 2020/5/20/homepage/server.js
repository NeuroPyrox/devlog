"use strict";

const getMayPosts = require("../post-finder/getMayPosts.js");

const templateHtml = listHtml => `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <title>Posts UI</title>
      <meta charset="utf-8" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        @import url("https://fonts.googleapis.com/css2?family=Nova+Mono&display=swap");

        body {
          background-color: black;
          font-family: "Nova Mono", monospace;
        }

        a:link,
        a:visited {
          color: green;
          text-decoration: none;
        }

        .post {
          border-radius: 20px;
          padding: 10px;
        }

        .post:hover {
          background-color: #020;
          cursor: pointer;
        }

        h2 {
          margin: 0;
        }

        h3 {
          margin: 0;
          text-align: right;
        }

        .list {
          max-width: 700px;
          margin: 0 auto;
        }
      </style>
    </head>
    <body>
      <div class="list">
        ${listHtml}
      </div>
    </body>
  </html>
`;

const makeItem = (day, title, href) => `
  <a href="${href}">
    <div class="post">
      <h2>
        ${title}
      </h2>
      <h3>
        ${day} May 2020
      </h3>
    </div>
  </a>
`;

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

const makeHtml = async () => {
  const mayPosts = (await getMayPosts())
    .map(({ day, title }) => ({
      day: day,
      title: title,
      href: `/2020/5/${day}/${title}`
    }))
    .reverse();
  const posts = mayPosts.concat(oldPosts);
  const listHtml = posts
    .map(({ day, title, href }) => makeItem(day, title, href))
    .join();
  return templateHtml(listHtml);
};

const html = makeHtml();

module.exports = async res => {
  res.writeHead(200, {
    "Content-Type": "text/html"
  });
  res.write(await html);
  res.end();
};
