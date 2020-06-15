"use strict";

const fs = require("fs").promises;

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
    `${handlerFolder}/${item}`,
    require(`./${handlerFolder}/${item}/server.js`)
  ]);
  return handlers;
};

// WARNING: modifies input
const addHandlers = async (baseUrl, paths) => {
  // HARDCODED: [21, 22, 27]
  const promises = [21, 22, 27]
    .map(getHandlersFromFolder)
    .map(async handlers => {
      for (const [urlPath, handler] of await handlers) {
        paths[`${baseUrl}/${urlPath}`] = handler;
      }
    });
  return Promise.all(promises);
};

const getPaths = async baseUrl => {
  const paths = require("./oldHandlers.js")(baseUrl);
  await addHandlers(baseUrl, paths);
  return paths;
}

const handle404error = res => {
  res.writeHead(404, { "Content-Type": "text/html" });
  res.write("404 not found");
  res.end();
};

const isEchoUrl = (baseUrl, url) => url.startsWith(`${baseUrl}/21/echo/`);
const handleEcho = (baseUrl, req, res) => {
  // HARDCODED: 9
  const echo = req.url.slice(baseUrl.length + 9);
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });
  res.write(echo);
  res.end();
};

module.exports = baseUrl => {
  const paths = getPaths(baseUrl);
  return async (req, res) => {
    // HARDCODED: this if statement
    if (isEchoUrl(baseUrl, req.url)) {
      handleEcho(baseUrl, req, res);
      return;
    }

    const handler = (await paths)[req.url];
    if (handler === undefined) {
      handle404error(res);
    } else {
      handler(res);
    }
  };
};
