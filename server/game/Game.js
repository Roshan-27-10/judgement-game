const { deal, getCardsForRound, getLegalCards, cardCompare } = require('./Deck');
const { scoreRound } = require('./scoring');

class Game {
  constructor(roomCode, customX = null) {
    this.roomCode = roomCode;
    this.host = null;
    this.players = [];
    this.phase = 'lobby';
    this.roundNumber = 0;
    this.customX = customX; // Store custom X if provided
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
    this.lastTrickWinner = null; // Add this line
    this.completedTrick = null; // Add this line
  }

  recalculateX() {
    if (this.customX) {
      // Use custom X if set, but cap at 52 / players
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
    const index = this.players.findIndex(p => p.id === socketId);
    if (index === -1) return null;
    
    const removed = this.players[index];
    this.players.splice(index, 1);
    
    if (this.host === socketId && this.players.length > 0) {
      this.host = this.players[0].id;
    }
    
    this.recalculateX();
    
    // If game in progress, mark as disconnected
    if (this.phase !== 'lobby') {
      removed.connected = false;
    }
    
    return removed;
  }

  startNewRound() {
    this.roundNumber++;
    this.cardsThisRound = getCardsForRound(this.x, this.roundSequenceIndex);
    this.roundSequenceIndex++;
    
    // Reset round state
    this.phase = 'guessing';
    this.guesses = {};
    this.trump = null;
    this.trumpSelectPlayerId = null;
    this.tricksWon = {};
    this.currentTrick = [];
    
    // Deal cards
    const hands = deal(this.players.length, this.cardsThisRound);
    this.players.forEach((player, i) => {
      player.hand = hands[i];
      player.guess = null;
      player.tricks = 0;
    });
    
    // Set starting player for guessing
    if (this.roundNumber === 1) {
      this.startPlayerIndex = Math.floor(Math.random() * this.players.length);
    } else {
      // Player to the left of the previous round's first guesser
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
    
    // Store in guesses object
    this.guesses[playerId] = guess;
    
    // ALSO update the player's guess property
    const player = this.players[playerIndex];
    player.guess = guess;
    
    // Move to next player
    this.guessingCursor = (this.guessingCursor + 1) % this.players.length;
    
    // Check if all players have guessed
    const allGuessed = this.players.every(p => p.guess !== null);
    
    if (allGuessed) {
      this.startTrumpSelection();
    }
    
    return { success: true };
  }

  startTrumpSelection() {
    this.phase = 'trump_select';
    
    // Find highest guesser (earliest clockwise from start player breaks ties)
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
    
    // Find the card in player's hand
    const cardIndex = player.hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
    if (cardIndex === -1) return { error: 'Card not in hand' };
    
    // Check if legal
    const ledSuit = this.currentTrick.length > 0 ? this.currentTrick[0].card.suit : null;
    const legalCards = getLegalCards(player.hand, ledSuit);
    const isLegal = legalCards.some(c => c.rank === card.rank && c.suit === card.suit);
    
    if (!isLegal) return { error: 'Must follow suit if possible' };
    
    // Play the card
    player.hand.splice(cardIndex, 1);
    this.currentTrick.push({ playerId, card });
    
    // Check if trick is complete
    if (this.currentTrick.length === this.players.length) {
      // Store completed trick before resolving
      this.completedTrick = [...this.currentTrick];
      const trickToResolve = [...this.currentTrick];
      this.currentTrick = []; // Clear immediately
      
      // Use setTimeout to allow UI to show the completed trick
      setTimeout(() => {
        this.resolveTrick(trickToResolve);
        this.completedTrick = null;
      }, 1500); // 1.5 second delay
    }
    
    return { success: true };
  }

  resolveTrick(trick) {
    // Determine winner from the passed trick
    const ledSuit = trick[0].card.suit;
    let winningPlay = trick[0];
    
    for (let i = 1; i < trick.length; i++) {
      const play = trick[i];
      if (cardCompare(play.card, winningPlay.card, this.trump, ledSuit) > 0) {
        winningPlay = play;
      }
    }
    
    // Award trick
    const winnerId = winningPlay.playerId;
    this.tricksWon[winnerId] = (this.tricksWon[winnerId] || 0) + 1;
    
    // Update the player's tricks count
    const winnerPlayer = this.players.find(p => p.id === winnerId);
    if (winnerPlayer) {
      winnerPlayer.tricks = this.tricksWon[winnerId];
    }
    
    // Store last trick winner for UI
    this.lastTrickWinner = {
      playerId: winnerId,
      playerName: winnerPlayer.name
    };
    
    // Set next leader
    this.trickLeaderIndex = this.players.findIndex(p => p.id === winnerId);
    
    // Check if round is over
    const allCardsPlayed = this.players.every(p => p.hand.length === 0);
    
    if (allCardsPlayed) {
      this.endRound();
    }
  }

  endRound() {
    this.phase = 'vote';
    
    // Calculate scores
    const roundScores = scoreRound(this.players, this.guesses, this.tricksWon);
    
    // Update player totals
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
    // If playerId is provided, return their actual hand
    // Otherwise return masked hands for other players
    
    return {
      roomCode: this.roomCode,
      host: this.host,
      players: this.players.map(p => {
        // Determine what cards to show this player
        let handToShow;
        if (!playerId) {
          // No specific player - mask all hands
          handToShow = p.hand.map(() => ({ rank: '?', suit: '?' }));
        } else if (p.id === playerId) {
          // This is the requesting player - show real hand
          handToShow = p.hand;
        } else {
          // Other player - show masked hand
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
      lastTrickWinner: this.lastTrickWinner, // Add this line
      completedTrick: this.completedTrick, // Add this line
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
    
    // Reset player stats
    this.players.forEach(player => {
      player.hand = [];
      player.guess = null;
      player.tricks = 0;
      player.roundScores = [];
      player.total = 0;
    });
    
    this.recalculateX();
  }
}

module.exports = Game;