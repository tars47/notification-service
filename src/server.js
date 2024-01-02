/*
Notification server 

App#01 registers to use Notification service
  1)Notification server will cerate a redis Topic with id App#01

User Device Turns On
  1)I am assuming that one long lived TCP socket(maybe a websocket or xampp implimentation)
     will be opened when ever internet is available.
  2)Once connection is established Device sends 
     all the app_ids that are registered for notification service,
     we assume this device has sent ["App#01", "App#04", "App#097"]
     and we assume that the load balancer has routed this request
     to websocket server "ws#87" 
   3) websocket server "ws#87" will subscribe to redis Topics "App#01", "App#04", "App#097"
      if not already subscribed



App#01 publishes a notification message to Notification server
  1)Notification server will publish a message on to redis Topic App#01
  2)Redis will push the message to all the subscribers of Topic App#01
  3)websocket server "ws#87" will receive a message on the redis subscriber connection
  4)websocket server "ws#87" will loop through all the tcp sockets currently active
    and finds the sockets with "App#01" device id  and sends the message to the device
  5)device will then display the notification
*/

require("dotenv/config");
const { createServer } = require("http");
const { WebSocketServer } = require("ws");
const Service = require("./Util/service");
const connectRedis = require("./Util/redis");
const getDeviceId = require("./Util/getDeviceId");

let client;
let subscriber;
connectRedis()
  .then(connections => {
    client = connections.client;
    subscriber = connections.subscriber;
  })
  .catch(err => {
    console.log(err);
    process.exit(1);
  });

/**
 *  @description -> registers handlers for node process events
 */
process.on("unhandledRejection", Service.uhr);
process.on("uncaughtException", Service.uce);
process.on("SIGTERM", Service.sigterm);
process.on("warning", Service.warning);
process.on("SIGHUP", Service.sighup);
process.on("exit", Service.exit);

//////////// HTTP Server Events///////////////////////////////////
const server = createServer();

server.on("upgrade", upgrade);
server.on("request", request);

function invalidReq(res, response, status, headers) {
  response.message = "Invalid request, please provide app_id and message";
  res.writeHead(status, headers);
  return res.end(JSON.stringify(response));
}

async function request(req, res) {
  let status = 404;
  let response = { status: "Error" };
  let headers = {
    "content-type": "application/json",
  };
  try {
    if (req.method === "POST" && req.url === "/app/notify") {
      let body = "";
      req.on("data", function (data) {
        body += data;
      });
      req.on("end", async function () {
        try {
          body = JSON.parse(body);
        } catch (err) {
          return invalidReq(res, response, 400, headers);
        }
        if (!body || !body.app_id || !body.message) {
          return invalidReq(res, response, 400, headers);
        }
        //publish msg to redis
        await client.publish(body.app_id, body.message);
        status = 200;
        response.status = "Success";
        res.writeHead(status, headers);
        return res.end(JSON.stringify(response));
      });
    } else {
      res.writeHead(status, headers);
      return res.end(JSON.stringify({ status: "NotFound" }));
    }
    return;
  } catch (err) {
    console.log(err);
    status = 500;
    response.message = err?.messge || "unknown";
    res.writeHead(status, headers);
    return res.end(JSON.stringify(response));
  }
}

function upgrade(request, socket, head) {
  socket.on("error", onSocketError);

  getDeviceId(request, function next(err, deviceId) {
    if (err || !deviceId) {
      socket.write(err.headers);
      socket.destroy();
      return;
    }

    socket.removeListener("error", onSocketError);

    wss.handleUpgrade(request, socket, head, function done(ws) {
      wss.emit("connection", ws, request, deviceId);
    });
  });
}

function onSocketError(err) {
  console.error(err);
}

/////////////////////////////////////////////////////////////////////////

///////////Web Socket Server Events//////////////////////////////////////

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", connection);
wss.on("close", close);

let subAppIds = {};

function listener(message, appId) {
  console.log(message, appId);
  socketloop: for (let ws of wss.clients) {
    if (ws.isAlive && ws.appIds.has(appId)) {
      try {
        ws.send(
          JSON.stringify({
            type: "notification",
            appId,
            message,
            code: 200,
          })
        );
      } catch (err) {
        console.log(err);
        continue socketloop;
      }
    }
  }
}

async function connection(ws, request, deviceId) {
  ws.isAlive = true;
  ws.deviceId = deviceId;
  ws.appIds = new Set();

  ws.on("error", console.error);
  ws.on("pong", heartbeat);

  ws.on("close", async function close() {
    await unsubscribeTopic(ws);
  });

  ws.on("message", async function message(data) {
    console.log(`Received message ${data} from device: ${deviceId}`);
    try {
      data = JSON.parse(data);
    } catch (err) {
      return ws.send(
        JSON.stringify({ type: "error", message: "invalid message segment" })
      );
    }

    if ((data.type = "subscribe_req")) {
      // loop
      let response = {
        type: "subscribe_res",
        appIds: [],
      };
      for (let appId of data.appIds) {
        // subscribe to redis app topics
        if (ws.appIds.has(appId)) {
          response.appIds.push({
            appId,
            message: "already subscribed",
            code: 400,
          });
          continue;
        }
        ws.appIds.add(appId);
        if (subAppIds[appId]) {
          response.appIds.push({
            appId,
            message: "already subscribed",
            code: 200,
          });
          subAppIds[appId]++;
          continue;
        }
        try {
          await subscriber.subscribe(appId, listener);
          subAppIds[appId] = 1;
          response.appIds.push({
            appId,
            message: "success",
            code: 200,
          });
        } catch (err) {
          response.appIds.push({
            appId,
            message: err?.message || "unknown",
            code: 500,
          });
          continue;
        }
      }
      ws.send(JSON.stringify(response));
    }
  });
}

function heartbeat() {
  this.isAlive = true;
}

function close() {
  clearInterval(interval);
}

const interval = setInterval(ping, 30000);

function ping() {
  wss.clients.forEach(async ws => await each(ws));
  console.log("Active Sockets -> ", wss.clients.size);
  console.log("Active subscriptions --->", JSON.stringify(subAppIds, null, 4));
}

async function unsubscribeTopic(ws) {
  if (ws.appIds.size > 0) {
    topicLoop: for (let appId of ws.appIds) {
      if (!subAppIds[appId] || subAppIds[appId] === 1) {
        try {
          await subscriber.unsubscribe(appId);
        } catch (err) {
          continue topicLoop;
        }
        delete subAppIds[appId];
      } else {
        subAppIds[appId]--;
      }
    }
  }
}

async function each(ws) {
  if (ws.isAlive === false) {
    await unsubscribeTopic(ws);
    return ws.terminate();
  }
  ws.isAlive = false;
  ws.ping();
}

///////////////////////////////////////////////////////////////////////

server.listen(Service.port, Service.listen);
