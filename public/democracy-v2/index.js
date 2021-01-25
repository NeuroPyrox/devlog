"use strict";

const fs = require("fs");

const title = "Democracy V2: Proposals";
const style = fs.promises.readFile(`${__dirname}/style.css`, "utf8");
const body = `
  <h1>
    Rules
  </h1>
  <div id="rules"></div>
  <textarea placeholder="Enter a new rule"></textarea>
  <button>
    Propose rule
  </button>
  <h1>
    Proposals
  </h1>
  <div id="proposals"></div>`;
const script = fs.promises.readFile(`${__dirname}/script.js`, "utf8");

const html = style.then(style =>
  script.then(
    script => `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>${title}</title>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />

          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
          <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
          <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
          <link rel="manifest" href="/site.webmanifest" />
          <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#164113" />
          <meta name="msapplication-TileColor" content="#006600" />
          <meta name="theme-color" content="#006600" />

          <style>
            ${style}
          </style>
        </head>
        <body>
          ${body}
        </body>
        <script>
          ${script}
        </script>
      </html>`
  )
);

module.exports = _ => html;
