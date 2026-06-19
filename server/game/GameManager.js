const crypto = require('crypto');
const Game = require('./Game');
const { generateRoomCode } = require('../utils');

class GameManager {
  constructor() {
    this.games = new Map();
    // socket id -> room code
    this.playerToRoom = new Map();
    // socket id -> stable player id
    this.socketToPlayer = new Map();
    // session token -> { roomCode, playerId, username }
    this.sessions = new Map();
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

  createSession(roomCode, playerId, username) {
    const token = crypto.randomBytes(24).toString('hex');
    this.sessions.set(token, { roomCode, playerId, username });
    return token;
  }

  getSession(token) {
    return this.sessions.get(token);
  }

  deleteSession(token) {
    if (token) this.sessions.delete(token);
  }

  addPlayerToRoom(socketId, roomCode, playerId = socketId) {
    this.playerToRoom.set(socketId, roomCode);
    this.socketToPlayer.set(socketId, playerId);
  }

  getRoomForPlayer(socketId) {
    return this.playerToRoom.get(socketId);
  }

  getPlayerIdForSocket(socketId) {
    return this.socketToPlayer.get(socketId) || socketId;
  }

  removeSocketMappings(socketId) {
    this.playerToRoom.delete(socketId);
    this.socketToPlayer.delete(socketId);
  }

  removePlayer(socketId) {
    const roomCode = this.playerToRoom.get(socketId);
    if (!roomCode) return null;

    const playerId = this.getPlayerIdForSocket(socketId);
    const game = this.games.get(roomCode);
    let result = null;

    if (game) {
      result = game.disconnectPlayer(playerId);

      if (result && result.removed && result.player?.sessionToken) {
        this.deleteSession(result.player.sessionToken);
      }

      if (game.players.length === 0) {
        this.games.delete(roomCode);
      }
    }

    this.removeSocketMappings(socketId);
    return { roomCode, game, playerResult: result };
  }

  rejoinSession(sessionToken, socketId) {
    const session = this.sessions.get(sessionToken);
    if (!session) return { error: 'Session not found. Please join fresh.' };

    const game = this.games.get(session.roomCode);
    if (!game) {
      this.sessions.delete(sessionToken);
      return { error: 'Room no longer exists. Please join fresh.' };
    }

    const result = game.reconnectPlayer(session.playerId);
    if (result.error) {
      this.sessions.delete(sessionToken);
      return result;
    }

    this.addPlayerToRoom(socketId, session.roomCode, session.playerId);
    return {
      success: true,
      roomCode: session.roomCode,
      playerId: session.playerId,
      username: session.username,
      game
    };
  }
}

module.exports = GameManager;
