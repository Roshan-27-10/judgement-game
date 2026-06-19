function registerHandlers(io, socket, gameManager) {
  const getStablePlayerId = () => gameManager.getPlayerIdForSocket(socket.id);

  function leaveCurrentRoomIfAny() {
    const existingRoom = gameManager.getRoomForPlayer(socket.id);
    if (!existingRoom) return;

    const oldGame = gameManager.getGame(existingRoom);
    const playerId = getStablePlayerId();

    if (oldGame) {
      const result = oldGame.leavePlayerVoluntarily(playerId);
      if (result.player?.sessionToken) {
        gameManager.deleteSession(result.player.sessionToken);
      }

      socket.leave(existingRoom);
      gameManager.removeSocketMappings(socket.id);

      if (oldGame.players.length === 0 || result.roomEmpty) {
        gameManager.games.delete(existingRoom);
      } else {
        broadcastGameState(io, existingRoom, oldGame, gameManager);
      }
    } else {
      gameManager.removeSocketMappings(socket.id);
    }
  }

  socket.on('create_room', (data, callback) => {
    try {
      leaveCurrentRoomIfAny();

      const customX = data.customX || null;
      const game = gameManager.createGame(customX);
      const roomCode = game.roomCode;
      const playerId = socket.id;
      const sessionToken = gameManager.createSession(roomCode, playerId, data.username);

      socket.join(roomCode);
      gameManager.addPlayerToRoom(socket.id, roomCode, playerId);

      const result = game.addPlayer(playerId, data.username, sessionToken);
      if (result.error) {
        gameManager.deleteSession(sessionToken);
        if (callback && typeof callback === 'function') {
          callback({ error: result.error });
        }
        return;
      }

      if (callback && typeof callback === 'function') {
        callback({
          success: true,
          roomCode,
          playerId,
          sessionToken,
          gameState: game.getState(playerId)
        });
      }

      broadcastGameState(io, roomCode, game, gameManager);
    } catch (error) {
      if (callback && typeof callback === 'function') {
        callback({ error: error.message });
      }
    }
  });

  socket.on('join_room', (data, callback) => {
    try {
      leaveCurrentRoomIfAny();

      const roomCode = (data.roomCode || '').toUpperCase();
      const game = gameManager.getGame(roomCode);

      if (!game) {
        if (callback && typeof callback === 'function') {
          callback({ error: 'Room not found' });
        }
        return;
      }

      const playerId = socket.id;
      const sessionToken = gameManager.createSession(roomCode, playerId, data.username);

      socket.join(roomCode);
      gameManager.addPlayerToRoom(socket.id, roomCode, playerId);

      const result = game.addPlayer(playerId, data.username, sessionToken);
      if (result.error) {
        socket.leave(roomCode);
        gameManager.removeSocketMappings(socket.id);
        gameManager.deleteSession(sessionToken);
        if (callback && typeof callback === 'function') {
          callback({ error: result.error });
        }
        return;
      }

      if (callback && typeof callback === 'function') {
        callback({
          success: true,
          roomCode,
          playerId,
          sessionToken,
          joinsNextRound: result.joinsNextRound,
          gameState: game.getState(playerId)
        });
      }

      broadcastGameState(io, roomCode, game, gameManager);
    } catch (error) {
      if (callback && typeof callback === 'function') {
        callback({ error: error.message });
      }
    }
  });

  socket.on('rejoin_session', (data, callback) => {
    try {
      leaveCurrentRoomIfAny();

      const result = gameManager.rejoinSession(data.sessionToken, socket.id);
      if (result.error) {
        if (callback && typeof callback === 'function') callback({ error: result.error });
        return;
      }

      socket.join(result.roomCode);

      if (callback && typeof callback === 'function') {
        callback({
          success: true,
          roomCode: result.roomCode,
          playerId: result.playerId,
          username: result.username,
          sessionToken: data.sessionToken,
          gameState: result.game.getState(result.playerId)
        });
      }

      broadcastGameState(io, result.roomCode, result.game, gameManager);
    } catch (error) {
      if (callback && typeof callback === 'function') callback({ error: error.message });
    }
  });

  socket.on('start_game', (callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback && typeof callback === 'function') {
        callback({ error: 'Not in a room' });
      }
      return;
    }

    const game = gameManager.getGame(roomCode);
    const playerId = getStablePlayerId();

    if (game.host !== playerId) {
      if (callback && typeof callback === 'function') {
        callback({ error: 'Only host can start the game' });
      }
      return;
    }

    const result = game.startNewRound();
    if (result.error) {
      if (callback && typeof callback === 'function') callback(result);
      return;
    }

    if (callback && typeof callback === 'function') {
      callback({ success: true });
    }

    broadcastGameState(io, roomCode, game, gameManager);
  });

  socket.on('submit_guess', (data, callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    const result = game.submitGuess(getStablePlayerId(), data.guess);

    if (result.error) {
      if (callback) callback(result);
      return;
    }

    if (callback) callback({ success: true });
    broadcastGameState(io, roomCode, game, gameManager);
  });

  socket.on('select_trump', (data, callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    const result = game.selectTrump(getStablePlayerId(), data.trump);

    if (result.error) {
      if (callback) callback(result);
      return;
    }

    if (callback) callback({ success: true });
    broadcastGameState(io, roomCode, game, gameManager);
  });

  socket.on('play_card', (data, callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    const result = game.playCard(getStablePlayerId(), data.card);

    if (result.error) {
      if (callback) callback(result);
      return;
    }

    if (callback) callback({ success: true });

    broadcastGameState(io, roomCode, game, gameManager);

    if (game.completedTrick) {
      setTimeout(() => {
        broadcastGameState(io, roomCode, game, gameManager);
      }, 1500);
    }
  });

  socket.on('continue_vote', (data, callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    const result = game.castContinueVote(getStablePlayerId(), data.continue);

    if (result.error) {
      if (callback) callback(result);
      return;
    }

    if (callback) callback({ success: true });
    broadcastGameState(io, roomCode, game, gameManager);
  });

  socket.on('restart_round_vote', (data, callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    const result = game.castRestartVote(getStablePlayerId(), data.restart);

    if (result.error) {
      if (callback) callback(result);
      return;
    }

    if (callback) callback({ success: true });
    broadcastGameState(io, roomCode, game, gameManager);
  });

  socket.on('restart_round', (callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    const result = game.restartCurrentRound(getStablePlayerId());

    if (result.error) {
      if (callback) callback(result);
      return;
    }

    if (callback) callback({ success: true });
    broadcastGameState(io, roomCode, game, gameManager);
  });

  socket.on('end_game_vote', (data, callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    const result = game.castEndGameVote(getStablePlayerId(), data.endGame);

    if (result.error) {
      if (callback) callback(result);
      return;
    }

    if (callback) callback({ success: true });
    broadcastGameState(io, roomCode, game, gameManager);
  });

  socket.on('end_game', (callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    const result = game.endGame(getStablePlayerId());

    if (result.error) {
      if (callback) callback(result);
      return;
    }

    if (callback) callback({ success: true });
    broadcastGameState(io, roomCode, game, gameManager);
  });

  socket.on('start_kick_vote', (data, callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    const result = game.startKickVote(getStablePlayerId(), data.targetPlayerId);

    if (result.error) {
      if (callback) callback(result);
      return;
    }

    if (callback) callback({ success: true });
    broadcastGameState(io, roomCode, game, gameManager);
  });

  socket.on('kick_vote', (data, callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    const result = game.castKickVote(getStablePlayerId(), data.kick);

    if (result.error) {
      if (callback) callback(result);
      return;
    }

    if (callback) callback({ success: true });
    broadcastGameState(io, roomCode, game, gameManager);
  });

  socket.on('cancel_kick_vote', (callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    const result = game.cancelKickVote(getStablePlayerId());

    if (result.error) {
      if (callback) callback(result);
      return;
    }

    if (callback) callback({ success: true });
    broadcastGameState(io, roomCode, game, gameManager);
  });

  socket.on('kick_player', (callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    const result = game.kickVotedPlayer(getStablePlayerId());

    if (result.error) {
      if (callback) callback(result);
      return;
    }

    if (result.player?.sessionToken) {
      gameManager.deleteSession(result.player.sessionToken);
    }

    removeKickedPlayerSockets(io, roomCode, gameManager, result.player?.id, result.player?.name);

    if (callback) callback({ success: true });
    broadcastGameState(io, roomCode, game, gameManager);
  });

  socket.on('leave_room', (callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    if (!game) {
      gameManager.removeSocketMappings(socket.id);
      if (callback) callback({ success: true });
      return;
    }

    const playerId = getStablePlayerId();
    const result = game.leavePlayerVoluntarily(playerId);

    if (result.error) {
      if (callback) callback(result);
      return;
    }

    if (result.player?.sessionToken) {
      gameManager.deleteSession(result.player.sessionToken);
    }

    socket.leave(roomCode);
    gameManager.removeSocketMappings(socket.id);

    if (callback) callback({ success: true });

    socket.emit('left_room', {
      roomCode,
      message: 'You left the room.'
    });

    if (game.players.length === 0 || result.roomEmpty) {
      gameManager.games.delete(roomCode);
    } else {
      broadcastGameState(io, roomCode, game, gameManager);
    }
  });

  socket.on('ready_next_round', (callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    const result = game.readyForNextRound(getStablePlayerId());

    if (result.error) {
      if (callback) callback(result);
      return;
    }

    if (callback) callback({ success: true });
    broadcastGameState(io, roomCode, game, gameManager);
  });

  socket.on('new_game', (data, callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    const playerId = getStablePlayerId();

    if (game.host !== playerId) {
      if (callback) callback({ error: 'Only host can start a new game' });
      return;
    }

    if (data && data.customX) {
      game.customX = data.customX;
    }

    game.returnToLobby();

    if (callback) callback({ success: true });
    broadcastGameState(io, roomCode, game, gameManager);
  });
}

function broadcastGameState(io, roomCode, game, gameManager) {
  const sockets = io.sockets.adapter.rooms.get(roomCode);
  if (sockets) {
    sockets.forEach(socketId => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        const playerId = gameManager.getPlayerIdForSocket(socketId);
        socket.emit('game_state', game.getState(playerId));
      }
    });
  }
}


function removeKickedPlayerSockets(io, roomCode, gameManager, playerId, playerName = 'A player') {
  if (!playerId) return;

  const sockets = io.sockets.adapter.rooms.get(roomCode);
  if (!sockets) return;

  Array.from(sockets).forEach(socketId => {
    if (gameManager.getPlayerIdForSocket(socketId) !== playerId) return;

    const playerSocket = io.sockets.sockets.get(socketId);
    if (playerSocket) {
      playerSocket.emit('kicked_from_room', {
        roomCode,
        message: 'You were kicked from the room.'
      });
      playerSocket.leave(roomCode);
    }

    gameManager.removeSocketMappings(socketId);
  });
}

module.exports = { registerHandlers, broadcastGameState };
