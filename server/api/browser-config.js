let Url = require('url');

module.exports = function(model) {
  return {
    getConfigAsJs(req, res) {
      let mqttUrl = Url.parse(model.CLOUDMQTT_URL);
      let password = model.CLOUDMQTT_WS_PASSWORD;

      // "Websockets are available on port 3xxxx where your normal MQTT port is 1xxxx."
      // https://www.cloudmqtt.com/docs-websocket.html
      let wsPort = mqttUrl.port.replace(/^\d/, '3');
      let hostname = mqttUrl.hostname;
      let useSSL = process.env.NODE_ENV == 'production';

      let content =`// templated output from browser-config.js

export {config as default};
let config = {
  VERBOSE: false,
  connectOptions: {
    hostname: "${hostname}",
    useSSL: ${useSSL},
    port: "${wsPort}",
    clientId: "browser-" + Math.random().toString(16).substr(2, 8),
    userName: "browser-ws",
    password: "${password}",
  },
}
`;
     res.setHeader('Content-Type', 'application/x-javascript');
      res.send(content);
    }
  };
};

