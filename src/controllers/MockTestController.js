import MockTestService from "../services/MockTestService.js";
import { sendSuccess } from "../core/response.js";

class MockTestController {
  static async startMockTest(req, res) {
    const data = await MockTestService.startMockTest(req.user);
    return sendSuccess(res, {
      message: "Mock test generated successfully",
      data,
      statusCode: 201
    });
  }

  static async submitMockTest(req, res) {
    const { sessionId, responses } = req.body;
    const data = await MockTestService.submitMockTest(req.user, sessionId, responses);
    return sendSuccess(res, {
      message: "Mock test submitted successfully",
      data,
      statusCode: 200
    });
  }

  static async getMockHistory(req, res) {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const data = await MockTestService.getMockHistory(req.user, page, limit);
    return sendSuccess(res, {
      message: "Mock history retrieved",
      data,
      statusCode: 200
    });
  }

  static async getMockStats(req, res) {
    const data = await MockTestService.getMockStats(req.user);
    return sendSuccess(res, {
      message: "Mock stats retrieved",
      data,
      statusCode: 200
    });
  }
}

export default MockTestController;
