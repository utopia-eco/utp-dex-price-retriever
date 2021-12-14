const mysql = require('mysql2')

// Database Connection for Production

const defaultPool = mysql.createPool({
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_DATABASE,
  socketPath: `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`, // For production
  // host: `${process.env.DB_HOST}`, // For local testing
  connectionLimit: 20,
  waitForConnections: true,
  queueLimit: 5,
});

const pool = defaultPool.promise();

module.exports = pool;