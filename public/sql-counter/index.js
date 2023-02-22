"use strict";

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
const tableName = "counter";

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

const createTable = async () => {
  await runSql(`CREATE TABLE ${tableName} (count int)`);
  await runSql(`INSERT INTO ${tableName} VALUES (0)`);
};

const ensureTableExists = async () => {
  const exists = await tableExists();
  if (!exists) {
    await createTable();
  }
};

const getCount = async () => {
  const database = await databasePromise;
  const all = await promisify(callback =>
    database.all(`SELECT * FROM ${tableName}`, {}, callback)
  );
  return all[0].count;
};

export default async () => {
  await ensureTableExists();
  const count = await getCount();
  await runSql(`UPDATE ${tableName} SET count=${count + 1}`);
  return { views: count };
};
