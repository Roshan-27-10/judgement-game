let gameState = null;

// UI Elements
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const gamePlayArea = document.getElementById('game-play-area');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const startGameBtn = document.getElementById('start-game-btn');
const usernameInput = document.getElementById('username-input');
const roomCodeInput = document.getElementById('room-code-input');
const roomCodeDisplay = document.getElementById('room-code-display');
const phaseDisplay = document.getElementById('phase-display');
const playersList = document.getElementById('players-list');
const errorMessage = document.getElementById('error-message');
const turnIndicator = document.getElementById('turn-indicator');
const trickWinnerDisplay = document.getElementById('trick-winner-display');
const readyStatus = document.getElementById('ready-status');
const scoreboardContainer = document.getElementById('scoreboard-container');
const guessesDisplay = document.getElementById('guesses-display');
const guessesList = document.getElementById('guesses-list');

// Game play elements
const roundNumber = document.getElementById('round-number');
const cardsThisRound = document.getElementById('cards-this-round');
const trumpDisplay = document.getElementById('trump-display');
const handCards = document.getElementById('hand-cards');
const currentTrick = document.getElementById('current-trick');
const guessControls = document.getElementById('guess-controls');
const guessButtons = document.getElementById('guess-buttons');
const trumpControls = document.getElementById('trump-controls');
const voteControls = document.getElementById('vote-controls');
const readyControls = document.getElementById('ready-controls');
const scoreboard = document.getElementById('scoreboard');
const newGameMaxCards = document.getElementById('new-game-max-cards');

// Update the element references at the top
const endedContainer = document.getElementById('ended-container');
const winnerDisplay = document.getElementById('winner-display');
const finalScoreboard = document.getElementById('final-scoreboard');
const newGameBtn = document.getElementById('new-game-btn');

async function createRoom(username, customX = null) {
  try {
    const response = await createRoomRequest(username, customX);
    currentRoom = response.roomCode;
    showGameScreen();
    return response;
  } catch (error) {
    throw error;
  }
}

async function joinRoom(roomCode, username) {
  try {
    const response = await joinRoomRequest(roomCode, username);
    currentRoom = roomCode;
    showGameScreen();
    return response;
  } catch (error) {
    throw error;
  }
}

// Update event listeners
newGameBtn.addEventListener('click', () => {
  const customX = newGameMaxCards.value ? parseInt(newGameMaxCards.value) : null;
  
  // Validate custom X
  if (customX && (customX < 1 || customX > 13)) {
    showError('Max cards must be between 1 and 13');
    return;
  }
  
  socket.emit('new_game', { customX }, (response) => {
    if (response && response.error) {
      showError(response.error);
    }
  });
});

joinRoomBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  
  if (!username) {
    showError('Please enter a username');
    return;
  }
  if (!roomCode) {
    showError('Please enter a room code');
    return;
  }

  try {
    await joinRoom(roomCode, username);
    showGameScreen();
  } catch (error) {
    showError(error);
  }
});

startGameBtn.addEventListener('click', async () => {
  try {
    startGameBtn.disabled = true;
    await startGame();
    startGameBtn.disabled = false;
  } catch (error) {
    showError(error);
    startGameBtn.disabled = false;
  }
});

// Trump selection
trumpControls.addEventListener('click', (e) => {
  if (e.target.tagName === 'BUTTON') {
    const suit = e.target.dataset.suit;
    socket.emit('select_trump', { trump: suit }, (response) => {
      if (response && response.error) {
        showError(response.error);
      }
    });
  }
});

// Vote controls
document.getElementById('vote-continue').addEventListener('click', () => {
  socket.emit('continue_vote', { continue: true });
  // Disable buttons to prevent double-voting
  document.getElementById('vote-continue').disabled = true;
  document.getElementById('vote-stop').disabled = true;
});

document.getElementById('vote-stop').addEventListener('click', () => {
  socket.emit('continue_vote', { continue: false });
  // Disable buttons to prevent double-voting
  document.getElementById('vote-continue').disabled = true;
  document.getElementById('vote-stop').disabled = true;
});

document.getElementById('ready-next-round').addEventListener('click', () => {
  const btn = document.getElementById('ready-next-round');
  btn.disabled = true;
  btn.textContent = 'Waiting for others...';
  socket.emit('ready_next_round');
});

