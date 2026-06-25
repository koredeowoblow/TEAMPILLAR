export function calculateExamTime({ type, questions }) {
  if (type === 'mock' || type === 'smart-mock') return 7200; // 2 hours strictly
  
  let total = 0;
  for (const q of questions) {
    const diff = (q.metadata?.difficulty || q.difficulty || 'medium').toLowerCase();
    if (diff === 'easy') total += 60;
    else if (diff === 'hard') total += 120;
    else total += 90; // medium default
  }
  
  return Math.min(3600, Math.max(300, total)); // Cap min 5m, max 60m
}
