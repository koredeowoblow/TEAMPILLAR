import { TokenRepository } from "../repositories/TokenRepository.js";
import bcrypt from "bcryptjs";

class TokenService {
  static generate4DigitToken() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  static async createToken(userId, type = "reset", expiresInMinutes = 10) {
    const tokenValue = this.generate4DigitToken();
    const salt = await bcrypt.genSalt(10);
    const hashedToken = await bcrypt.hash(tokenValue, salt);

    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    await TokenRepository.create({
      userId,
      type,
      token: hashedToken,
      expiresAt,
      revoked: false,
    });

    // Return the plain token to send to the user
    return tokenValue;
  }

  static async validateToken(userId, tokenValue, type) {
    const tokens = await TokenRepository.findAll({
      where: {
        userId,
        type,
        revoked: false,
      },
      order: [["createdAt", "DESC"]],
    });

    for (const token of tokens) {
      const match = await bcrypt.compare(tokenValue, token.token);
      if (match) {
        // Check expiration
        if (token.expiresAt < new Date()) return false;
        return true;
      }
    }

    return false;
  }

  static async revokeToken(userId, tokenValue, type) {
    const tokens = await TokenRepository.findAll({
      where: {
        userId,
        type,
        revoked: false,
      },
    });

    for (const token of tokens) {
      const match = await bcrypt.compare(tokenValue, token.token);
      if (match) {
        await token.update({ revoked: true });
      }
    }
  }
}

export default TokenService;
