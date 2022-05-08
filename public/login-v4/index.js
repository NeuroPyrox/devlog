"use strict";

const P = require("../../parsers.js");
const htmlHandler = require("../../lib/html-handler.js");

module.exports = P.end.map((_) => htmlHandler(`${__dirname}/index.html`));
