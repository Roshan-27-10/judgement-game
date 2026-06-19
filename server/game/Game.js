const { deal, getCardsForRound, getLegalCards, cardCompare } = require('./Deck');
const { scoreRound } = require('./scoring');

const CURRENT_ROUND_PHASES = new Set(['guessing', 'trump_select', 'playing']);
const BETWEEN_ROUND_PHASES = new Set(['vote', 'scoreboard']);

class Game {
  constructor(roomCode, customX = null) {
    this.roomCode = roomCode;
    this.host = null;
    this.players = [];
    this.phase = 'lobby';
    this.roundNumber = 0;
    this.customX = customX;
    this.x = 0;
    this.roundSequenceIndex = 0;
    this.cardsThisRound = 0;
    this.startPlayerIndex = 0; // index inside the active player order for the current round
    this.guessingCursor = 0;   // index inside the active player order for the current round
    this.guesses = {};
    this.trumpSelectPlayerId = null;
    this.trump = null;
    this.trickLeaderIndex = 0; // index inside the active player order for the current trick
    this.currentTrick = [];
    this.tricksWon = {};
    this.continueVotes = {};
    this.viewingScoreboard = new Set();
    this.lastTrickWinner = null;
    this.completedTrick = null;
    this.restartVotes = {};
    this.endGameVotes = {};
    this.kickVote = null;
    this.roundVersion = 0;
  }

  getActivePlayers() {
    return this.players.filter(p => p.activeInRound);
  }

  getConnectedPlayers() {
    return this.players.filter(p => p.connected);
  }

  getNextRoundPlayers() {
    return this.players.filter(p => p.connected);
  }

  getCompletedRoundCountForNewPlayer() {
    if (this.phase === 'lobby') return 0;
    if (CURRENT_ROUND_PHASES.has(this.phase)) return Math.max(0, this.roundNumber - 1);
    return this.roundNumber;
  }

  recalculateX(playerCount = null) {
    const count = Math.max(1, playerCount ?? this.getNextRoundPlayers().length ?? this.players.length);

    if (this.customX) {
      const maxPossible = Math.floor(52 / count);
      this.x = Math.min(this.customX, maxPossible);
    } else {
      this.x = Math.floor(52 / count);
    }
  }

  addPlayer(socketId, username, sessionToken = null) {
    const name = (username || 'Player').trim();

    if (this.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      return { error: 'Username already taken in this room. If this is you, refresh and rejoin with your saved session.' };
    }

    const joinsLater = this.phase !== 'lobby';
    const completedRounds = this.getCompletedRoundCountForNewPlayer();

    const player = {
      id: socketId, // stable player id; may differ from socket id after reconnect
      sessionToken,
      name,
      hand: [],
      guess: null,
      tricks: 0,
      connected: true,
      disconnectedAt: null,
      activeInRound: false,
      pendingJoin: joinsLater,
      joinedRoundNumber: joinsLater ? this.roundNumber + 1 : 0,
      roundScores: Array(completedRounds).fill(null),
      total: 0
    };

    this.players.push(player);

    if (!this.host) {
      this.host = player.id;
    }

    this.recalculateX(this.phase === 'lobby' ? this.players.length : this.getNextRoundPlayers().length);
    return { player, joinsNextRound: joinsLater };
  }

  reconnectPlayer(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { error: 'Player not found in this room' };

    player.connected = true;
    player.disconnectedAt = null;

    if (this.phase === 'lobby') {
      player.pendingJoin = false;
    } else if (!player.activeInRound) {
      player.pendingJoin = true;
      player.joinedRoundNumber = this.roundNumber + 1;
    }

    if (!this.host) {
      this.host = player.id;
    }

    this.recalculateX(this.phase === 'lobby' ? this.players.length : this.getNextRoundPlayers().length);
    return { player };
  }

  transferHostIfNeeded() {
    const hostPlayer = this.players.find(p => p.id === this.host);
    if (hostPlayer && hostPlayer.connected) return;

    const nextHost = this.players.find(p => p.connected) || this.players[0];
    this.host = nextHost ? nextHost.id : null;
  }

  removePlayer(playerId, { force = false } = {}) {
    const index = this.players.findIndex(p => p.id === playerId);
    if (index === -1) return null;

    const player = this.players[index];

    if (force || this.phase === 'lobby') {
      this.players.splice(index, 1);
      if (this.host === playerId) {
        this.host = this.players.find(p => p.connected)?.id || this.players[0]?.id || null;
      }
      this.recalculateX(this.phase === 'lobby' ? this.players.length : this.getNextRoundPlayers().length);
      return { player, removed: true };
    }

    return this.disconnectPlayer(playerId);
  }

