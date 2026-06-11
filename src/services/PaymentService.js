import { logger } from "../core/logger.js";
import User from "../models/UserModel.js";

class PaymentService {
  /**
   * Scans for users whose Pro subscriptions have expired and updates their status.
   * Runs via cron job in index.js
   */
  static async expirePendingPayments() {
    try {
      const now = new Date();
      
      // Find users whose subscription is active but expiry date has passed
      const expiredUsers = await User.find({
        subscriptionStatus: "active",
        proExpiresAt: { $lt: now }
      }, { _id: 1 }).lean();

      if (expiredUsers.length === 0) {
        return { expired: 0 };
      }

      const userIds = expiredUsers.map(u => u._id);
      
      // Bulk update users to 'expired' and revoke Pro status
      const result = await User.updateMany(
        { _id: { $in: userIds } },
        { 
          $set: { 
            subscriptionStatus: "expired",
            isPro: false 
          } 
        }
      );

      logger.info(`[PaymentService] Expired ${result.modifiedCount} subscriptions`, {
        userIds
      });

      return { expired: result.modifiedCount };
    } catch (err) {
      logger.error("[PaymentService] Failed to expire subscriptions", {
        message: err.message,
        stack: err.stack
      });
      throw err;
    }
  }
}

export default PaymentService;
