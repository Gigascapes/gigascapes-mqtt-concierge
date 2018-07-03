module.exports = {
  CLOUDMQTT_URL: process.env.CLOUDMQTT_URL || "mqtt://localhost:1883",
  COOKIE_SECRET: process.env.COOKIE_SECRET || 'somesecret',
  CLIENT_ID: process.env.CLIENT_ID || "concierge",
  HTTP_PORT: process.env.PORT || 3000,
  CLOUDMQTT_WS_PASSWORD: process.env.CLOUDMQTT_WS_PASSWORD || 'nopassword',
  CLOUDMQTT_CONCIERGE_PASSWORD: process.env.CLOUDMQTT_CONCIERGE_PASSWORD || 'nopassword',
}
