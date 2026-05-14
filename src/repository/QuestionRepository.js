import Question from "../models/QuestionModel.js";

class QuestionRepository {
  async create(questionData) {
    const q = new Question(questionData);
    return await q.save();
  }

  async insertMany(docs) {
    return await Question.insertMany(docs);
  }

  async findById(id) {
    return await Question.findById(id).exec();
  }

  async find(filter = {}, options = {}) {
    const query = Question.find(filter);
    if (options.limit) query.limit(options.limit);
    if (options.skip) query.skip(options.skip);
    if (options.sort) query.sort(options.sort);
    return await query.exec();
  }

  async findByIdAndUpdate(id, data, options = {}) {
    return await Question.findByIdAndUpdate(id, data, { new: true, ...options }).exec();
  }

  async findByIdAndDelete(id) {
    return await Question.findByIdAndDelete(id).exec();
  }

  async deleteMany(filter = {}) {
    return await Question.deleteMany(filter).exec();
  }

  async aggregate(pipeline = []) {
    return await Question.aggregate(pipeline).exec();
  }
}

export const questionRepository = new QuestionRepository();
