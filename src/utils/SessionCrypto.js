import crypto from "crypto";

const SERVER_SECRET = process.env.EXAM_SESSION_SECRET || "fallback_pillar_secret_key_8492049";

export function generateSessionFingerprint(sessionData) {
  const payload = {
    userId: String(sessionData.userId),
    totalDuration: sessionData.totalDuration,
    questionIds: (sessionData.questionIds || []).map(id => String(id)),
    sessionType: sessionData.sessionType,
    isMockTest: sessionData.isMockTest,
    sessionNonce: sessionData.sessionNonce
  };
  
  return crypto
    .createHmac("sha256", SERVER_SECRET)
    .update(JSON.stringify(payload))
    .digest("hex");
}

export function validateSessionFingerprint(sessionData, providedFingerprint) {
  const expected = generateSessionFingerprint(sessionData);
  return expected === providedFingerprint;
}