  disconnectPlayer(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return null;

    if (this.phase === 'lobby') {
      return this.removePlayer(playerId, { force: true });
    }

    player.connected = false;
    player.disconnectedAt = Date.now();
    this.transferHostIfNeeded();
    this.recalculateX(this.getNextRoundPlayers().length || this.getActivePlayers().length || this.players.length);

    return { player, removed: false };
  }

  prepareRoundPlayers() {
    const playersThisRound = this.getNextRoundPlayers();

    if (playersThisRound.length < 2) {
      return { error: 'Need at least 2 connected players to start the round' };
    }

    this.recalculateX(playersThisRound.length);
    return { playersThisRound };
  }

  resetRoundState() {
    this.phase = 'guessing';
    this.guesses = {};
    this.trump = null;
    this.trumpSelectPlayerId = null;
    this.tricksWon = {};
    this.currentTrick = [];
    this.completedTrick = null;
    this.lastTrickWinner = null;
    this.continueVotes = {};
    this.restartVotes = {};
    this.endGameVotes = {};
    this.kickVote = null;
    this.viewingScoreboard.clear();
    this.roundVersion++;

    this.players.forEach(player => {
      player.activeInRound = player.connected;
      player.pendingJoin = false;
      player.hand = [];
      player.guess = null;
      player.tricks = 0;
    });
  }

  dealCurrentRoundCards() {
    const activePlayers = this.getActivePlayers();
    const hands = deal(activePlayers.length, this.cardsThisRound);
    activePlayers.forEach((player, i) => {
      player.hand = hands[i];
    });
    return activePlayers;
  }

  startNewRound() {
    const prepared = this.prepareRoundPlayers();
    if (prepared.error) return prepared;

    this.roundNumber++;
    this.cardsThisRound = getCardsForRound(this.x, this.roundSequenceIndex);
    this.roundSequenceIndex++;

    this.resetRoundState();
    const activePlayers = this.dealCurrentRoundCards();

    if (this.roundNumber === 1) {
      this.startPlayerIndex = Math.floor(Math.random() * activePlayers.length);
    } else {
      this.startPlayerIndex = (this.startPlayerIndex + 1) % activePlayers.length;
    }

    this.guessingCursor = this.startPlayerIndex;
    this.trickLeaderIndex = this.startPlayerIndex;
    return { success: true };
  }

  getRestartVoteStatus() {
    const eligiblePlayers = this.getConnectedPlayers();
    const totalEligible = eligiblePlayers.length;
    const threshold = Math.floor(totalEligible / 2) + 1;
    const yesCount = eligiblePlayers.filter(p => this.restartVotes[p.id] === true).length;
    const noCount = eligiblePlayers.filter(p => this.restartVotes[p.id] === false).length;

    return {
      yesCount,
      noCount,
      totalEligible,
      threshold,
      canHostRestart: totalEligible >= 2 && yesCount >= threshold,
      votes: eligiblePlayers.reduce((acc, player) => {
        if (this.restartVotes[player.id] !== undefined) {
          acc[player.id] = this.restartVotes[player.id];
        }
        return acc;
      }, {})
    };
  }

  castRestartVote(playerId, wantsRestart) {
    if (!CURRENT_ROUND_PHASES.has(this.phase)) {
      return { error: 'Round restart voting is only available while a round is in progress' };
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player || !player.connected) return { error: 'Player not found' };

    this.restartVotes[playerId] = !!wantsRestart;
    return { success: true, restartVoteStatus: this.getRestartVoteStatus() };
  }

  getEndGameVoteStatus() {
    const eligiblePlayers = this.getConnectedPlayers();
    const totalEligible = eligiblePlayers.length;
    const threshold = Math.floor(totalEligible / 2) + 1;
    const yesCount = eligiblePlayers.filter(p => this.endGameVotes[p.id] === true).length;
    const noCount = eligiblePlayers.filter(p => this.endGameVotes[p.id] === false).length;

    return {
      yesCount,
      noCount,
      totalEligible,
      threshold,
      canHostEnd: totalEligible >= 1 && yesCount >= threshold,
      votes: eligiblePlayers.reduce((acc, player) => {
        if (this.endGameVotes[player.id] !== undefined) {
          acc[player.id] = this.endGameVotes[player.id];
        }
        return acc;
      }, {})
    };
  }

