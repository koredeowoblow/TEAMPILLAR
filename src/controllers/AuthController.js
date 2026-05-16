import AuthService from "../services/AuthService.js";
import CloudinaryService from "../services/CloudinaryService.js";
import { sendSuccess, sendError } from "../core/response.js";
import { AppError } from "../utils/AppError.js";

class AuthController {
  // Register
  static async register(req, res) {
    const user = await AuthService.register(req.body);
    return sendSuccess(res, {
      message: "User registered successfully",
      data: user,
      statusCode: 201,
    });
  }

  // Login
  static async login(req, res) {
    const { email, password } = req.body;
    const meta = {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    };
    const { user, token, refreshToken, expiresAt } = await AuthService.login(
      email,
      password,
      meta,
    );

    // Set HttpOnly cookie for refreshToken
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return sendSuccess(res, {
      message: "Login successful",
      data: { user, token, refreshToken, expiresAt },
      statusCode: 200,
    });
  }

  // Refresh Token
  static async refreshToken(req, res) {
    // Parse cookies manually or from req.cookies if middleware exists
    const cookies = req.headers.cookie
      ?.split(";")
      .reduce((acc, cookie) => {
        const [key, value] = cookie.split("=").map((c) => c.trim());
        acc[key] = value;
        return acc;
      }, {}) || {};

    const refreshTokenValue = cookies.refreshToken || req.body.refreshToken;

    if (!refreshTokenValue) {
      return sendError(res, {
        message: "Refresh token is required",
        statusCode: 401,
      });
    }

    const result = await AuthService.refreshToken(refreshTokenValue);
    
    // If a new refresh token was generated, update the cookie
    if (result.refreshToken) {
      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }

    return sendSuccess(res, {
      message: "Token refreshed successfully",
      data: result,
      statusCode: 200,
    });
  }

  // Logout
  static async logout(req, res) {
    const token = req.headers.authorization?.split(" ")[1];
    if (token) {
      await AuthService.logout(token);
    }
    
    // Clear HttpOnly cookie
    res.clearCookie("refreshToken");
    
    return sendSuccess(res, {
      message: "Logged out successfully",
      data: {},
      statusCode: 200,
    });
  }

  // Forgot Password — send token
  static async forgotPassword(req, res) {
    await AuthService.forgotPassword(req.body.email);
    return sendSuccess(res, {
      message: "Password reset token sent to your email",
      data: {},
      statusCode: 200,
    });
  }

  // Reset Password — verify token and set new password
  static async resetPassword(req, res) {
    const otp = req.body.otp || req.body.token;
    await AuthService.resetPassword(req.body.email, otp, req.body.newPassword);
    return sendSuccess(res, {
      message: "Password reset successfully",
      data: {},
      statusCode: 200,
    });
  }

