module.exports = {
  port: Number(process.env.PORT) || 3000,
  isProduction: process.env.NODE_ENV === 'production',
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  sessionCookieName: 'sid'
};
