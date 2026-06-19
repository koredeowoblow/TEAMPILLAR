/**
 * subject.dto.js
 *
 * Controls what Subject data leaves the API.
 * The `metadata` field is a freeform Object — we whitelist known keys
 * rather than spreading the whole thing.
 */

/**
 * Public subject shape.
 * Use in: PracticeController.getSubjects, and any admin subject routes.
 */
export function toSubjectDTO(subject) {
  if (!subject) return null;
  const s = subject.toObject ? subject.toObject() : subject;
  const rawId = s._id || s.id;

  return {
    id:            rawId ? String(rawId) : undefined,
    name:          s.name,
    code:          s.code,
    description:   s.description ?? null,
    questionCount: s.questionCount ?? 0,
    isActive:      s.isActive ?? true,
    createdAt:     s.createdAt,
  };
  // NEVER include: raw metadata object
}

/**
 * Admin subject shape — includes metadata for management.
 * Use in: admin subject management routes only.
 */
export function toAdminSubjectDTO(subject) {
  if (!subject) return null;
  const base = toSubjectDTO(subject);
  const s    = subject.toObject ? subject.toObject() : subject;

  return {
    ...base,
    metadata:  s.metadata ?? {},
    updatedAt: s.updatedAt,
  };
}