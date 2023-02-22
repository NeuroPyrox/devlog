"use strict";

// TODO remove SQL injection vulnerabilities

import * as P from "../../parsers.js";
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// I prefer this promisifier because I've had past issues with util.promisify and bluebird
const promisify = async executor => {
  const [err, result] = await new Promise((resolve, reject) => {
    try {
      executor((...args) => resolve(args));
    } catch (err) {
      // Error when initializing the promise
      reject(err);
    }
  });
  if (err !== null) {
    // Error passed into the callback
    throw Error(err);
  }
  return result;
};

const createDatabase = async filename => {
  let database;
  const sqlite3 = (await import("sqlite3")).default;
  await promisify(callback => {
    database = new sqlite3.Database(filename, callback);
  });
  return database;
};

const databasePromise = createDatabase(`${__dirname}/.sql`);
const tableName = "strings";

const runSql = async command => {
  const database = await databasePromise;
  await promisify(callback => database.run(command, {}, callback));
};

const getRejection = async promise => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  return null;
};

const tableExists = async () => {
  const err = await getRejection(runSql(`SELECT 1 FROM ${tableName}`));
  if (err === null) {
    return true;
  }
  if (err.message === `Error: SQLITE_ERROR: no such table: ${tableName}`) {
    return false;
  }
  throw err;
};

import * as fs from "fs";

const paths = {
  "": async (req, res) => {
    const stat = await fs.promises.stat(`${__dirname}/index.html`);
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Content-Length": stat.size
    });
    fs.createReadStream(`${__dirname}/index.html`).pipe(res);
  },
  "/clear": async (req, res) => {
    if (await tableExists()) {
      await runSql(`DROP TABLE ${tableName}`);
    }
    await runSql(`CREATE TABLE ${tableName} (text MEDIUMTEXT)`);
    res.end();
  },
  "/get-all": async (req, res) => {
    // TODO ensure table exists
    const database = await databasePromise;
    const all = await promisify(callback =>
      database.all(`SELECT * FROM ${tableName}`, {}, callback)
    );
    res.writeHead(200, {
      "Content-Type": "application/json"
    });
    res.write(JSON.stringify(all.map(row => row.text)));
    res.end();
  },
  "/add": async (req, res) => {
    // TODO ensure table exists
    let body = "";
    req.on("data", chunk => (body += chunk.toString()));
    req.on("end", async () => {
      await runSql(`INSERT INTO ${tableName} VALUES (${JSON.stringify(body)})`);
      res.end();
    });
  }
};

export default Object.entries(paths).reduce(
  (total, [key, value]) =>
    P.endIn(key)
      .map(_ => value)
      .or(total),
  P.fail
);
