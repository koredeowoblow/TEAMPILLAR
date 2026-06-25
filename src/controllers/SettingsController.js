import SettingsService from "../services/SettingsService.js";
import { sendSuccess } from "../core/response.js";
import { toUserDTO } from "../dto/index.js";
import { AppError } from "../utils/AppError.js";

class SettingsController {
  static async getSettings(req, res) {
    const data = await SettingsService.getSettings(req.user.id);
    return sendSuccess(res, {
      message: "Settings retrieved",
      data,
      statusCode: 200,
    });
  }

  static async updateProfile(req, res) {
    const user = await SettingsService.updateProfile(req.user.id, req.body);

    if (req.tokenHash) {
      const { invalidateCachedSessionUser } = await import("../utils/authSessionCache.js");
      await invalidateCachedSessionUser(req.tokenHash);
    }

    return sendSuccess(res, {
      message: "Profile updated",
      data: toUserDTO(user),
      statusCode: 200,
    });
  }

  static async uploadPhoto(req, res) {
    if (!req.file?.buffer) {
      throw new AppError("Photo file is required", 400);
    }

    const user = await SettingsService.updatePhoto(req.user.id, req.file.buffer);

    // Invalidate cache so the next /auth/me request gets the updated photo

    return sendSuccess(res, {
      message: "Profile photo updated",
      data: toUserDTO(user),
      statusCode: 200,
    });
  }

  static async removePhoto(req, res) {
    const user = await SettingsService.removePhoto(req.user.id);
    return sendSuccess(res, {
      message: "Profile photo removed",
      data: toUserDTO(user),
      statusCode: 200,
    });
  }

  static async updateNotifications(req, res) {
    const user = await SettingsService.updateNotificationPreferences(
      req.user.id,
      req.body,
    );
    return sendSuccess(res, {
      message: "Notification preferences updated",
      data: {
        notificationPreferences: user.notificationPreferences,
      },
      statusCode: 200,
    });
  }

  static async updatePrivacy(req, res) {
    const user = await SettingsService.updatePrivacySettings(req.user.id, req.body);
    return sendSuccess(res, {
      message: "Privacy settings updated",
      data: {
        privacySettings: user.privacySettings,
      },
      statusCode: 200,
    });
  }

  static async getSubscription(req, res) {
    const settings = await SettingsService.getSettings(req.user.id);
    return sendSuccess(res, {
      message: "Subscription retrieved",
      data: settings.subscription,
      statusCode: 200,
    });
  }

  static async deactivateAccount(req, res) {
    await SettingsService.deactivateAccount(req.user.id);
    return sendSuccess(res, {
      message: "Account deactivated. You can reactivate by logging in again.",
      data: {},
      statusCode: 200,
    });
  }

  static async reactivateAccount(req, res) {
    const user = await SettingsService.reactivateAccount(req.user.id);
    return sendSuccess(res, {
      message: "Account reactivated",
      data: toUserDTO(user),
      statusCode: 200,
    });
  }
}

export default SettingsController;
