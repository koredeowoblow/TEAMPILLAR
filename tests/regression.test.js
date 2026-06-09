import AdminController from "../src/controllers/AdminController.js";
import BillingController from "../src/controllers/BillingController.js";
import { questionRepository } from "../src/repository/QuestionRepository.js";
import { AppError } from "../src/utils/AppError.js";

describe("Regression Tests", () => {
  it("strips rogue _id on uploadQuestions", async () => {
    const req = { body: { questions: [{ _id: "rogue_id", questionText: "Test" }] } };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    
    // Mock insertMany
    const origInsert = questionRepository.insertMany;
    questionRepository.insertMany = jest.fn().mockResolvedValue([{ id: "1" }]);

    await AdminController.uploadQuestions(req, res);
    
    expect(questionRepository.insertMany).toHaveBeenCalledWith([{ questionText: "Test" }]);
    
    questionRepository.insertMany = origInsert;
  });

  it("BillingController returns 400 AppError on missing planId", async () => {
    const req = { body: {}, user: { email: "test@test.com", id: "123" } };
    const res = {};

    // Mock PricingPlan so there's no real DB call
    const PricingPlan = (await import("../src/models/PricingPlanModel.js")).default;
    const origFindById = PricingPlan.findById;
    PricingPlan.findById = jest.fn().mockResolvedValue(null);

    // When planId is missing/undefined, findById returns null → throws "Plan not found" 404
    await expect(
      BillingController.initializeSubscription(req, res)
    ).rejects.toThrow(AppError);
    await expect(
      BillingController.initializeSubscription(req, res)
    ).rejects.toMatchObject({ statusCode: 404 });

    PricingPlan.findById = origFindById;
  });

  it("AdminController listStudents regex does not hang", async () => {
    const req = { query: { search: "(a+)+$" } };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    // Mock AdminService.listStudents directly — AdminController delegates to it,
    // and this avoids fighting ESM static-import caching for User.aggregate.
    const AdminService = (await import("../src/services/AdminService.js")).default;
    const origListStudents = AdminService.listStudents;
    AdminService.listStudents = jest.fn().mockResolvedValue({
      students: [],
      total: 0,
      totalPages: 0,
      page: 1,
    });

    const startTime = Date.now();
    await AdminController.listStudents(req, res);
    const duration = Date.now() - startTime;

    // Controller should delegate immediately — no ReDoS hang
    expect(duration).toBeLessThan(100);
    // Service was called with the (escaped) search string
    expect(AdminService.listStudents).toHaveBeenCalledWith(
      expect.objectContaining({ search: "(a+)+$" })
    );

    AdminService.listStudents = origListStudents;
  });

  it("PracticeController.getSessions returns user's completed sessions", async () => {
    const req = {
      user: { id: "6a028262ec07526b47f1b6ea" },
      query: { page: "1", limit: "10" }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const PracticeController = (await import("../src/controllers/PracticeController.js")).default;
    const { practiceRepository } = await import("../src/repository/PracticeRepository.js");

    const origFind = practiceRepository.find;
    const origCount = practiceRepository.count;

    practiceRepository.find = jest.fn().mockResolvedValue([
      {
        _id: "6a028262ec07526b47f1b6eb",
        subjectId: "5f8d0a92d2b5880017a8e5f2",
        sessionStatus: "COMPLETED",
        score: 85,
        analytics: { accuracy: 85, speedPerQuestion: 12, topMistakeTopic: "Calculus" },
        startTime: new Date(),
        endTime: new Date(),
        createdAt: new Date()
      }
    ]);
    practiceRepository.count = jest.fn().mockResolvedValue(1);

    await PracticeController.getSessions(req, res);

    expect(practiceRepository.find).toHaveBeenCalledWith(
      { userId: "6a028262ec07526b47f1b6ea", sessionStatus: "COMPLETED" },
      { sort: { createdAt: -1 }, skip: 0, limit: 10 }
    );
    expect(res.json).toHaveBeenCalled();

    practiceRepository.find = origFind;
    practiceRepository.count = origCount;
  });

  it("AIController.chat returns tutor chat reply", async () => {
    const req = {
      user: { id: "6a028262ec07526b47f1b6ea" },
      body: {
        message: "Tell me about Newton's second law",
        subject: "Physics",
        sessionId: "session-uuid-1234",
        history: []
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const AIController = (await import("../src/controllers/AIController.js")).default;
    const AIService = (await import("../src/services/AIService.js")).default;

    const origGenerateTutorChatReply = AIService.generateTutorChatReply;
    AIService.generateTutorChatReply = jest.fn().mockResolvedValue({
      reply: "Newton's second law states that F = ma.",
      suggestedFollowUps: ["What is F?", "What is m?"],
      topicsReferenced: ["Mechanics"]
    });

    await AIController.chat(req, res);

    expect(AIService.generateTutorChatReply).toHaveBeenCalledWith({
      userId: "6a028262ec07526b47f1b6ea",
      message: "Tell me about Newton's second law",
      subject: "Physics",
      sessionId: "session-uuid-1234",
      history: []
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          reply: "Newton's second law states that F = ma."
        })
      })
    );

    AIService.generateTutorChatReply = origGenerateTutorChatReply;
  });

  it("PlannerController.generate generates a planner schedule successfully", async () => {
    const req = {
      user: { id: "6a028262ec07526b47f1b6ea" },
      body: {
        targetScore: 320,
        hoursPerDay: 4,
        examDate: "2026-07-20",
        prioritySubjects: ["Physics", "Mathematics"],
        studyPreference: "morning"
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const PlannerController = (await import("../src/controllers/PlannerController.js")).default;
    const PlannerService = (await import("../src/services/PlannerService.js")).default;

    const origGenerateSchedule = PlannerService.generateSchedule;
    PlannerService.generateSchedule = jest.fn().mockResolvedValue({
      userId: "6a028262ec07526b47f1b6ea",
      targetScore: 320,
      hoursPerDay: 4,
      weeks: []
    });

    await PlannerController.generate(req, res);

    expect(PlannerService.generateSchedule).toHaveBeenCalledWith({
      userId: "6a028262ec07526b47f1b6ea",
      targetScore: 320,
      hoursPerDay: 4,
      examDate: "2026-07-20",
      prioritySubjects: ["Physics", "Mathematics"],
      studyPreference: "morning"
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          targetScore: 320
        })
      })
    );

    PlannerService.generateSchedule = origGenerateSchedule;
  });
});

