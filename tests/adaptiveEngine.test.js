import AdaptiveEngineService from "../src/services/AdaptiveEngineService.js";
import PracticeService from "../src/services/PracticeService.js";
import { userRepository } from "../src/repository/UserRepository.js";
import { practiceRepository } from "../src/repository/PracticeRepository.js";
import { questionRepository } from "../src/repository/QuestionRepository.js";
import mongoose from "mongoose";
import { resolveSubjectId } from "../src/utils/subjectResolver.js";
import TopicPerformance from "../src/models/TopicPerformanceModel.js";

jest.mock("../src/repository/UserRepository.js");
jest.mock("../src/repository/PracticeRepository.js");
jest.mock("../src/repository/QuestionRepository.js");
jest.mock("../src/models/SubjectModel.js");
jest.mock("../src/services/AIService.js", () => {
  return {
    __esModule: true,
    default: {
      predictPracticeStrategy: jest.fn().mockResolvedValue(null)
    }
  };
});
jest.mock("../src/models/TopicPerformanceModel.js", () => {
  return {
    __esModule: true,
    default: {
      find: jest.fn().mockResolvedValue([
        { topicId: "topicWeak", masteryScore: 20 },
        { topicId: "topicMed", masteryScore: 50 },
        { topicId: "topicStrong", masteryScore: 80 }
      ]),
      findOneAndUpdate: jest.fn().mockImplementation(() => {
        return {
          then: jest.fn().mockImplementation((callback) => {
            return Promise.resolve(
              callback({
                totalAttempted: 1,
                totalCorrect: 1,
                masteryScore: 100,
                save: jest.fn().mockResolvedValue(true)
              })
            );
          })
        };
      })
    }
  };
});
jest.mock("../src/utils/subjectResolver.js");

describe("Adaptive Engine & Question Randomization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveSubjectId.mockResolvedValue("5f8d0a92d2b5880017a8e5f2");
  });

  it("should return different question orders on 5 calls with identical filters", async () => {
    questionRepository.aggregate.mockResolvedValue([
      { _id: "1", options: [] },
      { _id: "2", options: [] },
    ]);

    await PracticeService.getQuestionsForSubject("5f8d0a92d2b5880017a8e5f2", { limit: 10 });

    expect(questionRepository.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ $sample: { size: 10 } })
      ])
    );
  });

  it("should never return seen and recently-correct question IDs", async () => {
    const sessionId = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();

    practiceRepository.findById.mockResolvedValue({
      _id: sessionId,
      responses: [{ questionId: new mongoose.Types.ObjectId().toString() }]
    });

    const recentQId = new mongoose.Types.ObjectId().toString();
    practiceRepository.find.mockResolvedValue([
      { responses: [{ questionId: recentQId }] }
    ]);

    userRepository.findById.mockResolvedValue({});
    questionRepository.aggregate.mockResolvedValue([]);
    questionRepository.count.mockResolvedValue(100);

    await PracticeService.getQuestionsForSubject("5f8d0a92d2b5880017a8e5f2", { userId, sessionId, limit: 10 });

    expect(questionRepository.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: expect.objectContaining({
            _id: { $nin: expect.any(Array) }
          })
        })
      ])
    );

    const callArgs = questionRepository.aggregate.mock.calls[0][0];
    const matchStage = callArgs.find(stage => stage.$match).$match;

    const ninArray = matchStage._id.$nin.map(id => id.toString());
    expect(ninArray).toContain(recentQId);
  });

  it("should weight a topic with 20% mastery more frequently than a topic at 80%", async () => {
    const userId = new mongoose.Types.ObjectId().toString();

    let weakCount = 0;
    let strongCount = 0;
    for (let i = 0; i < 100; i++) {
      const match = await AdaptiveEngineService.buildWeightedPool(userId, "5f8d0a92d2b5880017a8e5f2");
      if (match["metadata.topic"] && match["metadata.topic"].$in && match["metadata.topic"].$in.includes("topicWeak")) {
        weakCount++;
      }
      if (match["metadata.topic"] && match["metadata.topic"].$in && match["metadata.topic"].$in.includes("topicStrong")) {
        strongCount++;
      }
    }

    expect(weakCount).toBeGreaterThan(strongCount);
  });

  it("updateTopicPerformance correctly upserts without duplicating topic entries", async () => {
    const userId = new mongoose.Types.ObjectId().toString();

    const mockUser = {
      _id: userId,
      topicPerformance: [
        { topicId: "topic1", totalAttempted: 10, totalCorrect: 5, averageTimeSpent: 10, recentAccuracy: [] }
      ],
      save: jest.fn()
    };

    userRepository.findById.mockResolvedValue(mockUser);

    questionRepository.find.mockResolvedValue([
      { _id: "q1", metadata: { topic: "topic1" }, options: [{ id: "A", isCorrect: true }] },
      { _id: "q2", metadata: { topic: "topic2" }, options: [{ id: "B", isCorrect: false }] }
    ]);

    const sessionResponses = [
      { questionId: "q1", selectedOption: "A", timeTaken: 5 },
      { questionId: "q2", selectedOption: "C", timeTaken: 10 }
    ];

    await AdaptiveEngineService.updateTopicPerformance(userId, sessionResponses, "5f8d0a92d2b5880017a8e5f2");

    expect(TopicPerformance.findOneAndUpdate).toHaveBeenCalled();
  });
});
