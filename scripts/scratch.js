import mongoose from "mongoose";
import User from "../src/models/UserModel.js";
import PracticeSession from "../src/models/PracticeSessionModel.js";
import "dotenv/config";

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const topPerformersAgg = await PracticeSession.aggregate([
    { $match: { sessionStatus: "COMPLETED", score: { $gt: 0 } } },
    {
      $project: {
        userId: 1,
        scaledScore: {
          $cond: {
            if: { 
              $or: [
                { $eq: ["$sessionType", "smart-mock"] },
                { $eq: ["$subjectId", null] }
              ] 
            },
            then: "$score",
            else: { $multiply: [{ $ifNull: ["$score", 0] }, 4] }
          }
        }
      }
    },
    {
      $group: {
        _id: "$userId",
        avgScoreUTME: { $avg: "$scaledScore" }
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user"
      }
    },
    { $unwind: "$user" },
    { $match: { "user.role": "STUDENT" } },
    { $sort: { avgScoreUTME: -1 } },
    { $limit: 5 },
    {
      $project: {
        name: "$user.name",
        avgScoreUTME: { $round: ["$avgScoreUTME", 0] },
        examType: "$user.onboarding.examType"
      }
    }
  ]);

  const topPerformers = topPerformersAgg.map((u) => ({
    name: u.name || "Student",
    score: `${Math.min(u.avgScoreUTME || 0, 400)}/400`,
    class: u.examType || "General",
  }));

  console.log("Top Performers:", topPerformers);
  process.exit(0);
}
test();
