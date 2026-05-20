export function getResultTone(status = '', playerSide = '', result = null) {
  if (!status) return '';

  if (/draw|stalemate|repetition|insufficient/i.test(status)) {
    return 'draw';
  }

  const resultWinner = typeof result?.winner === 'string' ? result.winner : '';
  const statusWinner = status.match(/\b(white|black)\s+won\b/i)?.[1] || '';
  const winner = (resultWinner || statusWinner).toLowerCase();
  const side = String(playerSide || '').toLowerCase();

  if (winner && side) {
    return winner === side ? 'win' : 'loss';
  }

  return /won/i.test(status) ? 'win' : 'draw';
}
