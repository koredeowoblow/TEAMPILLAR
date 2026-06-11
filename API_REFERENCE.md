# ⚡ Team Pillar - Complete API Documentation Reference

Welcome to the Team Pillar API documentation. This reference details all endpoints, authentication flows, request payloads, query parameters, validation rules, and security controls across the system.

---

## 🛠️ Base Configurations

*   **Base URL Path**: `/api/v1`
*   **Default Headers**:
    *   `Content-Type: application/json`
    *   `Authorization: Bearer <JWT_TOKEN>` (for private/protected endpoints)

### Global Security & Middleware Pipeline

All incoming requests are processed through a global middleware pipeline:
*   **Secure Transport Guard (`enforceSecureTransport`)**: Restricts non-SSL traffic and forces HTTPS configurations.
*   **Helmet Policies (`applySecurityHeaders`)**: Enforces secure DNS, framing protections, and script safety.
*   **Maintenance Guard (`checkMaintenance`)**: Intercepts request flows during active server upgrades (Admins bypass).
*   **Sanitization (`mongoSanitize`)**: Auto-scrubs MongoDB operators (`$`, `.`) from request payloads.

---

## 🔑 1. Authentication & Profile Settings Router (`/api/v1/auth`)

Provides standard credentials auth, session management, settings adjustments, social OAuth (Google/Apple), and account lifecycle.

### Credentials & Onboarding Flow

#### `POST` `/auth/register`
*   **Description**: Register a new student account.
*   **Rate Limit**: `registrationLimiter`
*   **Access**: Public
*   **Validation (Body)**:
    *   `email` (string, required): Valid email format.
    *   `password` (string, required): Min 8 characters. Must contain:
        *   At least one lowercase letter (`a-z`)
        *   At least one uppercase letter (`A-Z`)
        *   At least one digit (`0-9`)
        *   At least one special symbol (`@$!%*?&`)
    *   `name` (string, optional): Min length 2 characters.
    *   `fullName` (string, optional): Min length 2 characters.
    *   *Custom validation*: Either `name` or `fullName` must be provided, trimmed, and >= 2 characters.
*   **Action**: `AuthController.register`

#### `POST` `/auth/login`
*   **Description**: Authenticate user and issue access & refresh JWT tokens.
*   **Rate Limit**: `authLimiter`
*   **Access**: Public
*   **Validation (Body)**:
    *   `email` (string, required): Must be a valid email format.
    *   `password` (string, required): Cannot be empty.
*   **Action**: `AuthController.login`

#### `POST` `/auth/logout`
*   **Description**: Invalidate the active JWT session.
*   **Access**: Private (`protectUser`)
*   **Action**: `AuthController.logout`

#### `POST` `/auth/refresh`
*   **Description**: Refresh access token using a refresh token.
*   **Rate Limit**: `authLimiter`
*   **Access**: Public
*   **Action**: `AuthController.refreshToken`

---

### Verification & Account Recovery

#### `POST` `/auth/forgot-password`
*   **Description**: Sends a password reset OTP code to the email.
*   **Rate Limit**: `passwordResetLimiter`
*   **Access**: Public
*   **Validation (Body)**:
    *   `email` (string, required): Valid email format.
*   **Action**: `AuthController.forgotPassword`

#### `POST` `/auth/reset-password`
*   **Description**: Completes the password reset process using the OTP.
*   **Rate Limit**: `otpLimiter`
*   **Access**: Public
*   **Validation (Body)**:
    *   `email` (string, required): Valid email format. Custom check verifies if user exists.
    *   `otp` (string/number, required): Exactly a 4-digit number.
    *   `newPassword` (string, required): Min 8 characters, satisfies strong complexity.
    *   `confirmPassword` (string, required): Must match `newPassword`.
*   **Action**: `AuthController.resetPassword`

#### `POST` `/auth/change-password`
*   **Description**: Change password for an authenticated session.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `currentPassword` (string, required): Cannot be empty.
    *   `newPassword` (string, required): Min 8 characters, satisfies strong complexity.
*   **Action**: `AuthController.changePassword`

