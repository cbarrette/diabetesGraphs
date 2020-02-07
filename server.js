const fs = require('fs').promises;
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

const { MongoClient } = require("mongodb");

const dbs = {};

(async () => {
  await loadDB();
  await setupApi();

  http.listen(8080);
})();

async function setupApi() {
  app.use(express.static("public"));
  app.use(express.static("node_modules/chartjs-plugin-annotation"));
  io.on("connection", function(socket) {
    socket.on("api", api);
  });
}
async function loadDB() {
  const credentials = (await fs.readFile(`${__dirname}/secrets`, "utf-8")).trim();
  const uri = `mongodb+srv://${credentials}@cluster0-xtbt8.mongodb.net/cgm?retryWrites=true&w=majority`;

  const db = await MongoClient.connect(uri, { useUnifiedTopology: true });
  const cgm = db.db("cgm");
  dbs.bg = cgm.collection("bg");
  dbs.treatments = cgm.collection("treatments");
  dbs.deviceStatus = cgm.collection("devicestatus");
}

async function api(path, cb) {
  const data = {};
  await Promise.all([
    get_bg().then(bg => (data.bg = bg)),
    get_treatments().then(treatments => (data.treatments = treatments))
  ]);

  cb(data);
}

async function get_bg() {
  const data = await dbs.bg
    .find({
      sgv: { $exists: true }
    }, {
      projection: {
        device: 0,
        dateString: 0,
        direction: 0,
        filtered: 0,
        unfiltered: 0,
        noise: 0,
        rssi: 0,
        _id: 0,
        type: 0
      }
    })
    .toArray();
  return data.sort(sortProp.bind(null, "date")).map(({ date: timestamp, sgv: bg }) => ({ timestamp, bg: bg / 18 }));
}

async function get_treatments() {
  const tmp_data = await dbs.treatments
    .find({}, {
      projection: {
        _id: 0,
        created_at: 0,
        notes: 0,
        uuid: 0,
        enteredBy: 0,
        eventType: 0
      }
    })
    .toArray();
  const data = { carbs: [], insulin: [] };

  for (const { timestamp, carbs, insulin, pdm } of tmp_data.sort(sortProp.bind(null, "timestamp"))) {
    const entry = { timestamp };
    if (carbs) {
      entry.carbs = carbs;
      data.carbs.push(entry);
    }
    if (insulin) {
      entry.insulin = insulin;
      data.insulin.push(entry);
    }
    if (pdm) {
      entry.pdm = pdm;
    }
  }
  return data;
}

function sort(a, b) {
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

function sortProp(propName, a, b) {
  return sort(a[propName], b[propName]);
}
