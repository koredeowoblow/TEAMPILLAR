import NotificationService from "../services/NotificationService.js";
import { sendSuccess } from "../core/response.js";

class NotificationController {
  // GET /notifications
  static async list(req, res) {
    const userId = req.user.id;
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const unreadOnly = req.query.unread === "true";

    const result = await NotificationService.list(userId, { page, limit, unreadOnly });
    return sendSuccess(res, { message: "Notifications retrieved", data: result, statusCode: 200 });
  }

  // GET /notifications/unread-count
  static async unreadCount(req, res) {
    const result = await NotificationService.unreadCount(req.user.id);
    return sendSuccess(res, { message: "Unread count retrieved", data: result, statusCode: 200 });
  }

  // PATCH /notifications/:id/read
  static async markRead(req, res) {
    const result = await NotificationService.markRead(req.user.id, req.params.id);
    return sendSuccess(res, { message: "Notification marked as read", data: result, statusCode: 200 });
  }

  // PATCH /notifications/mark-all-read
  static async markAllRead(req, res) {
    const result = await NotificationService.markAllRead(req.user.id);
    return sendSuccess(res, { message: "All notifications marked as read", data: result, statusCode: 200 });
  }

  // DELETE /notifications/:id
  static async deleteOne(req, res) {
    const result = await NotificationService.deleteOne(req.user.id, req.params.id);
    return sendSuccess(res, { message: "Notification deleted", data: result, statusCode: 200 });
  }

  // DELETE /notifications
  static async deleteAll(req, res) {
    const result = await NotificationService.deleteAll(req.user.id);
    return sendSuccess(res, { message: "All notifications cleared", data: result, statusCode: 200 });
  }
}

export default NotificationController;
