import ClassModel from "../models/ClassModel.js";

class ClassRepository {
  async create(data) {
    const c = new ClassModel(data);
    return await c.save();
  }

  async findById(id) {
    return await ClassModel.findById(id).exec();
  }

  async update(id, updateData) {
    return await ClassModel.findByIdAndUpdate(id, updateData, {
      new: true,
    }).exec();
  }

  async find(filter = {}, options = {}) {
    const q = ClassModel.find(filter);
    if (options.limit) q.limit(options.limit);
    if (options.skip) q.skip(options.skip);
    if (options.sort) q.sort(options.sort);
    return await q.exec();
  }

  async delete(id) {
    return await ClassModel.findByIdAndDelete(id).exec();
  }
}

export const classRepository = new ClassRepository();
