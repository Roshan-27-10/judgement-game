const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const GameManager = require('./game/GameManager');
const handlers = require('./socket/handlers');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { 
  cors: { 
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static('client'));

const gameManager = new GameManager();

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  
  // Track heartbeat
  socket.on('ping', () => {
    socket.emit('pong');
  });
  
  handlers.registerHandlers(io, socket, gameManager);
  
  socket.on('disconnect', () => {
    console.log('Disconnect:', socket.id);
    const result = gameManager.removePlayer(socket.id);
    
    if (result && result.game) {
      const sockets = io.sockets.adapter.rooms.get(result.roomCode);
      if (sockets) {
        sockets.forEach(socketId => {
          const sock = io.sockets.sockets.get(socketId);
          if (sock) {
            sock.emit('game_state', result.game.getState(socketId));
          }
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Judgement server running on http://0.0.0.0:${PORT}`);
});