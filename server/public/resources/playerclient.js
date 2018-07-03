if (typeof Paho == undefined) {
  throw new Error("playerclient.js: Paho client not loaded and available in this scope");
}
console.log("Paho:", Paho);

const UTC_OFFSET_MS = (new Date()).getTimezoneOffset() * 1000 * 60;

import EventedMixin from './eventedmixin.js';
class Noop {};
class PlayerClient extends EventedMixin(Noop) {
  constructor(options={}) {
    super();
    this.pairId = null;
    this.connectOptions = Object.assign({
      cleanSession: true,
      onSuccess: resp => {
        console.log("success connecting");
        this.onConnect();
      },
      onFailure: resp => {
        console.warn(`failed to connect: ${resp.errorCode} - ${resp.errorMessage}`);
        console.log(resp);
      },
    }, options.connectOptions);
    this.options = Object.assign({}, options);
    this.topicPrefix = "gigascapes";
    delete this.options.connectOptions;
    this._messageQueue = [];
    this._messageTimer;
    this.messageThrottleMs = 1000/10;
  }
  init(connectOptions={}) {
    // Create a client instance
    // docs: http://www.eclipse.org/paho/files/jsdoc/Paho.MQTT.Client.html
    var mqttClient = new Paho.MQTT.Client(
      this.connectOptions.hostname,
      Number(this.connectOptions.port),
      this.connectOptions.clientId
    );
    this.mqttClient = mqttClient;

    // set callback handlers
    mqttClient.onConnectionLost = this.onDisconnect.bind(this);

    // resolve the connect options
    // - from our server-generated config, and from the options passed in from the caller
    let configOptions = Object.assign({}, this.connectOptions, connectOptions);
    let mqttClientConnectOptions = {};
    let validProperties = [
      "timeout", "userName", "password", "willMessage", "keepAliveInterval",
      "cleanSession", "useSSL", "invocationContext", "onSuccess", "onFailure",
      "hosts", "ports", "mqttVersion"];
    for (let name of validProperties) {
      if (name in configOptions) {
        mqttClientConnectOptions[name] = this.connectOptions[name];
      }
    }
    console.log("init: connecting to mqtt broker with options: ", mqttClientConnectOptions);
    mqttClient.connect(mqttClientConnectOptions);

    mqttClient.onMessageArrived = (message) => {
      this.options.VERBOSE && console.log("got message: ",
                                          message.destinationName,
                                          message.payloadString);
      let topic = message.destinationName;
      let [prefix, clientId] = topic.split('/');
      if (clientId !== this.clientId && topic.endsWith("positions-ts")) {
        this.emit("received", {
          topic: message.destinationName,
          data: message.payloadString,
          clientId
        });
      }
    };
  }

  get connected() {
    return this.mqttClient && this.mqttClient.isConnected();
  }

  get clientId() {
    return this.connectOptions.clientId;
  }

  onConnect() {
    let mqttClient = this.mqttClient;
    mqttClient.subscribe(`${this.topicPrefix}/+/positions-ms`);

    this.sendMessage(`${this.topicPrefix}/join`, `${this.clientId} is alive`);

    if(this._messageTimer) {
      clearInterval(this._messageTimer);
    }
    this._messageTimer = setInterval(() => {
      this.onTick();
    }, this.messageThrottleMs);

    this.emit("connected", { clientId: this.clientId });
  }

  onDisconnect(reason) {
    console.log('player mqtt client disconnected', reason);
    this.pairId = null;
    this.mqttClient = null;
    clearInterval(this._messageTimer);
    this._messageTimer = null;
    this.emit("disconnected", { clientId: this.clientId });
  }

  onTick() {
    if (this._messageQueue.length) {
      let [topic, payload] = this._messageQueue.pop();
      this.sendMessage(topic, payload);
      this._messageQueue.length = 0;
    }
  }

  enqueueMessage(topic, messageData) {
    this._messageQueue.push([topic, messageData]);
  }

  sendMessage(topic, payload) {
    if (typeof topic == "object") {
      topic = `${topic.prefix}/${this.clientId}/${topic.name}`;
    }
    if (typeof payload != "string") {
      // add a UTC timestamp to help track end-end latency
      payload.senderUTCTime = Date.now() + UTC_OFFSET_MS;
      payload = JSON.stringify(payload)
    }
    let message = new Paho.MQTT.Message(payload);
    message.destinationName = topic;
    let sendError;
    try {
      this.mqttClient.send(message);
    } catch (e) {
      sendError = e;
      console.warn("failed to send: ", e);
    }
    if (!sendError) {
      this.emit("sent", { topic, data: payload });
    }
  }

  parseMessage(messageData) {
    let data;
    try {
      data = JSON.parse(messageData);
    } catch(ex) {
      console.log("Failed to parse message: " + messageData);
    }
    if (!(data && data.positions)) {
      return null;
    }
    if (!Array.isArray(data.positions)) {
      data.positions = [data.positions];
    }
    let serverTime = data.serverUTCTime;
    if (serverTime) {
      let clientTime = Date.now() + UTC_OFFSET_MS;
      data.latencyMs = clientTime - serverTime;
    }
    return data;
  }

  broadcastPositions(positions) {
    let topic = `${this.topicPrefix}/${this.clientId}/positions`;
    this.enqueueMessage(topic, {
      positions
    });
  }
};

export {PlayerClient as default};
