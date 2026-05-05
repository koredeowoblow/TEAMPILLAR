import User from "../models/UserModel.js";

class UserRepository {
  async createUser(userData) {
    const user = new User(userData);
    return await user.save();
  }
  async findByEmail(email) {
    return await User.findOne({ email }).exec();
  }
  async findById(id) {
    return await User.findById(id).exec();
  }
  async updateUser(id, updateData) {
    return await User.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }
  async deleteUser(id) {
    return await User.findByIdAndDelete(id).exec();
  }
}

export const userRepository = new UserRepository();
