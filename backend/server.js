require('dotenv').config();

process.on('uncaughtException', (err) => {
  console.error('🛡️ [Proteksi Server] Uncaught Exception terdeteksi:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🛡️ [Proteksi Server] Unhandled Promise Rejection:', reason);
});

const { createApp } = require('./createApp');
const { startServer } = require('./startup');

const app = createApp();
startServer(app);