  // Verify Email with OTP
  static async verifyEmail(req, res) {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return sendError(res, {
        message: "Email and verification code are required",
        statusCode: 400,
      });
    }
    const result = await AuthService.verifyEmail(email, otp);
    return sendSuccess(res, {
      message: result.message,
      data: result.user,
      statusCode: 200,
    });
  }

  // Resend Email Verification OTP
  static async resendEmailVerification(req, res) {
    const { email } = req.body;
    if (!email) {
      return sendError(res, { message: "Email is required", statusCode: 400 });
    }
    const result = await AuthService.resendEmailVerification(email);
    return sendSuccess(res, {
      message: result.message,
      data: null,
      statusCode: 200,
    });
  }

  // Change Password — for logged-in users
  static async changePassword(req, res) {
    await AuthService.changePassword(
      req.user.email,
      req.body.currentPassword,
      req.body.newPassword,
    );
    return sendSuccess(res, {
      message: "Password changed successfully",
      data: {},
      statusCode: 200,
    });
  }

  // Get user profile
  static async getProfile(req, res) {
    const userId = req.user.id;
    if (!userId) {
      return sendError(res, {
        message: "User ID is required",
        statusCode: 400,
      });
    }
    const profile = await AuthService.getProfile(userId);
    if (!profile) {
      return sendError(res, { message: "Resource not found", statusCode: 404 });
    }
    return sendSuccess(res, {
      message: "Profile retrieved successfully",
      data: profile,
      statusCode: 200,
    });
  }

  // Create or update user profile
  static async createOrUpdateProfile(req, res) {
    const userId = req.user.id;
    const data = { ...req.body };

    // Upload photo to Cloudinary if provided
    if (req.file) {
      // Delete old photo from Cloudinary
      const existing = await AuthService.getProfile(userId);
      if (existing?.photoUrl) {
        await CloudinaryService.deleteIfCloudinary(existing.photoUrl);
      }
      const { url } = await CloudinaryService.upload(req.file.buffer, {
        folder: "mowdmin/profiles",
      });
      data.photoUrl = url;
    }
    const profile = await AuthService.createOrUpdateProfile(userId, data);
    return sendSuccess(res, {
      message: "Profile saved successfully",
      data: profile,
      statusCode: 200,
    });
  }

  // Delete user profile
  static async deleteProfile(req, res) {
    const userId = req.user.id;
    if (!userId) {
      return sendError(res, {
        message: "User ID is required",
        statusCode: 400,
      });
    }
    // Delete profile photo from Cloudinary
    const profile = await AuthService.getProfile(userId);
    if (profile?.photoUrl) {
      await CloudinaryService.deleteIfCloudinary(profile.photoUrl);
    }
    await AuthService.deleteProfile(userId);
    return sendSuccess(res, {
      message: "Profile deleted successfully",
      data: null,
      statusCode: 200,
    });
  }

  // LIST all users (Admin Only)
  static async getAllUsers(req, res) {
    const parsedPage = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const parsedLimit = Math.max(Number.parseInt(req.query.limit, 10) || 50, 1);
    const rawSearch =
      typeof req.query.search === "string" && req.query.search.trim().length > 0
        ? req.query.search
        : typeof req.query.q === "string"
          ? req.query.q
          : "";
    const maxSearchLength = 100;
    const search = rawSearch
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxSearchLength);
    const users = await AuthService.getAllUsers({
      page: parsedPage,
      limit: parsedLimit,
      search: search || undefined,
    });
    return sendSuccess(res, {
      message: "Users retrieved successfully",
      data: users,
      statusCode: 200,
    });
  }

  // GET user by ID (Admin or viewing public profiles)
  static async getUserById(req, res) {
    const { userId } = req.params;
    if (!userId) {
      return sendError(res, {
        message: "User ID is required",
        statusCode: 400,
      });
    }
    const user = await AuthService.getUserById(userId);
    if (!user) {
      return sendError(res, { message: "Resource not found", statusCode: 404 });
    }
    return sendSuccess(res, {
      message: "User retrieved successfully",
      data: user,
      statusCode: 200,
    });
  }

  // TOGGLE admin status (Admin Only)
  static async toggleAdminStatus(req, res) {
    const { userId } = req.params;
    const result = await AuthService.toggleAdminStatus(userId);
    return sendSuccess(res, {
      message: `Admin status toggled successfully`,
      data: result,
      statusCode: 200,
    });
  }

  // UPDATE User (Admin Only)
  static async adminUpdateUser(req, res) {
    const { userId } = req.params;
    const allowedUpdates = {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      isActive: req.body.isActive,
    };
    // Strip undefined keys
    Object.keys(allowedUpdates).forEach(
      (key) => allowedUpdates[key] === undefined && delete allowedUpdates[key]
    );
    const result = await AuthService.updateUserByAdmin(userId, allowedUpdates);
    return sendSuccess(res, {
      message: "User updated successfully (Admin)",
      data: result,
      statusCode: 200,
    });
  }

  // TRIGGER OTP (Admin Only)
  static async adminTriggerOTP(req, res) {
    const { userId } = req.params;
    await AuthService.adminTriggerPasswordReset(userId);
    return sendSuccess(res, {
      message: "OTP sent to user's email",
      data: null,
      statusCode: 200,
    });
  }

  // Social Authentication - Google
  static async googleAuth(req, res) {
    const { idToken } = req.body;
    if (!idToken) {
      throw new AppError("Google ID token is required", 400);
    }
    const SocialAuthService = (await import("../Services/SocialAuthService.js"))
      .default;
    const result = await SocialAuthService.authenticateWithGoogle(idToken);

    return sendSuccess(res, {
      message: "Google authentication successful",
      data: result,
      statusCode: 200,
    });
  }
  // Social Authentication - Apple
  static async appleAuth(req, res) {
    const { identityToken, user } = req.body;
    if (!identityToken) {
      throw new AppError("Apple identity token is required", 400);
    }
    const SocialAuthService = (await import("../Services/SocialAuthService.js"))
      .default;
    const result = await SocialAuthService.authenticateWithApple(
      identityToken,
      user,
    );
    return sendSuccess(res, {
      message: "Apple authentication successful",
      data: result,
      statusCode: 200,
    });
  }
  // Create Admin
  static async createAdmin(req, res) {
    const admin = await AuthService.createAdmin(req.body);
    return sendSuccess(res, {
      message: "Admin created successfully",
      data: admin,
      statusCode: 201,
    });
  }
}

export default AuthController;
