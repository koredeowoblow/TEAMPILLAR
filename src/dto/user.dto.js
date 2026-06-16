/**
 * user.dto.js
 *
 * Controls exactly what User data leaves the API.
 * Never include: password, googleId, appleId, __v, tokenHash
 */

/**
 * Public-facing user shape.
 * Use this in: register, login, getProfile, verifyEmail, updateOnboarding,
 * createOrUpdateProfile, deleteProfile, and any student-facing endpoint
 * that returns a user object.
 */
export function toUserDTO(user) {
  if (!user) return null;
  const u = user.toObject ? user.toObject() : user;

  return {
    id:            String(u._id),
    name:          u.name ?? null,
    username:      u.username ?? null,
    email:         u.email,
    photo:         u.photoUrl ?? u.photo ?? null,
    language:      u.language,
    role:          u.role,
    isPro:         u.subscriptionStatus === "active" || u.subscriptionStatus === "paid",
    emailVerified: u.emailVerified ?? false,
    onboarding:    u.onboarding ?? {},
    stats:         u.stats ?? {},
    notificationPreferences: u.notificationPreferences ?? {},
    privacySettings: u.privacySettings ?? {},
    subscriptionStatus: u.subscriptionStatus || "free",
    proExpiresAt:  u.proExpiresAt ?? null,
    isActive:      u.isActive !== false,
    createdAt:     u.createdAt,
  };
  // NEVER include: password, googleId, appleId, isAdmin, __v, updatedAt
}

/**
 * Admin-facing user shape.
 * Use this ONLY in admin-gated routes:
 * getAllUsers, getUserById (admin), adminUpdateUser, toggleAdminStatus,
 * AdminController.getStudent, AdminController.listStudents
 */
export function toAdminUserDTO(user) {
  if (!user) return null;
  const u = user.toObject ? user.toObject() : user;

  return {
    ...toUserDTO(user),
    isAdmin:   u.isAdmin ?? false,
    updatedAt: u.updatedAt,
  };
}

/**
 * Minimal user shape for embedding inside other DTOs.
 * Use when a user ref is nested (e.g. createdBy inside ExamDTO).
 */
export function toUserRefDTO(user) {
  if (!user) return null;
  const u = user.toObject ? user.toObject() : user;

  return {
    id:   String(u._id),
    name: u.name ?? null,
  };
}