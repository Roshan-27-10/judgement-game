const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['clubs', 'hearts', 'spades', 'diamonds'];
const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function deal(numPlayers, cardsPerPlayer) {
  const deck = shuffle(createDeck());
  const hands = [];
  
  for (let i = 0; i < numPlayers; i++) {
    const start = i * cardsPerPlayer;
    const end = start + cardsPerPlayer;
    hands.push(deck.slice(start, end));
  }
  
  return hands;
}

function rankValue(rank) {
  return RANK_ORDER.indexOf(rank);
}

function getCardsForRound(x, sequenceIndex) {
  // If x is 1, always deal 1 card
  if (x === 1) {
    return 1;
  }
  
  // Generate the full sequence for this x
  const sequence = [];

  // Descending: x down to 1
  for (let i = x; i >= 1; i--) {
    sequence.push(i);
  }
  
  // Ascending: 1 to x
  for (let i = 1; i <= x; i++) {
    sequence.push(i);
  }
  
  // Cycle through the sequence
  return sequence[sequenceIndex % sequence.length];
}

function cardCompare(cardA, cardB, trump, ledSuit) {
  const aIsTrump = cardA.suit === trump;
  const bIsTrump = cardB.suit === trump;
  
  // Trump beats non-trump
  if (aIsTrump && !bIsTrump) return 1;
  if (!aIsTrump && bIsTrump) return -1;
  
  // Both are trump - higher rank wins
  if (aIsTrump && bIsTrump) {
    return rankValue(cardA.rank) - rankValue(cardB.rank);
  }
  
  // Neither is trump
  const aFollowsLed = cardA.suit === ledSuit;
  const bFollowsLed = cardB.suit === ledSuit;
  
  // Card that follows led suit beats card that doesn't
  if (aFollowsLed && !bFollowsLed) return 1;
  if (!aFollowsLed && bFollowsLed) return -1;
  
  // Both follow led suit or both don't (though both shouldn't be off-suit unless they had no choice)
  // Compare ranks
  return rankValue(cardA.rank) - rankValue(cardB.rank);
}

function getLegalCards(hand, ledSuit) {
  if (!ledSuit) return hand; // Leading - any card is legal
  
  const sameSuit = hand.filter(c => c.suit === ledSuit);
  return sameSuit.length > 0 ? sameSuit : hand;
}

module.exports = {
  createDeck,
  shuffle,
  deal,
  rankValue,
  getCardsForRound,
  cardCompare,
  getLegalCards,
  RANKS,
  SUITS
};