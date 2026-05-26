const { deal, getCardsForRound, getLegalCards, cardCompare } = require('./Deck');
const { scoreRound } = require('./scoring');

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
    this.startPlayerIndex = 0;
    this.guessingCursor = 0;
    this.guesses = {};
    this.trumpSelectPlayerId = null;
    this.trump = null;
    this.trickLeaderIndex = 0;
    this.currentTrick = [];
    this.tricksWon = {};
    this.continueVotes = {};
    this.viewingScoreboard = new Set();
    this.lastTrickWinner = null;
    this.completedTrick = null;
    this.disconnectedPlayers = new Map(); // Track disconnected players with timeout
  }

  recalculateX() {
    if (this.customX) {
      const maxPossible = Math.floor(52 / Math.max(1, this.players.length));
      this.x = Math.min(this.customX, maxPossible);
    } else {
      this.x = Math.floor(52 / Math.max(1, this.players.length));
    }
  }

  addPlayer(socketId, username) {
    if (this.players.some(p => p.name === username)) {
      return { error: 'Username already taken in this room' };
    }

    const player = {
      id: socketId,
      name: username,
      hand: [],
      guess: null,
      tricks: 0,
      connected: true,
      roundScores: [],
      total: 0
    };

    this.players.push(player);
    
    if (!this.host) {
      this.host = socketId;
    }

    this.recalculateX();
    return { player };
  }

  removePlayer(socketId) {
    const player = this.players.find(p => p.id === socketId);
    if (!player) return null;
    
    // If game not started or ended, remove completely
    if (this.phase === 'lobby' || this.phase === 'ended') {
      const index = this.players.findIndex(p => p.id === socketId);
      this.players.splice(index, 1);
      
      if (this.host === socketId && this.players.length > 0) {
        this.host = this.players[0].id;
      }
      
      this.recalculateX();
      return player;
    }
    
    // Game in progress - mark as disconnected with timeout
    player.connected = false;
    player.disconnectTime = Date.now();
    
    // Store timeout for auto-removal (60 seconds)
    const timeout = setTimeout(() => {
      this.permanentlyRemovePlayer(socketId);
    }, 60000);
    
    this.disconnectedPlayers.set(socketId, timeout);
    
    return player;
  }

  permanentlyRemovePlayer(socketId) {
    const index = this.players.findIndex(p => p.id === socketId);
    if (index === -1) return;
    
    // Clear timeout if exists
    if (this.disconnectedPlayers.has(socketId)) {
      clearTimeout(this.disconnectedPlayers.get(socketId));
      this.disconnectedPlayers.delete(socketId);
    }
    
    const removed = this.players[index];
    this.players.splice(index, 1);
    
    // If game in progress, handle abandonment
    if (this.phase !== 'lobby' && this.phase !== 'ended') {
      this.handlePlayerAbandonment();
    }
    
    if (this.host === socketId && this.players.length > 0) {
      this.host = this.players[0].id;
    }
    
    this.recalculateX();
  }

  handlePlayerAbandonment() {
    const activePlayers = this.players.filter(p => p.connected);
    
    // If less than 2 players left, end the game
    if (activePlayers.length < 2) {
      this.phase = 'ended';
      return;
    }
    
    // If it's the disconnected player's turn during guessing phase
    if (this.phase === 'guessing') {
      const currentPlayer = this.players[this.guessingCursor];
      if (currentPlayer && !currentPlayer.connected) {
        // Auto-submit a random guess for disconnected player
        const randomGuess = Math.floor(Math.random() * (this.cardsThisRound + 1));
        this.submitGuess(currentPlayer.id, randomGuess);
      }
    }
    
    // If it's the disconnected player's turn during playing phase
    if (this.phase === 'playing' && this.currentTrick.length < this.players.length) {
      const expectedPlayerIndex = (this.trickLeaderIndex + this.currentTrick.length) % this.players.length;
      const expectedPlayer = this.players[expectedPlayerIndex];
      if (expectedPlayer && !expectedPlayer.connected) {
        // Auto-play the first legal card
        const ledSuit = this.currentTrick.length > 0 ? this.currentTrick[0].card.suit : null;
        const legalCards = getLegalCards(expectedPlayer.hand, ledSuit);
        if (legalCards.length > 0) {
          this.playCard(expectedPlayer.id, legalCards[0]);
        }
      }
    }
  }

  reconnectPlayer(oldSocketId, newSocketId, username) {
    // Try to find player by old ID first
    let player = this.players.find(p => p.id === oldSocketId);
    
    // If not found, try by username
    if (!player) {
      player = this.players.find(p => p.name === username);
    }
    
    if (!player) {
      return { error: 'Player not found' };
    }
    
    if (!player.connected) {
      // Clear disconnection timeout
      if (this.disconnectedPlayers.has(player.id)) {
        clearTimeout(this.disconnectedPlayers.get(player.id));
        this.disconnectedPlayers.delete(player.id);
      }
      
      // Update socket ID
      player.id = newSocketId;
      player.connected = true;
      
      return { success: true, player };
    }
    
    return { error: 'Player already connected' };
  }

  startNewRound() {
    this.roundNumber++;
    this.cardsThisRound = getCardsForRound(this.x, this.roundSequenceIndex);
    this.roundSequenceIndex++;
    
    this.phase = 'guessing';
    this.guesses = {};
    this.trump = null;
    this.trumpSelectPlayerId = null;
    this.tricksWon = {};
    this.currentTrick = [];
    
    const hands = deal(this.players.length, this.cardsThisRound);
    this.players.forEach((player, i) => {
      player.hand = hands[i];
      player.guess = null;
      player.tricks = 0;
    });
    
    if (this.roundNumber === 1) {
      this.startPlayerIndex = Math.floor(Math.random() * this.players.length);
    } else {
      this.startPlayerIndex = (this.startPlayerIndex + 1) % this.players.length;
    }
    
    this.guessingCursor = this.startPlayerIndex;
  }

  submitGuess(playerId, guess) {
    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return { error: 'Player not found' };
    if (this.phase !== 'guessing') return { error: 'Not in guessing phase' };
    if (playerIndex !== this.guessingCursor) return { error: 'Not your turn' };
    if (guess < 0 || guess > this.cardsThisRound) return { error: 'Invalid guess' };
    
    this.guesses[playerId] = guess;
    const player = this.players[playerIndex];
    player.guess = guess;
    
    this.guessingCursor = (this.guessingCursor + 1) % this.players.length;
    
    const allGuessed = this.players.every(p => p.guess !== null);
    
    if (allGuessed) {
      this.startTrumpSelection();
    }
    
    return { success: true };
  }

  startTrumpSelection() {
    this.phase = 'trump_select';
    
    let highestGuess = -1;
    let selectorIndex = -1;
    
    for (let i = 0; i < this.players.length; i++) {
      const playerIndex = (this.startPlayerIndex + i) % this.players.length;
      const player = this.players[playerIndex];
      const guess = this.guesses[player.id] || 0;
      
      if (guess > highestGuess) {
        highestGuess = guess;
        selectorIndex = playerIndex;
      }
    }
    
    this.trumpSelectPlayerId = this.players[selectorIndex].id;
    this.trickLeaderIndex = selectorIndex;
  }

  selectTrump(playerId, trump) {
    if (this.phase !== 'trump_select') return { error: 'Not in trump selection phase' };
    if (playerId !== this.trumpSelectPlayerId) return { error: 'Not your turn to select trump' };
    
    const validSuits = ['clubs', 'hearts', 'spades', 'diamonds'];
    if (!validSuits.includes(trump)) return { error: 'Invalid trump suit' };
    
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
    
    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return { error: 'Player not found' };
    
    const expectedPlayerId = this.players[(this.trickLeaderIndex + this.currentTrick.length) % this.players.length].id;
    if (playerId !== expectedPlayerId) return { error: 'Not your turn' };
    
    const player = this.players[playerIndex];
    
    const cardIndex = player.hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
    if (cardIndex === -1) return { error: 'Card not in hand' };
    
    const ledSuit = this.currentTrick.length > 0 ? this.currentTrick[0].card.suit : null;
    const legalCards = getLegalCards(player.hand, ledSuit);
    const isLegal = legalCards.some(c => c.rank === card.rank && c.suit === card.suit);
    
    if (!isLegal) return { error: 'Must follow suit if possible' };
    
    player.hand.splice(cardIndex, 1);
    this.currentTrick.push({ playerId, card });
    
    if (this.currentTrick.length === this.players.length) {
      this.completedTrick = [...this.currentTrick];
      const trickToResolve = [...this.currentTrick];
      this.currentTrick = [];
      
      setTimeout(() => {
        this.resolveTrick(trickToResolve);
        this.completedTrick = null;
      }, 1500);
    }
    
    return { success: true };
  }

  resolveTrick(trick) {
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
    }
    
    this.lastTrickWinner = {
      playerId: winnerId,
      playerName: winnerPlayer.name
    };
    
    this.trickLeaderIndex = this.players.findIndex(p => p.id === winnerId);
    
    const allCardsPlayed = this.players.every(p => p.hand.length === 0);
    
    if (allCardsPlayed) {
      this.endRound();
    }
  }

  endRound() {
    if (this.phase !== 'playing') return;
    
    this.phase = 'vote';
    
    const roundScores = scoreRound(this.players, this.guesses, this.tricksWon);
    
    this.players.forEach(player => {
      const scoreObj = roundScores.find(s => s.playerId === player.id);
      const score = scoreObj ? scoreObj.score : 0;
      player.roundScores.push(score);
      player.total += score;
    });
    
    this.continueVotes = {};
  }

  castContinueVote(playerId, wantsContinue) {
    if (this.phase !== 'vote') return { error: 'Not in vote phase' };
    
    if (this.continueVotes[playerId] !== undefined) {
      return { error: 'Already voted' };
    }
    
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { error: 'Player not found' };
    
    this.continueVotes[playerId] = wantsContinue;
    
    const connectedPlayers = this.players.filter(p => p.connected);
    const allVoted = connectedPlayers.every(p => this.continueVotes[p.id] !== undefined);
    
    if (allVoted) {
      const anyoneWantsContinue = Object.values(this.continueVotes).some(v => v === true);
      
      if (!anyoneWantsContinue) {
        this.phase = 'ended';
      } else {
        this.phase = 'scoreboard';
        this.viewingScoreboard.clear();
      }
    }
    
    return { success: true };
  }

  readyForNextRound(playerId) {
    if (this.phase !== 'scoreboard') return { error: 'Not in scoreboard phase' };
    
    this.viewingScoreboard.add(playerId);
    
    const connectedPlayers = this.players.filter(p => p.connected);
    const allReady = connectedPlayers.every(p => this.viewingScoreboard.has(p.id));
    
    if (allReady) {
      this.startNewRound();
    }
    
    return { success: true };
  }

  getWinners() {
    if (this.players.length === 0) return [];
    
    const maxScore = Math.max(...this.players.map(p => p.total));
    return this.players.filter(p => p.total === maxScore);
  }

  getState(playerId = null) {
    return {
      roomCode: this.roomCode,
      host: this.host,
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
          roundScores: p.roundScores,
          total: p.total
        };
      }),
      phase: this.phase,
      roundNumber: this.roundNumber,
      cardsThisRound: this.cardsThisRound,
      trump: this.trump,
      trumpSelectPlayerId: this.trumpSelectPlayerId,
      guessingCursor: this.guessingCursor,
      currentTrick: this.currentTrick,
      trickLeaderIndex: this.trickLeaderIndex,
      lastTrickWinner: this.lastTrickWinner,
      completedTrick: this.completedTrick,
      continueVotes: this.continueVotes,
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
    this.viewingScoreboard.clear();
    this.lastTrickWinner = null;
    this.completedTrick = null;
    
    this.players.forEach(player => {
      player.hand = [];
      player.guess = null;
      player.tricks = 0;
      player.roundScores = [];
      player.total = 0;
      player.connected = true;
    });
    
    // Clear all disconnection timeouts
    this.disconnectedPlayers.forEach((timeout) => {
      clearTimeout(timeout);
    });
    this.disconnectedPlayers.clear();
    
    this.recalculateX();
  }
}

module.exports = Game;