#### `POST` `/auth/verify-otp` (also alias `/auth/verify-email`)
*   **Description**: Verify a user's account using the registration/verification OTP.
*   **Rate Limit**: `otpLimiter`
*   **Access**: Public
*   **Validation (Body)**:
    *   `email` (string, required): Valid email format. Custom check verifies if user exists.
    *   `otp` (string/number, required): Exactly a 4-digit number.
*   **Action**: `AuthController.verifyEmail`

#### `POST` `/auth/resend-otp`
*   **Description**: Request a new email verification code.
*   **Rate Limit**: `passwordResetLimiter`
*   **Access**: Public
*   **Validation (Body)**:
    *   `email` (string, required): Valid email format. Custom check verifies if user exists.
*   **Action**: `AuthController.resendEmailVerification`

---

### Profile & Settings Configurations

#### `GET` `/auth/me`
*   **Description**: Get active user session details, onboarding flags, limits, and status.
*   **Access**: Private (`protectUser`)
*   **Action**: `AuthController.getProfile`

#### `PATCH` `/auth/profile`
*   **Description**: Update profile details or upload avatar image.
*   **Access**: Private (`protectUser`)
*   **Upload**: Handles single file upload with field name `photo` (via Multer).
*   **Action**: `AuthController.createOrUpdateProfile`

#### `GET` `/auth/settings`
*   **Description**: Fetch all notification and security settings for the active user.
*   **Access**: Private (`protectUser`)
*   **Action**: `SettingsController.getSettings`

#### `PATCH` `/auth/settings/profile`
*   **Description**: Short-hand patch for user profile properties.
*   **Access**: Private (`protectUser`)
*   **Action**: `SettingsController.updateProfile`

#### `POST` `/auth/settings/photo`
*   **Description**: Upload a new profile picture.
*   **Access**: Private (`protectUser`)
*   **Upload**: Single file upload with field name `photo`.
*   **Action**: `SettingsController.uploadPhoto`

#### `DELETE` `/auth/settings/photo`
*   **Description**: Remove profile photo, resetting user to default avatar.
*   **Access**: Private (`protectUser`)
*   **Action**: `SettingsController.removePhoto`

#### `PATCH` `/auth/settings/notifications`
*   **Description**: Toggle email, push, or reminder settings.
*   **Access**: Private (`protectUser`)
*   **Action**: `SettingsController.updateNotifications`

#### `PATCH` `/auth/settings/privacy`
*   **Description**: Toggle public profile settings and leaderboard visibility.
*   **Access**: Private (`protectUser`)
*   **Action**: `SettingsController.updatePrivacy`

#### `GET` `/auth/subscription`
*   **Description**: Query active premium subscription tier and billing schedule details.
*   **Access**: Private (`protectUser`)
*   **Action**: `SettingsController.getSubscription`

#### `POST` `/auth/deactivate`
*   **Description**: Set account active status to false.
*   **Access**: Private (`protectUser`)
*   **Action**: `SettingsController.deactivateAccount`

#### `POST` `/auth/reactivate`
*   **Description**: Reactivate a deactivated account structure.
*   **Access**: Private (`protectUser`)
*   **Action**: `SettingsController.reactivateAccount`

---

### Third-Party OAuth & Session Security

#### `POST` `/auth/google`
*   **Description**: Authenticate or sign up via Google Sign-In.
*   **Rate Limit**: `authLimiter`
*   **Access**: Public
*   **Action**: `AuthController.googleAuth`

#### `POST` `/auth/apple`
*   **Description**: Authenticate or sign up via Sign in with Apple.
*   **Rate Limit**: `authLimiter`
*   **Access**: Public
*   **Action**: `AuthController.appleAuth`

#### `GET` `/auth/sessions`
*   **Description**: Fetch active login sessions (IP, device/User-Agent, activity timestamp).
*   **Access**: Private (`protectUser`)
*   **Action**: `AuthController.getActiveSessions`

#### `POST` `/auth/logout-all`
*   **Description**: Invalidate and sign out of all active devices.
*   **Access**: Private (`protectUser`)
*   **Action**: `AuthController.logoutAllDevices`

#### `DELETE` `/auth/account`
*   **Description**: Completely delete the user account and purge related records.
*   **Access**: Private (`protectUser`)
*   **Action**: `AuthController.deleteAccount`

