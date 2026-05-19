import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { escapeRegex } from "../utils/stringUtils.js";
import EmailService from "./emailService.js";
import OTPService from "./OTPService.js";
import { AppError } from "../utils/AppError.js";
import { userRepository } from "../repository/UserRepository.js";
import AuthRepository from "../repository/AuthRepository.js";
import { logger } from "../core/logger.js";
import { invalidateCachedSessionUser } from "../utils/authSessionCache.js";

const authRepository = new AuthRepository();

class AuthService {
  // ================= PASSWORD =================
  static validatePassword(password) {
    if (!password || password.length < 8) {
      throw new AppError("Password must be at least 8 characters long", 400);
    }
    if (!/[A-Z]/.test(password)) {
      throw new AppError("Password must contain uppercase letter", 400);
    }
    if (!/[a-z]/.test(password)) {
      throw new AppError("Password must contain lowercase letter", 400);
    }
    if (!/[0-9]/.test(password)) {
      throw new AppError("Password must contain number", 400);
    }
  }

  // ================= TOKENS =================
  static generateToken(id) {
    const expiresIn = process.env.JWT_EXPIRES_IN || "15m";

    const token = jwt.sign({ id }, process.env.JWT_SECRET, {
      expiresIn,
      algorithm: "HS256",
    });

    const decoded = jwt.decode(token);
    return {
      token,
      expiresAt: decoded?.exp ? new Date(decoded.exp * 1000) : null,
    };
  }

  static generateRefreshToken(id) {
    const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

    const refreshToken = jwt.sign(
      { id, type: "refresh" },
      process.env.JWT_SECRET,
      { expiresIn, algorithm: "HS256" },
    );

    const decoded = jwt.decode(refreshToken);

    return {
      refreshToken,
      expiresAt: decoded?.exp ? new Date(decoded.exp * 1000) : null,
    };
  }

  static hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  // ================= REGISTER =================
  static async register(userData) {
    const { email, password, name, language } = userData;

    this.validatePassword(password);

    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      throw new AppError("Invalid credentials", 400);
    }

    const newUser = await userRepository.createUser({
      email,
      password,
      name,
      language,
      emailVerified: false,
    });

    try {
      const otp = await OTPService.storeOTP(email, "email_verification", 10);
      await EmailService.sendEmailVerificationOTP(email, otp, name);
    } catch (err) {
      logger.error("OTP send failed", { message: err.message });
    }

    setImmediate(async () => {
      try {
        await EmailService.sendWelcomeEmail(newUser.email, newUser.name);
      } catch (err) {
        logger.error("Welcome email failed", { message: err.message });
      }
    });

    const user = typeof newUser.toObject === "function" ? newUser.toObject() : { ...newUser };
    delete user.password;

    return {
      user,
      token: null,
      message: "Check your email for verification code",
    };
  }

  // ================= LOGIN =================
  static async login(email, password, meta = {}) {
    const user = await userRepository.findByEmail(email, {
      includePassword: true,
    });
    console.log("Login attempt for", email, "User found:", !!user);
    if (!user)
      throw new AppError("Invalid credentials", 401, {}, "ERR_AUTH_INVALID");

    if (!user.password) {
      throw new AppError("Invalid credentials", 401, {}, "ERR_AUTH_INVALID");
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid)
      throw new AppError("Invalid credentials", 401, {}, "ERR_AUTH_INVALID");

    const { token, expiresAt } = this.generateToken(user._id);
    const { refreshToken, expiresAt: refreshExpiresAt } =
      this.generateRefreshToken(user._id);

    await authRepository.createSession({
      userId: user._id,
      tokenHash: this.hashToken(token),
      refreshTokenHash: this.hashToken(refreshToken),
      refreshTokenExpiresAt: refreshExpiresAt,
      ipAddress: meta.ip,
      deviceInfo: meta.userAgent,
    });

    const safeUser = typeof user.toObject === "function" ? user.toObject() : { ...user };
    delete safeUser.password;

    return { user: safeUser, token, refreshToken, expiresAt };
  }

  // ================= REFRESH =================
  static async refreshToken(refreshTokenValue) {
    let decoded;

    try {
      decoded = jwt.verify(refreshTokenValue, process.env.JWT_SECRET);
    } catch {
      throw new AppError("Unauthorized", 401);
    }

    if (decoded.type !== "refresh") {
      throw new AppError("Unauthorized", 401);
    }

    const session = await authRepository.findSessionByRefreshToken(
      this.hashToken(refreshTokenValue),
    );

    if (!session || session.isLoggedOut) {
      throw new AppError("Unauthorized", 401);
    }

    if (
      session.refreshTokenExpiresAt &&
      new Date() > session.refreshTokenExpiresAt
    ) {
      throw new AppError("Unauthorized", 401);
    }

    await authRepository.invalidateSession(session.tokenHash);

    const { token, expiresAt } = this.generateToken(decoded.id);
    const { refreshToken, expiresAt: newRefreshExpiry } =
      this.generateRefreshToken(decoded.id);

    await authRepository.createSession({
      userId: decoded.id,
      tokenHash: this.hashToken(token),
      refreshTokenHash: this.hashToken(refreshToken),
      refreshTokenExpiresAt: newRefreshExpiry,
    });

    return { token, refreshToken, expiresAt };
  }

  // ================= LOGOUT =================
  static async logout(token) {
    const tokenHash = this.hashToken(token);

    const session = await authRepository.findSessionByToken(tokenHash);
    if (session) {
      await authRepository.invalidateSession(tokenHash);
    }

    invalidateCachedSessionUser(tokenHash);

    return { message: "Logged out successfully" };
  }

  // ================= PASSWORD RESET =================
  static async forgotPassword(email) {
    const user = await userRepository.findByEmail(email);
    if (!user) throw new AppError("Request failed", 404);

    const otp = await OTPService.storeOTP(email, "password_reset", 15);
    await EmailService.sendTokenEmail(email, otp, "Password Reset");

    return { message: "Reset code sent" };
  }

  static async resetPassword(email, otp, newPassword) {
    this.validatePassword(newPassword);

    const user = await userRepository.findByEmail(email);
    if (!user) throw new AppError("Request failed", 404);

    const verification = await OTPService.verifyOTP(
      email,
      otp,
      "password_reset",
    );

    if (!verification.valid) {
      throw new AppError(verification.message, 400);
    }

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    return { message: "Password reset successful" };
  }
  // ================= USERS =================
  static async getAllUsers({ page = 1, limit = 50, search } = {}) {
    const skip = (page - 1) * limit;

    let filter = {};

    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      filter = {
        $or: [{ name: regex }, { email: regex }],
      };
    }

    const User = (await import("../models/UserModel.js")).default;
    const users = await User.find(filter)
      .skip(skip)
      .limit(limit)
      .select("-password");

    const total = await User.countDocuments(filter);

    return {
      data: users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  static async getUserById(userId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError("Not found", 404);

    const safe = user.toObject();
    delete safe.password;

    return safe;
  }

  // Convenience: controller expects getProfile()
  static async getProfile(userId) {
    return await this.getUserById(userId);
  }

  static async createOrUpdateProfile(userId, profileData) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError("Not found", 404);

    return await userRepository.updateUser(userId, profileData);
  }

  static async toggleAdminStatus(userId) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError("Not found", 404);

    return await userRepository.updateUser(userId, {
      isAdmin: !user.isAdmin,
    });
  }
}

export default AuthService;
