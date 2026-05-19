export function toAchievementDTO(achievement) {
  if (!achievement) return null;
  const a = achievement.toObject ? achievement.toObject() : achievement;

  return {
    id: String(a._id),
    user_id: String(a.userId),
    title: a.title,
    completed: a.completed,
    created_at: a.createdAt,
  };
}

export function toStreakDTO(streak) {
  if (!streak) return null;
  const s = streak.toObject ? streak.toObject() : streak;

  return {
    id: String(s._id),
    user_id: String(s.userId),
    streak_count: s.streakCount,
    updated_at: s.updatedAt,
  };
}

export function toLeaderboardDTO(entry) {
  if (!entry) return null;
  const l = entry.toObject ? entry.toObject() : entry;

  return {
    id: String(l._id),
    user_id: String(l.userId),
    score: l.score,
    rank: l.rank || 0,
    updated_at: l.updatedAt,
  };
}
