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

  const userObj = l.user || (l.userId && typeof l.userId === 'object' ? l.userId : null);
  
  const isPrivate = userObj?.privacySettings?.profileVisibility === 'private';
  
  return {
    id: String(l._id || l.id || Math.random().toString(36).substr(2, 9)),
    user_id: userObj ? String(userObj._id) : String(l.userId),
    userName: isPrivate ? "Hidden Scholar" : (userObj ? (userObj.firstName ? `${userObj.firstName} ${userObj.lastName}` : userObj.name || userObj.username) : "Student"),
    userPhoto: isPrivate ? null : (userObj ? (userObj.photoUrl || userObj.profilePicture || userObj.photo) : null),
    score: l.score,
    rank: l.rank || 0,
    updated_at: l.updatedAt,
  };
}
