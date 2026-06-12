import { addAnalyticsJob, processQueue } from "../src/queues/AnalyticsQueue.js";
import PracticeSession from "../src/models/PracticeSessionModel.js";
import TopicPerformance from "../src/models/TopicPerformanceModel.js";
import User from "../src/models/UserModel.js";
import UserAnalytics from "../src/models/UserAnalyticsModel.js";
import AIService from "../src/services/AIService.js";
import mongoose from "mongoose";

jest.mock("../src/models/PracticeSessionModel.js");
jest.mock("../src/models/TopicPerformanceModel.js");
jest.mock("../src/models/UserModel.js");
jest.mock("../src/models/UserAnalyticsModel.js");
jest.mock("../src/services/AIService.js", () => {
  return {
    __esModule: true,
    default: {
      _callAIWithFallback: jest.fn()
    }
  };
});

describe("AnalyticsQueue Background Worker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should successfully process queue job and write analytics report to the database", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const sessionId = new mongoose.Types.ObjectId().toString();

    // Mock User findById
    User.findById = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: userId,
        onboarding: { targetScore: 300 }
      })
    });

    // Mock PracticeSession completed sessions
    PracticeSession.find = jest.fn().mockImplementation(() => {
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          {
            _id: sessionId,
            userId,
            score: 75,
            sessionStatus: "COMPLETED",
            analytics: { accuracy: 80, speedPerQuestion: 30 }
          }
        ])
      };
      return mockQuery;
    });

    // Mock TopicPerformance
    TopicPerformance.find = jest.fn().mockImplementation(() => {
      return {
        lean: jest.fn().mockResolvedValue([
          { topicId: "Matrices", totalAttempted: 10, totalCorrect: 8, averageTimeSpent: 12 }
        ])
      };
    });

    // Mock AIService call
    AIService._callAIWithFallback.mockResolvedValue({
      content: JSON.stringify({
        tips: "Keep up the excellent momentum. You're doing great on Matrices.",
        focusAreas: [
          {
            topic: "Matrices",
            accuracy: 80,
            attempted: 10,
            correct: 8,
            incorrect: 2,
            averageTime: 12,
            topicsToReview: ["Determinants"],
            commonWeakness: "Slight hesitation with high dimension matrices.",
            recommendation: "Review 3D determinants.",
            estimatedScoreGain: 5
          }
        ],
        priorityRecommendations: [
          {
            priority: 1,
            topic: "Matrices",
            reason: "High yield topic.",
            potentialGain: "+5 marks",
            recommendedQuestionCount: 10
          }
        ]
      })
    });

    // Mock UserAnalytics findOneAndUpdate
    UserAnalytics.findOneAndUpdate = jest.fn().mockResolvedValue({});

    // Import the queue trigger logic or call addAnalyticsJob
    addAnalyticsJob(userId, sessionId);

    // Trigger processing
    await processQueue();

    // Verify AI service was called with proper messages
    expect(AIService._callAIWithFallback).toHaveBeenCalled();

    // Verify database was updated
    expect(UserAnalytics.findOneAndUpdate).toHaveBeenCalledWith(
      { userId },
      expect.objectContaining({
        tips: "Keep up the excellent momentum. You're doing great on Matrices.",
        focusAreas: expect.any(Array),
        priorityRecommendations: expect.any(Array)
      }),
      { upsert: true, new: true }
    );
  });
});
