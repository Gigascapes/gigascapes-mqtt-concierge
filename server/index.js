// "indent": ["error", 2, { "SwitchCase": 1 }],
var config = require('./config');
var express = require('express');
var bodyParser = require('body-parser');
var path = require('path');

var mqtt = require('mqtt');
var mqttClient;
var app;
const topicPrefix = '/gs/';

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
    mqttClient.subscribe(`${topicPrefix}/join`);

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
    let [prefix, ...parts] = _topic.split('/').filter(part => !!part);
    if (prefix.startsWith('/')) {
      // strip off a leading '/'
      prefix = prefix.substring(1);
    }
    let topic = parts.join('/');
    // message is Buffer
    console.log(`got a message at prefix ${prefix}, on topic: ${topic}`,
                message.toString());

    if (prefix == '$SYS') {
      // system messages from the broker
      console.log(`System message: ${topic}: ${message.toString()}`);
      return;
    }
    if (prefix == config.CLIENT_ID || prefix == topicPrefix.substring(1)) {
      switch (topic) {
        case `nudge`:
          sendMessage('status', status.get());
          sendMessage('recent', recentClients.get());
          break;
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
      return;
    }

  });

  function sendMessage(name, messageData) {
    let topic = `/${topicPrefix}/${name}`;
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
    clients: require('./api/clients')(recentClients),
    config: require('./api/browser-config')(config),
  };

  app.use(bodyParser.urlencoded({
    extended: true
  }));
  app.use(bodyParser.json());

  app.get('/', function(req, res) {
    let result = {
      CLOUDMQTT_URL: config.CLOUDMQTT_URL,
      CLIENT_ID: config.CLIENT_ID,
      routes: [
        "/status",
        "/clients/",
        "/clients/:id",
      ],
      topics: [
        '/+/join',
        `/${config.CLIENT_ID}/nudge`,
      ]
    };
    res.send(result);
  });
  app.get('/status', api.status.getStatus);
  app.get('/clients', api.clients.getClients);
  app.get('/clients/:id', api.clients.getClient);
  app.get('/mqtt-config.js', api.config.getConfigAsJs);
  app.use(express.static(path.join(__dirname, './public')));

  app.listen(appConfig.port, function () {
    console.log('Status app listening on port ' + appConfig.port + '!');
  });
}

setupMQTT();
setupHTTP();
