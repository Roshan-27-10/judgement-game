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
const waitingNextRound = document.getElementById('waiting-next-round');
const restartRoundControls = document.getElementById('restart-round-controls');
const restartVoteStatus = document.getElementById('restart-vote-status');
const restartVoteYes = document.getElementById('restart-vote-yes');
const restartVoteNo = document.getElementById('restart-vote-no');
const restartRoundBtn = document.getElementById('restart-round-btn');
const endGameBtn = document.getElementById('end-game-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const leaveRoomConfirm = document.getElementById('leave-room-confirm');
const confirmLeaveRoomBtn = document.getElementById('confirm-leave-room-btn');
const backToGameBtn = document.getElementById('back-to-game-btn');
let leaveConfirmVisible = false;
const endGameVoteControls = document.getElementById('end-game-vote-controls');
const endGameVoteStatus = document.getElementById('end-game-vote-status');
const endGameVoteYes = document.getElementById('end-game-vote-yes');
const endGameVoteNo = document.getElementById('end-game-vote-no');
const kickPlayerControls = document.getElementById('kick-player-controls');
const kickStartRow = document.getElementById('kick-start-row');
const kickPlayerSelect = document.getElementById('kick-player-select');
const startKickVoteBtn = document.getElementById('start-kick-vote-btn');
const kickVotePanel = document.getElementById('kick-vote-panel');
const kickVoteStatus = document.getElementById('kick-vote-status');
const kickVoteYes = document.getElementById('kick-vote-yes');
const kickVoteNo = document.getElementById('kick-vote-no');
const cancelKickVoteBtn = document.getElementById('cancel-kick-vote-btn');
const kickPlayerBtn = document.getElementById('kick-player-btn');
const gameActionsToggle = document.getElementById('game-actions-toggle');
const gameActionsSidebar = document.getElementById('game-actions-sidebar');
const gameActionsClose = document.getElementById('game-actions-close');
const gameActionsOverlay = document.getElementById('game-actions-overlay');

// Game play elements
const roundNumber = document.getElementById('round-number');
const cardsThisRound = document.getElementById('cards-this-round');
const trumpDisplay = document.getElementById('trump-display');
const handCards = document.getElementById('hand-cards');
const handOrganizer = document.getElementById('hand-organizer');
const currentSuitOrder = document.getElementById('current-suit-order');
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

const DEFAULT_SUIT_ORDER = ['spades', 'diamonds', 'clubs', 'hearts'];
const RANK_ORDER = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  'J': 11,
  'Q': 12,
  'K': 13,
  'A': 14
};

// The visible hand is always shown in the original clean suit-row layout.
let handSortMode = 'suit';
let suitOrder = [...DEFAULT_SUIT_ORDER];

function loadSuitOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem('judgementSuitOrder') || 'null');
    if (Array.isArray(saved) && saved.length === DEFAULT_SUIT_ORDER.length && DEFAULT_SUIT_ORDER.every(suit => saved.includes(suit))) {
      return saved;
    }
  } catch (error) {
    // Ignore corrupt local storage and use the default order.
  }
  return [...DEFAULT_SUIT_ORDER];
}

function saveHandOrganizerPrefs() {
  localStorage.setItem('judgementHandSortMode', handSortMode);
  localStorage.setItem('judgementSuitOrder', JSON.stringify(suitOrder));
}

function setGameActionsSidebarOpen(open) {
  if (!gameActionsSidebar || !gameActionsOverlay) return;
  gameActionsSidebar.classList.toggle('open', open);
  gameActionsOverlay.classList.toggle('open', open);
  gameActionsSidebar.setAttribute('aria-hidden', open ? 'false' : 'true');
  document.body.classList.toggle('game-actions-open', open);
}

function updateGameActionsToggle(state, currentPlayer) {
  if (!gameActionsToggle) return;
  const canOpenActions = !!currentPlayer && currentPlayer.connected && state.phase !== 'lobby' && state.phase !== 'ended';
  gameActionsToggle.style.display = canOpenActions ? 'inline-block' : 'none';
  if (!canOpenActions) {
    setGameActionsSidebarOpen(false);
  }
}

function getCardRankValue(card) {
  return RANK_ORDER[String(card.rank)] || 0;
}

function getSuitOrderValue(suit, trump = null) {
  if (trump && suit === trump) return -1;
  const index = suitOrder.indexOf(suit);
  return index === -1 ? 99 : index;
}

