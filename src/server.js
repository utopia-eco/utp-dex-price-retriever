require('dotenv').config()
const express = require('express')
const cors = require('cors')
const axios = require('axios')
const dateFns = require('date-fns')
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
app.get('/retrievePrice/:token', async (req, res) => {
  const token = req.params.token.toLowerCase();
  const query = "SELECT * FROM " + token + "_300 order by startTime desc limit 1"
    try {
      const [results, fields] = await pool.query(query);
      if (!results[0]) {
        res.json({ status: "Not Found" });
      } else {
        gjson(results[0].close)
      }
    } catch (error) {
      console.error("error", error);
    }
})

// Returns associated price from bitquery
app.get('/retrievePriceExternal/:token', async (req, res) => {
  const token = req.params.token.toLowerCase();
  try {
    const response = await axios.post(
      'https://graphql.bitquery.io',
        {
            query: `{
              ethereum(network: bsc) {
                dexTrades(
                  baseCurrency: {is: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"}
                  quoteCurrency: {is: "${token}"}
                  options: {desc: ["block.height", "transaction.index"], limit: 1}
                ) {
                  block {
                    height
                    timestamp {
                      time(format: "%Y-%m-%d %H:%M:%S")
                    }
                  }
                  transaction {
                    index
                  }
                  baseCurrency {
                    symbol
                  }
                  quoteCurrency {
                    symbol
                  }
                  quotePrice
                }
              }
            }`,
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': 'BQYmsfh6zyChKKHtKogwvrjXLw8AJkdP',
            },
        })
    res.json(response?.data?.data?.ethereum?.dexTrades?.[0]?.quotePrice);
  } catch (err) {
    console.error("Problem retrieving price from bitquery");
    console.error(err);
    console.error(err.response.data.errors.message);
    res.json("Error retrieving price");
  }
})

// Returns associated limit orders for orderer address
app.get('/retrievePrice/:token/:timePeriodInSeconds/:startTime/:endTime', async (req, res) => {
  var period = parseInt(req.params.timePeriodInSeconds)
  var startTime = parseInt(req.params.startTime)
  var endTime = parseInt(req.params.endTime)
  var periodStartTime = startTime - (startTime % period)
  var periodEndTime = endTime - (endTime % period) + period - 1
  const token = req.params.token.toLowerCase();
  if (period == 900) {
    const query = "SELECT * FROM " + token + "_? WHERE startTime BETWEEN ? and ?"
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
    const query = "SELECT * FROM " + token + "_? WHERE startTime BETWEEN ? and ?"
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

io.on('connection', (socket) => {
  console.log('Connection established', socket.id);
  let priceSubs = []
  socket.on('SubAdd', data => {
    console.log("subAdd", data);
    for (const channel of data.subs) {
      const [, exchange, fromSymbol, toSymbol] = channel.split('~')
      var priceSub = `${fromSymbol.toLowerCase()}~${toSymbol}`
      if (!priceSubs.includes(priceSub)) {
        priceSubs.push(priceSub)
      }
      console.log("price subscribed", priceSub)
    }
  })
  // Sends event every 5 seconds
  const intervalId = setInterval(async function sendNewestAddress() {
    for (const priceSub of priceSubs) {
      const [fromSymbol, toSymbol] = priceSub.split('~') // We assume that the token in question is From while BNB is to
      // Query to retrieve latest bar for symbol
      try {
        const response = await axios.post(
          'https://graphql.bitquery.io',
            {
                query: `{ ethereum(network: bsc) { dexTrades( baseCurrency: {is: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"} quoteCurrency: {is: "${fromSymbol}"} options: {desc: ["block.height", "transaction.index"], limit: 1} ) { block { height timestamp { time(format: "%Y-%m-%d %H:%M:%S") } } transaction { index } baseCurrency { symbol } quoteCurrency { symbol } quotePrice } } }`,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': 'BQYmsfh6zyChKKHtKogwvrjXLw8AJkdP',
                },
            })
        const currentQuotePrice = response?.data?.data?.ethereum?.dexTrades?.[0]?.quotePrice;

        let baseCurrency;
        if (fromSymbol == "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c") {
          baseCurrency = toSymbol;
        } else {
          baseCurrency = fromSymbol;
        }

        const queryStartTime = dateFns.formatISO(Date.now() - (1 * 60 * 1000));
        const response2 = await axios.post(
          'https://graphql.bitquery.io',
            {
                query: `{ ethereum(network: bsc) { dexTrades( exchangeName: {is: "Pancake"} baseCurrency: {is: "${baseCurrency}"} time: {after: "${queryStartTime}"} ) { count tradeAmount(in: USD) } } }`,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': 'BQYmsfh6zyChKKHtKogwvrjXLw8AJkdP',
                },
            })
        const volume = response2?.data?.data?.ethereum?.dexTrades?.[0]?.tradeAmount;

        const priceUpdate = `0~Utopia~${fromSymbol}~${toSymbol}~0~0~${queryStartTime}~${volume}~${currentQuotePrice}~0~0~0`
        console.log("emitting for connection", socket.id, priceUpdate)
        socket.emit('m', priceUpdate)
      } catch (err) {
        console.error("Problem retrieving price from bitquery");
        console.error(err);
        socket.emit('error', err)
      }
    }
  }, 5000)

  socket.on('disconnect', () => {
    clearInterval(intervalId)
  })
});