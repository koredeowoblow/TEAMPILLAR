import { AppError } from "../utils/AppError.js";

export const onboardingGuard = (req, res, next) => {
  if (req.user && req.user.role !== "STUDENT") {
    return next();
  }
  const o = req.user?.onboarding || {};
  const emailVerified = req.user?.emailVerified === true || o.emailVerified === true;
  const completed = o.completed ?? false;

  if (completed) {
    return next();
  }

  // Determine current step
  let currentStep = "verify-email";
  if (emailVerified)               currentStep = "subject-selection";
  if (o.subjectsSelected ?? false) currentStep = "target-score";
  if (o.targetScoreSet ?? false)   currentStep = "study-hours";
  if (o.studyHoursSet ?? false)    currentStep = "completed";

  return res.status(403).json({
    success: false,
    code: "ONBOARDING_INCOMPLETE",
    currentStep,
    onboarding: {
      emailVerified: emailVerified,
      subjectsSelected: o.subjectsSelected ?? false,
      targetScoreSet: o.targetScoreSet ?? false,
      studyHoursSet: o.studyHoursSet ?? false,
    },
  });
};
