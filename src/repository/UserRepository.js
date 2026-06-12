import User from "../models/UserModel.js";

class UserRepository {
  async createUser(userData) {
    const user = new User(userData);
    return await user.save();
  }

  async count(filter = {}) {
    return await User.countDocuments(filter).exec();
  }

  async findOne(filter = {}, options = {}) {
    let query = User.findOne(filter);

    if (options.select) {
      query = query.select(options.select);
    }

    if (options.sort) {
      query = query.sort(options.sort);
    }

    return await query.exec();
  }

  async findByEmail(email, options = {}) {
    let query = User.findOne({ email });

    if (options.includePassword) {
      query = query.select("+password");
    }
    if (options.select) {
      query = query.select(options.select);
    }
    if (options.lean) {
      query = query.lean();
    }

    return await query.exec();
  }
  async findById(id, options = {}) {
    let query = User.findById(id);
    if (options.select) query = query.select(options.select);
    if (options.lean) query = query.lean();
    const result = await query.exec();
    // Mongoose lean() removes the .id virtual — synthesise it so req.user.id
    // works throughout the codebase regardless of whether lean was used.
    if (result && options.lean && !result.id) {
      result.id = String(result._id);
    }
    return result;
  }
  async find(filter = {}, options = {}) {
    const q = User.find(filter);
    if (options.limit) q.limit(options.limit);
    if (options.skip) q.skip(options.skip);
    if (options.sort) q.sort(options.sort);
    if (options.select) q.select(options.select);
    if (options.lean) q.lean();
    return await q.exec();
  }
  async updateUser(id, updateData) {
    // If password is being updated, load the document, assign fields and save
    // so Mongoose `pre('save')` hooks (which hash the password) run.
    if (
      updateData &&
      Object.prototype.hasOwnProperty.call(updateData, "password")
    ) {
      const user = await User.findById(id).exec();
      if (!user) return null;
      Object.keys(updateData).forEach((k) => {
        user[k] = updateData[k];
      });
      return await user.save();
    }

    return await User.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }
  async deleteUser(id) {
    return await User.findByIdAndDelete(id).exec();
  }
}

export const userRepository = new UserRepository();
