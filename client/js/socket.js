const socket = io();

let currentRoom = null;
let currentPlayerId = null;

socket.on('connect', () => {
  console.log('Connected to server');
  currentPlayerId = socket.id;
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  if (typeof showError === 'function') {
    showError('Failed to connect to server');
  }
});

socket.on('game_state', (newGameState) => {
  // Check if a trick was just won
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
  
  // Update room code display if element exists
  if (currentRoom && document.getElementById('room-code-display')) {
    document.getElementById('room-code-display').textContent = currentRoom;
  }
  
  // Update phase display if element exists
  if (newGameState.phase && document.getElementById('phase-display')) {
    document.getElementById('phase-display').textContent = newGameState.phase;
  }
  
  // Update players list if element exists
  // if (newGameState.players && document.getElementById('players-list')) {
  //   const playersList = document.getElementById('players-list');
  //   playersList.innerHTML = '';
  //   newGameState.players.forEach(player => {
  //     const playerDiv = document.createElement('div');
  //     playerDiv.className = 'player-item' + (player.id === newGameState.host ? ' host' : '');
  //     playerDiv.textContent = player.name + (player.connected ? '' : ' (disconnected)');
  //     playersList.appendChild(playerDiv);
  //   });
  // }

  // In the game_state handler, update the players list display:
  if (newGameState.players && document.getElementById('players-list')) {
    const playersList = document.getElementById('players-list');
    playersList.innerHTML = '';
    newGameState.players.forEach(player => {
      const playerDiv = document.createElement('div');
      playerDiv.className = 'player-item' + (player.id === newGameState.host ? ' host' : '');
      
      // Show tricks won during playing phase
      const tricksInfo = (newGameState.phase === 'playing' || newGameState.phase === 'vote' || newGameState.phase === 'scoreboard') 
        ? ` (${player.tricks || 0} tricks)` 
        : '';
      
      playerDiv.textContent = player.name + tricksInfo + (player.connected ? '' : ' (disconnected)');
      playersList.appendChild(playerDiv);
    });
  }
  
  // Show/hide start game button for host
  if (document.getElementById('start-game-btn')) {
    const startBtn = document.getElementById('start-game-btn');
    if (newGameState.host === currentPlayerId && newGameState.phase === 'lobby') {
      startBtn.style.display = 'block';
    } else {
      startBtn.style.display = 'none';
    }
  }
  
  // Show/hide game play area
  if (document.getElementById('game-play-area')) {
    const gamePlayArea = document.getElementById('game-play-area');
    gamePlayArea.style.display = newGameState.phase !== 'lobby' ? 'block' : 'none';
  }
  
  // Call the detailed UI update function if it exists
  if (typeof updateGamePlayUI === 'function') {
    updateGamePlayUI(newGameState);
  }
});

function createRoomRequest(username, customX = null) {
  return new Promise((resolve, reject) => {
    const data = { username };
    if (customX) {
      data.customX = customX;
    }
    
    socket.emit('create_room', data, (response) => {
      if (response && response.error) {
        reject(response.error);
      } else {
        resolve(response);
      }
    });
  });
}

function joinRoomRequest(roomCode, username) {
  return new Promise((resolve, reject) => {
    socket.emit('join_room', { roomCode, username }, (response) => {
      if (response && response.error) {
        reject(response.error);
      } else {
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