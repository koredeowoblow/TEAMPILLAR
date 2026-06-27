import jwt from "jsonwebtoken";
import { AppError } from "../utils/AppError.js";
import { userRepository } from "../repository/UserRepository.js";
import AuthRepository from "../repository/AuthRepository.js";
import AuthService from "./AuthService.js";
import EmailService from "./emailService.js";
import { logger } from "../core/logger.js";

const authRepository = new AuthRepository();

class SocialAuthService {
  static async createSessionForUser(user, meta = {}) {
    const { token, expiresAt } = AuthService.generateToken(user._id);
    const { refreshToken, expiresAt: refreshExpiresAt } =
      AuthService.generateRefreshToken(user._id);

    await authRepository.createSession({
      userId: user._id,
      tokenHash: AuthService.hashToken(token),
      refreshTokenHash: AuthService.hashToken(refreshToken),
      refreshTokenExpiresAt: refreshExpiresAt,
      ipAddress: meta.ip,
      deviceInfo: meta.userAgent,
    });

    const safeUser = typeof user.toObject === "function" ? user.toObject() : { ...user };
    delete safeUser.password;

    return { user: safeUser, token, refreshToken, expiresAt };
  }

  static async authenticateWithGoogle(idToken, meta = {}) {
    const verifyRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );

    if (!verifyRes.ok) {
      throw new AppError("Invalid Google token", 401);
    }

    const payload = await verifyRes.json();
    const clientId = process.env.GOOGLE_CLIENT_ID;

    if (clientId && payload.aud !== clientId) {
      throw new AppError("Invalid Google token audience", 401);
    }

    if (!payload.email) {
      throw new AppError("Google account email is required", 400);
    }

    let user = await userRepository.findByEmail(payload.email);

    if (!user) {
      user = await userRepository.createUser({
        email: payload.email.toLowerCase(),
        name: payload.name || payload.email.split("@")[0],
        googleId: payload.sub,
        emailVerified: payload.email_verified === "true" || payload.email_verified === true,
        emailVerifiedAt:
          payload.email_verified === "true" || payload.email_verified === true
            ? new Date()
            : null,
        photoUrl: payload.picture || undefined,
      });

      // Send welcome email for new social users
      setImmediate(async () => {
        try {
          await EmailService.sendWelcomeEmail(user.email, user.name);
        } catch (err) {
          logger.error("Welcome email failed for social user", { message: err.message });
        }
      });
    } else if (!user.googleId) {
      user = await userRepository.updateUser(user._id, {
        googleId: payload.sub,
        ...(payload.picture && !user.photoUrl ? { photoUrl: payload.picture } : {}),
      });
    }

    return this.createSessionForUser(user, meta);
  }

  static async authenticateWithApple(identityToken, appleUser = {}, meta = {}) {
    let decoded;
    try {
      decoded = jwt.decode(identityToken, { complete: true });
    } catch {
      throw new AppError("Invalid Apple identity token", 401);
    }

    if (!decoded?.payload?.sub) {
      throw new AppError("Invalid Apple identity token", 401);
    }

    const appleId = decoded.payload.sub;
    const email = decoded.payload.email || appleUser?.email;

    let user = await userRepository.findOne({ appleId });

    if (!user && email) {
      user = await userRepository.findByEmail(email);
    }

    if (!user) {
      if (!email) {
        throw new AppError("Apple account email is required for first sign-in", 400);
      }

      user = await userRepository.createUser({
        email: email.toLowerCase(),
        name: appleUser?.name?.firstName
          ? `${appleUser.name.firstName} ${appleUser.name.lastName || ""}`.trim()
          : email.split("@")[0],
        appleId,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      });

      // Send welcome email for new social users
      setImmediate(async () => {
        try {
          await EmailService.sendWelcomeEmail(user.email, user.name);
        } catch (err) {
          logger.error("Welcome email failed for social user", { message: err.message });
        }
      });
    } else if (!user.appleId) {
      user = await userRepository.updateUser(user._id, { appleId });
    }

    return this.createSessionForUser(user, meta);
  }
}

export default SocialAuthService;
