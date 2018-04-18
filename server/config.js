module.exports = {
  CLOUDMQTT_URL: process.env.CLOUDMQTT_URL || "mqtt://localhost:18443",
  COOKIE_SECRET: process.env.COOKIE_SECRET || 'somesecret',
  CLIENT_ID: process.env.CLIENT_ID || "concierge",
  HTTP_PORT: process.env.PORT || 3000,
}
