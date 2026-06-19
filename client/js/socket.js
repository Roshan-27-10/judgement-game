const socket = io();

const SESSION_STORAGE_KEY = 'judgement-game-session';

let currentRoom = null;
let currentPlayerId = null;
let triedSessionReconnect = false;

function getSavedSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function saveSession({ roomCode, username, sessionToken, playerId }) {
  if (!roomCode || !sessionToken) return;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
    roomCode,
    username,
    sessionToken,
    playerId,
    savedAt: Date.now()
  }));
}

function clearSavedSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function applyJoinResponse(response, username = null) {
  if (!response) return;

  currentRoom = response.roomCode || currentRoom;
  currentPlayerId = response.playerId || response.gameState?.myId || currentPlayerId;

  saveSession({
    roomCode: currentRoom,
    username: username || response.username,
    sessionToken: response.sessionToken,
    playerId: currentPlayerId
  });
}

socket.on('connect', () => {
  console.log('Connected to server');

  const savedSession = getSavedSession();
  if (!triedSessionReconnect && savedSession?.sessionToken) {
    triedSessionReconnect = true;

    socket.emit('rejoin_session', { sessionToken: savedSession.sessionToken }, (response) => {
      if (response && response.error) {
        console.warn('Could not restore previous Judgement session:', response.error);
        clearSavedSession();
        currentPlayerId = socket.id;
        return;
      }

      applyJoinResponse(response, response.username || savedSession.username);

      const usernameEl = document.getElementById('username-input');
      const roomCodeEl = document.getElementById('room-code-input');
      if (usernameEl && (response.username || savedSession.username)) {
        usernameEl.value = response.username || savedSession.username;
      }
      if (roomCodeEl && response.roomCode) {
        roomCodeEl.value = response.roomCode;
      }
      if (typeof showGameScreen === 'function') {
        showGameScreen();
      }
    });
  } else {
    currentPlayerId = currentPlayerId || socket.id;
  }
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  if (typeof showError === 'function') {
    showError('Failed to connect to server');
  }
});

socket.on('kicked_from_room', (data = {}) => {
  clearSavedSession();
  currentRoom = null;
  currentPlayerId = socket.id;
  gameState = null;

  if (typeof showLobbyScreen === 'function') {
    showLobbyScreen();
  } else {
    const lobby = document.getElementById('lobby-screen');
    const game = document.getElementById('game-screen');
    if (game) game.classList.remove('active');
    if (lobby) lobby.classList.add('active');
  }

  if (typeof showError === 'function') {
    showError(data.message || 'You were kicked from the room.');
  }
});

socket.on('left_room', (data = {}) => {
  clearSavedSession();
  currentRoom = null;
  currentPlayerId = socket.id;
  gameState = null;

  if (typeof showLobbyScreen === 'function') {
    showLobbyScreen();
  } else {
    const lobby = document.getElementById('lobby-screen');
    const game = document.getElementById('game-screen');
    if (game) game.classList.remove('active');
    if (lobby) lobby.classList.add('active');
  }

  if (typeof showError === 'function' && data.message) {
    showError(data.message);
  }
});

socket.on('game_state', (newGameState) => {
  currentPlayerId = newGameState.myId || currentPlayerId || socket.id;
  currentRoom = newGameState.roomCode || currentRoom;

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
    const roundNeedPhases = ['guessing', 'trump_select', 'playing', 'vote'];

    newGameState.players.forEach(player => {
      const playerDiv = document.createElement('div');
      playerDiv.className = 'player-item' + (player.id === newGameState.host ? ' host' : '');

      const statusParts = [];
      if (!player.connected) statusParts.push('disconnected');
      if (player.pendingJoin) statusParts.push(`joins R${player.joinedRoundNumber}`);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'player-name';
      nameSpan.textContent = player.name + (statusParts.length ? ` (${statusParts.join(', ')})` : '');
      playerDiv.appendChild(nameSpan);

      if (player.activeInRound && roundNeedPhases.includes(newGameState.phase)) {
        const needBadge = document.createElement('span');
        needBadge.className = 'player-need-badge';

        if (player.guess === null || player.guess === undefined) {
          needBadge.classList.add('waiting');
          needBadge.textContent = '🎯 ?';
          needBadge.title = "Waiting for this player's guess";
        } else {
          const guess = Number(player.guess) || 0;
          const tricksWon = Number(player.tricks) || 0;
          const remaining = guess - tricksWon;

          if (remaining >= 0) {
            needBadge.classList.add('on-target');
            needBadge.textContent = `🎯 ${remaining}`;
            needBadge.title = `${remaining} more trick${remaining === 1 ? '' : 's'} needed`;
          } else {
            const extra = Math.abs(remaining);
            needBadge.classList.add('over-target');
            needBadge.textContent = `🎯 ${extra}`;
            needBadge.title = `${extra} extra trick${extra === 1 ? '' : 's'} over target`;
          }
        }

        playerDiv.appendChild(needBadge);
      }

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
    const data = { username };
    if (customX) {
      data.customX = customX;
    }

    socket.emit('create_room', data, (response) => {
      if (response && response.error) {
        reject(response.error);
      } else {
        applyJoinResponse(response, username);
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
        applyJoinResponse(response, username);
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
