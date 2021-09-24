const mysql = require('mysql')
const { createPool } = require('mysql');

// Database Connection for Production

const pool = mysql.createPool({
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_DATABASE,
  socketPath: `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`,
});

module.exports = pool;