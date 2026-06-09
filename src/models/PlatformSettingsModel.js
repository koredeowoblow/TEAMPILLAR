import mongoose from "mongoose";

/**
 * PlatformSettings — single-document store for admin-controlled platform config.
 * The document is seeded with defaults on first read by AdminService.getSettings().
 */
const PlatformSettingsSchema = new mongoose.Schema(
  {
    /* Notification alert flags */
    lowPerformanceAlerts: { type: Boolean, default: true },
    weeklyReports:        { type: Boolean, default: true },

    /* Security */
    twoFactorEnabled: { type: Boolean, default: false },

    /* Institution profile */
    institutionName:    { type: String, default: "" },
    institutionAddress: { type: String, default: "" },
    institutionLogoUrl: { type: String, default: null },

    /* System / maintenance */
    maintenanceMode:    { type: Boolean, default: false },
    maintenanceBanner:  { type: String,  default: "" },

    /* Broadcast / announcement */
    lastAnnouncementText:     { type: String, default: "" },
    lastAnnouncementSentAt:   { type: Date,   default: null },
  },
  { timestamps: true },
);

export default mongoose.model("PlatformSettings", PlatformSettingsSchema);
