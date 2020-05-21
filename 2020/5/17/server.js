"use strict";

const path = require("path");
const writeFile = require("./writeFile.js");

const textPages = [["page1", "This is page 1"], ["page2", "This is page 2"]];
const htmlPageNames = ["followMouse", "mobileDragNDrop", "dragNDrop", "pills"];

const textHandlers = textPages.map(([name, text]) => [
  name,
  res => {
    res.writeHead(200, {
      "Content-Type": "text/html"
    });
    res.write(text);
    res.end();
  }
]);

const htmlHandlers = htmlPageNames.map(name => [
  name, res => {
    writeFile(res, path.join(__dirname, name + ".html"))
  }
]);

const pageHandlers = textHandlers.concat(htmlHandlers);

const pageNames = pageHandlers.map(([first, _]) => first);
const homeHtml = pageNames.map(key => `<a href="${key}">${key}</a>`).join(`<br>`);

const handlers = {"": res => {
    res.writeHead(200, {
      "Content-Type": "text/html"
    });
    res.write(homeHtml);
    res.end();
  }};


for (const [name, handler] of pageHandlers) {
  handlers[name] = handler
}

module.exports = handlers;
