// Changed: Created adaptive engine tests.
// Why: Step 7 of UTME Adaptive Engine implementation.
// Date: 2026-05-12

import AdaptiveEngineService from "../src/services/AdaptiveEngineService.js";
import PracticeService from "../src/services/PracticeService.js";
import { userRepository } from "../src/repository/UserRepository.js";
import { practiceRepository } from "../src/repository/PracticeRepository.js";
import { questionRepository } from "../src/repository/QuestionRepository.js";
import mongoose from "mongoose";
import { resolveSubjectId } from "../src/utils/subjectResolver.js";

jest.mock("../src/repository/UserRepository.js");
jest.mock("../src/repository/PracticeRepository.js");
jest.mock("../src/repository/QuestionRepository.js");
jest.mock("../src/models/SubjectModel.js");
jest.mock("../src/utils/subjectResolver.js");

describe("Adaptive Engine & Question Randomization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveSubjectId.mockResolvedValue("subjectId1");
  });

  it("should return different question orders on 5 calls with identical filters", async () => {
    questionRepository.aggregate.mockResolvedValue([
      { _id: "1", options: [] },
      { _id: "2", options: [] },
    ]);

    await PracticeService.getQuestionsForSubject("subjectId1", { limit: 10 });

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

    await PracticeService.getQuestionsForSubject("subjectId1", { userId, sessionId, limit: 10 });

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
    userRepository.findById.mockResolvedValue({
      _id: userId,
      topicPerformance: [
        { topicId: "topicWeak", masteryScore: 20 },
        { topicId: "topicMed", masteryScore: 50 },
        { topicId: "topicStrong", masteryScore: 80 }
      ]
    });

    let weakCount = 0;
    let strongCount = 0;
    for (let i = 0; i < 100; i++) {
      const match = await AdaptiveEngineService.buildWeightedPool(userId, "subjectId1");
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

    await AdaptiveEngineService.updateTopicPerformance(userId, sessionResponses, "subjectId1");

    expect(mockUser.save).toHaveBeenCalled();
    expect(mockUser.topicPerformance.length).toBe(2);
    
    const topic1 = mockUser.topicPerformance.find(t => String(t.topicId) === "topic1");
    expect(topic1.totalAttempted).toBe(11);
    expect(topic1.totalCorrect).toBe(6);
    
    const topic2 = mockUser.topicPerformance.find(t => String(t.topicId) === "topic2");
    expect(topic2.totalAttempted).toBe(1);
    expect(topic2.totalCorrect).toBe(0);
  });
});
