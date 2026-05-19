import { sendSuccess } from "../core/response.js";
import { classRepository } from "../repository/ClassRepository.js";
import { toClassDTO, toAdminClassDTO } from "../dto/index.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

class ClassesController {
  static async list(req, res) {
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;
    const filter = {};
    const classes = await classRepository.find(filter, {
      skip,
      limit,
      sort: { createdAt: -1 },
    });

    const data = classes.map(toClassDTO);

    return sendSuccess(res, {
      message: "Classes retrieved",
      data,
      statusCode: 200,
    });
  }

  static async create(req, res) {
    const payload = req.body;
    const created = await classRepository.create(payload);
    return sendSuccess(res, {
      message: "Class created",
      data: toAdminClassDTO(created),
      statusCode: 201,
    });
  }

  static async get(req, res) {
    const { id } = req.params;
    const found = await classRepository.findById(id);
    return sendSuccess(res, {
      message: "Class retrieved",
      data: toClassDTO(found),
      statusCode: 200,
    });
  }

  static async update(req, res) {
    const { id } = req.params;
    const updated = await classRepository.update(id, req.body);
    return sendSuccess(res, {
      message: "Class updated",
      data: toAdminClassDTO(updated),
      statusCode: 200,
    });
  }

  static async remove(req, res) {
    const { id } = req.params;
    await classRepository.delete(id);
    return sendSuccess(res, {
      message: "Class deleted",
      data: null,
      statusCode: 200,
    });
  }
}

export default ClassesController;