---

## 📝 2. Practice & Exam Session Router (`/api/v1/practice`)

Provides endpoints to interact with practice questions, starting/submitting practice papers, and adaptive engine features.

#### `GET` `/practice/questions`
*   **Description**: Fetch questions for testing.
*   **Access**: Private (`protectUser`)
*   **Validation (Query)**:
    *   `subjectId` (string, required): Cannot be empty.
    *   `limit` (integer, optional): Must be between 1 and 200.
    *   `difficulty` (string, optional): Must be one of `EASY`, `MEDIUM`, `HARD`, or `ADAPTIVE`.
    *   `year` (integer, optional): Must be a valid year >= 1900.
*   **Action**: `PracticeController.getQuestions`

#### `POST` `/practice/questions/next`
*   **Description**: Batch fetch the next set of adaptive questions during an active exam.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `sessionId` (string, required): Valid MongoDB ObjectID.
    *   `subjectId` (string, required): Cannot be empty.
*   **Action**: `PracticeController.getNextQuestions`

#### `GET` `/practice/sessions`
*   **Description**: Fetch past practice exam history of the student.
*   **Access**: Private (`protectUser`)
*   **Action**: `PracticeController.getSessions`

#### `GET` `/practice/subjects`
*   **Description**: Fetch the list of academic subjects configured in the platform.
*   **Access**: Private (`protectUser`)
*   **Action**: `PracticeController.getSubjects`

#### `POST` `/practice/session/start`
*   **Description**: Initialize a standard practice session.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   *Custom validation*: Must provide either a single `subjectId` (string) OR an array `subjectIds` (strings) containing at least one item.
*   **Action**: `PracticeController.startSession`

#### `POST` `/practice/session/submit`
*   **Description**: Submit final answers for grading and generate immediate analysis reports.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `sessionId` (string, required): Valid MongoDB ObjectID.
    *   `responses` (array, required): Array of student submissions.
        *   `responses.*.questionId` (string, required): Valid MongoDB ObjectID.
        *   `responses.*.selectedOption` (string, optional): Option ID.
    *   `tabSwitches` (integer, optional): Number of detected tab violations (>= 0).
*   **Action**: `PracticeController.submit`

#### `POST` `/practice/session/visibility`
*   **Description**: Real-time log of tab/window visibility loss events (for anti-cheat tracking).
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `sessionId` (string, required): Valid MongoDB ObjectID.
    *   `increment` (integer, optional): Min value 1.
*   **Action**: `PracticeController.recordVisibility`

#### `GET` `/practice/session/result/:id`
*   **Description**: View analytics, scores, and complete subject breakdowns for a completed practice session.
*   **Access**: Private (`protectUser`)
*   **Action**: `PracticeController.getResult`

---

## 🤖 3. AI Tutor & AI Helpers Router (`/api/v1/ai` or `/api/v1/ai-tutor`)

Exposes OpenAI/Gemini operations to explain questions, chat, and generate customized reports.

#### `POST` `/ai/explain` (also alias `/ai-tutor/explain`)
*   **Description**: Request multi-part step-by-step AI explanation for a UTME question.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `questionId` (string, required): Cannot be empty.
    *   `context` (object, optional): Object context containing surrounding choices or parameters.
*   **Action**: `AIController.explain`

#### `POST` `/ai/study-plan` (also alias `/ai-tutor/study-plan`)
*   **Description**: Generate an immediate custom study routine outlining subjects/topics.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `weakTopics` (array, optional): Array of topic strings.
*   **Action**: `AIController.generateStudyPlan`

#### `POST` `/ai/question-insight` (also alias `/ai-tutor/question-insight`)
*   **Description**: Generate question stats analysis explaining error triggers and distractors.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `id` (string, required): Cannot be empty.
    *   `failRate` (number, required): Numeric.
    *   `topic` (string, optional): Name of topic.
    *   `distractor` (string, optional): Text of most common incorrect choice.
*   **Action**: `AIController.generateQuestionInsight`

