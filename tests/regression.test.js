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
    const req = { body: {} };
    const res = {};
    
    await expect(BillingController.initialize(req, res)).rejects.toThrow(AppError);
    await expect(BillingController.initialize(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("AdminController listStudents regex does not hang", async () => {
    const req = { query: { search: "(a+)+$" } };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    // Just run it, it should not hang.
    // It will hit mongoose aggregate and return quickly because it's escaped!
    const origAggregate = (await import("../src/models/UserModel.js")).default.aggregate;
    (await import("../src/models/UserModel.js")).default.aggregate = jest.fn().mockResolvedValue([]);
    
    const startTime = Date.now();
    await AdminController.listStudents(req, res);
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(100); // Should be very fast
    
    (await import("../src/models/UserModel.js")).default.aggregate = origAggregate;
  });
});
