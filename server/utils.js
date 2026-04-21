// Generate 4-letter uppercase room code
function generateRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I,O (confusing)
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }
  return code;
}

module.exports = { generateRoomCode };