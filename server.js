"use strict";

const http = require("http");
const fs = require("fs").promises;
const requireFile = filePath => require(`${__dirname}/${filePath}`);

const paths = requireFile("2020/5/oldHandlers.js");
paths["/"] = requireFile("2020/5/20/homepage/server.js");

// WARNING: this is hardcoded instead of general
const removeNonFolders = items => {
  const index = items.indexOf("htmlResponse.js");
  if (index !== -1) {
    items.splice(index, 1);
  }
};

const getHandlersFromFolder = async handlerFolder => {
  const items = await fs.readdir(`${__dirname}/2020/5/${handlerFolder}`);
  removeNonFolders(items);
  const handlers = items.map(item => [
    `/2020/5/${handlerFolder}/${item}`,
    requireFile(`2020/5/${handlerFolder}/${item}/server.js`)
  ]);
  return handlers;
};

const addHandlers = async () => {
  // WARNING: [21, 22, 27] is hardcoded instead of general
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

// WARNING: this is hardcoded instead of general
const isEchoUrl = url => url.startsWith("/2020/5/21/echo/");
const handleEcho = (req, res) => {
  const echo = req.url.slice(16);
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });
  res.write(echo);
  res.end();
};

const main = async () => {
  await addHandlers();
  paths["/2020/6/14/didnt-solve-agi"] = requireFile(
    `2020/6/14/didnt-solve-agi/server.js`
  );
  http
    .createServer((req, res) => {
      // WARNING: this if statement is hardcoded instead of general
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
    })
    .listen(process.env.PORT, () => {
      console.log(`Your app is listening on port ${process.env.PORT}`);
    });
};

main();
