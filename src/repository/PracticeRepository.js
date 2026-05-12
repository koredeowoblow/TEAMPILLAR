import PracticeSession from "../models/PracticeSessionModel.js";

class PracticeRepository {
  async create(sessionData) {
    const s = new PracticeSession(sessionData);
    return await s.save();
  }

  async count(filter = {}) {
    return await PracticeSession.countDocuments(filter).exec();
  }

  async findById(id) {
    return await PracticeSession.findById(id).exec();
  }

  async update(id, updateData) {
    return await PracticeSession.findByIdAndUpdate(id, updateData, {
      new: true,
    }).exec();
  }

  async find(filter = {}, options = {}) {
    const query = PracticeSession.find(filter);
    if (options.limit) query.limit(options.limit);
    if (options.skip) query.skip(options.skip);
    if (options.sort) query.sort(options.sort);
    return await query.exec();
  }

  async aggregate(pipeline = []) {
    return await PracticeSession.aggregate(pipeline).exec();
  }
}

export const practiceRepository = new PracticeRepository();
