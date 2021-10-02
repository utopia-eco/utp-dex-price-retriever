require('dotenv').config()

const express = require('express')
const cors = require('cors')
const app = express()

app.use(cors());
app.options('*', cors())

const http = require('http');
const server = http.createServer(app);

const io = require("socket.io")(server, {
  cors: {
    origin: '*',
  }
});

const port = process.env.PORT

const connection = require('./databaseClient');
const pool = require('./databaseClient');





app.get('/', (req, res) => {
  res.send('Utopia Dex Price Retriever')
})

app.get('/subscribe', (req, res) => {
  res.sendFile(__dirname + '/pages/subscribe.html')
})

// Returns associated limit orders for orderer address
app.get('/retrievePrice/:token/:timePeriodInSeconds/:startTime/:endTime', async (req, res) => {

  var period = parseInt(req.params.timePeriodInSeconds)
  var startTime = parseInt(req.params.startTime)
  var endTime = parseInt(req.params.endTime)

  var periodStartTime = startTime - (startTime % period)
  var periodEndTime = endTime - (endTime % period) + period - 1

  if (period == 900) {
    const query = "SELECT * FROM " + req.params.token + "_? WHERE startTime BETWEEN ? and ?"
    try {
      const [results, fields] = await pool.query(query, [300, periodStartTime, periodEndTime]);
      if (!results[0]) {
        res.json({ status: "Not Found" });
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
      const [results, fields] = await pool.query(query, [period, periodStartTime, periodEndTime]);
      if (!results[0]) {
        res.json({ status: "Not Found" });
      } else {
        res.json(results);
      }
    } catch (error) {
      throw error;
    }
  }
})

app.get('/health', (req, res) => res.send("Healthy"));

server.listen(port, () => {
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

  socket.on('SubAdd', data => {
    console.log("subAdd", data);
    for (const channel of data.subs) {
      console.log(channel);
      const [, exchange, fromSymbol, toSymbol] = channel.split('~')
      var room = `${fromSymbol}~${toSymbol}`
      if (!rooms.includes(room)) {
        rooms.push(room)
      }
      socket.join(room)
      console.log("room joined", room)
    }
  })

  // Sends event every 5 minute
  setInterval(async function sendNewestAddress() {
    for (const room of rooms) {
      const [fromSymbol, toSymbol] = room.split('~') // We assume that the token in question is From while BNB is to
      // Query to retrieve latest bar for symbol
      const query = "SELECT * FROM " + fromSymbol + "_300 order by startTime desc limit 1"
      try {
        const [results, fields] = await pool.query(query);
        if (!results[0]) {
          console.error("Unable to find latest price for", room)
        } else {
          const priceUpdate = `0~Utopia~${fromSymbol}~${toSymbol}~0~0~${results[0].startTime}~0~${results[0].close}`
          console.log("emitting for room", room, priceUpdate)
          socket.to(room).emit('m', priceUpdate)
        }
      } catch (error) {
        throw error;
      }
    }
  }, 5000)
});