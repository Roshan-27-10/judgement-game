function scoreRound(players, guesses, tricksWon) {
  const roundScores = [];
  
  for (const player of players) {
    const guess = guesses[player.id] || 0;
    const tricks = tricksWon[player.id] || 0;
    let score = 0;
    
    if (guess === 0 && tricks === 0) {
      score = 1;
    } else if (guess === tricks) {
      score = tricks;
    } else {
      score = -Math.abs(guess - tricks);
    }
    
    roundScores.push({
      playerId: player.id,
      score: score
    });
  }
  
  return roundScores;
}

module.exports = { scoreRound };