function showGameScreen() {
  lobbyScreen.classList.remove('active');
  gameScreen.classList.add('active');
  document.getElementById('scoreboard-container').style.display = 'block';
}

function showError(message) {
  errorMessage.textContent = message;
  setTimeout(() => {
    errorMessage.textContent = '';
  }, 3000);
}

function updateGamePlayUI(state) {
  roundNumber.textContent = state.roundNumber;
  cardsThisRound.textContent = state.cardsThisRound;
  trumpDisplay.textContent = state.trump || 'Not selected';
  
  // Find current player
  const currentPlayer = state.players.find(p => p.id === currentPlayerId);
  
  // Update hand
  if (currentPlayer) {
    handCards.innerHTML = '';
    const sortedHand = sortCards(currentPlayer.hand);
    sortedHand.forEach(card => {
      const cardDiv = document.createElement('div');
      cardDiv.className = `card ${card.suit}`;
      cardDiv.textContent = `${card.rank} ${getSuitSymbol(card.suit)}`;
      cardDiv.addEventListener('click', () => playCard(card));
      handCards.appendChild(cardDiv);
    });
  }
  
  // Update current trick - show either current or completed trick
  currentTrick.innerHTML = '';
  const trickToShow = state.completedTrick && state.completedTrick.length > 0 
    ? state.completedTrick 
    : state.currentTrick;

  if (trickToShow && trickToShow.length > 0) {
    trickToShow.forEach(play => {
      const player = state.players.find(p => p.id === play.playerId);
      const cardDiv = document.createElement('div');
      cardDiv.className = `card ${play.card.suit}`;
      cardDiv.textContent = `${player.name}: ${play.card.rank} ${getSuitSymbol(play.card.suit)}`;
      currentTrick.appendChild(cardDiv);
    });
  }
  
  if (state.phase !== 'lobby') {
    updateScoreboard(state);
  }

  // Show/hide containers based on phase
  guessControls.style.display = state.phase === 'guessing' ? 'block' : 'none';
  trumpControls.style.display = state.phase === 'trump_select' && state.trumpSelectPlayerId === currentPlayerId ? 'block' : 'none';
  
  // Handle vote controls
  if (state.phase === 'vote') {
    voteControls.style.display = 'block';
    // Reset button states when entering vote phase
    document.getElementById('vote-continue').disabled = false;
    document.getElementById('vote-stop').disabled = false;
    
    // Hide if already voted
    if (state.continueVotes && state.continueVotes[currentPlayerId] !== undefined) {
      voteControls.style.display = 'none';
    }

  } else {
    voteControls.style.display = 'none';
  }

  endedContainer.style.display = state.phase === 'ended' ? 'block' : 'none';
  
  // Hide hand and trick during ended phase
  document.getElementById('hand-container').style.display = state.phase === 'ended' ? 'none' : 'block';
  document.getElementById('trick-container').style.display = state.phase === 'ended' ? 'none' : 'block';

  // Update turn indicator
  if (state.phase === 'playing') {
    // Hide turn indicator if trick is complete (waiting to resolve)
    if (state.completedTrick && state.completedTrick.length > 0) {
      turnIndicator.style.display = 'none';
    } else {
      // Calculate whose turn it is
      const currentPlayerIndex = (state.trickLeaderIndex + state.currentTrick.length) % state.players.length;
      const turnPlayer = state.players[currentPlayerIndex];
      
      if (turnPlayer && turnPlayer.id === currentPlayerId) {
        turnIndicator.textContent = "🎮 YOUR TURN!";
        turnIndicator.style.color = "#4CAF50";
      } else if (turnPlayer) {
        turnIndicator.textContent = `🎮 ${turnPlayer.name}'s turn...`;
        turnIndicator.style.color = "#eee";
      }
      turnIndicator.style.display = 'block';
    }
  } else {
    turnIndicator.style.display = 'none';
  }
  
  // Update guess buttons
  if (state.phase === 'guessing') {
    updateGuessButtons(state);
  }

  if (state.phase === 'guessing' || state.phase === 'trump_select' || state.phase === 'playing') {
    if (guessesDisplay) {
      guessesDisplay.style.display = 'block';
      updateGuessesList(state);
    }
  } else {
    if (guessesDisplay) {
      guessesDisplay.style.display = 'none';
    }
  }

  // Handle ready controls for scoreboard phase
  if (state.phase === 'scoreboard') {
    readyControls.style.display = 'block';
    updateReadyStatus(state);
    
    const readyBtn = document.getElementById('ready-next-round');
    if (currentPlayer && state.viewingScoreboard && state.viewingScoreboard.includes(currentPlayerId)) {
      readyBtn.disabled = true;
      readyBtn.textContent = 'Waiting for others...';
    } else {
      readyBtn.disabled = false;
      readyBtn.textContent = 'Ready for Next Round';
    }
  } else {
    readyControls.style.display = 'none';
  }
  
  // Update scoreboard
  if (state.phase === 'scoreboard' || state.phase === 'vote' || state.phase === 'ended') {
    updateScoreboard(state);
  }

  // Update ended screen
  if (state.phase === 'ended') {
    updateEndedScreen(state);
  }

}

