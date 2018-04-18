// "indent": ["error", 2, { "SwitchCase": 1 }],
var config = require('./config');
var express = require('express');
var bodyParser = require('body-parser');

var mqtt = require('mqtt');
var mqttClient;
var app;

var status = {
  _data: {
    name: 'disconnected',
    timestamp: Date.now()
  },
  update(name) {
    this._data.name = name;
    this._data.timestamp = Date.now();
  },
  get() {
    return Object.assign({}, this._data);
  },
};

var recentClients = {
  _data: new Map(),
  get(id) {
    let timestamp = this._data.get(id);
    if (timestamp) {
      return {id, timestamp};
    }
    return null;
  },
  getRecent() {
    let now = Date.now();
    let arr = [];
    let recent = now - RECENT_THRESHOLD_MS;
    for(let [id, timestamp] of this._data.entries()) {
      if (timestamp >= recent) {
        arr.push({ id, timestamp });
      }
    }
    return arr;
  },
  update(id) {
    this._data.set(id, Date.now());
  },
  remove(id) {
    if (this._data.has(id)) {
      delete this._data[id];
    }
  }
};

// consider all clients publishing in the last 1 minute as recent
var RECENT_THRESHOLD_MS = 60000;


function setupMQTT() {
  mqttClient = mqtt.connect(config.CLOUDMQTT_URL);

  mqttClient.on('connect', function () {
    status.update('connected');
    // listen for other clients that want to join
    // TODO: define what join means vs. just connecting?
    mqttClient.subscribe('/+/join');

    // this isn't a request/response model, but another client may "nudge" us
    // by publishing on the /concierge/nudge/ topic, causing us to
    // publish current status
    mqttClient.subscribe(`${config.CLIENT_ID}/nudge`);

    // let the world know we are alive and listening
    sendMessage('status', status.get());
    console.log(`signalling client (${config.CLIENT_ID}) connected to ${config.CLOUDMQTT_URL}`);
  });

  mqttClient.on('close', function () {
    status.update('closed');
  });

  mqttClient.on('offline', function () {
    status.update('offline');
  });

  mqttClient.on('error', function () {
    status.update('connection-error');
  });

  mqttClient.on('end', function () {
    status.update('end');
  });

  mqttClient.on('message', function (_topic, message) {
    status.update('receiving');
    let [clientId, ...parts] = _topic.split('/').filter(part => !!part);
    let topic = parts.join('/');
    // message is Buffer
    console.log(`got a message from ${clientId}, on topic: ${topic}`,
                message.toString());

    if (!clientId) {
      console.log(`No clientId matched in topic: ${_topic}`);
      return;
    }
    if (clientId == '$SYS') {
      // system messages from the broker
      console.log(`System message: ${topic}: ${message.toString()}`);
      return;
    }
    if (clientId == config.CLIENT_ID || clientId == 'all') {
      topic = parts.join('/');
      switch (topic) {
        case `nudge`:
          sendMessage('status', status.get());
          sendMessage('recent', recentClients.get());
          break;
      }
      return;
    }

    switch (topic) {
      case 'join':
        // every client could always publish on clientId-prefixed topics
        // and we could use wildcard: subscribe('/+/join', ....)
        recentClients.update(clientId);
        sendMessage('recent', recentClients.get());
        break;
      case 'leave':
        recentClients.remove(clientId);
        sendMessage('recent', recentClients.get());
        break;
    }
  });

  function sendMessage(name, messageData) {
    let topic = `/${config.CLIENT_ID}/${name}`;
    let message = JSON.stringify(messageData);
    mqttClient.publish(topic, message);
  }
}

function setupHTTP() {
  app = express();
  let appConfig = {
    port: config.HTTP_PORT
  };

  app.recentClients = recentClients;

  var api = {
    status: require('./api/status')(status),
    clients: require('./api/clients')(recentClients)
  };

  app.use(bodyParser.urlencoded({
    extended: true
  }));
  app.use(bodyParser.json());

  app.get('/status', api.status.getStatus);
  app.get('/clients', api.clients.getClients);
  app.get('/clients/:id', api.clients.getClient);
  // app.put('/user/clients/:id', api.clients.updateClient);

  app.listen(appConfig.port, function () {
    console.log('Status app listening on port ' + appConfig.port + '!');
  });
}

setupMQTT();
setupHTTP();
