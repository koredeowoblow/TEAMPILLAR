# 🚀 Team Pillar - Frontend API Documentation

This documentation covers all backend endpoints, including Authentication, Student Onboarding, Practice, Billing, and Freemium Restrictions.

---

## 🔑 Authentication & Profile

### **POST** `/api/v1/auth/register`
Register a new student account.
- **Rate Limit**: Registration Limiter applied.
- **Body (JSON)**:
| Field | Type | Validation |
| :--- | :--- | :--- |
| `firstName` | String | Required |
| `lastName` | String | Required |
| `email` | String | Required, Email format |
| `password` | String | Required, Min 8 chars |

### **POST** `/api/v1/auth/login`
Authenticate a user.
- **Rate Limit**: Auth Limiter applied.
- **Body**: `{ "email": "...", "password": "..." }`
- **Success Response**: Returns JWT token in `data.token`.

### **GET** `/api/v1/auth/me`
Fetch current user profile and subscription status.
- **Auth Required**: Bearer Token
- **Success Response (200)**:
```json
{
  "status": "success",
  "data": {
    "id": "user_123",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "subscription": "free", // "free" | "pro"
    "selectedSubjects": ["subj_1", "subj_2"],
    "limits": {
      "dailyAICount": 2,
      "lastAIReset": "2026-06-05T12:00:00Z",
      "totalMockTests": 1
    }
  }
}
```

### **PATCH** `/api/v1/auth/profile`
Update user profile information or upload profile photo.
- **Auth Required**: Bearer Token
- **Body**: FormData (if uploading `photo`) or JSON.

### **POST** `/api/v1/auth/forgot-password`
Initiate password reset.
- **Body**: `{ "email": "..." }`

### **POST** `/api/v1/auth/reset-password`
Reset password using OTP.
- **Body**: `{ "email": "...", "otp": "...", "newPassword": "..." }`

### **POST** `/api/v1/auth/verify-otp` / `/api/v1/auth/verify-email`
Verify account email with OTP.
- **Body**: `{ "email": "...", "otp": "..." }`

---

## 📚 Student Onboarding & Dashboard

### **POST** `/api/v1/student/me/onboarding`
Save onboarding data including selected subjects.
- **Auth Required**: Bearer Token
- **Body (JSON)**:
| Field | Type | Validation | Description |
| :--- | :--- | :--- | :--- |
| `subjects` | Array | Required, Max 6 | Array of Subject IDs |
| `targetScore` | Number | Optional | User's target UTME score |
| `studyIntensity` | String | Optional | e.g. "moderate" |
- **Constraints**:
  - Free users: Max 2 subjects.
  - Pro users: Max 6 subjects.

### **POST** `/api/v1/student/me/subjects`
Update selected subjects after onboarding.
- **Auth Required**: Bearer Token
- **Validation**:
  - Once-a-week restriction: Returns `403 Forbidden` if updated within last 7 days.
- **Body**: `{ "subjects": ["id1", "id2"] }`

### **GET** `/api/v1/student/me/dashboard`
Fetch student dashboard summary (stats, upcoming sessions, recent performance).
- **Auth Required**: Bearer Token

---

## 🤖 AI Tutor (Freemium Restricted)

### **POST** `/api/v1/ai/explain`
Get an AI explanation for a specific question.
- **Auth Required**: Bearer Token
- **Body**: `{ "questionId": "id", "context": {}, "selectedOptionId": "opt1" }`
- **Freemium Rules**:
  - Free users: 10 explanations/day.
- **Limit Reached Error (403)**:
```json
{
  "status": "error",
  "code": "LIMIT_REACHED",
  "used": 10,
  "limit": 10,
  "resetAt": "2026-06-06T00:00:00.000Z"
}
```

---

## 📝 Practice & Smart Mock

### **GET** `/api/v1/practice/questions`
Fetch questions for a subject.
- **Query Params**: `subjectId`, `limit`, `topic`.

### **POST** `/api/v1/practice/session/start`
Initialize a practice session.
- **Body**: `{ "subjectId": "...", "mode": "study|exam", "questionCount": 20 }`

### **POST** `/api/v1/practice/session/submit`
Submit session answers for grading.
- **Body**: `{ "sessionId": "...", "answers": [{ "questionId": "...", "selectedOptionId": "..." }] }`

### **GET** `/api/v1/practice/session/result/:id`
Fetch results for a completed session.

### **POST** `/api/v1/practice/smart-mock/generate`
Generate an AI-powered smart mock session.
- **Freemium Rules**:
  - Free users: 5 lifetime mock tests.
