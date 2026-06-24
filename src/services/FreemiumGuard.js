import User from "../models/UserModel.js";
import { AppError } from "../utils/AppError.js";
import { resolveUserTier } from "../middleware/entitlement.js";

class FreemiumGuard {
  static LIMITS = {
    free: {
      dailyAIExplanations: 10,
      subjects: 6,
      mockTests: 5,
      offlineMode: false,
      prioritySupport: false,
    },
    pro: {
      dailyAIExplanations: null, // Unlimited
      subjects: null, // Unlimited
      mockTests: null, // Unlimited
      offlineMode: true,
      prioritySupport: true,
    },
  };

  /**
   * Check and increment AI Explanation usage
   * @param {Object} user - User document
   * @returns {Promise<void>}
   */
  static async checkAIExplanation(user) {
    if (resolveUserTier(user) === "pro") return;

    const userId = user._id || user.id || user;
    const dbUser = await User.findById(userId);
    if (!dbUser) throw new AppError("User not found", 404);

    const limit = this.LIMITS.free.dailyAIExplanations;
    const now = new Date();
    const lastReset = new Date(dbUser.limits.lastAIReset || now);

    // Reset counter if it's a new day (UTC)
    const isNewDay =
      now.getUTCFullYear() !== lastReset.getUTCFullYear() ||
      now.getUTCMonth() !== lastReset.getUTCMonth() ||
      now.getUTCDate() !== lastReset.getUTCDate();

    let currentCount = isNewDay ? 0 : dbUser.limits.dailyAICount;

    if (currentCount >= limit) {
      const resetAt = new Date(now);
      resetAt.setUTCHours(24, 0, 0, 0); // Next midnight UTC

      throw new AppError("Daily AI Explanation limit reached", 403, {
        code: "LIMIT_REACHED",
        used: currentCount,
        limit: limit,
        resetAt: resetAt.toISOString(),
      });
    }

    // Increment and save
    dbUser.limits.dailyAICount = currentCount + 1;
    dbUser.limits.lastAIReset = now;
    await dbUser.save();
  }

  /**
   * Check mock test limit
   * @param {Object} user - User document
   * @returns {Promise<void>}
   */
  static async checkMockTest(user) {
    if (resolveUserTier(user) === "pro") return;

    const userId = user._id || user.id || user;
    const dbUser = await User.findById(userId).select("limits");
    if (!dbUser) return;

    const limit = this.LIMITS.free.mockTests;
    const totalTests = dbUser.limits?.totalMockTests || 0;

    if (totalTests >= limit) {
      throw new AppError(`Lifetime free mock test limit reached (${totalTests}/${limit}). Upgrade to Pro for unlimited exams!`, 403, {
        code: "LIMIT_REACHED",
        used: totalTests,
        limit: limit,
      });
    }
  }

  static async incrementMockTest(user) {
    if (resolveUserTier(user) === "pro") return;

    const userId = user._id || user.id || user;
    const dbUser = await User.findById(userId);
    if (!dbUser) return;

    if (!dbUser.limits) dbUser.limits = { totalMockTests: 0 };
    dbUser.limits.totalMockTests = (dbUser.limits.totalMockTests || 0) + 1;
    await dbUser.save();
  }

  /**
   * Check subject limit
   * @param {number} count - Number of subjects being selected
   * @param {string} subscription - User subscription tier
   * @returns {void}
   */
  static checkSubjectLimit(count, user) {
    if (resolveUserTier(user) === "pro") return;

    const limit = this.LIMITS.free.subjects;
    if (count > limit) {
      throw new AppError(`Free users can only select up to ${limit} subjects`, 403, {
        code: "LIMIT_REACHED",
        used: count,
        limit: limit,
      });
    }
  }
}

export default FreemiumGuard;
