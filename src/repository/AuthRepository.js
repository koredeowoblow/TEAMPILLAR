import Auth from "../models/AuthModel.js";
class AuthRepository {
  async createSession(sessionData) {
    const session = new Auth(sessionData);
    return await session.save();
  }
  async findByUserId(userId) {
    return await Auth.find({ userId, isLoggedOut: false }).exec();
  }
  async findSessionByToken(token) {
    return await Auth.findOne({ tokenHash: token }).exec();
  }
  async findSessionByRefreshToken(refreshToken) {
    return await Auth.findOne({ refreshTokenHash: refreshToken }).exec();
  }
  async invalidateSession(token) {
    return await Auth.findOneAndUpdate(
      { tokenHash: token },
      { isLoggedOut: true, loggedOutAt: new Date() },
      { new: true },
    ).exec();
  }
  async revokeAllUserTokens(userId) {
    return await Auth.updateMany(
      { userId, isLoggedOut: false },
      { isLoggedOut: true, loggedOutAt: new Date() },
    ).exec();
  }
  async touchToken(token, lastLogin) {
    return await Auth.findOneAndUpdate(
      { tokenHash: token },
      { lastLogin },
      { new: true },
    ).exec();
  }
}

export default AuthRepository;
