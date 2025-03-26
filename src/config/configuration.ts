export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  sendbird: {
    appId: process.env.SENDBIRD_APP_ID,
    apiToken: process.env.SENDBIRD_API_TOKEN,
    webhookSecret: process.env.SENDBIRD_WEBHOOK_SECRET,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10), // limit each IP to 100 requests per windowMs
  },
  clientEndpoint: process.env.CLIENT_ENDPOINT,
});