  castEndGameVote(playerId, wantsEndGame) {
    if (this.phase === 'lobby') {
      return { error: 'Game has not started yet' };
    }

    if (this.phase === 'ended') {
      return { error: 'Game has already ended' };
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player || !player.connected) return { error: 'Player not found' };

    this.endGameVotes[playerId] = !!wantsEndGame;
    return { success: true, endGameVoteStatus: this.getEndGameVoteStatus() };
  }

  getKickVoteStatus() {
    if (!this.kickVote || !this.kickVote.targetPlayerId) {
      return {
        active: false,
        targetPlayerId: null,
        targetPlayerName: null,
        yesCount: 0,
        noCount: 0,
        totalEligible: 0,
        threshold: 0,
        canHostKick: false,
        votes: {}
      };
    }

    const target = this.players.find(p => p.id === this.kickVote.targetPlayerId);
    if (!target) {
      this.kickVote = null;
      return this.getKickVoteStatus();
    }

    const eligiblePlayers = this.getConnectedPlayers().filter(p => p.id !== target.id);
    const totalEligible = eligiblePlayers.length;
    const threshold = Math.floor(totalEligible / 2) + 1;
    const yesCount = eligiblePlayers.filter(p => this.kickVote.votes[p.id] === true).length;
    const noCount = eligiblePlayers.filter(p => this.kickVote.votes[p.id] === false).length;

    return {
      active: true,
      targetPlayerId: target.id,
      targetPlayerName: target.name,
      yesCount,
      noCount,
      totalEligible,
      threshold,
      canHostKick: totalEligible >= 1 && yesCount >= threshold,
      votes: eligiblePlayers.reduce((acc, player) => {
        if (this.kickVote.votes[player.id] !== undefined) {
          acc[player.id] = this.kickVote.votes[player.id];
        }
        return acc;
      }, {})
    };
  }

  startKickVote(hostPlayerId, targetPlayerId) {
    if (this.host !== hostPlayerId) {
      return { error: 'Only host can start a kick vote' };
    }

    if (!targetPlayerId) return { error: 'Choose a player to kick' };
    if (targetPlayerId === hostPlayerId) return { error: 'Host cannot kick themselves' };

    const target = this.players.find(p => p.id === targetPlayerId);
    if (!target) return { error: 'Target player not found' };
    if (target.id === this.host) return { error: 'Cannot kick the host' };

    const eligiblePlayers = this.getConnectedPlayers().filter(p => p.id !== target.id);
    if (eligiblePlayers.length === 0) {
      return { error: 'Need at least one connected voter other than the target' };
    }

    this.kickVote = {
      targetPlayerId: target.id,
      startedBy: hostPlayerId,
      votes: {},
      startedAt: Date.now()
    };

    return { success: true, kickVoteStatus: this.getKickVoteStatus() };
  }

  castKickVote(playerId, wantsKick) {
    if (!this.kickVote || !this.kickVote.targetPlayerId) {
      return { error: 'No kick vote is active' };
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player || !player.connected) return { error: 'Player not found' };
    if (player.id === this.kickVote.targetPlayerId) {
      return { error: 'Target player cannot vote on their own kick' };
    }

    this.kickVote.votes[playerId] = !!wantsKick;
    return { success: true, kickVoteStatus: this.getKickVoteStatus() };
  }

  cancelKickVote(playerId) {
    if (this.host !== playerId) {
      return { error: 'Only host can cancel a kick vote' };
    }

    this.kickVote = null;
    return { success: true };
  }

  evaluateContinueVotes() {
    if (this.phase !== 'vote') return;

    const activeConnectedPlayers = this.getActivePlayers().filter(p => p.connected);
    if (activeConnectedPlayers.length === 0) {
      this.phase = 'ended';
      return;
    }

    const allVoted = activeConnectedPlayers.every(p => this.continueVotes[p.id] !== undefined);
    if (!allVoted) return;

    const anyoneWantsContinue = activeConnectedPlayers.some(p => this.continueVotes[p.id] === true);
    if (!anyoneWantsContinue) {
      this.phase = 'ended';
    } else {
      this.phase = 'scoreboard';
      this.viewingScoreboard.clear();
    }
  }