#### `POST` `/ai/chat` (also alias `/ai-tutor/chat`)
*   **Description**: Chat with the custom AI Tutor on any specific subject/topic.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `message` (string, required): Cannot be empty.
    *   `subject` (string, optional): Target subject context.
    *   `sessionId` (string, optional): Active test session to refer to.
    *   `history` (array, optional): Array of prior chat bubbles for context retention.
*   **Action**: `AIController.chat`

---

## 🎯 4. Smart Mock Exam Router (`/api/v1/practice/smart-mock`)

Dedicated router to compile full-length, AI-optimized mock exams mimicking official JAMB/UTME requirements.

#### `POST` `/practice/smart-mock/generate`
*   **Description**: Generate a smart mock exam.
*   **Rate Limit**: `smartMockLimiter` (max 30 requests/15 mins)
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   *Custom validation*: Must provide either a single `subjectId` (string) OR an array `subjectIds` (strings) containing at least one item.
*   **Action**: `SmartMockController.generateSmartMock`

#### `POST` `/practice/smart-mock/submit`
*   **Description**: Grade and close an active smart mock exam.
*   **Rate Limit**: `smartMockLimiter`
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `sessionId` (string, required): Valid MongoDB ObjectID.
    *   `responses` (array, required): Array of responses.
        *   `responses.*.questionId` (string, required): Valid MongoDB ObjectID.
    *   `tabSwitches` (integer, optional): Non-negative integer.
*   **Action**: `SmartMockController.submitSmartMock`

---

## 📚 5. Student Management Router (`/api/v1/student`)

Provides student onboarding profiles and quick dashboard cards.

#### `POST` `/student/me/onboarding`
*   **Description**: Complete the initial student onboarding choices.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `subjects` (array, optional): Array of selected subject IDs.
    *   `targetScore` (integer, optional): Target UTME score (0 to 400).
    *   `studyPlan` (string, optional): Must be `"1-2 hours"`, `"3-4 hours"`, or `"5+ hours"`.
*   **Action**: `StudentController.updateOnboarding`

#### `POST` `/student/me/subjects`
*   **Description**: Adjust selected subjects. (Locked to once every 7 days via database timestamp checks).
*   **Access**: Private (`protectUser`)
*   **Action**: `StudentController.updateSelectedSubjects`

#### `GET` `/student/me/dashboard`
*   **Description**: Fetch stats, charts, streaks, and recommendations for dashboard index.
*   **Access**: Private (`protectUser`)
*   **Validation (Query)**:
    *   `period` (string, optional): Must be one of `week`, `month`, or `all`.
*   **Action**: `StudentController.getDashboard`

---

## 📈 6. Performance Analytics Router (`/api/v1/analytics`)

Exposes metrics for charts, reports, and detail views.

#### `GET` `/analytics/summary`
*   **Description**: Fetch global analytics dashboard summary.
*   **Access**: Admin-Only (`protectUser` AND `protectAdmin`)
*   **Validation (Query)**:
    *   `from` (string, optional): ISO8601 date.
    *   `to` (string, optional): ISO8601 date.
*   **Action**: `AnalyticsController.summary`

#### `GET` `/analytics/reports`
*   **Description**: Export reports of general student levels.
*   **Access**: Admin-Only (`protectUser` AND `protectAdmin`)
*   **Validation (Query)**:
    *   `from` (string, optional): ISO8601 date.
    *   `to` (string, optional): ISO8601 date.
*   **Action**: `AnalyticsController.reports`

#### `GET` `/analytics/student/:id`
*   **Description**: Fetch individual analytics breakdown for a single student.
*   **Access**: Private (`protectUser`)
*   **Validation (Query/Params)**:
    *   `id` (string, required): Student id.
    *   `from` (string, optional): ISO8601 date.
    *   `to` (string, optional): ISO8601 date.
    *   `subjectId` (string, optional): Filter results for single subject.
*   **Action**: `AnalyticsController.studentAnalytics`

---

## 💳 7. Billing & Payment Gateway Router (`/api/v1/billing`)

Integrates subscription verification via Paystack.

#### `GET` `/billing/plans`
*   **Description**: Retrieve active pricing plans.
*   **Access**: Public
*   **Action**: `AdminPricingController.getPublicPlans`

