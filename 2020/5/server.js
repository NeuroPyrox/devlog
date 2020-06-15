"use strict";

const fs = require("fs").promises;

// WARNING: this global variable gets modified
const paths = require("./oldHandlers.js");

// HARDCODED: "htmlResponse.js"
const removeNonFolders = items => {
  const index = items.indexOf("htmlResponse.js");
  if (index !== -1) {
    items.splice(index, 1);
  }
};

const getHandlersFromFolder = async handlerFolder => {
  const items = await fs.readdir(`${__dirname}/${handlerFolder}`);
  removeNonFolders(items);
  const handlers = items.map(item => [
    `/2020/5/${handlerFolder}/${item}`,
    require(`./${handlerFolder}/${item}/server.js`)
  ]);
  return handlers;
};

// WARNING: modifies a global variable
const addHandlers = async () => {
  // HARDCODED: [21, 22, 27]
  const promises = [21, 22, 27]
    .map(getHandlersFromFolder)
    .map(async handlers => {
      for (const [urlPath, handler] of await handlers) {
        paths[urlPath] = handler;
      }
    });
  return Promise.all(promises);
};

const handle404error = res => {
  res.writeHead(404, { "Content-Type": "text/html" });
  res.write("404 not found");
  res.end();
};

// HARDCODED: "/2020/5..."
const isEchoUrl = url => url.startsWith("/2020/5/21/echo/");
const handleEcho = (req, res) => {
  // HARDCODED: 16
  const echo = req.url.slice(16);
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });
  res.write(echo);
  res.end();
};

// TODO inject url argument everywhere
module.exports = async url => {
  await addHandlers();
  return async (req, res) => {
    console.count();
    // HARDCODED: this if statement
    if (isEchoUrl(req.url)) {
      handleEcho(req, res);
      return;
    }

    const handler = paths[req.url];
    if (handler === undefined) {
      handle404error(res);
    } else {
      handler(res);
    }
  };
};
