require('dotenv').config()

const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const connection = require('./databaseClient');
const pool = require('./databaseClient');
const port = process.env.PORT

app.get('/', (req, res) => {
  res.send('Utopia Dex Price Retriever')
})

// Returns associated limit orders for orderer address
app.route('/retrievePrice/:token/:timePeriodInSeconds/:startTime/:endTime')
  .get(function(req, res, next) {
    var period = parseInt(req.params.timePeriodInSeconds)
    var startTime = parseInt(req.params.startTime)
    var endTime = parseInt(req.params.endTime)

    var periodStartTime = startTime - (startTime % period)
    var periodEndTime = endTime - (endTime % period) + period - 1

    const query = "SELECT * FROM " + token + "_? WHERE startTime BETWEEN ? and ?"
    pool.query(query, [ period, startTime, endTime ], (error, results) => {
      if (error) throw error;
      if (!results[0]) {
        res.json({ status: "Not Found"});
      } else {
        res.json(results[0]);
      }
    })
  });

app.get('/health', (req, res) => res.send("Healthy"));

app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`)
})