import PracticeQuestionService from "./PracticeQuestionService.js";
import PracticeSessionManager from "./PracticeSessionManager.js";
import PracticeGradingService from "./PracticeGradingService.js";

const PracticeService = {
  getQuestionsForSubject: PracticeQuestionService.getQuestionsForSubject.bind(PracticeQuestionService),
  getSubjects: PracticeQuestionService.getSubjects.bind(PracticeQuestionService),
  startSession: PracticeSessionManager.startSession.bind(PracticeSessionManager),
  recordVisibility: PracticeSessionManager.recordVisibility.bind(PracticeSessionManager),
  getSessionResult: PracticeSessionManager.getSessionResult.bind(PracticeSessionManager),
  submitSession: PracticeGradingService.submitSession.bind(PracticeGradingService),
  computeUTMEScoreFromMap: PracticeGradingService.computeUTMEScoreFromMap.bind(PracticeGradingService),
};

export default PracticeService;
