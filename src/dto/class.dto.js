/**
 * class.dto.js
 *
 * Controls what Class data leaves the API.
 * The ClassModel has a freeform `metadata` object — we deliberately
 * pick only the safe, known keys rather than spreading the whole thing.
 */

/**
 * Public / admin class list shape.
 * Use in: ClassesController.list, ClassesController.get
 */
export function toClassDTO(classDoc) {
  if (!classDoc) return null;
  const c = classDoc.toObject ? classDoc.toObject() : classDoc;
  const meta = c.metadata || {};

  // Extract the known safe keys from metadata
  const subjects     = Array.isArray(meta.subjects)   ? meta.subjects   : [];
  const studentCount = Array.isArray(meta.studentIds)
    ? meta.studentIds.length
    : Number(meta.studentCount || 0);
  const performance  = Math.min(Math.max(Number(meta.performance || 0), 0), 100);

  return {
    id:           String(c._id),
    name:         c.name ?? "",
    description:  c.description ?? "",
    grade:        c.grade ?? "",
    teacherId:    c.teacherId ? String(c.teacherId) : null,
    subjects,
    studentCount,
    performance,
    createdAt:    c.createdAt,
  };
  // NEVER include: raw metadata object (contains studentIds array with PII)
}

/**
 * Admin-only class shape — includes raw metadata for management UIs.
 * Use in: admin class management routes only.
 */
export function toAdminClassDTO(classDoc) {
  if (!classDoc) return null;
  const base = toClassDTO(classDoc);
  const c    = classDoc.toObject ? classDoc.toObject() : classDoc;

  return {
    ...base,
    metadata:  c.metadata ?? {},
    updatedAt: c.updatedAt,
  };
}