export default () => ({
  port: parseInt(process.env.PORT, 10) || 9009,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  jwt: {
    secret: process.env.JWT_SECRET || 'lokeshkumar',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'lokeshkumar',
    accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
    refreshTokenTtl: process.env.REFRESH_TOKEN_TTL || '7d',
  },
  database: {
    uri: process.env.MONGO_URI,
  },
  bootstrapAdmin: {
    email: process.env.ADMIN_EMAIL || 'hiverift@gmail.com',
    password: process.env.ADMIN_PASSWORD || '123456',
  },
  email: {
    host: process.env.EMAIL_HOST || 'smtp.hostinger.com',
    port: parseInt(process.env.EMAIL_PORT, 10) || 465,
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    from: process.env.MAIL_FROM || 'HiveRift Desk <info@hiverift.com>',
    contactReceiver: process.env.CONTACT_RECEIVER_EMAIL || 'info@hiverift.com',
  },
  timing: {
    autoSubmitCronIntervalMs: parseInt(process.env.EXAM_AUTO_SUBMIT_CRON_INTERVAL_MS, 10) || 15000,
    finalizingRecoveryTimeoutMs: parseInt(process.env.FINALIZING_RECOVERY_TIMEOUT_MS, 10) || 30000,
    submissionTransitGraceMs: parseInt(process.env.SUBMISSION_TRANSIT_GRACE_MS, 10) || 15000,
  },
});

