require('dotenv').config()

const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const connection = require('./databaseClient');
const pool = require('./databaseClient');
const cors = require ('cors')
const port = process.env.PORT

app.use(cors());
app.options('*', cors())

app.get('/', (req, res) => {
  res.send('Utopia Dex Price Retriever')
})

// Returns associated limit orders for orderer address
app.get('/retrievePrice/:token/:timePeriodInSeconds/:startTime/:endTime', async(req, res) => {

    var period = parseInt(req.params.timePeriodInSeconds)
    var startTime = parseInt(req.params.startTime)
    var endTime = parseInt(req.params.endTime)

    var periodStartTime = startTime - (startTime % period)
    var periodEndTime = endTime - (endTime % period) + period - 1

    if (period == 900) {
      const query = "SELECT * FROM " + req.params.token + "_? WHERE startTime BETWEEN ? and ?"
      try {
        const [results, fields]  = await pool.query(query, [ 300, periodStartTime, periodEndTime ]);
        if (!results[0]) {
          res.json({ status: "Not Found"});
        } else {
          console.log(results);

          let bars = []
          let barPeriodStartTime = periodStartTime;
          var oldBar;

          results.forEach((bar) => {
              if (bar.startTime < barPeriodStartTime + period) {
                oldBar = updateBar(oldBar, bar);
              } else {
                barPeriodStartTime = bar.startTime;
                bars = [...bars, oldBar]
                oldBar = bar
              }
              
          })

          bars = [...bars, oldBar];
          res.json(bars);
        }
        
      } catch (error) {
        throw error
      }
      
    } else {
      const query = "SELECT * FROM " + req.params.token + "_? WHERE startTime BETWEEN ? and ?"
      try {
        const [results, fields] = await pool.query(query, [ period, periodStartTime, periodEndTime ]);
        if (!results[0]) {
          res.json({ status: "Not Found"});
        } else {
          res.json(results);
        }
      } catch (error) {
        throw error;
      }
    }
})

app.get('/health', (req, res) => res.send("Healthy"));

app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`)
})

function updateBar(oldBar, newBar) {
  // For initialization
  if (oldBar === undefined) {
    return {
      startTime: newBar.startTime,
      low: newBar.low,
      high: newBar.high,
      open: newBar.open,
      close: newBar.close,
    }
  } else {
    return {
      startTime: oldBar.startTime,
      low: Math.min(oldBar.low, newBar.low),
      high: Math.max(oldBar.high, newBar.high),
      open: oldBar.open,
      close: newBar.close,
    }
  }
  
}