#### `POST` `/billing/initialize`
*   **Description**: Prepare billing parameters for plan checkout.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `planId` (string, required): Cannot be empty.
    *   `billingCycle` (string, required): Cannot be empty (e.g., `"Monthly"`, `"Yearly"`).
*   **Action**: `BillingController.initialize`

#### `POST` `/billing/subscribe`
*   **Description**: Formulates Paystack standard checkout url.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `planId` (string, required): Cannot be empty.
    *   `billingCycle` (string, required): Cannot be empty.
*   **Action**: `BillingController.initializeSubscription`

#### `GET` `/billing/verify`
*   **Description**: Verify payment reference against Paystack endpoint.
*   **Access**: Private (`protectUser`)
*   **Action**: `BillingController.verify`

#### `POST` `/billing/webhook`
*   **Description**: Hook receiver to listen to Paystack events (`charge.success`, etc.).
*   **Access**: Public
*   **Action**: `BillingController.webhook`

---

## 🏫 8. Classes & Tutors Router (`/api/v1/classes`)

Virtual classes schedule and records.

#### `GET` `/classes`
*   **Description**: List virtual classes available.
*   **Access**: Private (`protectUser`)
*   **Action**: `ClassesController.list`

#### `POST` `/classes`
*   **Description**: Create a virtual class event.
*   **Access**: Admin-Only (`protectUser` AND `protectAdmin`)
*   **Action**: `ClassesController.create`

#### `GET` `/classes/:id`
*   **Description**: Fetch detail properties of a class.
*   **Access**: Private (`protectUser`)
*   **Action**: `ClassesController.get`

#### `PUT` `/classes/:id`
*   **Description**: Modify a class listing.
*   **Access**: Admin-Only (`protectUser` AND `protectAdmin`)
*   **Action**: `ClassesController.update`

#### `DELETE` `/classes/:id`
*   **Description**: Delete a class listing.
*   **Access**: Admin-Only (`protectUser` AND `protectAdmin`)
*   **Action**: `ClassesController.remove`

---

## 📝 9. Scheduled Exams Router (`/api/v1/exams`)

Institutional Exam operations.

#### `POST` `/exams`
*   **Description**: Register a new scheduled institutional mock exam.
*   **Access**: Admin-Only (uses `requireRole("ADMIN")`)
*   **Action**: `ExamController.create`

---

## 🏆 10. Achievements, Streaks & Leaderboards Router (`/api/v1`)

*Note: Mounted directly at root `/api/v1/` level, not `/api/v1/achievements`.*

#### `GET` `/achievements`
*   **Description**: Get earned achievements, badges, unlocked dates and progress.
*   **Access**: Private (`protectUser`)
*   **Action**: `AchievementController.getAchievements`

#### `POST` `/streaks`
*   **Description**: Ping user streak to calculate consecutive study days.
*   **Access**: Private (`protectUser`)
*   **Action**: `AchievementController.updateStreak`

#### `GET` `/leaderboard`
*   **Description**: Retrieve student performance score leaderboard.
*   **Access**: Private (`protectUser`)
*   **Action**: `AchievementController.getLeaderboard`

---

## 🔔 11. Notifications Router (`/api/v1/notifications`)

Manages alerts and messages sent to users.

#### `GET` `/notifications`
*   **Description**: List all user notifications.
*   **Access**: Private (`protectUser`)
*   **Action**: `NotificationController.list`

#### `GET` `/notifications/unread-count`
*   **Description**: Get count of unread notifications.
*   **Access**: Private (`protectUser`)
*   **Action**: `NotificationController.unreadCount`

#### `PATCH` `/notifications/mark-all-read`
*   **Description**: Mark all notifications as read.
*   **Access**: Private (`protectUser`)
*   **Action**: `NotificationController.markAllRead`

#### `PATCH` `/notifications/:id/read`
*   **Description**: Mark single notification as read.
*   **Access**: Private (`protectUser`)
*   **Action**: `NotificationController.markRead`

#### `DELETE` `/notifications`
*   **Description**: Clear notification inbox.
*   **Access**: Private (`protectUser`)
*   **Action**: `NotificationController.deleteAll`

#### `DELETE` `/notifications/:id`
*   **Description**: Delete a notification.
*   **Access**: Private (`protectUser`)
*   **Action**: `NotificationController.deleteOne`