  restartRoundAfterRosterChange(oldStartPlayerId = null) {
    const prepared = this.prepareRoundPlayers();
    if (prepared.error) {
      this.phase = 'ended';
      return { success: true, ended: true };
    }

    const maxCardsPossible = Math.floor(52 / prepared.playersThisRound.length);
    this.cardsThisRound = Math.max(1, Math.min(this.cardsThisRound || this.x || 1, this.x, maxCardsPossible));

    this.resetRoundState();
    const activePlayers = this.dealCurrentRoundCards();

    const oldStartIndex = oldStartPlayerId ? activePlayers.findIndex(p => p.id === oldStartPlayerId) : -1;
    if (oldStartIndex !== -1) {
      this.startPlayerIndex = oldStartIndex;
    } else {
      this.startPlayerIndex = this.startPlayerIndex % activePlayers.length;
    }

    this.guessingCursor = this.startPlayerIndex;
    this.trickLeaderIndex = this.startPlayerIndex;
    return { success: true, roundRestarted: true };
  }

  kickVotedPlayer(hostPlayerId) {
    if (this.host !== hostPlayerId) {
      return { error: 'Only host can kick a player' };
    }

    const kickVoteStatus = this.getKickVoteStatus();
    if (!kickVoteStatus.active) return { error: 'No kick vote is active' };
    if (!kickVoteStatus.canHostKick) {
      return { error: `Need majority yes votes to kick (${kickVoteStatus.yesCount}/${kickVoteStatus.threshold})` };
    }

    const targetId = kickVoteStatus.targetPlayerId;
    const target = this.players.find(p => p.id === targetId);
    if (!target) {
      this.kickVote = null;
      return { error: 'Target player not found' };
    }

    const wasActiveInCurrentRound = target.activeInRound && CURRENT_ROUND_PHASES.has(this.phase);
    const oldActivePlayers = this.getActivePlayers();
    const oldStartPlayerId = oldActivePlayers[this.startPlayerIndex]?.id || null;

    const removed = this.removePlayer(targetId, { force: true });
    this.kickVote = null;
    delete this.restartVotes[targetId];
    delete this.endGameVotes[targetId];
    delete this.continueVotes[targetId];
    this.viewingScoreboard.delete(targetId);

    const connectedPlayers = this.getConnectedPlayers();
    if (this.phase !== 'lobby' && connectedPlayers.length < 2) {
      this.phase = 'ended';
      return { success: true, kicked: true, player: removed?.player || target, ended: true };
    }

    if (wasActiveInCurrentRound) {
      const restartResult = this.restartRoundAfterRosterChange(oldStartPlayerId === targetId ? null : oldStartPlayerId);
      return { success: true, kicked: true, player: removed?.player || target, roundRestarted: !!restartResult.roundRestarted };
    }

    if (this.phase === 'vote') {
      this.evaluateContinueVotes();
    }

    if (this.phase === 'scoreboard') {
      const allReady = this.getConnectedPlayers().every(p => this.viewingScoreboard.has(p.id));
      if (allReady) this.startNewRound();
    }

    return { success: true, kicked: true, player: removed?.player || target };
  }

  leavePlayerVoluntarily(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { error: 'Player not found' };

    const wasActiveInCurrentRound = player.activeInRound && CURRENT_ROUND_PHASES.has(this.phase);
    const oldActivePlayers = this.getActivePlayers();
    const oldStartPlayerId = oldActivePlayers[this.startPlayerIndex]?.id || null;

    const removed = this.removePlayer(playerId, { force: true });

    delete this.restartVotes[playerId];
    delete this.endGameVotes[playerId];
    delete this.continueVotes[playerId];
    this.viewingScoreboard.delete(playerId);

    if (this.kickVote) {
      if (this.kickVote.targetPlayerId === playerId || this.kickVote.startedBy === playerId) {
        this.kickVote = null;
      } else {
        delete this.kickVote.votes[playerId];
      }
    }

    const connectedPlayers = this.getConnectedPlayers();
    if (this.players.length === 0) {
      return { success: true, left: true, player: removed?.player || player, roomEmpty: true };
    }

    if (this.phase !== 'lobby' && connectedPlayers.length < 2) {
      this.phase = 'ended';
      this.currentTrick = [];
      this.completedTrick = null;
      this.roundVersion++;
      return { success: true, left: true, player: removed?.player || player, ended: true };
    }

    if (wasActiveInCurrentRound) {
      const restartResult = this.restartRoundAfterRosterChange(oldStartPlayerId === playerId ? null : oldStartPlayerId);
      return { success: true, left: true, player: removed?.player || player, roundRestarted: !!restartResult.roundRestarted };
    }

    if (this.phase === 'vote') {
      this.evaluateContinueVotes();
    }

    if (this.phase === 'scoreboard') {
      const allReady = this.getConnectedPlayers().every(p => this.viewingScoreboard.has(p.id));
      if (allReady) this.startNewRound();
    }

    return { success: true, left: true, player: removed?.player || player };
  }

