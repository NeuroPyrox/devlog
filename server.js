"use strict";

require("http")
  .createServer(require("./handlers.js"))
  .listen(process.env.PORT, () =>
    console.log(`Your app is listening on port ${process.env.PORT}`)
  );
