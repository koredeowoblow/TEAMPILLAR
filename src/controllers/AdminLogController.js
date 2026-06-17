import LogEntry from "../models/LogEntryModel.js";
import { sendSuccess } from "../core/response.js";

class AdminLogController {
  static async getLogs(req, res) {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(Number.parseInt(req.query.limit, 10) || 50, 1);
    const skip = (page - 1) * limit;

    const { type, category, userId, startDate, endDate, search } = req.query;

    const filter = {};
    if (type && type !== "all") filter.type = type;
    if (category && category !== "all") filter.category = category;
    if (userId) filter.userId = userId;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    if (search) {
      filter.$or = [
        { description: { $regex: search, $options: "i" } },
        { errorMessage: { $regex: search, $options: "i" } },
      ];
    }

    const [logs, total] = await Promise.all([
      LogEntry.find(filter)
        .populate("userId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LogEntry.countDocuments(filter),
    ]);

    return sendSuccess(res, {
      data: {
        logs,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
      message: "Logs retrieved successfully",
    });
  }

  static async getLogDetail(req, res) {
    const log = await LogEntry.findById(req.params.id).populate("userId", "name email role").lean();
    return sendSuccess(res, { data: log, message: "Log detail retrieved" });
  }

  static async getUserTimeline(req, res) {
    const logs = await LogEntry.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .lean();
    return sendSuccess(res, { data: logs, message: "User timeline retrieved" });
  }
}

export default AdminLogController;
