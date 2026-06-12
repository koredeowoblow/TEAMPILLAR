import Notification from "../models/NotificationModel.js";
import { AppError } from "../utils/AppError.js";

class NotificationService {
  // ─── CREATE ────────────────────────────────────────────────────────────────
  /**
   * Create a notification for a user.
   * Can be called from any service (e.g. AchievementService, PracticeService).
   */
  static async create({ userId, type = "system", title, message, meta = {} }) {
    if (!userId || !title || !message) {
      throw new AppError("userId, title, and message are required", 400);
    }
    return await Notification.create({ userId, type, title, message, meta });
  }

  // ─── LIST ──────────────────────────────────────────────────────────────────
  /**
   * Fetch paginated notifications for a user, newest first.
   * Optionally filter by read/unread.
   */
  static async list(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
    const skip = (page - 1) * limit;
    const filter = { userId };
    if (unreadOnly) filter.isRead = false;

    const promises = [
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
    ];

    if (!unreadOnly) {
      promises.push(Notification.countDocuments({ userId, isRead: false }));
    }

    const results = await Promise.all(promises);
    const notifications = results[0];
    const total = results[1];
    const unreadCount = unreadOnly ? total : results[2];

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      unreadCount,
    };
  }

  // ─── MARK ONE AS READ ──────────────────────────────────────────────────────
  static async markRead(userId, notificationId) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { isRead: true, readAt: new Date() },
      { new: true },
    );
    if (!notification) throw new AppError("Notification not found", 404);
    return notification;
  }

  // ─── MARK ALL AS READ ─────────────────────────────────────────────────────
  static async markAllRead(userId) {
    const result = await Notification.updateMany(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return { updated: result.modifiedCount };
  }

  // ─── UNREAD COUNT ─────────────────────────────────────────────────────────
  static async unreadCount(userId) {
    const count = await Notification.countDocuments({ userId, isRead: false });
    return { unreadCount: count };
  }

  // ─── DELETE ONE ───────────────────────────────────────────────────────────
  static async deleteOne(userId, notificationId) {
    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      userId,
    });
    if (!notification) throw new AppError("Notification not found", 404);
    return { deleted: true };
  }

  // ─── DELETE ALL FOR USER ──────────────────────────────────────────────────
  static async deleteAll(userId) {
    const result = await Notification.deleteMany({ userId });
    return { deleted: result.deletedCount };
  }
}

export default NotificationService;
