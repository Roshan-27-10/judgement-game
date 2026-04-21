const Game = require('./Game');
const { generateRoomCode } = require('../utils');

class GameManager {
  constructor() {
    this.games = new Map();
    this.playerToRoom = new Map();
  }

  createGame(customX = null) {
    let code;
    do {
      code = generateRoomCode();
    } while (this.games.has(code));
    
    const game = new Game(code, customX);
    this.games.set(code, game);
    return game;
  }

  getGame(roomCode) {
    return this.games.get(roomCode);
  }

  addPlayerToRoom(socketId, roomCode) {
    this.playerToRoom.set(socketId, roomCode);
  }

  getRoomForPlayer(socketId) {
    return this.playerToRoom.get(socketId);
  }

  removePlayer(socketId) {
    const roomCode = this.playerToRoom.get(socketId);
    if (!roomCode) return null;
    
    const game = this.games.get(roomCode);
    if (game) {
      game.removePlayer(socketId);
      
      // Clean up empty games
      if (game.players.length === 0) {
        this.games.delete(roomCode);
      }
    }
    
    this.playerToRoom.delete(socketId);
    return { roomCode, game };
  }
}

module.exports = GameManager;