function compareCardsByRankThenSuit(a, b, trump = null) {
  const rankDiff = getCardRankValue(b) - getCardRankValue(a);
  if (rankDiff !== 0) return rankDiff;
  return getSuitOrderValue(a.suit, trump) - getSuitOrderValue(b.suit, trump);
}

function compareCardsBySuitThenRank(a, b, trump = null) {
  const suitDiff = getSuitOrderValue(a.suit, trump) - getSuitOrderValue(b.suit, trump);
  if (suitDiff !== 0) return suitDiff;
  return getCardRankValue(b) - getCardRankValue(a);
}

function getDisplaySuitOrder(trump = null) {
  return [...suitOrder];
}

function getOrganizedHand(hand, trump = null) {
  const cards = [...(hand || [])];

  if (handSortMode === 'rank') {
    cards.sort((a, b) => compareCardsByRankThenSuit(a, b, null));
  } else if (handSortMode === 'suit') {
    cards.sort((a, b) => compareCardsBySuitThenRank(a, b, null));
  } else if (handSortMode === 'trump') {
    cards.sort((a, b) => compareCardsBySuitThenRank(a, b, trump));
  }

  return cards;
}

function getSuitName(suit) {
  const names = {
    clubs: 'Clubs',
    hearts: 'Hearts',
    spades: 'Spades',
    diamonds: 'Diamonds'
  };
  return names[suit] || suit;
}

function createPlayableCard(card) {
  const cardDiv = document.createElement('div');
  cardDiv.className = `card ${card.suit}`;
  cardDiv.textContent = `${card.rank} ${getSuitSymbol(card.suit)}`;
  cardDiv.addEventListener('click', () => playCard(card));
  return cardDiv;
}

function updateHandOrganizerUI() {
  document.querySelectorAll('.hand-sort-btn[data-sort]').forEach(button => {
    button.classList.toggle('active', button.dataset.sort === handSortMode);
  });

  document.querySelectorAll('.suit-order-btn').forEach(button => {
    const index = suitOrder.indexOf(button.dataset.suit);
    button.textContent = `${index + 1}. ${getSuitSymbol(button.dataset.suit)}`;
    button.title = 'Click to move this suit earlier in the order';
  });

  if (currentSuitOrder) {
    currentSuitOrder.textContent = `Current suit order: ${suitOrder.map(getSuitSymbol).join('  ')}`;
  }
}

function renderHand(currentPlayer, state) {
  if (!handCards) return;

  handCards.innerHTML = '';

  const hand = currentPlayer ? [...(currentPlayer.hand || [])] : [];

  // Original clean hand layout: one row per suit, cards sorted high-to-low inside each suit.
  handCards.classList.add('suit-grouped-hand');
  const orderedSuits = getDisplaySuitOrder();

  orderedSuits.forEach(suit => {
    const suitCards = hand
      .filter(card => card.suit === suit)
      .sort((a, b) => getCardRankValue(b) - getCardRankValue(a));

    const row = document.createElement('div');
    row.className = `suit-hand-row ${suit}`;

    const label = document.createElement('div');
    label.className = `suit-hand-label ${suit}`;
    label.textContent = `${getSuitSymbol(suit)} ${getSuitName(suit)}`;

    const cards = document.createElement('div');
    cards.className = 'suit-hand-cards';
    suitCards.forEach(card => cards.appendChild(createPlayableCard(card)));

    row.appendChild(label);
    row.appendChild(cards);
    handCards.appendChild(row);
  });
}

function rerenderHandIfPossible() {
  updateHandOrganizerUI();

  if (!gameState) return;
  const currentPlayer = gameState.players.find(p => p.id === currentPlayerId);
  if (currentPlayer) {
    renderHand(currentPlayer, gameState);
  }
}

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
  const continueBtn = document.getElementById('vote-continue');
  const stopBtn = document.getElementById('vote-stop');
  continueBtn.disabled = true;
  stopBtn.disabled = true;

  socket.emit('continue_vote', { continue: true }, (response) => {
    if (response && response.error) {
      showError(response.error);
      continueBtn.disabled = false;
      stopBtn.disabled = false;
    }
  });
});

document.getElementById('vote-stop').addEventListener('click', () => {
  const continueBtn = document.getElementById('vote-continue');
  const stopBtn = document.getElementById('vote-stop');
  continueBtn.disabled = true;
  stopBtn.disabled = true;

  socket.emit('continue_vote', { continue: false }, (response) => {
    if (response && response.error) {
      showError(response.error);
      continueBtn.disabled = false;
      stopBtn.disabled = false;
    }
  });
});