---

## 📅 12. Study Planner Router (`/api/v1/planner`)

AI study scheduler.

#### `GET` `/planner/schedule`
*   **Description**: Get current daily study agenda.
*   **Access**: Private (`protectUser`)
*   **Action**: `PlannerController.getSchedule`

#### `POST` `/planner/generate`
*   **Description**: Produce study routine schedule based on parameters.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `targetScore` (number, required): Must be numeric.
    *   `hoursPerDay` (number, required): Must be numeric.
    *   `examDate` (string, required): Cannot be empty.
    *   `prioritySubjects` (array, optional): Subject array.
    *   `studyPreference` (string, optional): Priority topic/area focus.
*   **Action**: `PlannerController.generate`

#### `POST` `/planner/reschedule-day`
*   **Description**: Re-arrange study slot configurations for today.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `date` (string, required): Date code formatted YYYY-MM-DD.
*   **Action**: `PlannerController.rescheduleDay`

#### `PATCH` `/planner/session/:id/complete`
*   **Description**: Mark a single planner task slot as completed.
*   **Access**: Private (`protectUser`)
*   **Action**: `PlannerController.markComplete`

---

## ✉️ 13. Support Router (`/api/v1/support`)

Public ticket creation.

#### `POST` `/support/ticket`
*   **Description**: Submit support requests.
*   **Access**: Public / Auth-Optional (`optionalProtectUser`)
*   **Action**: `SupportController.createTicket`

---

## 👑 14. Platform Administration Router (`/api/v1/admin`)

*Note: Routes are mounted under both `/api/v1/` and `/api/v1/admin/`.*
*   **Rate Limit**: `adminRateLimiter` (max 100 requests/15 mins)
*   **Access**: Admin-Only (`protectUser` AND `protectAdmin`)

### Student Roster & Record Exports

#### `GET` `/admin/students`
*   **Description**: Paginated list of registered students.
*   **Validation (Query)**:
    *   `page` (integer, optional): Min value 1.
    *   `limit` (integer, optional): Min 1, Max 100.
    *   `search` (string, optional): Match name/email.
    *   `role` (string, optional): One of `STUDENT`, `TUTOR`, or `ADMIN`.
*   **Action**: `AdminController.listStudents`

#### `GET` `/admin/students/:id`
*   **Description**: View student information profile.
*   **Validation (Params)**:
    *   `id` (string, required): Valid MongoDB ObjectID.
*   **Action**: `AdminController.getStudent`

#### `GET` `/admin/students/:id/achievements`
*   **Description**: List student badges.
*   **Action**: `AdminController.getStudentAchievements`

#### `PATCH` `/admin/students/:id`
*   **Description**: Modify student metadata properties manually.
*   **Action**: `AdminController.updateStudent`

#### `DELETE` `/admin/students/:id`
*   **Description**: Delete student data.
*   **Action**: `AdminController.deleteStudent`

#### `POST` `/admin/students`
*   **Description**: Create new student.
*   **Action**: `AdminController.createStudent`

#### `POST` `/admin/students/export`
*   **Description**: Export all students' performance history as CSV.
*   **Action**: `AdminController.exportStudents`

#### `POST` `/admin/students/remind`
*   **Description**: Send push nudge or study reminders.
*   **Action**: `AdminController.sendReminder`

---

### User Security Account Operations

#### `GET` `/admin/users`
*   **Description**: View all user security accounts.
*   **Action**: `AdminController.getAllUsers`

#### `GET` `/admin/users/:userId`
*   **Description**: Retrieve user security details.
*   **Action**: `AdminController.getUserById`

#### `PUT` `/admin/users/:userId`
*   **Description**: Admin update user account properties.
*   **Action**: `AdminController.adminUpdateUser`

#### `PATCH` `/admin/users/:userId/promote`
*   **Description**: Toggle role permissions between standard users and Admin.
*   **Action**: `AdminController.toggleAdminStatus`

#### `POST` `/admin/users/:userId/otp`
*   **Description**: Manually send code OTP reset instructions.
*   **Action**: `AdminController.adminTriggerOTP`

