# Judgement Card Game

A multiplayer online implementation of the classic Judgement (also known as Oh Hell!) card game.

## Features
- Create or join rooms with 4-letter codes
- Customizable max cards per round
- Real-time multiplayer gameplay
- Score tracking across rounds
- Host controls for new games
- Disconnected players can rejoin with their saved browser session
- New players can join while a round is running and will start from the next round
- Players can vote to restart the current round; once a majority votes yes, the host can restart and redistribute cards
- Players can vote to end the game; once a majority votes yes, the host can end it
- Any player can leave the room voluntarily after an in-game confirmation with Confirm Leave / Back to Game
- Host can start a kick vote; once a majority of eligible connected players vote yes, the host can kick that player
- The UI always shows whose chance it is to guess, select trump, or play
- Player hands use the clean original suit-row grouping view
- Leave-room, restart, kick, and end-game controls are tucked into a collapsible Game Options sidebar

## How to Play
1. Enter your name
2. Create a room or join with a room code
3. Wait for players (minimum 2)
4. Host starts the game
5. Each round: make your guess, select trump (highest guesser), play cards
6. Score points for correct guesses, lose points for incorrect ones
7. If someone refreshes/disconnects, they can reopen the same browser and rejoin their seat/hand automatically
8. If a new player joins during Round X, they wait as a spectator and receive cards from Round X+1
9. During an active round, connected players can vote to restart. If a majority votes yes, the host can restart that same round; any waiting new players are included immediately and cards are redistributed
10. During the game, use the Game Options button to open the sidebar for leave-room, restart, kick, and end-game controls
11. Connected players can vote to end the game. If a majority votes yes, the host can click End Game; an unfinished current round is not scored
12. Any player can open Game Options and click Leave Room, then choose Confirm Leave or Back to Game. If they confirm and were active in the current round, the round is safely restarted and cards are redistributed to remaining players
13. Host can start a kick vote against a non-host player. The target cannot vote on their own kick. After majority yes votes, the host clicks Kick Player. If the kicked player was active in the current round, that round restarts and cards are redistributed
14. Your hand is shown in the clean original suit-row layout, with cards sorted high-to-low inside each suit

## Setup
```bash
npm install
npm start
```
Server runs on port 3000.
### Player needed-count display

The separate **Round Guesses** panel has been removed. During a round, each active player's tile now shows only how many more tricks they need beside their name using the `🎯` icon. For example, `🎯 3` means that player needs 3 more tricks to meet their guess.