document.getElementById('ready-next-round').addEventListener('click', () => {
  const btn = document.getElementById('ready-next-round');
  btn.disabled = true;
  btn.textContent = 'Waiting for others...';
  socket.emit('ready_next_round', (response) => {
    if (response && response.error) {
      showError(response.error);
      btn.disabled = false;
      btn.textContent = 'Ready for Next Round';
    }
  });
});


document.querySelectorAll('.hand-sort-btn[data-sort]').forEach(button => {
  button.addEventListener('click', () => {
    handSortMode = button.dataset.sort;
    saveHandOrganizerPrefs();
    rerenderHandIfPossible();
  });
});

document.querySelectorAll('.suit-order-btn').forEach(button => {
  button.addEventListener('click', () => {
    const suit = button.dataset.suit;
    const currentIndex = suitOrder.indexOf(suit);
    if (currentIndex > 0) {
      suitOrder.splice(currentIndex, 1);
      suitOrder.unshift(suit);
    } else if (currentIndex === 0) {
      suitOrder.push(suitOrder.shift());
    }
    saveHandOrganizerPrefs();
    rerenderHandIfPossible();
  });
});

const resetSuitOrderBtn = document.getElementById('reset-suit-order-btn');
if (resetSuitOrderBtn) {
  resetSuitOrderBtn.addEventListener('click', () => {
    suitOrder = [...DEFAULT_SUIT_ORDER];
    saveHandOrganizerPrefs();
    rerenderHandIfPossible();
  });
}

if (gameActionsToggle) {
  gameActionsToggle.addEventListener('click', () => {
    const isOpen = gameActionsSidebar && gameActionsSidebar.classList.contains('open');
    setGameActionsSidebarOpen(!isOpen);
  });
}

if (gameActionsClose) {
  gameActionsClose.addEventListener('click', () => setGameActionsSidebarOpen(false));
}

if (gameActionsOverlay) {
  gameActionsOverlay.addEventListener('click', () => setGameActionsSidebarOpen(false));
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setGameActionsSidebarOpen(false);
  }
});

restartVoteYes.addEventListener('click', () => {
  socket.emit('restart_round_vote', { restart: true }, (response) => {
    if (response && response.error) {
      showError(response.error);
    }
  });
});

restartVoteNo.addEventListener('click', () => {
  socket.emit('restart_round_vote', { restart: false }, (response) => {
    if (response && response.error) {
      showError(response.error);
    }
  });
});

restartRoundBtn.addEventListener('click', () => {
  const ok = window.confirm('Restart this round? Current cards, guesses, trump, and tricks for this round will be discarded and cards will be redistributed.');
  if (!ok) return;

  restartRoundBtn.disabled = true;
  socket.emit('restart_round', (response) => {
    if (response && response.error) {
      showError(response.error);
      restartRoundBtn.disabled = false;
    }
  });
});

if (endGameVoteYes) {
  endGameVoteYes.addEventListener('click', () => {
    socket.emit('end_game_vote', { endGame: true }, (response) => {
      if (response && response.error) {
        showError(response.error);
      }
    });
  });
}

if (endGameVoteNo) {
  endGameVoteNo.addEventListener('click', () => {
    socket.emit('end_game_vote', { endGame: false }, (response) => {
      if (response && response.error) {
        showError(response.error);
      }
    });
  });
}

if (endGameBtn) {
  endGameBtn.addEventListener('click', () => {
    const ok = window.confirm('End the game now? This is allowed only after majority yes votes. The current unfinished round will not be scored.');
    if (!ok) return;

    endGameBtn.disabled = true;
    socket.emit('end_game', (response) => {
      endGameBtn.disabled = false;
      if (response && response.error) {
        showError(response.error);
      }
    });
  });
}

function setLeaveConfirmVisible(visible) {
  leaveConfirmVisible = !!visible;

  if (leaveRoomConfirm) {
    leaveRoomConfirm.style.display = leaveConfirmVisible ? 'block' : 'none';
  }

  if (leaveRoomBtn && gameState) {
    const currentPlayer = gameState.players.find(p => p.id === currentPlayerId);
    const canLeave = !!currentPlayer && gameState.phase !== 'ended';
    leaveRoomBtn.style.display = canLeave && !leaveConfirmVisible ? 'inline-block' : 'none';
    leaveRoomBtn.disabled = false;
  }
}