  endGame(playerId) {
    if (this.host !== playerId) {
      return { error: 'Only host can end the game' };
    }

    if (this.phase === 'lobby') {
      return { error: 'Game has not started yet' };
    }

    if (this.phase === 'ended') {
      return { success: true, alreadyEnded: true };
    }

    const endGameVoteStatus = this.getEndGameVoteStatus();
    if (!endGameVoteStatus.canHostEnd) {
      return { error: `Need majority yes votes to end the game (${endGameVoteStatus.yesCount}/${endGameVoteStatus.threshold})` };
    }

    this.phase = 'ended';
    this.currentTrick = [];
    this.completedTrick = null;
    this.restartVotes = {};
    this.endGameVotes = {};
    this.kickVote = null;
    this.continueVotes = {};
    this.viewingScoreboard.clear();
    this.roundVersion++;

    return { success: true, ended: true };
  }

  restartCurrentRound(playerId) {
    if (this.host !== playerId) {
      return { error: 'Only host can restart the round' };
    }

    if (!CURRENT_ROUND_PHASES.has(this.phase)) {
      return { error: 'Can only restart while a round is in progress' };
    }

    const restartVoteStatus = this.getRestartVoteStatus();
    if (!restartVoteStatus.canHostRestart) {
      return { error: `Need majority yes votes to restart (${restartVoteStatus.yesCount}/${restartVoteStatus.threshold})` };
    }

    const oldActivePlayers = this.getActivePlayers();
    const oldStartPlayerId = oldActivePlayers[this.startPlayerIndex]?.id || null;
    const oldCardsThisRound = this.cardsThisRound;

    const prepared = this.prepareRoundPlayers();
    if (prepared.error) return prepared;

    const maxCardsPossible = Math.floor(52 / prepared.playersThisRound.length);
    const currentSequenceIndex = Math.max(0, this.roundSequenceIndex - 1);
    const sequenceCards = getCardsForRound(this.x, currentSequenceIndex);
    const requestedCards = oldCardsThisRound || sequenceCards;
    this.cardsThisRound = Math.max(1, Math.min(requestedCards, this.x, maxCardsPossible));

    this.resetRoundState();
    const activePlayers = this.dealCurrentRoundCards();

    const oldStartIndex = activePlayers.findIndex(p => p.id === oldStartPlayerId);
    if (oldStartIndex !== -1) {
      this.startPlayerIndex = oldStartIndex;
    } else {
      this.startPlayerIndex = this.startPlayerIndex % activePlayers.length;
    }

    this.guessingCursor = this.startPlayerIndex;
    this.trickLeaderIndex = this.startPlayerIndex;

    return { success: true, restarted: true };
  }

  submitGuess(playerId, guess) {
    const activePlayers = this.getActivePlayers();
    const playerIndex = activePlayers.findIndex(p => p.id === playerId);

    if (playerIndex === -1) return { error: 'You are not active in this round yet' };
    if (this.phase !== 'guessing') return { error: 'Not in guessing phase' };
    if (playerIndex !== this.guessingCursor) return { error: 'Not your turn' };
    if (guess < 0 || guess > this.cardsThisRound) return { error: 'Invalid guess' };

    this.guesses[playerId] = guess;

    const player = activePlayers[playerIndex];
    player.guess = guess;

    this.guessingCursor = (this.guessingCursor + 1) % activePlayers.length;

    const allGuessed = activePlayers.every(p => p.guess !== null);
    if (allGuessed) {
      this.startTrumpSelection();
    }

    return { success: true };
  }

  startTrumpSelection() {
    const activePlayers = this.getActivePlayers();
    this.phase = 'trump_select';

    let highestGuess = -1;
    let selectorIndex = -1;

    for (let i = 0; i < activePlayers.length; i++) {
      const playerIndex = (this.startPlayerIndex + i) % activePlayers.length;
      const player = activePlayers[playerIndex];
      const guess = this.guesses[player.id] || 0;

      if (guess > highestGuess) {
        highestGuess = guess;
        selectorIndex = playerIndex;
      }
    }

    this.trumpSelectPlayerId = activePlayers[selectorIndex].id;
    this.trickLeaderIndex = selectorIndex;
  }

