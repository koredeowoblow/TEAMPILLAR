import MockTestService from "../services/MockTestService.js";
import { sendSuccess } from "../core/response.js";
import LogService from "../services/LogService.js";

class MockTestController {
  static async startMockTest(req, res) {
    const { subjectIds } = req.body || {};
    const data = await MockTestService.startMockTest(req.user, subjectIds);
    LogService.logAction({
      userId: req.user?.id,
      userRole: req.user?.role,
      category: "mock_test",
      action: "mock_test_started",
      description: "Mock test generated",
      metadata: { sessionId: data.sessionId },
      req,
    });

    return sendSuccess(res, {
      message: "Mock test generated successfully",
      data,
      statusCode: 201
    });
  }

  static async getActiveSession(req, res) {
    const data = await MockTestService.getActiveSession(req.user);
    return sendSuccess(res, {
      message: "Active session retrieved",
      data,
      statusCode: 200
    });
  }

  static async saveProgress(req, res) {
    const { sessionId } = req.params;
    const { responses, timeRemaining } = req.body;
    await MockTestService.saveProgress(req.user, sessionId, responses, timeRemaining);
    return sendSuccess(res, {
      message: "Progress saved",
      statusCode: 200
    });
  }

  static async submitMockTest(req, res) {
    const { sessionId, responses, tabSwitches, ipAddress } = req.body;
    const submissionOptions = {
      tabSwitches: tabSwitches || 0,
      ipAddress: ipAddress || req.ip || null
    };
    const data = await MockTestService.submitMockTest(req.user, sessionId, responses, submissionOptions);
    LogService.logAction({
      userId: req.user?.id,
      userRole: req.user?.role,
      category: "mock_test",
      action: "mock_test_submitted",
      description: `Mock test ${sessionId} submitted`,
      metadata: { sessionId, score: data.score },
      req,
    });

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