function updateReadyStatus(state) {
  if (!readyStatus) return;
  
  const totalPlayers = state.players.filter(p => p.connected).length;
  const readyPlayers = state.viewingScoreboard ? state.viewingScoreboard.length : 0;
  const waitingPlayers = totalPlayers - readyPlayers;
  
  if (waitingPlayers === 0) {
    readyStatus.textContent = 'All players ready! Starting next round...';
    readyStatus.style.color = '#4CAF50';
  } else {
    // Get names of players who aren't ready
    const notReadyPlayers = state.players
      .filter(p => p.connected && (!state.viewingScoreboard || !state.viewingScoreboard.includes(p.id)))
      .map(p => p.name);
    
    if (notReadyPlayers.length === 1) {
      readyStatus.textContent = `Waiting for ${notReadyPlayers[0]} to be ready...`;
    } else if (notReadyPlayers.length === 2) {
      readyStatus.textContent = `Waiting for ${notReadyPlayers.join(' and ')} to be ready...`;
    } else if (notReadyPlayers.length > 2) {
      const last = notReadyPlayers.pop();
      readyStatus.textContent = `Waiting for ${notReadyPlayers.join(', ')}, and ${last} to be ready...`;
    }
    readyStatus.style.color = '#FFA500';
  }
}

function updateGuessesList(state) {
  if (!guessesList) return;
  
  const playersWithGuesses = state.players.filter(p => p.guess !== null);
  
  if (playersWithGuesses.length === 0) {
    guessesList.innerHTML = '<div class="guess-item waiting">Waiting for guesses...</div>';
    return;
  }
  
  let html = '';
  
  // Sort players by guess submission order (or just show all with guesses)
  state.players.forEach(player => {
    if (player.guess !== null) {
      html += `<div class="guess-item">${player.name}: ${player.guess}</div>`;
    } else {
      html += `<div class="guess-item waiting">${player.name}: waiting...</div>`;
    }
  });
  
  guessesList.innerHTML = html;
}

function updateEndedScreen(state) {
  // Display winner(s)
  if (state.winners && state.winners.length > 0) {
    if (state.winners.length === 1) {
      winnerDisplay.innerHTML = `<h2>🏆 ${state.winners[0]} Wins! 🏆</h2>`;
    } else {
      winnerDisplay.innerHTML = `<h2>🏆 Tie Game! Winners: ${state.winners.join(', ')} 🏆</h2>`;
    }
  }
  
  // Display final scoreboard
  let html = '<table><tr><th>Player</th>';
  
  const maxRounds = Math.max(...state.players.map(p => p.roundScores.length));
  for (let i = 1; i <= maxRounds; i++) {
    html += `<th>R${i}</th>`;
  }
  html += '<th>Total</th></tr>';
  
  const sortedPlayers = [...state.players].sort((a, b) => b.total - a.total);
  
  sortedPlayers.forEach(player => {
    html += `<tr><td>${player.name}</td>`;
    for (let i = 0; i < maxRounds; i++) {
      html += `<td>${player.roundScores[i] !== undefined ? player.roundScores[i] : '-'}</td>`;
    }
    html += `<td>${player.total}</td></tr>`;
  });
  
  html += '</table>';
  finalScoreboard.innerHTML = html;
  
  // Show/hide New Game controls based on host status
  const newGameOptions = document.querySelector('.new-game-options');
  const endGameControls = document.getElementById('end-game-controls');
  
  if (state.host === currentPlayerId) {
    if (newGameOptions) newGameOptions.style.display = 'block';
    if (newGameBtn) newGameBtn.style.display = 'inline-block';
    if (endGameControls) endGameControls.style.display = 'block';
  } else {
    if (newGameOptions) newGameOptions.style.display = 'none';
    if (newGameBtn) newGameBtn.style.display = 'none';
    // Keep end-game-controls visible for the "Game Over" text
  }
}

