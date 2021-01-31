"use strict";

const homepage = require("../homepage.js");

const renderHtml = listHtml => `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <title>NeuroPyrox's Devlog</title>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
      <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
      <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
      <link rel="manifest" href="/site.webmanifest">
      <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#164113">
      <meta name="msapplication-TileColor" content="#006600">
      <meta name="theme-color" content="#006600">

      <style>
        @import url("https://fonts.googleapis.com/css2?family=Nova+Mono&display=swap");

        body {
          background-color: black;
          font-family: "Nova Mono", monospace;
        }

        a, p {
          color: #0D0;
        }

        a {
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
        <p>Elegance is not optional.</p>
        <p>- Richard O’Keefe, The Craft of Prolog</p>
        <br><br>
        ${listHtml}
      </div>
    </body>
  </html>
`;

let html;

module.exports = async () => {
  if (html === undefined) {
    html = renderHtml(await homepage());
  }
  return html;
};