  selectTrump(playerId, trump) {
    if (this.phase !== 'trump_select') return { error: 'Not in trump selection phase' };
    if (playerId !== this.trumpSelectPlayerId) return { error: 'Not your turn to select trump' };

    this.trump = trump;
    this.startPlayingPhase();
    return { success: true };
  }

  startPlayingPhase() {
    this.phase = 'playing';
    this.currentTrick = [];
  }

  playCard(playerId, card) {
    if (this.phase !== 'playing') return { error: 'Not in playing phase' };

    const activePlayers = this.getActivePlayers();
    const playerIndex = activePlayers.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return { error: 'You are not active in this round yet' };

    const expectedPlayerId = activePlayers[(this.trickLeaderIndex + this.currentTrick.length) % activePlayers.length].id;
    if (playerId !== expectedPlayerId) return { error: 'Not your turn' };

    const player = activePlayers[playerIndex];

    const cardIndex = player.hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
    if (cardIndex === -1) return { error: 'Card not in hand' };

    const ledSuit = this.currentTrick.length > 0 ? this.currentTrick[0].card.suit : null;
    const legalCards = getLegalCards(player.hand, ledSuit);
    const isLegal = legalCards.some(c => c.rank === card.rank && c.suit === card.suit);

    if (!isLegal) return { error: 'Must follow suit if possible' };

    player.hand.splice(cardIndex, 1);
    this.currentTrick.push({ playerId, card });

    if (this.currentTrick.length === activePlayers.length) {
      this.completedTrick = [...this.currentTrick];
      const trickToResolve = [...this.currentTrick];
      const roundVersionAtPlay = this.roundVersion;
      this.currentTrick = [];

      setTimeout(() => {
        if (this.roundVersion !== roundVersionAtPlay || this.phase !== 'playing') return;
        this.resolveTrick(trickToResolve);
        this.completedTrick = null;
      }, 1500);
    }

    return { success: true };
  }

  resolveTrick(trick) {
    if (!trick || trick.length === 0) return;

    const activePlayers = this.getActivePlayers();
    const ledSuit = trick[0].card.suit;
    let winningPlay = trick[0];

    for (let i = 1; i < trick.length; i++) {
      const play = trick[i];
      if (cardCompare(play.card, winningPlay.card, this.trump, ledSuit) > 0) {
        winningPlay = play;
      }
    }

    const winnerId = winningPlay.playerId;
    this.tricksWon[winnerId] = (this.tricksWon[winnerId] || 0) + 1;

    const winnerPlayer = this.players.find(p => p.id === winnerId);
    if (winnerPlayer) {
      winnerPlayer.tricks = this.tricksWon[winnerId];
      this.lastTrickWinner = {
        playerId: winnerId,
        playerName: winnerPlayer.name
      };
    }

    const winnerIndex = activePlayers.findIndex(p => p.id === winnerId);
    if (winnerIndex !== -1) {
      this.trickLeaderIndex = winnerIndex;
    }

    const allCardsPlayed = activePlayers.every(p => p.hand.length === 0);
    if (allCardsPlayed) {
      this.endRound();
    }
  }

  endRound() {
    this.phase = 'vote';

    const activePlayers = this.getActivePlayers();
    const roundScores = scoreRound(activePlayers, this.guesses, this.tricksWon);

    this.players.forEach(player => {
      if (!player.activeInRound) {
        player.roundScores.push(null);
        return;
      }

      const scoreObj = roundScores.find(s => s.playerId === player.id);
      const score = scoreObj ? scoreObj.score : 0;
      player.roundScores.push(score);
      player.total += score;
    });

    this.continueVotes = {};
    this.restartVotes = {};
    this.endGameVotes = {};
    this.kickVote = null;
  }

  castContinueVote(playerId, wantsContinue) {
    if (this.phase !== 'vote') return { error: 'Not in vote phase' };

    const player = this.players.find(p => p.id === playerId);
    if (!player) return { error: 'Player not found' };
    if (!player.activeInRound) return { error: 'You will join from the next round' };

    this.continueVotes[playerId] = wantsContinue;
    this.evaluateContinueVotes();

    return { success: true };
  }

