import Token from "../models/TokenModel";

class TokenRepository {
  static async create(tokenData) {
    const token = new Token(tokenData);
    return await token.save();
  }

  static async findAll(query) {
    return await Token.find(query);
  }

  static async update(id, updateData) {
    return await Token.findByIdAndUpdate(id, updateData, { new: true });
  }
  static async findone(query) {
    return await Token.findOne(query);
  }
}

export default TokenRepository;
