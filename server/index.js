// "indent": ["error", 2, { "SwitchCase": 1 }],
'use strict';

var config = require('./config');
var express = require('express');
var bodyParser = require('body-parser');
var path = require('path');
var mqtt = require('mqtt');
let Url = require('url');

var mqttClient;
var app;
const topicPrefix = 'gigascapes';

const joinTopic= topicPrefix + '/+/join';
const leaveTopic= topicPrefix + '/+/leave';
const positionsTopic= topicPrefix + '/+/positions';
const gameStateTopic= topicPrefix + '/+/gamestate';

var serverTime = {
  _date: new Date(),

  get date() {
    return this._date;
  },
  get timestamp() {
    return this._date.getTime();
  },
  get utcString() {
    let d = this._date;
    return d.getUTCHours() + ':' + d.getUTCMinutes() + ':' + d.getUTCSeconds() +
           '.' + d.getUTCMilliseconds() + ' GMT';
  },
  touch() {
    this._date = new Date();
  }
};

var status = {
  _data: {
    name: 'disconnected',
    timestamp: Date.now()
  },
  update(name) {
    this._data.name = name;
    this._data.timestamp = serverTime.timestamp;
    console.log('status update: ' + name, serverTime.timestamp);
  },
  get() {
    return Object.assign({}, this._data);
  }
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
    let now = serverTime.timestamp;
    let arr = [];
    let recent = now - RECENT_THRESHOLD_MS;
    for(let [id, timestamp] of this._data.entries()) {
      if (timestamp >= recent) {
        arr.push({ id, timestamp });
      }
    }
    return arr;
  },
  update(id, date) {
    this._data.set(id, date || serverTime.timestamp);
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
  let mqttUrl = Url.parse(config.CLOUDMQTT_URL);
  mqttUrl.auth = `concierge:${config.CLOUDMQTT_CONCIERGE_PASSWORD}`;

  let connectUrl = Url.format(mqttUrl);
  mqttClient = mqtt.connect(connectUrl);

  mqttClient.on('connect', function () {
    serverTime.touch();
    status.update('connected');

    // listen for game updates
    mqttClient.subscribe(positionsTopic);
    mqttClient.subscribe(gameStateTopic);

    // listen for other clients that want to join
    // TODO: define what join means vs. just connecting?
    mqttClient.subscribe(`${config.CLIENT_ID}/+/join`);
    mqttClient.subscribe(`${config.CLIENT_ID}/+/leave`);

    // this isn't a request/response model, but another client may 'nudge' us
    // by publishing on the /concierge/nudge/ topic, causing us to
    // publish current status
    mqttClient.subscribe(`${config.CLIENT_ID}/nudge`);

    // let the world know we are alive and listening
    sendMessage('status', status.get());

    console.log(`signalling client (${config.CLIENT_ID}) connected to ${config.CLOUDMQTT_URL}`);
    console.log(`at time: ${serverTime.utcString}`);
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
    serverTime.touch();
    status.update('receiving');

    if (_topic.startsWith(config.CLIENT_ID)) {
      let [selfId, clientId, name] = _topic.split('/');
      switch (name) {
        case 'join':
          // every client could always publish on clientId-prefixed topics
          // and we could use wildcard: subscribe('/+/join', ....)
          recentClients.update(clientId, serverTime.timestamp);
          sendMessage('recent', recentClients.get());
          break;
        case 'leave':
          recentClients.remove(clientId);
          sendMessage('recent', recentClients.get());
          break;
        case 'nudge':
          sendMessage('status', status.get());
          sendMessage('recent', recentClients.get());
      }
      return;
    }

    if (_topic.startsWith('$SYS')) {
      // system messages from the broker
      console.log(`System message: ${_topic}: ${message.toString()}`);
      return;
    }

    let [prefix, clientId, name] = _topic.split('/').filter(part => !!part);
    switch (name) {
      case 'positions':
      case 'gamestate':
        // update tally of active/recent clients
        recentClients.update(clientId);
        // add a timestamp and re-publish
        rePublishWithTimestamp(prefix, clientId, name, message);
        break;
    }
  });

  function rePublishWithTimestamp(prefix, clientId, name, message) {
    let entries;
    let receivedTopic = `${prefix}/${clientId}/${name}`;
    let publishTopic  = `${prefix}/${clientId}/${name}-ts`;
    try {
      entries = JSON.parse(message.toString());
    } catch (ex) {
      console.log('Failed to parse message on topic ' + receivedTopic, message.toString());
    }
    if (Array.isArray(entries)) {
      for (let entry of entries) {
        // add a UTC timestamp to help track end-end latency
        entry.serverUTCTime = serverTime.timestamp;
      }
      console.log(`rePublishWithTimestamp, received: ${receivedTopic}, publishTopic: ${publishTopic}`, JSON.stringify(entries));
      mqttClient.publish(publishTopic, JSON.stringify(entries));
    }
  }
  function sendMessage(name, messageData) {
    let topic = `${topicPrefix}/${config.CLIENT_ID}/${name}`;
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
    serverTime: require('./api/serverTime')(serverTime)
  };

  app.use(function (req, res, next) {
    serverTime.touch();
    next();
  });

  app.use(bodyParser.urlencoded({
    extended: true
  }));
  app.use(bodyParser.json());

  app.get('/', function(req, res) {
    let result = {
      CLOUDMQTT_URL: config.CLOUDMQTT_URL,
      CLIENT_ID: config.CLIENT_ID,
      routes: [
        '/status',
        '/clients/',
        '/clients/:id'
      ],
      topics: [
        joinTopic,
        leaveTopic,
        positionsTopic,
        gameStateTopic,
        `/${config.CLIENT_ID}/nudge`
      ]
    };
    res.send(result);
  });
  app.get('/status', api.status.getStatus);
  app.get('/clients', api.clients.getClients);
  app.get('/clients/:id', api.clients.getClient);
  app.get('/mqtt-config.js', api.config.getConfigAsJs);
  app.get('/time', api.serverTime.getTime);
  app.use(express.static(path.join(__dirname, './public')));

  app.listen(appConfig.port, function () {
    console.log('Status app listening on port ' + appConfig.port + '!');
  });
}

setupMQTT();
setupHTTP();