- **Limit Reached Error (403)**:
```json
{
  "status": "error",
  "code": "LIMIT_REACHED",
  "used": 5,
  "limit": 5,
  "message": "Lifetime free mock test limit reached"
}
```

### **POST** `/api/v1/practice/smart-mock/submit`
Submit and grade a smart mock session.

---

## 💳 Billing & Subscriptions

### **GET** `/api/v1/payments/plans`
Fetch all active pricing plans.
- **Auth Required**: None (Public)
- **Success Response (200)**:
```json
{
  "status": "success",
  "data": [
    {
      "_id": "plan_pro",
      "name": "Pro",
      "tier": "pro",
      "isPopular": true,
      "billingCycles": [
        { "label": "Monthly", "price": 450000, "discountPercent": 0 },
        { "label": "Yearly", "price": 1200000, "discountPercent": 77 }
      ],
      "features": [
        { "label": "Unlimited AI", "included": true },
        { "label": "Offline Mode", "included": true }
      ]
    }
  ]
}
```

### **POST** `/api/v1/payments/subscribe`
Initialize a Paystack subscription.
- **Auth Required**: Bearer Token
- **Body**: `{ "planId": "id", "billingCycle": "Monthly" | "Yearly" }`
- **Success Response**:
```json
{
  "status": "success",
  "data": {
    "authorization_url": "https://checkout.paystack.com/xxxx",
    "access_code": "xxxx",
    "reference": "xxxx"
  }
}
```

---

## 📊 Analytics & Reports

### **GET** `/api/v1/analytics/student/:id`
Fetch performance analytics for a specific student.
- **Auth Required**: Bearer Token

### **GET** `/api/v1/analytics/summary` (Admin)
Get global platform summary.

### **GET** `/api/v1/analytics/reports` (Admin)
Get detailed reports.

---

## 🏆 Achievements & Leaderboard

### **GET** `/api/v1/achievements/achievements`
Fetch user's earned and available achievements.

### **POST** `/api/v1/achievements/streaks`
Update/check daily study streak.

### **GET** `/api/v1/achievements/leaderboard`
Fetch global/subject-based leaderboard.

---

## 📅 Study Planner

### **GET** `/api/v1/planner/schedule`
Fetch the current study schedule.

### **POST** `/api/v1/planner/generate`
Generate a new AI-powered study schedule.
- **Body**: `{ "targetScore": 300, "hoursPerDay": 4, "examDate": "2026-06-20", "prioritySubjects": [] }`

### **PATCH** `/api/v1/planner/session/:id/complete`
Mark a study session as complete.

---

## 🔔 Notifications

### **GET** `/api/v1/notifications`
List all notifications for the user.

### **PATCH** `/api/v1/notifications/:id/read`
Mark a notification as read.

### **DELETE** `/api/v1/notifications`
Clear all notifications.

---

## 🏫 Classes & Tutors

### **GET** `/api/v1/classes`
List available virtual classes or tutor sessions.

### **GET** `/api/v1/classes/:id`
Get details for a specific class.

---

## 📝 Exams

### **POST** `/api/v1/exams`
Schedule a new exam (Admin only).

---

## �️ Admin Panel

### **GET** `/api/v1/admin/students`
List all students with pagination and filters.
- **Auth Required**: Admin

### **GET** `/api/v1/admin/students/:id`
Get detailed student profile and activity log.

### **PATCH** `/api/v1/admin/students/:id`
Update student details or subscription manually.

### **GET** `/api/v1/admin/questions`
List all practice questions.

### **POST** `/api/v1/admin/questions`
Bulk upload questions (JSON/CSV).

### **GET** `/api/v1/admin/pricing`
List and manage subscription plans.

---

## ��️ Global Error Codes

| Code | Meaning | Action |
| :--- | :--- | :--- |
| `UPGRADE_REQUIRED` | Feature restricted to Pro users | Redirect to `/pricing` |
| `LIMIT_REACHED` | Daily/Lifetime quota exceeded | Show upgrade overlay |
| `FORBIDDEN` | Admin access required or restricted | Show access denied |
| `NOT_FOUND` | Resource not found | Handle 404 |

---

## 🎨 UI Rendering Guidelines

### **AI Responses**
AI responses use a mix of Markdown and LaTeX.
- **Inline Math**: `$x^2$`
- **Block Math**: `$$E=mc^2$$`
- **Renderer**: Use the `<AIResponse>` component in `src/components/ai/`.
- **Sanitization**: Always call `sanitizeAIContent(raw)` before passing text to the renderer.
