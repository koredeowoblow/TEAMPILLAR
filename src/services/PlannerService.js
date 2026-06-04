import PlannerSchedule from "../models/PlannerScheduleModel.js";
import AIService from "./AIService.js";
import { logger } from "../core/logger.js";

const SUBJECTS = ["English", "Mathematics", "Physics", "Chemistry"];

// Map a subject name to its UTME topic pool
const TOPIC_POOL = {
  English: [
    "Comprehension Passages", "Lexis and Structure", "Concord (Agreement)",
    "Figures of Speech", "Oral English / Phonetics", "Essay Writing",
    "Tenses and Aspects", "Summary Writing", "Antonyms & Synonyms",
  ],
  Mathematics: [
    "Quadratic Equations", "Indices and Logarithms", "Coordinate Geometry",
    "Trigonometry", "Differentiation", "Integration", "Statistics & Probability",
    "Matrices and Determinants", "Number Theory",
  ],
  Physics: [
    "Mechanics (Newton's Laws)", "Waves and Sound", "Electricity & Magnetism",
    "Optics (Reflection & Refraction)", "Modern Physics", "Heat & Thermodynamics",
    "Pressure and Fluid Mechanics", "Motion (Equations of Motion)",
  ],
  Chemistry: [
    "Stoichiometry & Mole Concept", "Chemical Bonding", "Organic Chemistry (Hydrocarbons)",
    "Electrolysis & Faraday's Laws", "Equilibrium & Le Chatelier", "Periodic Table Trends",
    "Acids, Bases & Salts", "Rates of Reaction",
  ],
};

/**
 * Generate ISO date strings for each day of N weeks starting today.
 */
function buildDateGrid(examDate, hoursPerDay) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = new Date(examDate);
  exam.setHours(0, 0, 0, 0);
  const daysLeft = Math.max(Math.ceil((exam - today) / 86400000), 7);
  const weeksNeeded = Math.min(Math.ceil(daysLeft / 7), 12); // cap at 12 weeks

  const weeks = [];
  for (let w = 0; w < weeksNeeded; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(today);
      date.setDate(today.getDate() + w * 7 + d);
      days.push({
        date: date.toISOString().split("T")[0],
        isRestDay: hoursPerDay === 0,
        sessions: [],
      });
    }
    weeks.push({ weekIndex: w, days });
  }
  return weeks;
}

/**
 * Distribute sessions across the week grid.
 * Cycles through priority subjects, picking from each subject's topic pool.
 */
function populateSessions(weeks, prioritySubjects, hoursPerDay) {
  const subjects = prioritySubjects.length ? prioritySubjects : SUBJECTS;
  const sessionDuration = 45; // minutes
  const maxSessionsPerDay = Math.max(1, Math.floor((hoursPerDay * 60) / sessionDuration));
  const topicIndices = {}; // track rotation index per subject

  for (const week of weeks) {
    for (const day of week.days) {
      if (day.isRestDay) continue;
      for (let s = 0; s < maxSessionsPerDay; s++) {
        const subject = subjects[s % subjects.length];
        const pool = TOPIC_POOL[subject] || [`${subject} Revision`];
        if (!topicIndices[subject]) topicIndices[subject] = 0;
        const topic = pool[topicIndices[subject] % pool.length];
        topicIndices[subject]++;

        day.sessions.push({
          subject,
          topic,
          duration: sessionDuration,
          focus: s === 0 ? "Conceptual Review" : "Practice Questions",
          completed: false,
          completedAt: null,
        });
      }
    }
  }
}

class PlannerService {
  /**
   * Return the persisted schedule for a student (or null if none).
   */
  static async getSchedule(userId) {
    return PlannerSchedule.findOne({ userId }).lean();
  }

  /**
   * Generate (or regenerate) a full schedule and persist it.
   */
  static async generateSchedule({ userId, targetScore, hoursPerDay, examDate, prioritySubjects, studyPreference }) {
    // Try to enrich with AI topic suggestions (non-blocking; fall back to static pool)
    try {
      await AIService.generateStudyPlan(userId, prioritySubjects);
    } catch (err) {
      logger.warn("PlannerService: AI enrichment skipped", { error: err.message });
    }

    const weeks = buildDateGrid(examDate, hoursPerDay);
    populateSessions(weeks, prioritySubjects, hoursPerDay);

    const schedule = await PlannerSchedule.findOneAndUpdate(
      { userId },
      {
        userId,
        targetScore,
        hoursPerDay,
        examDate: new Date(examDate),
        prioritySubjects,
        studyPreference,
        weeks,
        generatedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return schedule;
  }

  /**
   * Regenerate sessions for a specific calendar date for a student.
   */
  static async rescheduleDay({ userId, date }) {
    const schedule = await PlannerSchedule.findOne({ userId });
    if (!schedule) return null;

    for (const week of schedule.weeks) {
      const day = week.days.find((d) => d.date === date);
      if (day) {
        day.sessions = [];
        populateSessions([{ weekIndex: week.weekIndex, days: [day] }], schedule.prioritySubjects, schedule.hoursPerDay);
        break;
      }
    }

    schedule.markModified("weeks");
    await schedule.save();
    return schedule;
  }

  /**
   * Toggle a session's completed status.
   */
  static async markSessionComplete({ userId, sessionId }) {
    const schedule = await PlannerSchedule.findOne({ userId });
    if (!schedule) return null;

    let found = false;
    for (const week of schedule.weeks) {
      for (const day of week.days) {
        const session = day.sessions.find((s) => String(s._id) === sessionId);
        if (session) {
          session.completed = !session.completed;
          session.completedAt = session.completed ? new Date() : null;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    schedule.markModified("weeks");
    await schedule.save();
    return schedule;
  }
}

export default PlannerService;