  readyForNextRound(playerId) {
    if (this.phase !== 'scoreboard') return { error: 'Not in scoreboard phase' };

    const player = this.players.find(p => p.id === playerId);
    if (!player || !player.connected) return { error: 'Player not found' };

    this.viewingScoreboard.add(playerId);

    const connectedPlayers = this.getConnectedPlayers();
    const allReady = connectedPlayers.every(p => this.viewingScoreboard.has(p.id));

    if (allReady) {
      return this.startNewRound();
    }

    return { success: true };
  }

  getWinners() {
    if (this.players.length === 0) return [];

    const maxScore = Math.max(...this.players.map(p => p.total));
    return this.players.filter(p => p.total === maxScore);
  }

  getState(playerId = null) {
    const activePlayers = this.getActivePlayers();
    const guessingPlayer = this.phase === 'guessing' ? activePlayers[this.guessingCursor] : null;
    const turnPlayer = this.phase === 'playing' && !(this.completedTrick && this.completedTrick.length > 0)
      ? activePlayers[(this.trickLeaderIndex + this.currentTrick.length) % activePlayers.length]
      : null;

    return {
      roomCode: this.roomCode,
      host: this.host,
      myId: playerId,
      players: this.players.map(p => {
        let handToShow;
        if (!playerId) {
          handToShow = p.hand.map(() => ({ rank: '?', suit: '?' }));
        } else if (p.id === playerId) {
          handToShow = p.hand;
        } else {
          handToShow = p.hand.map(() => ({ rank: '?', suit: '?' }));
        }

        return {
          id: p.id,
          name: p.name,
          hand: handToShow,
          handSize: p.hand.length,
          guess: p.guess,
          tricks: p.tricks,
          connected: p.connected,
          activeInRound: p.activeInRound,
          pendingJoin: p.pendingJoin,
          joinedRoundNumber: p.joinedRoundNumber,
          roundScores: p.roundScores,
          total: p.total
        };
      }),
      phase: this.phase,
      roundNumber: this.roundNumber,
      cardsThisRound: this.cardsThisRound,
      maxCardsPerRound: this.x,
      trump: this.trump,
      trumpSelectPlayerId: this.trumpSelectPlayerId,
      guessingCursor: this.guessingCursor,
      guessingPlayerId: guessingPlayer ? guessingPlayer.id : null,
      currentTurnPlayerId: turnPlayer ? turnPlayer.id : null,
      currentTrick: this.currentTrick,
      trickLeaderIndex: this.trickLeaderIndex,
      lastTrickWinner: this.lastTrickWinner,
      completedTrick: this.completedTrick,
      continueVotes: this.continueVotes,
      restartVoteStatus: this.getRestartVoteStatus(),
      endGameVoteStatus: this.getEndGameVoteStatus(),
      kickVoteStatus: this.getKickVoteStatus(),
      viewingScoreboard: Array.from(this.viewingScoreboard),
      roundScores: this.players.map(p => ({
        name: p.name,
        scores: p.roundScores,
        total: p.total
      })),
      winners: this.phase === 'ended' ? this.getWinners().map(w => w.name) : []
    };
  }

  returnToLobby() {
    this.players = this.players.filter(player => player.connected);

    this.phase = 'lobby';
    this.roundNumber = 0;
    this.roundSequenceIndex = 0;
    this.cardsThisRound = 0;
    this.startPlayerIndex = 0;
    this.guessingCursor = 0;
    this.guesses = {};
    this.trumpSelectPlayerId = null;
    this.trump = null;
    this.trickLeaderIndex = 0;
    this.currentTrick = [];
    this.tricksWon = {};
    this.continueVotes = {};
    this.restartVotes = {};
    this.endGameVotes = {};
    this.kickVote = null;
    this.viewingScoreboard.clear();
    this.lastTrickWinner = null;
    this.completedTrick = null;
    this.restartVotes = {};
    this.endGameVotes = {};
    this.kickVote = null;
    this.roundVersion = 0;

    this.players.forEach(player => {
      player.hand = [];
      player.guess = null;
      player.tricks = 0;
      player.roundScores = [];
      player.total = 0;
      player.activeInRound = false;
      player.pendingJoin = false;
      player.joinedRoundNumber = 0;
    });

    this.transferHostIfNeeded();
    this.recalculateX(this.players.length);
  }
}

module.exports = Game;
