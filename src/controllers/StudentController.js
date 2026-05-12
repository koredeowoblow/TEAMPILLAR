import { sendSuccess, sendError } from "../core/response.js";
import { userRepository } from "../repository/UserRepository.js";
import { practiceRepository } from "../repository/PracticeRepository.js";
import { AppError } from "../utilis/AppError.js";

class StudentController {
  static async updateOnboarding(req, res) {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Unauthorized", 401);
    const data = req.body;
    const updated = await userRepository.updateUser(userId, {
      onboarding: data,
    });
    return sendSuccess(res, {
      message: "Onboarding saved",
      data: updated,
      statusCode: 200,
    });
  }

  static async getDashboard(req, res) {
    const user = req.user;
    if (!user) throw new AppError("Unauthorized", 401);

    const sessions = await practiceRepository.find(
      { userId: user.id },
      { sort: { createdAt: -1 }, limit: 10 },
    );
    
    const total = sessions.length;
    const currentScore = total ? Math.round(sessions.reduce((s, x) => s + (x.score || 0), 0) / total) : 0;
    const targetScore = user.onboarding?.targetScore || 300;
    const progressPercentage = Math.min(Math.round((currentScore / targetScore) * 100), 100);

    const dashboard = {
      name: user.name.split(" ")[0], // Just first name for greeting
      daysUntilUTME: 45, // This should ideally be calculated from a constant UTME date
      minutesStudiedToday: user.analytics?.minutesToday || 0,
      targetScore,
      currentScore,
      progressPercentage,
      streak: user.analytics?.streak || 0,
      averageScore: currentScore,
      todayPlan: user.onboarding?.studyPlan || [
        { id: 1, topic: "Cell Biology", subject: "Biology", duration: "45m", completed: false },
        { id: 2, topic: "Atomic Structure", subject: "Chemistry", duration: "1h", completed: false }
      ],
      recentActivity: sessions.map(s => ({
        id: s.id,
        title: `${s.subject || 'Practice'} Session`,
        subtitle: `Scored ${s.score}% • ${new Date(s.createdAt).toLocaleDateString()}`,
        color: (s.score || 0) > 70 ? 'bg-primary' : 'bg-secondary'
      }))
    };

    return sendSuccess(res, {
      message: "Dashboard retrieved",
      data: dashboard,
      statusCode: 200,
    });
  }
}

export default StudentController;
