require('dotenv').config()

const express = require('express')
const app = express()
const http = require('http');
const server = http.createServer(app);

const { Server } = require("socket.io");
const io = new Server(server);
const port = process.env.PORT

const connection = require('./databaseClient');
const pool = require('./databaseClient');
const cors = require ('cors')


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
          let bars = []
          let barPeriodStartTime = periodStartTime;
          var oldBar;

          results.forEach((bar) => {
              if (bar.startTime < barPeriodStartTime + period) {
                oldBar = updateBar(oldBar, bar);
              } else {
                barPeriodStartTime = bar.startTime;
                if (oldBar != undefined) { // To prevent initializing on a null when the time where the db starts to record and periodStartTime do not match
                  bars = [...bars, oldBar]
                }
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

let rooms = []

io.on('connection', (socket) => {
  console.log('Connection established', socket.id);

  socket.on('SubAdd', subs => {
    const [,exchange, fromSymbol, toSymbol] = data.split('~')
    var room = `${fromSymbol}~${toSymbol}`
    rooms.push(room)
    socket.join(room)
  })

  // Sends event every 5 minute
  setTimeout(async function sendNewestAddress() {
    for (const room in rooms) {
      const [fromSymbol, toSymbol] = data.split('~') // We assume that the token in question is From while BNB is to
      // Query to retrieve latest bar for symbol
      const query = "SELECT * FROM " + fromSymbol + "_300 WHERE order by startTime desc limit 1"
      try {
        const [results, fields] = await pool.query(query);
        if (!results[0]) {
          console.error("Unable to find latest price for", room)
        } else {
          io.on(room).emit('m', results[0].close)
        }
      } catch (error) {
        throw error;
      }
    }
  }, 5000)
});