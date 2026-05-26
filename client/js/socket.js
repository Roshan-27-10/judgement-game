const socket = io();

let currentRoom = null;
let currentPlayerId = null;

// Reconnection state
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let reconnectTimer = null;
let lastRoomCode = null;
let lastUsername = null;

socket.on('connect', () => {
  console.log('Connected to server');
  currentPlayerId = socket.id;
  reconnectAttempts = 0;
  
  // If we have stored room info and game screen is active, try to rejoin
  if (lastRoomCode && lastUsername && document.getElementById('game-screen').classList.contains('active')) {
    console.log('Auto-rejoining game after reconnect');
    socket.emit('reconnect_game', {
      roomCode: lastRoomCode,
      username: lastUsername
    }, (response) => {
      if (response && response.error) {
        console.error('Auto-rejoin failed:', response.error);
        if (typeof showError === 'function') {
          showError('Failed to rejoin game. Please return to lobby.');
        }
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else if (response && response.success) {
        console.log('Successfully reconnected to game');
        if (typeof hideReconnectingIndicator === 'function') {
          hideReconnectingIndicator();
        }
      }
    });
  }
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  if (typeof showError === 'function') {
    showError('Failed to connect to server');
  }
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  
  if (typeof showError === 'function') {
    showError('Connection lost! Attempting to reconnect...');
  }
  
  if (typeof showReconnectingIndicator === 'function') {
    showReconnectingIndicator();
  }
  
  attemptReconnection();
});

function attemptReconnection() {
  if (reconnectAttempts >= maxReconnectAttempts) {
    if (typeof showError === 'function') {
      showError('Failed to reconnect. Please refresh the page.');
    }
    if (typeof hideReconnectingIndicator === 'function') {
      hideReconnectingIndicator();
    }
    return;
  }
  
  reconnectAttempts++;
  console.log(`Reconnection attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
  
  if (reconnectTimer) clearTimeout(reconnectTimer);
  
  reconnectTimer = setTimeout(() => {
    if (socket.connected) {
      reconnectAttempts = 0;
      if (typeof hideReconnectingIndicator === 'function') {
        hideReconnectingIndicator();
      }
      return;
    }
    
    socket.connect();
    
    setTimeout(() => {
      if (socket.connected && lastRoomCode && lastUsername) {
        socket.emit('reconnect_game', {
          roomCode: lastRoomCode,
          username: lastUsername
        }, (response) => {
          if (response && response.error) {
            console.error('Reconnection failed:', response.error);
            attemptReconnection();
          } else if (response && response.success) {
            console.log('Successfully reconnected to game');
            reconnectAttempts = 0;
            if (typeof hideReconnectingIndicator === 'function') {
              hideReconnectingIndicator();
            }
            
            if (response.gameState && typeof updateGamePlayUI === 'function') {
              gameState = response.gameState;
              updateGamePlayUI(gameState);
            }
          }
        });
      } else {
        attemptReconnection();
      }
    }, 1000);
  }, 2000 * reconnectAttempts);
}

socket.on('game_state', (newGameState) => {
  if (newGameState.lastTrickWinner && 
      gameState && 
      gameState.completedTrick && 
      gameState.completedTrick.length > 0 &&
      !newGameState.completedTrick) {
    if (typeof showTrickWinner === 'function') {
      showTrickWinner(newGameState.lastTrickWinner.playerName);
    }
  }

  console.log('Game state update:', newGameState);
  gameState = newGameState;
  
  if (currentRoom && document.getElementById('room-code-display')) {
    document.getElementById('room-code-display').textContent = currentRoom;
  }
  
  if (newGameState.phase && document.getElementById('phase-display')) {
    document.getElementById('phase-display').textContent = newGameState.phase;
  }
  
  if (newGameState.players && document.getElementById('players-list')) {
    const playersList = document.getElementById('players-list');
    playersList.innerHTML = '';
    newGameState.players.forEach(player => {
      const playerDiv = document.createElement('div');
      playerDiv.className = 'player-item' + (player.id === newGameState.host ? ' host' : '');
      
      const tricksInfo = (newGameState.phase === 'playing' || newGameState.phase === 'vote' || newGameState.phase === 'scoreboard') 
        ? ` (${player.tricks || 0} tricks)` 
        : '';
      
      const disconnectedIcon = player.connected ? '' : ' 🔴';
      
      playerDiv.textContent = player.name + tricksInfo + disconnectedIcon + (player.connected ? '' : ' (disconnected)');
      playersList.appendChild(playerDiv);
    });
  }
  
  if (document.getElementById('start-game-btn')) {
    const startBtn = document.getElementById('start-game-btn');
    if (newGameState.host === currentPlayerId && newGameState.phase === 'lobby') {
      startBtn.style.display = 'block';
    } else {
      startBtn.style.display = 'none';
    }
  }
  
  if (document.getElementById('game-play-area')) {
    const gamePlayArea = document.getElementById('game-play-area');
    gamePlayArea.style.display = newGameState.phase !== 'lobby' ? 'block' : 'none';
  }
  
  if (typeof updateGamePlayUI === 'function') {
    updateGamePlayUI(newGameState);
  }
});

function createRoomRequest(username, customX = null) {
  return new Promise((resolve, reject) => {
    lastUsername = username;
    
    const data = { username };
    if (customX) {
      data.customX = customX;
    }
    
    socket.emit('create_room', data, (response) => {
      if (response && response.error) {
        reject(response.error);
      } else {
        lastRoomCode = response.roomCode;
        currentRoom = response.roomCode;
        resolve(response);
      }
    });
  });
}

function joinRoomRequest(roomCode, username) {
  return new Promise((resolve, reject) => {
    lastRoomCode = roomCode;
    lastUsername = username;
    
    socket.emit('join_room', { roomCode, username }, (response) => {
      if (response && response.error) {
        reject(response.error);
      } else {
        currentRoom = roomCode;
        resolve(response);
      }
    });
  });
}

function startGame() {
  return new Promise((resolve, reject) => {
    socket.emit('start_game', (response) => {
      if (response && response.error) {
        reject(response.error);
      } else {
        resolve(response);
      }
    });
  });
}

// Helper functions for reconnection UI
function showReconnectingIndicator() {
  const indicator = document.getElementById('reconnecting-indicator');
  if (indicator) indicator.style.display = 'block';
}

function hideReconnectingIndicator() {
  const indicator = document.getElementById('reconnecting-indicator');
  if (indicator) indicator.style.display = 'none';
}