function updateGuessButtons(state) {
  guessButtons.innerHTML = '';
  const currentPlayer = state.players.find(p => p.id === currentPlayerId);
  const isMyTurn = state.players[state.guessingCursor]?.id === currentPlayerId;
  
  if (isMyTurn && currentPlayer.guess === null) {
    for (let i = 0; i <= state.cardsThisRound; i++) {
      const btn = document.createElement('button');
      btn.className = 'guess-btn';
      btn.textContent = i;
      btn.addEventListener('click', () => {
        socket.emit('submit_guess', { guess: i }, (response) => {
          if (response && response.error) {
            showError(response.error);
          }
        });
      });
      guessButtons.appendChild(btn);
    }
  } else {
    guessButtons.innerHTML = '<p>Waiting for others to guess...</p>';
  }
}

function playCard(card) {
  if (gameState.phase !== 'playing') {
    showError('Not in playing phase');
    return;
  }

  // Don't allow playing while trick is resolving
  if (gameState.completedTrick) {
    showError('Please wait for trick to resolve');
    return;
  }
  
  socket.emit('play_card', { card }, (response) => {
    if (response && response.error) {
      showError(response.error);
    }
  });
}

function showTrickWinner(winnerName) {
  if (trickWinnerDisplay) {
    trickWinnerDisplay.textContent = `🏆 ${winnerName} won the trick! 🏆`;
    trickWinnerDisplay.style.display = 'block';
    
    // Hide after 3 seconds
    setTimeout(() => {
      trickWinnerDisplay.style.display = 'none';
    }, 3000);
  }
}

function updateScoreboard(state) {
  let html = '<table><tr><th>Player</th>';
  
  const maxRounds = Math.max(...state.players.map(p => p.roundScores.length));
  for (let i = 1; i <= maxRounds; i++) {
    html += `<th>R${i}</th>`;
  }
  html += '<th>Total</th></tr>';
  
  state.players.forEach(player => {
    html += `<tr><td>${player.name}</td>`;
    for (let i = 0; i < maxRounds; i++) {
      html += `<td>${player.roundScores[i] || '-'}</td>`;
    }
    html += `<td>${player.total}</td></tr>`;
  });
  
  html += '</table>';
  scoreboard.innerHTML = html;
}

function getSuitSymbol(suit) {
  const symbols = {
    'hearts': '♥',
    'diamonds': '♦',
    'clubs': '♣',
    'spades': '♠'
  };
  return symbols[suit] || suit;
}

// Add after the getSuitSymbol function (around line 324)
function sortCards(cards) {
  const suitOrder = { 'clubs': 0, 'hearts': 1, 'spades': 2, 'diamonds': 3 };
  const rankOrder = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };

  return [...cards].sort((a, b) => {
    // First sort by suit
    if (suitOrder[a.suit] !== suitOrder[b.suit]) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    // Then sort by rank within the same suit
    return rankOrder[a.rank] - rankOrder[b.rank];
  });
}

// Add element reference
const maxCardsInput = document.getElementById('max-cards-input');

// Update create room handler
createRoomBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  if (!username) {
    showError('Please enter a username');
    return;
  }

  try {
    const customX = maxCardsInput.value ? parseInt(maxCardsInput.value) : null;
    
    // Validate custom X
    if (customX && (customX < 1 || customX > 13)) {
      showError('Max cards must be between 1 and 13');
      return;
    }
    
    await createRoom(username, customX);
    showGameScreen();
  } catch (error) {
    showError(error);
  }
});