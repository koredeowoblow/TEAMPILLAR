import { questionRepository } from "../../repository/QuestionRepository.js";
import { practiceRepository } from "../../repository/PracticeRepository.js";
import { CONSTANTS } from "../../config/constants.js";
import { userRepository } from "../../repository/UserRepository.js";
import Subject from "../../models/SubjectModel.js";
import mongoose from "mongoose";
import AdaptiveEngineService from "../AdaptiveEngineService.js";
import { AppError } from "../../utils/AppError.js";
import { resolveSubjectId } from "../../utils/subjectResolver.js";
import QuestionPoolService from "../QuestionPoolService.js";
class PracticeQuestionService {
  static async getQuestionsForSubject(
    subjectId,
    {
      userId,
      sessionId,
      topicId,
      difficulty,
      year,
      limit = CONSTANTS.PAGINATION.DEFAULT_LIMIT,
      filters = {},
      deterministic = false,
      isAdmin = false,
      topic,
    } = {},
  ) {
    try {
      const projectionStage = {
        $project: {
          _id: 1,
          subjectId: 1,
          content: { text: 1, image: 1, equation: 1 },
          metadata: 1,
          options: isAdmin
            ? 1
            : { id: 1, text: 1 }
        }
      };

      let resolvedSubjectId = null;
      if (subjectId) {
        resolvedSubjectId = await resolveSubjectId(subjectId);
      } else if (!isAdmin) {
        throw new AppError("subjectId is required", 400);
      }

      let session = null;
      if (sessionId) {
        session = await practiceRepository.findById(sessionId, [], { lean: true });
      }

      const sessionTopic = topic || session?.topic || null;

      if (session && session.questionIds && session.questionIds.length > 0) {
        const questions = await questionRepository.find({
          _id: { $in: session.questionIds },
        }, {
          lean: true,
          select: isAdmin
            ? "_id subjectId content metadata options"
            : "_id subjectId content metadata options.id options.text"
        });

        const subjectIds = [...new Set(questions.map(q => q.subjectId).filter(Boolean).map(String))];
        const subjectDocs = subjectIds.length > 0 ? await Subject.find({ _id: { $in: subjectIds } }).lean() : [];
        const subjectMap = {};
        subjectDocs.forEach(d => { subjectMap[String(d._id)] = d.name; });

        const qMap = new Map(questions.map((q) => [String(q._id || q.id), q]));
        const orderedQuestions = session.questionIds
          .map((id) => qMap.get(String(id)))
          .filter(Boolean);

        const safe = orderedQuestions.map((q) => {
          const correctOpt = q.options?.find((o) => o.isCorrect);
          const slim = {
            _id: q._id,
            subjectId: q.subjectId,
            subjectName: subjectMap[String(q.subjectId)] || "Subject",
            content: {
              text: q.content?.text,
              image: q.content?.image,
              equation: q.content?.equation,
            },
            metadata: q.metadata,
          };

          if (isAdmin) {
            slim.correctAnswer = correctOpt ? correctOpt.id : null;
            slim.options = q.options?.map((o) => ({
              id: o.id,
              text: o.text,
              isCorrect: o.isCorrect,
            })) || [];
          } else {
            if (q.options) {
              slim.options = q.options.map((o) => ({
                id: o.id,
                text: o.text,
              }));
            }
          }
          return slim;
        });
        return safe;
      }

      let matchStage = { ...filters };

      if (session && session.subjectIds && session.subjectIds.length > 1) {
        let allQuestions = [];
        const subjectDocs = await Subject.find({ _id: { $in: session.subjectIds } }).lean();
        const subjectNameMap = {};
        subjectDocs.forEach(d => { subjectNameMap[String(d._id)] = d.name; });

        for (let i = 0; i < session.subjectIds.length; i++) {
          const currentSubId = session.subjectIds[i];
          const currentLimit = Number(limit); 

          let subMatchStage = { ...filters, subjectId: currentSubId };

          if (!filters["metadata.topic"] && !filters["metadata.difficulty"]) {
            const adaptiveMatch = await AdaptiveEngineService.buildWeightedPool(
              userId,
              currentSubId,
              filters,
            );
            if (adaptiveMatch["metadata.topic"] && !sessionTopic)
              subMatchStage["metadata.topic"] = adaptiveMatch["metadata.topic"];
            if (adaptiveMatch["metadata.difficulty"])
              subMatchStage["metadata.difficulty"] = adaptiveMatch["metadata.difficulty"];
          }

          if (sessionTopic) subMatchStage["metadata.topic"] = sessionTopic;
          if (topicId) subMatchStage["metadata.topic"] = topicId;
          if (difficulty) subMatchStage["metadata.difficulty"] = difficulty.toLowerCase();
          if (year) subMatchStage["metadata.year"] = Number(year);

          const poolFilters = {};
          if (subMatchStage["metadata.topic"]) poolFilters.topic = subMatchStage["metadata.topic"];
          if (subMatchStage["metadata.difficulty"]) poolFilters.difficulty = subMatchStage["metadata.difficulty"];

          let subQuestions = await QuestionPoolService.getRandomFilteredQuestions(currentSubId, poolFilters, currentLimit);

          // Fallback if we didn't get enough questions
          if (subQuestions.length < currentLimit) {
            const extraCount = currentLimit - subQuestions.length;
            const extraQuestions = await QuestionPoolService.getRandomQuestionsBySubject(currentSubId, extraCount);
            
            const existingIds = new Set(subQuestions.map(q => q._id.toString()));
            for (const eq of extraQuestions) {
              if (!existingIds.has(eq._id.toString())) {
                subQuestions.push(eq);
              }
            }
          }

          const enrichedSubQuestions = subQuestions.map(q => ({
            ...q,
            subjectName: subjectNameMap[String(currentSubId)] || "Subject"
          }));

          allQuestions = allQuestions.concat(enrichedSubQuestions);
        }

        const safe = allQuestions.map((q) => {
          const slim = {
            _id: q._id,
            subjectId: q.subjectId,
            subjectName: q.subjectName,
            content: { text: q.content?.text, image: q.content?.image, equation: q.content?.equation },
            metadata: q.metadata,
            options: q.options?.map(o => ({ id: o.id, text: o.text })) || []
          };
          return slim;
        });

        if (session && session.sessionStatus === "ACTIVE") {
          await practiceRepository.update(sessionId, {
            questionIds: safe.map((q) => q._id),
            questionLimit: safe.length 
          });
        }
        return safe;
      }

      if (resolvedSubjectId) matchStage.subjectId = resolvedSubjectId;
      if (sessionTopic) matchStage["metadata.topic"] = sessionTopic;
      if (topicId) matchStage["metadata.topic"] = topicId;
      if (difficulty)
        matchStage["metadata.difficulty"] = difficulty.toLowerCase();
      if (year) matchStage["metadata.year"] = Number(year);

      const excludedIds = new Set();
      if (!isAdmin && process.env.NODE_ENV !== "test") {
        if (!sessionId) {
          throw new AppError("sessionId is required to fetch questions", 400);
        }
        if (!session) {
          throw new AppError("Session not found", 404);
        }
        if (String(session.userId) !== String(userId)) {
          throw new AppError("Access denied: Session ownership mismatch", 403);
        }
        if (session.sessionStatus !== "ACTIVE") {
          throw new AppError("Session is no longer active", 400);
        }
        if (session.responses) {
          session.responses.forEach((r) =>
            excludedIds.add(r.questionId.toString()),
          );
        }
      } else {
        if (session && session.responses) {
          session.responses.forEach((r) =>
            excludedIds.add(r.questionId.toString()),
          );
        }
      }

      if (userId) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentSessions = await practiceRepository.find({
          userId,
          createdAt: { $gte: sevenDaysAgo },
          sessionStatus: "COMPLETED",
        }, { lean: true });

        const recentlyAnsweredIds = new Set();
        recentSessions.forEach((s) => {
          if (s.responses) {
            s.responses.forEach((r) =>
              recentlyAnsweredIds.add(r.questionId.toString()),
            );
          }
        });

        const potentialExcluded = new Set([...excludedIds, ...recentlyAnsweredIds]);
        const candidateMatchStage = { ...matchStage };
        if (potentialExcluded.size > 0) {
          candidateMatchStage._id = {
            $nin: Array.from(potentialExcluded).map(
              (id) => new mongoose.Types.ObjectId(id),
            ),
          };
        }
        const availableCount = (await questionRepository.count(candidateMatchStage)) || 0;

        if (availableCount >= Number(limit)) {
          recentlyAnsweredIds.forEach((id) => excludedIds.add(id));
        }
      }

      if (excludedIds.size > 0) {
        matchStage._id = {
          $nin: Array.from(excludedIds).map(
            (id) => new mongoose.Types.ObjectId(id),
          ),
        };
      }

      if (!filters["metadata.topic"] && !filters["metadata.difficulty"]) {
        const adaptiveMatch = await AdaptiveEngineService.buildWeightedPool(
          userId,
          resolvedSubjectId,
          filters,
        );
        if (adaptiveMatch["metadata.topic"] && !sessionTopic)
          matchStage["metadata.topic"] = adaptiveMatch["metadata.topic"];
        if (adaptiveMatch["metadata.difficulty"])
          matchStage["metadata.difficulty"] =
            adaptiveMatch["metadata.difficulty"];
      }

      if (sessionTopic) matchStage["metadata.topic"] = sessionTopic;
      if (topicId) matchStage["metadata.topic"] = topicId;
      if (difficulty)
        matchStage["metadata.difficulty"] = difficulty.toLowerCase();
      if (year) matchStage["metadata.year"] = Number(year);

      const poolFilters = {};
      if (matchStage["metadata.topic"]) poolFilters.topic = matchStage["metadata.topic"];
      if (matchStage["metadata.difficulty"]) poolFilters.difficulty = matchStage["metadata.difficulty"];

      let questions = await QuestionPoolService.getRandomFilteredQuestions(resolvedSubjectId, poolFilters, Number(limit));

      // Filter out excluded IDs in memory
      if (excludedIds.size > 0) {
        questions = questions.filter(q => !excludedIds.has(q._id.toString()));
      }

      if (!deterministic && questions.length < limit) {
        let fallbackLimit = limit - questions.length;
        let extraQuestions = await QuestionPoolService.getRandomQuestionsBySubject(resolvedSubjectId, fallbackLimit);
        
        let existingIds = new Set(questions.map(q => q._id.toString()));
        for (const eq of extraQuestions) {
          if (!existingIds.has(eq._id.toString()) && !excludedIds.has(eq._id.toString())) {
            questions.push(eq);
          }
        }
      }

      const safe = questions.map((q) => {
        const correctOpt = q.options?.find((o) => o.isCorrect);

        const slim = {
          _id: q._id,
          subjectId: q.subjectId,
          content: {
            text: q.content?.text,
            image: q.content?.image,
            equation: q.content?.equation,
          },
          metadata: q.metadata,
        };

        if (isAdmin) {
          slim.correctAnswer = correctOpt ? correctOpt.id : null;
          slim.options = q.options.map((o) => ({
            id: o.id,
            text: o.text,
            isCorrect: o.isCorrect,
          }));
        } else {
          if (q.options) {
            slim.options = q.options.map((o) => ({
              id: o.id,
              text: o.text,
            }));
          }
        }
        return slim;
      });

      if (session && session.sessionStatus === "ACTIVE" && (!session.questionIds || session.questionIds.length === 0)) {
        await practiceRepository.update(sessionId, {
          questionIds: safe.map((q) => q._id),
        });
      }

      return safe;
    } catch (error) {
      throw new Error(`Failed to get questions for subject: ${error.message}`);
    }
  }

  static async getSubjects({ page = 1, limit = 50, userId = null, isAdmin = false } = {}) {
    const skip = (page - 1) * limit;
    let query = {};

    if (!isAdmin) {
      query.isActive = { $ne: false };
    }

    if (userId) {
      const user = await userRepository.findById(userId, { lean: true, select: "selectedSubjects" });
      if (user && user.selectedSubjects && user.selectedSubjects.length > 0) {
        query._id = { $in: user.selectedSubjects };
      }
    }

    const total = await Subject.countDocuments(query);
    const subjects = await Subject.find(query).skip(skip).limit(limit).lean();
    const mapped = subjects.map((s) => ({
      id: String(s._id),
      name: s.name,
      code: s.code,
      description: s.description,
      questionCount: Number(s.questionCount || 0),
      isActive: s.isActive,
    }));
    return {
      data: mapped,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }
}

export default PracticeQuestionService;
