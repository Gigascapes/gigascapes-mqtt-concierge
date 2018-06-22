export {config as default};
let config = {
  VERBOSE: false,
  connectOptions: {
    hostname: "broker.hivemq.com",
    port: 8000,
    clientId: "browser-" + Math.random().toString(16).substr(2, 8),
    user: null,
    password: null,
  }
  // CLOUDMQTT_URL: "mqtt://localhost:18443",
  // CLIENT_ID: ,
  // USERNAME: 'electronA',
  // PASSWORD: "asdasdasd",
}