function completeLeaveRoom() {
  if (confirmLeaveRoomBtn) confirmLeaveRoomBtn.disabled = true;
  if (backToGameBtn) backToGameBtn.disabled = true;

  socket.emit('leave_room', (response) => {
    if (confirmLeaveRoomBtn) confirmLeaveRoomBtn.disabled = false;
    if (backToGameBtn) backToGameBtn.disabled = false;

    if (response && response.error) {
      showError(response.error);
      return;
    }

    if (typeof clearSavedSession === 'function') {
      clearSavedSession();
    }
    currentRoom = null;
    currentPlayerId = socket.id;
    gameState = null;
    setLeaveConfirmVisible(false);
    showLobbyScreen();
    showError('You left the room.');
  });
}

if (leaveRoomBtn) {
  leaveRoomBtn.addEventListener('click', () => {
    setLeaveConfirmVisible(true);
  });
}

if (backToGameBtn) {
  backToGameBtn.addEventListener('click', () => {
    setLeaveConfirmVisible(false);
    setGameActionsSidebarOpen(false);
  });
}

if (confirmLeaveRoomBtn) {
  confirmLeaveRoomBtn.addEventListener('click', () => {
    completeLeaveRoom();
  });
}

if (startKickVoteBtn) {
  startKickVoteBtn.addEventListener('click', () => {
    const targetPlayerId = kickPlayerSelect ? kickPlayerSelect.value : null;
    if (!targetPlayerId) {
      showError('Choose a player to kick');
      return;
    }

    socket.emit('start_kick_vote', { targetPlayerId }, (response) => {
      if (response && response.error) {
        showError(response.error);
      }
    });
  });
}

if (kickVoteYes) {
  kickVoteYes.addEventListener('click', () => {
    socket.emit('kick_vote', { kick: true }, (response) => {
      if (response && response.error) {
        showError(response.error);
      }
    });
  });
}

if (kickVoteNo) {
  kickVoteNo.addEventListener('click', () => {
    socket.emit('kick_vote', { kick: false }, (response) => {
      if (response && response.error) {
        showError(response.error);
      }
    });
  });
}

if (cancelKickVoteBtn) {
  cancelKickVoteBtn.addEventListener('click', () => {
    socket.emit('cancel_kick_vote', (response) => {
      if (response && response.error) {
        showError(response.error);
      }
    });
  });
}

if (kickPlayerBtn) {
  kickPlayerBtn.addEventListener('click', () => {
    const targetName = gameState?.kickVoteStatus?.targetPlayerName || 'this player';
    const ok = window.confirm(`Kick ${targetName}? If they are active in the current round, the round will restart and cards will be redistributed.`);
    if (!ok) return;

    kickPlayerBtn.disabled = true;
    socket.emit('kick_player', (response) => {
      kickPlayerBtn.disabled = false;
      if (response && response.error) {
        showError(response.error);
      }
    });
  });
}

function showGameScreen() {
  lobbyScreen.classList.remove('active');
  gameScreen.classList.add('active');
  document.getElementById('scoreboard-container').style.display = 'block';
}

function showLobbyScreen() {
  gameScreen.classList.remove('active');
  lobbyScreen.classList.add('active');
  if (scoreboardContainer) scoreboardContainer.style.display = 'none';
  if (gamePlayArea) gamePlayArea.style.display = 'none';
  if (gameActionsToggle) gameActionsToggle.style.display = 'none';
  setGameActionsSidebarOpen(false);
  setLeaveConfirmVisible(false);
}

function showError(message) {
  const lobbyErrorMessage = document.getElementById('lobby-error-message');
  const targetError = gameScreen && gameScreen.classList.contains('active')
    ? errorMessage
    : (lobbyErrorMessage || errorMessage);

  if (!targetError) return;

  targetError.textContent = message;
  setTimeout(() => {
    targetError.textContent = '';
  }, 3000);
}

