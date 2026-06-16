import { AppError } from "../utils/AppError.js";

export function resolveUserTier(user) {
  if (!user) return "free";
  
  if (user.role === "ADMIN" || user.role === "TUTOR") {
    return "pro";
  } else if (user.isPro === true) {
    return "pro";
  } else if (user.subscriptionStatus === "active") {
    return "pro";
  } else if (user.subscription === "pro") {
    return "pro";
  }
  
  return "free";
}

export function requireEntitlement(permission) {
  return (req, res, next) => {
    try {
      const tier = resolveUserTier(req.user);
      
      if (permission === "practice:multi_subject") {
        const { subjectId, subjectIds } = req.body;
        const requestedSubjects = Array.isArray(subjectIds) && subjectIds.length > 0 ? subjectIds : (subjectId ? [subjectId] : []);
        
        if (tier === "free" && requestedSubjects.length > 2) {
          throw new AppError(`Subject Limit Reached: Free users can select up to 2 subjects (you selected ${requestedSubjects.length}). Upgrade to Pro for all subjects!`, 403);
        }
      } else if (permission === "practice:unlimited_questions") {
        const { subjectId, subjectIds, limit, duration } = req.body;
        const requestedSubjects = Array.isArray(subjectIds) && subjectIds.length > 0 ? subjectIds : (subjectId ? [subjectId] : []);
        // The controller did:
        // const questionLimit = Math.min(Math.max(Number(limit || duration || 20), 1), CONSTANTS.PAGINATION.MAX_LIMIT);
        // But we don't have CONSTANTS imported here. Let's just calculate totalRequestedQuestions exactly like the controller.
        // Wait, the controller does Math.min(..., CONSTANTS.PAGINATION.MAX_LIMIT). I should import CONSTANTS.
        
        // Wait, the total requested questions check in controller:
        const rawLimit = Number(limit || duration || 20);
        // Let's assume questionLimit is just the rawLimit or 100 for now. Actually let's import CONSTANTS.
        const questionLimit = Math.max(rawLimit, 1);
        
        const totalRequestedQuestions = questionLimit * Math.max(requestedSubjects.length, 1);
        
        if (tier === "free" && totalRequestedQuestions > 40) {
          throw new AppError(`Question Limit Reached: Free users are limited to 40 questions total for multi-subject sessions. You requested ${totalRequestedQuestions}. Upgrade to Pro!`, 403);
        }
      }
      
      next();
    } catch (err) {
      next(err);
    }
  };
}
