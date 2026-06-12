import User from "../models/UserModel.js";
import { AppError } from "../utils/AppError.js";

class FreemiumGuard {
  static LIMITS = {
    free: {
      dailyAIExplanations: 10,
      subjects: 2,
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
    if (user.subscription === "pro" ||
      user.isPro === true ||
      user.subscriptionStatus === "active" ||
      ["ADMIN", "TUTOR"].includes(user.role)) return;

    const limit = this.LIMITS.free.dailyAIExplanations;
    const now = new Date();
    const lastReset = new Date(user.limits.lastAIReset || now);

    // Reset counter if it's a new day (UTC)
    const isNewDay =
      now.getUTCFullYear() !== lastReset.getUTCFullYear() ||
      now.getUTCMonth() !== lastReset.getUTCMonth() ||
      now.getUTCDate() !== lastReset.getUTCDate();

    let currentCount = isNewDay ? 0 : user.limits.dailyAICount;

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
    user.limits.dailyAICount = currentCount + 1;
    user.limits.lastAIReset = now;
    await user.save();
  }

  /**
   * Check mock test limit
   * @param {Object} user - User document
   * @returns {Promise<void>}
   */
  static async checkMockTest(user) {
    if (user.subscription === "pro" ||
      user.isPro === true ||
      user.subscriptionStatus === "active" ||
      ["ADMIN", "TUTOR"].includes(user.role)) return;

    const limit = this.LIMITS.free.mockTests;
    const totalTests = user.limits?.totalMockTests || 0;

    if (totalTests >= limit) {
      throw new AppError(`Lifetime free mock test limit reached (${totalTests}/${limit}). Upgrade to Pro for unlimited exams!`, 403, {
        code: "LIMIT_REACHED",
        used: totalTests,
        limit: limit,
      });
    }
  }

  static async incrementMockTest(user) {
    if (user.subscription === "pro" ||
      user.isPro === true ||
      user.subscriptionStatus === "active" ||
      ["ADMIN", "TUTOR"].includes(user.role)) return;

    if (!user.limits) user.limits = { totalMockTests: 0 };
    user.limits.totalMockTests = (user.limits.totalMockTests || 0) + 1;
    await user.save();
  }

  /**
   * Check subject limit
   * @param {number} count - Number of subjects being selected
   * @param {string} subscription - User subscription tier
   * @returns {void}
   */
  static checkSubjectLimit(count, user) {
    if (user?.subscription === "pro" ||
      user?.isPro === true ||
      user?.subscriptionStatus === "active" ||
      ["ADMIN", "TUTOR"].includes(user?.role)) return;

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
