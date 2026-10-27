const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');
const config = require('./config');
const { initSockets } = require('./sockets');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const conversationRoutes = require('./routes/conversations');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

app.use('/api', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const server = http.createServer(app);
const io = new Server(server);
initSockets(io);

server.listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
});

function shutdown() {
  console.log('Shutting down...');
  io.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
