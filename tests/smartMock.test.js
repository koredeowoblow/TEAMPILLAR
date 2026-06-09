import SmartMockService from "../src/services/SmartMockService.js";
import { questionRepository } from "../src/repository/QuestionRepository.js";
import { practiceRepository } from "../src/repository/PracticeRepository.js";
import TopicPerformance from "../src/models/TopicPerformanceModel.js";
import mongoose from "mongoose";

jest.mock("../src/repository/QuestionRepository.js");
jest.mock("../src/repository/PracticeRepository.js");
jest.mock("../src/models/TopicPerformanceModel.js");
jest.mock("../src/models/SubjectModel.js", () => {
  return {
    __esModule: true,
    default: {
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: "subjectId", name: "Physics" }])
      })
    }
  };
});
jest.mock("groq-sdk", () => {
  return jest.fn().mockImplementation(() => {
    return {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({ questionIds: ["q1", "q2"] })
                }
              }
            ]
          })
        }
      }
    };
  });
});

describe("SmartMockService - Dynamic Limits and AI Fallback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should size candidate pool dynamically and slice to limit when AI is bypassed (or returns subset)", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const subjectId = new mongoose.Types.ObjectId().toString();

    // Mock DB counts and performance records
    questionRepository.count.mockResolvedValue(100);
    TopicPerformance.find.mockResolvedValue([]);
    practiceRepository.find.mockResolvedValue([]);
    practiceRepository.aggregate.mockResolvedValue([]);

    // We have 10 mock questions in the pool
    const mockPool = Array.from({ length: 10 }, (_, i) => ({
      _id: `q${i + 1}`,
      metadata: { topic: "topic1", difficulty: "medium" }
    }));
    questionRepository.aggregate.mockResolvedValue(mockPool);

    // Call generateSmartMock with limit 5
    const questions = await SmartMockService.generateSmartMock(userId, subjectId, 5);

    // We expect the final questions to be exactly 5
    expect(questions.length).toBe(5);

    // Verify dynamic pool sizing in aggregate call
    const poolCall = questionRepository.aggregate.mock.calls[0][0];
    const sampleStage = poolCall.find(stage => stage.$sample);
    // limit 5 * 2 = 10, but min is 30, so size is 30 (bounded by count which is 100)
    expect(sampleStage.$sample.size).toBe(30);
  });

  it("should fallback to pool questions if AI returns fewer questions than requested limit", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const subjectId = new mongoose.Types.ObjectId().toString();

    const mockPool = Array.from({ length: 15 }, (_, i) => ({
      _id: `q${i + 1}`,
      metadata: { topic: "topic1", difficulty: "medium" }
    }));

    // Mock selectWithAI directly or let it call through
    // Let's test selectWithAI function directly
    const userPerformance = [{ topicId: "topic1", masteryScore: 30 }];
    
    // Test with limit 8. Since we mock groq completions to return only ["q1", "q2"],
    // the final questions should still be 8 because of fallback filling.
    const questions = await SmartMockService.selectWithAI(
      userId,
      subjectId,
      mockPool,
      userPerformance,
      8
    );

    expect(questions.length).toBe(8);
    // First 2 should be the ones from AI (q1, q2)
    expect(questions[0]._id).toBe("q1");
    expect(questions[1]._id).toBe("q2");
    // The rest should be filled from the pool
    const questionIds = questions.map(q => q._id);
    expect(new Set(questionIds).size).toBe(8); // Ensure unique questions
  });
});