function updateGamePlayUI(state) {
  roundNumber.textContent = state.roundNumber;
  cardsThisRound.textContent = state.cardsThisRound;
  trumpDisplay.textContent = state.trump || 'Not selected';
  
  // Find current player
  const currentPlayer = state.players.find(p => p.id === currentPlayerId);
  updateGameActionsToggle(state, currentPlayer);
  const isWaitingForNextRound = currentPlayer && currentPlayer.pendingJoin && !currentPlayer.activeInRound && state.phase !== 'ended';

  if (waitingNextRound) {
    if (isWaitingForNextRound) {
      waitingNextRound.textContent = `You joined while Round ${state.roundNumber} is in progress. You will start playing from Round ${currentPlayer.joinedRoundNumber}. If the host restarts this round after majority approval, you will be included immediately.`;
      waitingNextRound.style.display = 'block';
    } else {
      waitingNextRound.style.display = 'none';
    }
  }

  updateRestartRoundControls(state, currentPlayer);
  updateEndGameVoteControls(state, currentPlayer);
  updateKickPlayerControls(state, currentPlayer);
  updateHostGameControls(state, currentPlayer);
  
  // Update hand in the clean original suit-row layout.
  if (currentPlayer) {
    renderHand(currentPlayer, state);
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
      cardDiv.textContent = `${player ? player.name : 'Player'}: ${play.card.rank} ${getSuitSymbol(play.card.suit)}`;
      currentTrick.appendChild(cardDiv);
    });
  }
  
  if (state.phase !== 'lobby') {
    updateScoreboard(state);
  }

  // Show/hide containers based on phase
  guessControls.style.display = state.phase === 'guessing' && !isWaitingForNextRound ? 'block' : 'none';
  trumpControls.style.display = state.phase === 'trump_select' && state.trumpSelectPlayerId === currentPlayerId && !isWaitingForNextRound ? 'block' : 'none';
  
  // Handle vote controls
  if (state.phase === 'vote' && currentPlayer && currentPlayer.activeInRound) {
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
  document.getElementById('hand-container').style.display = (state.phase === 'ended' || isWaitingForNextRound) ? 'none' : 'block';
  document.getElementById('trick-container').style.display = state.phase === 'ended' ? 'none' : 'block';

  // Always show whose chance/turn it is during the game
  updateChanceIndicator(state);
  
  // Update guess buttons
  if (state.phase === 'guessing') {
    updateGuessButtons(state);
  }

  // Round guesses are now shown compactly beside each player's name as a 🎯 needed count.
  if (guessesDisplay) {
    guessesDisplay.style.display = 'none';
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

function updateHostGameControls(state, currentPlayer) {
  const canLeave = !!currentPlayer && state.phase !== 'ended';

  if (!canLeave) {
    setLeaveConfirmVisible(false);
  }

  if (leaveRoomBtn) {
    leaveRoomBtn.style.display = canLeave && !leaveConfirmVisible ? 'inline-block' : 'none';
    leaveRoomBtn.disabled = false;
  }

  if (leaveRoomConfirm) {
    leaveRoomConfirm.style.display = canLeave && leaveConfirmVisible ? 'block' : 'none';
  }
}

function updateEndGameVoteControls(state, currentPlayer) {
  if (!endGameVoteControls || !endGameVoteStatus) return;

  const canShow = currentPlayer && currentPlayer.connected && state.phase !== 'lobby' && state.phase !== 'ended';
  if (!canShow) {
    endGameVoteControls.style.display = 'none';
    return;
  }

  endGameVoteControls.style.display = 'block';

  const voteStatus = state.endGameVoteStatus || {
    yesCount: 0,
    noCount: 0,
    totalEligible: 0,
    threshold: 0,
    canHostEnd: false,
    votes: {}
  };

  const votes = voteStatus.votes || {};
  const myVote = votes[currentPlayerId];
  const remainingYesVotes = Math.max(0, voteStatus.threshold - voteStatus.yesCount);
  const myVoteText = myVote === true
    ? 'Your vote: Yes'
    : myVote === false
      ? 'Your vote: No'
      : 'You have not voted yet';

  endGameVoteStatus.textContent = `End game yes votes: ${voteStatus.yesCount}/${voteStatus.threshold} needed. No votes: ${voteStatus.noCount}. ${myVoteText}.`;

  if (endGameVoteYes) {
    endGameVoteYes.textContent = myVote === true ? 'Voted Yes' : 'Vote Yes';
  }
  if (endGameVoteNo) {
    endGameVoteNo.textContent = myVote === false ? 'Voted No' : 'Vote No';
  }

  if (endGameBtn) {
    const isHost = state.host === currentPlayerId;
    endGameBtn.style.display = isHost ? 'inline-block' : 'none';
    endGameBtn.disabled = !voteStatus.canHostEnd;
    endGameBtn.textContent = voteStatus.canHostEnd
      ? 'End Game'
      : `Host End Locked (${remainingYesVotes} more yes)`;
  }
}

function updateChanceIndicator(state) {
  if (!turnIndicator) return;

  const showIndicator = state.phase !== 'lobby' && state.phase !== 'ended';
  if (!showIndicator) {
    turnIndicator.style.display = 'none';
    return;
  }

  let text = 'Waiting...';
  let color = '#eee';

  if (state.phase === 'guessing') {
    const guessPlayer = state.players.find(p => p.id === state.guessingPlayerId);
    if (guessPlayer && guessPlayer.id === currentPlayerId) {
      text = '🎲 YOUR CHANCE TO GUESS!';
      color = '#4CAF50';
    } else if (guessPlayer) {
      text = `🎲 ${guessPlayer.name}'s chance to guess...`;
    } else {
      text = '🎲 Waiting for guessing turn...';
    }
  } else if (state.phase === 'trump_select') {
    const trumpPlayer = state.players.find(p => p.id === state.trumpSelectPlayerId);
    if (trumpPlayer && trumpPlayer.id === currentPlayerId) {
      text = '🃏 YOUR CHANCE TO SELECT TRUMP!';
      color = '#4CAF50';
    } else if (trumpPlayer) {
      text = `🃏 ${trumpPlayer.name}'s chance to select trump...`;
    } else {
      text = '🃏 Waiting for trump selection...';
    }
  } else if (state.phase === 'playing') {
    if (state.completedTrick && state.completedTrick.length > 0) {
      text = '⏳ Trick complete — resolving winner...';
      color = '#FFA500';
    } else {
      const turnPlayer = state.players.find(p => p.id === state.currentTurnPlayerId);
      if (turnPlayer && turnPlayer.id === currentPlayerId) {
        text = '🎮 YOUR TURN TO PLAY!';
        color = '#4CAF50';
      } else if (turnPlayer) {
        text = `🎮 ${turnPlayer.name}'s chance to play...`;
      } else {
        text = '🎮 Waiting for turn...';
      }
    }
  } else if (state.phase === 'vote') {
    text = '🗳️ Round over — waiting for continue votes...';
    color = '#FFA500';
  } else if (state.phase === 'scoreboard') {
    text = '✅ Waiting for everyone to be ready for the next round...';
    color = '#FFA500';
  }

  turnIndicator.textContent = text;
  turnIndicator.style.color = color;
  turnIndicator.style.display = 'block';
}

function updateKickPlayerControls(state, currentPlayer) {
  if (!kickPlayerControls || !kickVoteStatus) return;

  const kickStatus = state.kickVoteStatus || { active: false, votes: {}, yesCount: 0, noCount: 0, threshold: 0, canHostKick: false };
  const isHost = state.host === currentPlayerId;
  const isConnected = currentPlayer && currentPlayer.connected;
  const canShow = isConnected && state.phase !== 'ended' && state.phase !== 'lobby' && (isHost || kickStatus.active);

  if (!canShow) {
    kickPlayerControls.style.display = 'none';
    return;
  }

  kickPlayerControls.style.display = 'block';

  if (kickStatus.active) {
    if (kickStartRow) kickStartRow.style.display = 'none';
    if (kickVotePanel) kickVotePanel.style.display = 'block';

    const votes = kickStatus.votes || {};
    const myVote = votes[currentPlayerId];
    const isTarget = kickStatus.targetPlayerId === currentPlayerId;
    const remainingYesVotes = Math.max(0, kickStatus.threshold - kickStatus.yesCount);

    let myVoteText = 'You have not voted yet';
    if (isTarget) {
      myVoteText = 'You are the target, so you cannot vote';
    } else if (myVote === true) {
      myVoteText = 'Your vote: Yes';
    } else if (myVote === false) {
      myVoteText = 'Your vote: No';
    }

    kickVoteStatus.textContent = `Kick vote for ${kickStatus.targetPlayerName}: Yes votes ${kickStatus.yesCount}/${kickStatus.threshold} needed. No votes: ${kickStatus.noCount}. ${myVoteText}.`;

    if (kickVoteYes) {
      kickVoteYes.style.display = isTarget ? 'none' : 'inline-block';
      kickVoteYes.textContent = myVote === true ? 'Voted Yes' : 'Vote Yes';
    }
    if (kickVoteNo) {
      kickVoteNo.style.display = isTarget ? 'none' : 'inline-block';
      kickVoteNo.textContent = myVote === false ? 'Voted No' : 'Vote No';
    }
    if (cancelKickVoteBtn) {
      cancelKickVoteBtn.style.display = isHost ? 'inline-block' : 'none';
    }
    if (kickPlayerBtn) {
      kickPlayerBtn.style.display = isHost ? 'inline-block' : 'none';
      kickPlayerBtn.disabled = !kickStatus.canHostKick;
      kickPlayerBtn.textContent = kickStatus.canHostKick
        ? `Kick ${kickStatus.targetPlayerName}`
        : `Kick Locked (${remainingYesVotes} more yes)`;
    }

    return;
  }

  if (kickVotePanel) kickVotePanel.style.display = 'none';

  if (isHost) {
    if (kickStartRow) kickStartRow.style.display = 'flex';
    if (kickPlayerSelect) {
      const previousValue = kickPlayerSelect.value;
      const kickablePlayers = state.players.filter(p => p.id !== state.host);
      kickPlayerSelect.innerHTML = '';

      kickablePlayers.forEach(player => {
        const option = document.createElement('option');
        option.value = player.id;
        option.textContent = `${player.name}${player.connected ? '' : ' (disconnected)'}`;
        kickPlayerSelect.appendChild(option);
      });

      if (kickablePlayers.some(p => p.id === previousValue)) {
        kickPlayerSelect.value = previousValue;
      }

      if (startKickVoteBtn) {
        startKickVoteBtn.disabled = kickablePlayers.length === 0;
      }
    }
  } else if (kickStartRow) {
    kickStartRow.style.display = 'none';
  }
}

function updateRestartRoundControls(state, currentPlayer) {
  if (!restartRoundControls || !restartVoteStatus) return;

  const roundInProgress = ['guessing', 'trump_select', 'playing'].includes(state.phase);
  if (!roundInProgress || !currentPlayer || !currentPlayer.connected) {
    restartRoundControls.style.display = 'none';
    return;
  }

  restartRoundControls.style.display = 'block';

  const voteStatus = state.restartVoteStatus || {
    yesCount: 0,
    noCount: 0,
    totalEligible: 0,
    threshold: 0,
    canHostRestart: false,
    votes: {}
  };

  const votes = voteStatus.votes || {};
  const myVote = votes[currentPlayerId];
  const remainingYesVotes = Math.max(0, voteStatus.threshold - voteStatus.yesCount);
  const myVoteText = myVote === true
    ? 'Your vote: Yes'
    : myVote === false
      ? 'Your vote: No'
      : 'You have not voted yet';

  restartVoteStatus.textContent = `Yes votes: ${voteStatus.yesCount}/${voteStatus.threshold} needed. No votes: ${voteStatus.noCount}. ${myVoteText}.`;

  if (restartVoteYes) {
    restartVoteYes.textContent = myVote === true ? 'Voted Yes' : 'Vote Yes';
  }
  if (restartVoteNo) {
    restartVoteNo.textContent = myVote === false ? 'Voted No' : 'Vote No';
  }

  if (restartRoundBtn) {
    const isHost = state.host === currentPlayerId;
    restartRoundBtn.style.display = isHost ? 'inline-block' : 'none';
    restartRoundBtn.disabled = !voteStatus.canHostRestart;
    restartRoundBtn.textContent = voteStatus.canHostRestart
      ? 'Restart Round + Redistribute Cards'
      : `Host Restart Locked (${remainingYesVotes} more yes)`;
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
  
  const roundPlayers = state.players.filter(p => p.activeInRound);
  const playersWithGuesses = roundPlayers.filter(p => p.guess !== null);
  
  if (playersWithGuesses.length === 0) {
    guessesList.innerHTML = '<div class="guess-item waiting">Waiting for guesses...</div>';
    return;
  }
  
  let html = '';
  
  // Sort players by guess submission order (or just show all with guesses)
  roundPlayers.forEach(player => {
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
      html += `<td>${player.roundScores[i] !== undefined && player.roundScores[i] !== null ? player.roundScores[i] : '-'}</td>`;
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
  const isMyTurn = state.guessingPlayerId === currentPlayerId;
  
  if (isMyTurn && currentPlayer && currentPlayer.guess === null) {
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
      const score = player.roundScores[i];
      html += `<td>${score !== undefined && score !== null ? score : '-'}</td>`;
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