#### `POST` `/admin/users/create-admin`
*   **Description**: Create root administration login.
*   **Action**: `AdminController.createAdmin`

#### `DELETE` `/admin/users/:userId`
*   **Description**: Remove user login credentials profiles.
*   **Action**: `AdminController.deleteUserProfile`

---

### System Analytics & Monitoring

#### `GET` `/admin/analytics/reports`
*   **Description**: Summary database analytics.
*   **Validation (Query)**:
    *   `from` (string, optional): ISO date string.
    *   `to` (string, optional): ISO date string.
    *   `subjectId` (string, optional): Non-empty filter.
*   **Action**: `AdminController.analyticsReports`

#### `GET` `/admin/dashboard/stats`
*   **Description**: Return summary dashboard numbers.
*   **Action**: `AdminController.dashboardStats`

#### `GET` `/admin/live-monitor`
*   **Description**: Return logs of students currently taking mock exams.
*   **Action**: `AdminController.liveMonitorData`

#### `GET` `/admin/tutors`
*   **Description**: List registered educators.
*   **Action**: `AdminController.getTutors`

#### `GET` `/admin/settings`
*   **Description**: View platform setting properties.
*   **Action**: `AdminController.getSettings`

#### `PUT` `/admin/settings`
*   **Description**: Modify global system parameters (e.g. maintenance mode).
*   **Action**: `AdminController.updateSettings`

---

### Question & Subject Inventory

#### `GET` `/admin/questions`
*   **Description**: List matching questions.
*   **Action**: `AdminController.listQuestions`

#### `GET` `/admin/questions/stats`
*   **Description**: Return counts of questions loaded by subject.
*   **Action**: `AdminController.questionStats`

#### `GET` `/admin/questions/:id`
*   **Description**: View details of single question.
*   **Action**: `AdminController.getQuestion`

#### `POST` `/admin/questions`
*   **Description**: Upload questions.
*   **Validation (Body)**: Must be an array of questions.
    *   `*.subjectId` (string, required): Cannot be empty.
    *   `*.content.type` (string, required): One of `text`, `image`, or `equation`.
    *   `*.content.value` (string, required): Cannot be empty.
    *   `*.options` (array, required): 2-5 option items.
        *   `*.options.*.text` (string, required): Option label.
        *   `*.options.*.isCorrect` (boolean, required): Flag for correct answer.
    *   `*.metadata.year` (integer, optional): Valid year 2000 to current year.
    *   `*.metadata.difficulty` (string, optional): One of `EASY`, `MEDIUM`, or `HARD`.
*   **Action**: `AdminController.uploadQuestions`

#### `PUT` `/admin/questions/:id`
*   **Description**: Update question properties.
*   **Action**: `AdminController.updateQuestion`

#### `DELETE` `/admin/questions/:id`
*   **Description**: Remove question item.
*   **Action**: `AdminController.deleteQuestion`

#### `GET` `/admin/subjects`
*   **Description**: List subjects.
*   **Action**: `PracticeController.getSubjects`

#### `POST` `/admin/subjects`
*   **Description**: Create subject classification.
*   **Action**: `PracticeController.createSubject`

#### `PATCH` `/admin/subjects/:id`
*   **Description**: Update subject details.
*   **Action**: `PracticeController.updateSubject`

#### `DELETE` `/admin/subjects/:id`
*   **Description**: Delete subject classification.
*   **Action**: `PracticeController.deleteSubject`

---

### Package & Pricing Management

#### `GET` `/admin/pricing`
*   **Description**: List loaded pricing plan entries.
*   **Action**: `AdminPricingController.listPlans`

#### `POST` `/admin/pricing`
*   **Description**: Create a pricing tier.
*   **Action**: `AdminPricingController.createPlan`

#### `PUT` `/admin/pricing/:id`
*   **Description**: Modify package values.
*   **Action**: `AdminPricingController.updatePlan`

#### `DELETE` `/admin/pricing/:id`
*   **Description**: Soft-delete a pricing plan.
*   **Action**: `AdminPricingController.softDeletePlan`

#### `PUT` `/admin/pricing/:id/toggle-popular`
*   **Description**: Toggle isPopular flag.
*   **Action**: `AdminPricingController.togglePopular`
