import { AppError } from "../utils/AppError.js";
import { userRepository } from "../repository/UserRepository.js";
import CloudinaryService from "./CloudinaryService.js";

const ALLOWED_PROFILE_FIELDS = ["name", "username", "email", "language"];
const NOTIFICATION_FIELDS = [
  "emailNotifications",
  "examReminders",
  "resultAlerts",
  "productUpdates",
];
const PRIVACY_FIELDS = ["profileVisibility", "showEmail", "showStats", "dataSharing"];

class SettingsService {
  static normalizeUsername(username) {
    return String(username || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  static async getSettings(userId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    return {
      profile: {
        name: user.name ?? null,
        username: user.username ?? null,
        email: user.email,
        photo: user.photoUrl ?? user.photo ?? null,
      },
      notificationPreferences: user.notificationPreferences ?? {},
      privacySettings: user.privacySettings ?? {},
      subscription: SettingsService.buildSubscription(user),
      account: {
        isActive: user.isActive !== false,
        deactivatedAt: user.deactivatedAt ?? null,
        emailVerified: user.emailVerified ?? false,
      },
    };
  }

  static buildSubscription(user) {
    const now = new Date();
    const expiresAt = user.proExpiresAt ? new Date(user.proExpiresAt) : null;
    let status = user.subscriptionStatus || (user.isPro ? "active" : "free");

    if (user.isPro && expiresAt && expiresAt < now) {
      status = "expired";
    }

    return {
      plan: user.isPro ? "pro" : "free",
      status,
      isPro: user.isPro ?? false,
      expiresAt,
    };
  }

  static async updateProfile(userId, updates) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    const payload = {};

    for (const field of ALLOWED_PROFILE_FIELDS) {
      if (updates[field] !== undefined) {
        payload[field] = updates[field];
      }
    }

    if (payload.username !== undefined) {
      const username = SettingsService.normalizeUsername(payload.username);
      if (username.length < 3) {
        throw new AppError("Username must be at least 3 characters", 400);
      }
      if (!/^[a-z0-9_]+$/.test(username)) {
        throw new AppError("Username may only contain letters, numbers, and underscores", 400);
      }
      const existing = await userRepository.findOne({ username });
      if (existing && String(existing._id) !== String(userId)) {
        throw new AppError("Username already taken", 400);
      }
      payload.username = username;
    }

    if (payload.email !== undefined) {
      const email = String(payload.email).trim().toLowerCase();
      const existing = await userRepository.findByEmail(email);
      if (existing && String(existing._id) !== String(userId)) {
        throw new AppError("Email already registered", 400);
      }
      payload.email = email;
      if (email !== user.email) {
        payload.emailVerified = false;
        payload.emailVerifiedAt = null;
      }
    }

    if (Object.keys(payload).length === 0) {
      throw new AppError("No valid profile fields to update", 400);
    }

    return userRepository.updateUser(userId, payload);
  }

  static async updatePhoto(userId, fileBuffer) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    const existingPhoto = user.photoUrl || user.photo;
    if (existingPhoto) {
      await CloudinaryService.deleteIfCloudinary(existingPhoto);
    }

    const { url } = await CloudinaryService.upload(fileBuffer, {
      folder: "Team_Pillar/profiles",
    });

    return userRepository.updateUser(userId, { photoUrl: url });
  }

  static async removePhoto(userId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    const existingPhoto = user.photoUrl || user.photo;
    if (existingPhoto) {
      await CloudinaryService.deleteIfCloudinary(existingPhoto);
    }

    return userRepository.updateUser(userId, { photoUrl: null, photo: null });
  }

  static async updateNotificationPreferences(userId, preferences) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    const next = { ...(user.notificationPreferences?.toObject?.() ?? user.notificationPreferences ?? {}) };
    for (const field of NOTIFICATION_FIELDS) {
      if (preferences[field] !== undefined) {
        next[field] = Boolean(preferences[field]);
      }
    }

    return userRepository.updateUser(userId, { notificationPreferences: next });
  }

  static async updatePrivacySettings(userId, settings) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    const next = { ...(user.privacySettings?.toObject?.() ?? user.privacySettings ?? {}) };
    for (const field of PRIVACY_FIELDS) {
      if (settings[field] !== undefined) {
        next[field] = settings[field];
      }
    }

    if (next.profileVisibility && !["public", "private"].includes(next.profileVisibility)) {
      throw new AppError("profileVisibility must be public or private", 400);
    }

    return userRepository.updateUser(userId, { privacySettings: next });
  }

  static async deactivateAccount(userId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);
    if (user.isActive === false) {
      throw new AppError("Account is already deactivated", 400);
    }

    return userRepository.updateUser(userId, {
      isActive: false,
      deactivatedAt: new Date(),
    });
  }

  static async reactivateAccount(userId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);
    if (user.isActive !== false) {
      throw new AppError("Account is already active", 400);
    }

    return userRepository.updateUser(userId, {
      isActive: true,
      deactivatedAt: null,
    });
  }
}

export default SettingsService;
