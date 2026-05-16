import Subject from "../models/SubjectModel.js";
import mongoose from "mongoose";
import { AppError } from "./AppError.js";

/**
 * Resolve subject identifier (name, code, or ObjectId) to a valid MongoDB ObjectId
 * @param {string} identifier - Subject name, code, or ObjectId
 * @returns {Promise<ObjectId>} Valid MongoDB ObjectId
 */
export async function resolveSubjectId(identifier) {
  if (!identifier) {
    throw new AppError("Subject identifier is required", 400);
  }

  // If already a valid ObjectId, return as-is
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    return new mongoose.Types.ObjectId(identifier);
  }

  const escapedIdentifier = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Try to find by name (case-insensitive), code, or partial match
  // First try exact or partial matches (case-insensitive)
  let subject = await Subject.findOne({
    $or: [
      { name: { $regex: `^${escapedIdentifier}$`, $options: "i" } },
      { code: { $regex: `^${escapedIdentifier}$`, $options: "i" } },
      { name: { $regex: escapedIdentifier, $options: "i" } },
    ],
  });

  if (!subject) {
    // Normalize common variations (singular/plural, shorthand)
    const norm = identifier
      .toLowerCase()
      .replace(/[\s\-_]+/g, " ")
      .trim();
    const withoutTrailingS = norm.replace(/s$/i, "");
    const escapedNorm = withoutTrailingS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Try looser match using normalized tokens
    subject = await Subject.findOne({
      $or: [
        { name: { $regex: escapedNorm, $options: "i" } },
        { code: { $regex: escapedNorm, $options: "i" } },
      ],
    });
  }

  if (!subject) {
    throw new AppError(`Subject "${identifier}" not found`, 404);
  }

  return subject._id;
}
