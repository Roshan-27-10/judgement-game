function registerHandlers(io, socket, gameManager) {
  
  socket.on('create_room', (data, callback) => {
    try {
      // First, remove player from any existing room
      const existingRoom = gameManager.getRoomForPlayer(socket.id);
      if (existingRoom) {
        const oldGame = gameManager.getGame(existingRoom);
        if (oldGame) {
          oldGame.removePlayer(socket.id);
          socket.leave(existingRoom);
          
          if (oldGame.players.length === 0) {
            gameManager.games.delete(existingRoom);
          } else {
            broadcastGameState(io, existingRoom, oldGame);
          }
        }
        gameManager.playerToRoom.delete(socket.id);
      }
      
      // Create new room with custom X if provided
      const customX = data.customX || null;
      const game = gameManager.createGame(customX);
      const roomCode = game.roomCode;
      
      socket.join(roomCode);
      gameManager.addPlayerToRoom(socket.id, roomCode);
      
      const result = game.addPlayer(socket.id, data.username);
      if (result.error) {
        if (callback && typeof callback === 'function') {
          callback({ error: result.error });
        }
        return;
      }
      
      if (callback && typeof callback === 'function') {
        callback({ 
          success: true, 
          roomCode,
          gameState: game.getState(socket.id)
        });
      }
      
      broadcastGameState(io, roomCode, game);
    } catch (error) {
      if (callback && typeof callback === 'function') {
        callback({ error: error.message });
      }
    }
  });

  socket.on('join_room', (data, callback) => {
    try {
      // First, remove player from any existing room
      const existingRoom = gameManager.getRoomForPlayer(socket.id);
      if (existingRoom) {
        const oldGame = gameManager.getGame(existingRoom);
        if (oldGame) {
          oldGame.removePlayer(socket.id);
          socket.leave(existingRoom);
          
          // Clean up empty games
          if (oldGame.players.length === 0) {
            gameManager.games.delete(existingRoom);
          } else {
            // Notify remaining players
            broadcastGameState(io, existingRoom, oldGame);
          }
        }
        gameManager.playerToRoom.delete(socket.id);
      }
      
      // Now join new room
      const game = gameManager.getGame(data.roomCode);
      
      if (!game) {
        if (callback && typeof callback === 'function') {
          callback({ error: 'Room not found' });
        }
        return;
      }

      if (game.phase !== 'lobby' && game.phase !== 'vote' && game.phase !== 'ended') {
        if (callback && typeof callback === 'function') {
          callback({ error: 'Game already in progress' });
        }
        return;
      }

      socket.join(data.roomCode);
      gameManager.addPlayerToRoom(socket.id, data.roomCode);
      
      const result = game.addPlayer(socket.id, data.username);
      if (result.error) {
        if (callback && typeof callback === 'function') {
          callback({ error: result.error });
        }
        return;
      }
      
      if (callback && typeof callback === 'function') {
        callback({ 
          success: true,
          gameState: game.getState(socket.id)
        });
      }
      
      broadcastGameState(io, data.roomCode, game);
    } catch (error) {
      if (callback && typeof callback === 'function') {
        callback({ error: error.message });
      }
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
    
    if (game.host !== socket.id) {
      if (callback && typeof callback === 'function') {
        callback({ error: 'Only host can start the game' });
      }
      return;
    }

    if (game.players.length < 2) {
      if (callback && typeof callback === 'function') {
        callback({ error: 'Need at least 2 players' });
      }
      return;
    }

    // Start first round
    game.startNewRound();
    
    if (callback && typeof callback === 'function') {
      callback({ success: true });
    }
    
    broadcastGameState(io, roomCode, game);
  });

  socket.on('submit_guess', (data, callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    const result = game.submitGuess(socket.id, data.guess);
    
    if (result.error) {
      if (callback) callback(result);
      return;
    }
    
    if (callback) callback({ success: true });
    broadcastGameState(io, roomCode, game);
  });

  socket.on('select_trump', (data, callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    const result = game.selectTrump(socket.id, data.trump);
    
    if (result.error) {
      if (callback) callback(result);
      return;
    }
    
    if (callback) callback({ success: true });
    broadcastGameState(io, roomCode, game);
  });

  socket.on('play_card', (data, callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    const result = game.playCard(socket.id, data.card);
    
    if (result.error) {
      if (callback) callback(result);
      return;
    }
    
    if (callback) callback({ success: true });
    
    // Broadcast immediately to show the played card
    broadcastGameState(io, roomCode, game);
    
    // If trick is complete, broadcast again after delay to show resolution
    if (game.completedTrick) {
      setTimeout(() => {
        broadcastGameState(io, roomCode, game);
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
    const result = game.castContinueVote(socket.id, data.continue);
    
    if (result.error) {
      if (callback) callback(result);
      return;
    }
    
    if (callback) callback({ success: true });
    broadcastGameState(io, roomCode, game);
  });

  socket.on('ready_next_round', (callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    const result = game.readyForNextRound(socket.id);
    
    if (result.error) {
      if (callback) callback(result);
      return;
    }
    
    if (callback) callback({ success: true });
    broadcastGameState(io, roomCode, game);
  });

  socket.on('new_game', (data, callback) => {
    const roomCode = gameManager.getRoomForPlayer(socket.id);
    if (!roomCode) {
      if (callback) callback({ error: 'Not in a room' });
      return;
    }

    const game = gameManager.getGame(roomCode);
    
    // Only host can start new game
    if (game.host !== socket.id) {
      if (callback) callback({ error: 'Only host can start a new game' });
      return;
    }
    
    // Update customX if provided
    if (data && data.customX) {
      game.customX = data.customX;
    }
    
    game.returnToLobby();
    
    if (callback) callback({ success: true });
    broadcastGameState(io, roomCode, game);
  });

}

// Helper function to broadcast state to each player with their own perspective
function broadcastGameState(io, roomCode, game) {
  const sockets = io.sockets.adapter.rooms.get(roomCode);
  if (sockets) {
    sockets.forEach(socketId => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('game_state', game.getState(socketId));
      }
    });
  }
}

module.exports = { registerHandlers };