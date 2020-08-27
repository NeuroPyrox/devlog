"use strict";

const getPostLocations = require("../../getPostLocations.js");

const templateHtml = listHtml => `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <title>NeuroPyrox's Blog</title>
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

const makeHtml = async () => {
  const listHtml = (await getPostLocations())
    .map(({ day, title, href }) => makeItem(day, title, `/2020/5/${href}`))
    .join();
  return templateHtml(listHtml);
};

module.exports = (() => {
  const html = makeHtml();
  return async (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/html"
    });
    res.write(await html);
    res.end();
  };
})();
