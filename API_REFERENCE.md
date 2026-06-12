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
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Registration successful",
      "data": {
        "accessToken": "eyJhbGciOi...",
        "user": {
          "_id": "user-id",
          "email": "student@example.com",
          "name": "John Doe",
          "role": "STUDENT"
        }
      }
    }
    ```

#### `POST` `/auth/login`
*   **Description**: Authenticate user and issue access & refresh JWT tokens.
*   **Rate Limit**: `authLimiter`
*   **Access**: Public
*   **Validation (Body)**:
    *   `email` (string, required): Must be a valid email format.
    *   `password` (string, required): Cannot be empty.
*   **Action**: `AuthController.login`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Login successful",
      "data": {
        "accessToken": "eyJhbGciOi...",
        "user": {
          "_id": "user-id",
          "email": "student@example.com",
          "name": "John Doe",
          "role": "STUDENT",
          "onboardingComplete": true,
          "subscription": "free"
        }
      }
    }
    ```

#### `POST` `/auth/logout`
*   **Description**: Invalidate the active JWT session.
*   **Access**: Private (`protectUser`)
*   **Action**: `AuthController.logout`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Logged out successfully",
      "data": null
    }
    ```

#### `POST` `/auth/refresh`
*   **Description**: Refresh access token using a refresh token.
*   **Rate Limit**: `authLimiter`
*   **Access**: Public
*   **Action**: `AuthController.refreshToken`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Token refreshed successfully",
      "data": {
        "accessToken": "eyJhbGciOi..."
      }
    }
    ```

---

### Verification & Account Recovery

#### `POST` `/auth/forgot-password`
*   **Description**: Sends a password reset OTP code to the email.
*   **Rate Limit**: `passwordResetLimiter`
*   **Access**: Public
*   **Validation (Body)**:
    *   `email` (string, required): Valid email format.
*   **Action**: `AuthController.forgotPassword`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "OTP sent to your email",
      "data": null
    }
    ```

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
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Password reset successfully",
      "data": null
    }
    ```

#### `POST` `/auth/change-password`
*   **Description**: Change password for an authenticated session.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `currentPassword` (string, required): Cannot be empty.
    *   `newPassword` (string, required): Min 8 characters, satisfies strong complexity.
*   **Action**: `AuthController.changePassword`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Password changed successfully",
      "data": null
    }
    ```

#### `POST` `/auth/verify-otp` (also alias `/auth/verify-email`)
*   **Description**: Verify a user's account using the registration/verification OTP.
*   **Rate Limit**: `otpLimiter`
*   **Access**: Public
*   **Validation (Body)**:
    *   `email` (string, required): Valid email format. Custom check verifies if user exists.
    *   `otp` (string/number, required): Exactly a 4-digit number.
*   **Action**: `AuthController.verifyEmail`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Email verified successfully",
      "data": null
    }
    ```

#### `POST` `/auth/resend-otp`
*   **Description**: Request a new email verification code.
*   **Rate Limit**: `passwordResetLimiter`
*   **Access**: Public
*   **Validation (Body)**:
    *   `email` (string, required): Valid email format. Custom check verifies if user exists.
*   **Action**: `AuthController.resendEmailVerification`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Verification code resent successfully",
      "data": null
    }
    ```

---

### Profile & Settings Configurations

#### `GET` `/auth/me`
*   **Description**: Get active user session details, onboarding flags, limits, and status.
*   **Access**: Private (`protectUser`)
*   **Action**: `AuthController.getProfile`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Profile retrieved successfully",
      "data": {
        "user": {
          "_id": "user-id",
          "email": "student@example.com",
          "name": "John Doe",
          "role": "STUDENT",
          "subscription": "free",
          "onboardingComplete": true,
          "selectedSubjects": ["subj-id-1", "subj-id-2"],
          "limits": {
            "totalMockTests": 1,
            "aiPromptsUsed": 5
          }
        }
      }
    }
    ```

#### `PATCH` `/auth/profile`
*   **Description**: Update profile details or upload avatar image.
*   **Access**: Private (`protectUser`)
*   **Upload**: Handles single file upload with field name `photo` (via Multer).
*   **Action**: `AuthController.createOrUpdateProfile`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `GET` `/auth/settings`
*   **Description**: Fetch all notification and security settings for the active user.
*   **Access**: Private (`protectUser`)
*   **Action**: `SettingsController.getSettings`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Settings retrieved",
      "data": {
        "notifications": {
          "emailAlerts": true,
          "pushNotifications": true,
          "studyReminders": false
        },
        "privacy": {
          "publicProfile": true,
          "showOnLeaderboard": true
        }
      }
    }
    ```

#### `PATCH` `/auth/settings/profile`
*   **Description**: Short-hand patch for user profile properties.
*   **Access**: Private (`protectUser`)
*   **Action**: `SettingsController.updateProfile`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Profile updated successfully",
      "data": {
        "user": {
          "_id": "user-id",
          "name": "Updated Name",
          "email": "student@example.com"
        }
      }
    }
    ```

#### `POST` `/auth/settings/photo`
*   **Description**: Upload a new profile picture.
*   **Access**: Private (`protectUser`)
*   **Upload**: Single file upload with field name `photo`.
*   **Action**: `SettingsController.uploadPhoto`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `DELETE` `/auth/settings/photo`
*   **Description**: Remove profile photo, resetting user to default avatar.
*   **Access**: Private (`protectUser`)
*   **Action**: `SettingsController.removePhoto`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `PATCH` `/auth/settings/notifications`
*   **Description**: Toggle email, push, or reminder settings.
*   **Access**: Private (`protectUser`)
*   **Action**: `SettingsController.updateNotifications`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Notifications updated successfully",
      "data": null
    }
    ```

#### `PATCH` `/auth/settings/privacy`
*   **Description**: Toggle public profile settings and leaderboard visibility.
*   **Access**: Private (`protectUser`)
*   **Action**: `SettingsController.updatePrivacy`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Privacy settings updated successfully",
      "data": null
    }
    ```

#### `GET` `/auth/subscription`
*   **Description**: Query active premium subscription tier and billing schedule details.
*   **Access**: Private (`protectUser`)
*   **Action**: `SettingsController.getSubscription`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `POST` `/auth/deactivate`
*   **Description**: Set account active status to false.
*   **Access**: Private (`protectUser`)
*   **Action**: `SettingsController.deactivateAccount`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `POST` `/auth/reactivate`
*   **Description**: Reactivate a deactivated account structure.
*   **Access**: Private (`protectUser`)
*   **Action**: `SettingsController.reactivateAccount`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

---

### Third-Party OAuth & Session Security

#### `POST` `/auth/google`
*   **Description**: Authenticate or sign up via Google Sign-In.
*   **Rate Limit**: `authLimiter`
*   **Access**: Public
*   **Action**: `AuthController.googleAuth`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Authentication successful",
      "data": {
        "accessToken": "eyJhbGciOi...",
        "user": {
          "_id": "user-id",
          "email": "student@gmail.com",
          "name": "Jane Doe",
          "role": "STUDENT"
        }
      }
    }
    ```

#### `POST` `/auth/apple`
*   **Description**: Authenticate or sign up via Sign in with Apple.
*   **Rate Limit**: `authLimiter`
*   **Access**: Public
*   **Action**: `AuthController.appleAuth`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `GET` `/auth/sessions`
*   **Description**: Fetch active login sessions (IP, device/User-Agent, activity timestamp).
*   **Access**: Private (`protectUser`)
*   **Action**: `AuthController.getActiveSessions`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `POST` `/auth/logout-all`
*   **Description**: Invalidate and sign out of all active devices.
*   **Access**: Private (`protectUser`)
*   **Action**: `AuthController.logoutAllDevices`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Logged out of all devices",
      "data": null
    }
    ```

#### `DELETE` `/auth/account`
*   **Description**: Completely delete the user account and purge related records.
*   **Access**: Private (`protectUser`)
*   **Action**: `AuthController.deleteAccount`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

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
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Questions retrieved",
      "data": [
        {
          "id": "question-id",
          "content": {
            "text": "What is the capital of France?",
            "image": null
          },
          "options": [
            { "id": "opt-1", "key": "opt-1", "text": "Paris" },
            { "id": "opt-2", "key": "opt-2", "text": "London" }
          ],
          "metadata": {
            "difficulty": "EASY",
            "topic": "Geography"
          },
          "subjectId": "subj-id"
        }
      ]
    }
    ```

#### `POST` `/practice/questions/next`
*   **Description**: Batch fetch the next set of adaptive questions during an active exam.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `sessionId` (string, required): Valid MongoDB ObjectID.
    *   `subjectId` (string, required): Cannot be empty.
*   **Action**: `PracticeController.getNextQuestions`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Next questions retrieved",
      "data": [
        {
          "id": "question-id",
          "content": { "text": "What is 2+2?" },
          "options": [
            { "id": "opt-1", "key": "opt-1", "text": "4" }
          ],
          "metadata": { "difficulty": "EASY" },
          "subjectId": "subj-id"
        }
      ]
    }
    ```

#### `GET` `/practice/sessions`
*   **Description**: Fetch past practice exam history of the student.
*   **Access**: Private (`protectUser`)
*   **Action**: `PracticeController.getSessions`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Sessions retrieved",
      "data": [
        {
          "id": "session-id",
          "subjectId": "subj-id",
          "sessionStatus": "COMPLETED",
          "score": 85,
          "questionLimit": 20,
          "analytics": {
            "accuracy": 85,
            "speedPerQuestion": 45,
            "topMistakeTopic": "Algebra"
          },
          "startTime": "2026-06-10T10:00:00Z",
          "endTime": "2026-06-10T10:20:00Z"
        }
      ]
    }
    ```

#### `GET` `/practice/subjects`
*   **Description**: Fetch the list of academic subjects configured in the platform.
*   **Access**: Private (`protectUser`)
*   **Action**: `PracticeController.getSubjects`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Subjects retrieved",
      "data": [
        {
          "_id": "subj-id",
          "name": "Mathematics",
          "category": "Science",
          "description": "General Mathematics",
          "isActive": true
        }
      ]
    }
    ```

#### `POST` `/practice/session/start`
*   **Description**: Initialize a standard practice session.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   *Custom validation*: Must provide either a single `subjectId` (string) OR an array `subjectIds` (strings) containing at least one item.
*   **Action**: `PracticeController.startSession`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Session started",
      "data": {
        "sessionId": "session-id",
        "questions": [
          {
            "id": "question-id",
            "content": {
              "text": "Solve for x.",
              "image": null
            },
            "options": [
              { "id": "opt-1", "key": "opt-1", "text": "2" },
              { "id": "opt-2", "key": "opt-2", "text": "4" }
            ],
            "metadata": {
              "difficulty": "MEDIUM",
              "topic": "Algebra"
            },
            "subjectId": "subj-id"
          }
        ]
      }
    }
    ```

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
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Session submitted successfully",
      "data": {
        "id": "session-id",
        "score": 85,
        "analytics": {
          "accuracy": 85,
          "speedPerQuestion": 45
        },
        "responses": [
          {
            "questionId": "question-id",
            "selectedOption": "opt-1",
            "isCorrect": true
          }
        ]
      }
    }
    ```

#### `POST` `/practice/session/visibility`
*   **Description**: Real-time log of tab/window visibility loss events (for anti-cheat tracking).
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `sessionId` (string, required): Valid MongoDB ObjectID.
    *   `increment` (integer, optional): Min value 1.
*   **Action**: `PracticeController.recordVisibility`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Visibility violation recorded",
      "data": {
        "tabSwitches": 4,
        "isFlagged": true
      }
    }
    ```

#### `GET` `/practice/session/result/:id`
*   **Description**: View analytics, scores, and complete subject breakdowns for a completed practice session.
*   **Access**: Private (`protectUser`)
*   **Action**: `PracticeController.getResult`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Session result retrieved",
      "data": {
        "id": "session-id",
        "score": 85,
        "analytics": {
          "accuracy": 85,
          "speedPerQuestion": 45
        },
        "responses": [
          {
            "questionId": "question-id",
            "selectedOption": "opt-1",
            "timeTaken": 30,
            "isCorrect": true,
            "userAnswer": "2",
            "correctAnswer": "2",
            "question": {
              "id": "question-id",
              "content": { "text": "Solve for x." },
              "options": [
                { "id": "opt-1", "text": "2", "isCorrect": true },
                { "id": "opt-2", "text": "4", "isCorrect": false }
              ],
              "explanation": {
                "summary": "AI generated explanation...",
                "whyCorrect": "Because 2+2=4.",
                "whyOthersWrong": ["4 is incorrect because..."],
                "examTip": "Always check your signs."
              }
            }
          }
        ]
      }
    }
    ```

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
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Explanation generated",
      "data": {
        "summary": "This question tests your knowledge of kinematics.",
        "whyCorrect": "Option A is correct because v = u + at.",
        "whyOthersWrong": [
          "Option B uses the wrong formula.",
          "Option C ignores initial velocity."
        ],
        "examTip": "Always convert km/h to m/s before applying equations of motion.",
        "relatedConcepts": ["Kinematics", "Equations of Motion"]
      }
    }
    ```

#### `POST` `/ai/study-plan` (also alias `/ai-tutor/study-plan`)
*   **Description**: Generate an immediate custom study routine outlining subjects/topics.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `weakTopics` (array, optional): Array of topic strings.
*   **Action**: `AIController.generateStudyPlan`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Study plan generated",
      "data": {
        "focusAreas": ["Calculus", "Mechanics"],
        "dailyRoutine": [
          {
            "day": "Monday",
            "tasks": ["Review derivatives", "Solve 20 mechanics questions"]
          }
        ],
        "tips": ["Take short breaks every 45 minutes."]
      }
    }
    ```

#### `POST` `/ai/question-insight` (also alias `/ai-tutor/question-insight`)
*   **Description**: Generate question stats analysis explaining error triggers and distractors.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `id` (string, required): Cannot be empty.
    *   `failRate` (number, required): Numeric.
    *   `topic` (string, optional): Name of topic.
    *   `distractor` (string, optional): Text of most common incorrect choice.
*   **Action**: `AIController.generateQuestionInsight`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Insight generated",
      "data": {
        "analysis": "Students often pick the distractor because they forget to square the radius.",
        "commonPitfalls": ["Forgetting formula", "Unit conversion errors"],
        "teachingStrategy": "Emphasize writing down units before calculation."
      }
    }
    ```

#### `POST` `/ai/chat` (also alias `/ai-tutor/chat`)
*   **Description**: Chat with the custom AI Tutor on any specific subject/topic.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `message` (string, required): Cannot be empty.
    *   `subject` (string, optional): Target subject context.
    *   `sessionId` (string, optional): Active test session to refer to.
    *   `history` (array, optional): Array of prior chat bubbles for context retention.
*   **Action**: `AIController.chat`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Chat response generated",
      "data": {
        "reply": "Newton's first law states that an object at rest stays at rest...",
        "context": "Physics"
      }
    }
    ```

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
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Smart mock generated",
      "data": {
        "sessionId": "mock-session-id",
        "questions": [
          {
            "_id": "q-id",
            "subjectId": "subj-id",
            "text": "Calculate the derivative...",
            "options": [
              { "key": "A", "text": "2x" }
            ]
          }
        ]
      }
    }
    ```

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
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Smart mock submitted",
      "data": {
        "compositeScore": 310,
        "sessionId": "mock-session-id",
        "timeTaken": 6000,
        "subjectScores": [
          {
            "subjectId": "subj-id",
            "subjectName": "Mathematics",
            "score": 85,
            "correct": 34,
            "total": 40
          }
        ]
      }
    }
    ```

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
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Onboarding completed successfully",
      "data": {
        "user": {
          "_id": "user-id",
          "onboardingComplete": true,
          "selectedSubjects": ["subj-1", "subj-2", "subj-3", "subj-4"],
          "onboarding": {
            "targetScore": 280,
            "studyPlan": "3-4 hours"
          }
        }
      }
    }
    ```

#### `POST` `/student/me/subjects`
*   **Description**: Adjust selected subjects. (Locked to once every 7 days via database timestamp checks).
*   **Access**: Private (`protectUser`)
*   **Action**: `StudentController.updateSelectedSubjects`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Subjects updated successfully",
      "data": {
        "selectedSubjects": ["subj-1", "subj-2", "subj-3", "subj-4"]
      }
    }
    ```

#### `GET` `/student/me/dashboard`
*   **Description**: Fetch stats, charts, streaks, and recommendations for dashboard index.
*   **Access**: Private (`protectUser`)
*   **Validation (Query)**:
    *   `period` (string, optional): Must be one of `week`, `month`, or `all`.
*   **Action**: `StudentController.getDashboard`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Dashboard data retrieved",
      "data": {
        "stats": {
          "totalSessions": 12,
          "averageScore": 76,
          "studyStreak": 5,
          "questionsAnswered": 450
        },
        "recentSessions": [
          {
            "id": "session-id",
            "subjectId": "subj-id",
            "score": 80,
            "createdAt": "2026-06-10T10:00:00Z"
          }
        ],
        "recommendations": [
          {
            "subjectId": "subj-id",
            "topic": "Calculus",
            "reason": "Low accuracy (40%) in recent sessions",
            "recommendedAction": "Start Practice"
          }
        ]
      }
    }
    ```

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
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `GET` `/analytics/reports`
*   **Description**: Export reports of general student levels.
*   **Access**: Admin-Only (`protectUser` AND `protectAdmin`)
*   **Validation (Query)**:
    *   `from` (string, optional): ISO8601 date.
    *   `to` (string, optional): ISO8601 date.
*   **Action**: `AnalyticsController.reports`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `GET` `/analytics/student/:id`
*   **Description**: Fetch individual analytics breakdown for a single student.
*   **Access**: Private (`protectUser`)
*   **Validation (Query/Params)**:
    *   `id` (string, required): Student id.
    *   `from` (string, optional): ISO8601 date.
    *   `to` (string, optional): ISO8601 date.
    *   `subjectId` (string, optional): Filter results for single subject.
*   **Action**: `AnalyticsController.studentAnalytics`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Analytics retrieved",
      "data": {
        "overall": {
          "totalSessions": 15,
          "averageScore": 72,
          "totalQuestions": 300,
          "correctAnswers": 216
        },
        "subjects": [
          {
            "subjectId": "subj-id",
            "subjectName": "Mathematics",
            "score": 80,
            "questionsAttempted": 100
          }
        ],
        "weakTopics": ["Probability", "Trigonometry"]
      }
    }
    ```

---

## 💳 7. Billing & Payment Gateway Router (`/api/v1/billing`)

Integrates subscription verification via Paystack.

#### `GET` `/billing/plans`
*   **Description**: Retrieve active pricing plans.
*   **Access**: Public
*   **Action**: `AdminPricingController.getPublicPlans`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `POST` `/billing/initialize`
*   **Description**: Prepare billing parameters for plan checkout.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `planId` (string, required): Cannot be empty.
    *   `billingCycle` (string, required): Cannot be empty (e.g., `"Monthly"`, `"Yearly"`).
*   **Action**: `BillingController.initialize`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Billing initialized",
      "data": {
        "checkoutUrl": "https://checkout.paystack.com/...",
        "reference": "ref-12345",
        "accessCode": "code-12345"
      }
    }
    ```

#### `POST` `/billing/subscribe`
*   **Description**: Formulates Paystack standard checkout url.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `planId` (string, required): Cannot be empty.
    *   `billingCycle` (string, required): Cannot be empty.
*   **Action**: `BillingController.initializeSubscription`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `GET` `/billing/verify`
*   **Description**: Verify payment reference against Paystack endpoint.
*   **Access**: Private (`protectUser`)
*   **Action**: `BillingController.verify`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `POST` `/billing/webhook`
*   **Description**: Hook receiver to listen to Paystack events (`charge.success`, etc.).
*   **Access**: Public
*   **Action**: `BillingController.webhook`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

---

## 🏫 8. Classes & Tutors Router (`/api/v1/classes`)

Virtual classes schedule and records.

#### `GET` `/classes`
*   **Description**: List virtual classes available.
*   **Access**: Private (`protectUser`)
*   **Action**: `ClassesController.list`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Classes retrieved",
      "data": [
        {
          "id": "class-id",
          "title": "Intro to Organic Chemistry",
          "tutor": "Dr. Sarah",
          "date": "2026-06-15T14:00:00Z",
          "link": "https://zoom.us/j/...",
          "status": "UPCOMING"
        }
      ]
    }
    ```

#### `POST` `/classes`
*   **Description**: Create a virtual class event.
*   **Access**: Admin-Only (`protectUser` AND `protectAdmin`)
*   **Action**: `ClassesController.create`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `GET` `/classes/:id`
*   **Description**: Fetch detail properties of a class.
*   **Access**: Private (`protectUser`)
*   **Action**: `ClassesController.get`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `PUT` `/classes/:id`
*   **Description**: Modify a class listing.
*   **Access**: Admin-Only (`protectUser` AND `protectAdmin`)
*   **Action**: `ClassesController.update`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `DELETE` `/classes/:id`
*   **Description**: Delete a class listing.
*   **Access**: Admin-Only (`protectUser` AND `protectAdmin`)
*   **Action**: `ClassesController.remove`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

---

## 📝 9. Scheduled Exams Router (`/api/v1/exams`)

Institutional Exam operations.

#### `POST` `/exams`
*   **Description**: Register a new scheduled institutional mock exam.
*   **Access**: Admin-Only (uses `requireRole("ADMIN")`)
*   **Action**: `ExamController.create`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

---

## 🏆 10. Achievements, Streaks & Leaderboards Router (`/api/v1`)

*Note: Mounted directly at root `/api/v1/` level, not `/api/v1/achievements`.*

#### `GET` `/achievements`
*   **Description**: Get earned achievements, badges, unlocked dates and progress.
*   **Access**: Private (`protectUser`)
*   **Action**: `AchievementController.getAchievements`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Achievements retrieved",
      "data": [
        {
          "id": "achv-id",
          "title": "First Blood",
          "description": "Complete your first practice session.",
          "icon": "Trophy",
          "isUnlocked": true,
          "unlockedAt": "2026-06-10T10:00:00Z"
        }
      ]
    }
    ```

#### `POST` `/streaks`
*   **Description**: Ping user streak to calculate consecutive study days.
*   **Access**: Private (`protectUser`)
*   **Action**: `AchievementController.updateStreak`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Streak updated",
      "data": {
        "currentStreak": 5,
        "isNewBest": false,
        "bestStreak": 14
      }
    }
    ```

#### `GET` `/leaderboard`
*   **Description**: Retrieve student performance score leaderboard.
*   **Access**: Private (`protectUser`)
*   **Action**: `AchievementController.getLeaderboard`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Leaderboard retrieved",
      "data": {
        "rankings": [
          {
            "rank": 1,
            "userId": "user-id",
            "name": "Jane Smith",
            "score": 9500,
            "avatarUrl": "https://..."
          }
        ],
        "userRank": {
          "rank": 42,
          "score": 4500
        }
      }
    }
    ```

---

## 🔔 11. Notifications Router (`/api/v1/notifications`)

Manages alerts and messages sent to users.

#### `GET` `/notifications`
*   **Description**: List all user notifications.
*   **Access**: Private (`protectUser`)
*   **Action**: `NotificationController.list`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Notifications retrieved",
      "data": [
        {
          "id": "notif-id",
          "type": "REMINDER",
          "title": "Time to study!",
          "message": "Don't break your 5-day streak.",
          "isRead": false,
          "createdAt": "2026-06-12T08:00:00Z"
        }
      ]
    }
    ```

#### `GET` `/notifications/unread-count`
*   **Description**: Get count of unread notifications.
*   **Access**: Private (`protectUser`)
*   **Action**: `NotificationController.unreadCount`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Unread count retrieved",
      "data": {
        "count": 3
      }
    }
    ```

#### `PATCH` `/notifications/mark-all-read`
*   **Description**: Mark all notifications as read.
*   **Access**: Private (`protectUser`)
*   **Action**: `NotificationController.markAllRead`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "All notifications marked as read",
      "data": null
    }
    ```

#### `PATCH` `/notifications/:id/read`
*   **Description**: Mark single notification as read.
*   **Access**: Private (`protectUser`)
*   **Action**: `NotificationController.markRead`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `DELETE` `/notifications`
*   **Description**: Clear notification inbox.
*   **Access**: Private (`protectUser`)
*   **Action**: `NotificationController.deleteAll`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `DELETE` `/notifications/:id`
*   **Description**: Delete a notification.
*   **Access**: Private (`protectUser`)
*   **Action**: `NotificationController.deleteOne`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

---

## 📅 12. Study Planner Router (`/api/v1/planner`)

AI study scheduler.

#### `GET` `/planner/schedule`
*   **Description**: Get current daily study agenda.
*   **Access**: Private (`protectUser`)
*   **Action**: `PlannerController.getSchedule`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Schedule retrieved",
      "data": {
        "date": "2026-06-12",
        "tasks": [
          {
            "id": "task-id",
            "subjectId": "subj-id",
            "subjectName": "Physics",
            "topic": "Kinematics",
            "durationMinutes": 45,
            "isCompleted": false,
            "scheduledTime": "10:00 AM"
          }
        ]
      }
    }
    ```

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
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Schedule generated successfully",
      "data": {
        "schedule": [
          {
            "date": "2026-06-13",
            "tasks": [
              {
                "subjectId": "subj-id",
                "topic": "Organic Chemistry",
                "durationMinutes": 60
              }
            ]
          }
        ]
      }
    }
    ```

#### `POST` `/planner/reschedule-day`
*   **Description**: Re-arrange study slot configurations for today.
*   **Access**: Private (`protectUser`)
*   **Validation (Body)**:
    *   `date` (string, required): Date code formatted YYYY-MM-DD.
*   **Action**: `PlannerController.rescheduleDay`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `PATCH` `/planner/session/:id/complete`
*   **Description**: Mark a single planner task slot as completed.
*   **Access**: Private (`protectUser`)
*   **Action**: `PlannerController.markComplete`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Task marked complete",
      "data": null
    }
    ```

---

## ✉️ 13. Support Router (`/api/v1/support`)

Public ticket creation.

#### `POST` `/support/ticket`
*   **Description**: Submit support requests.
*   **Access**: Public / Auth-Optional (`optionalProtectUser`)
*   **Action**: `SupportController.createTicket`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Support ticket created",
      "data": {
        "ticketId": "TCK-849201",
        "status": "OPEN",
        "priority": "NORMAL"
      }
    }
    ```

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
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Students retrieved",
      "data": {
        "users": [
          {
            "id": "user-id",
            "name": "John Doe",
            "email": "john@example.com",
            "subscription": "pro",
            "joinedAt": "2026-01-01T00:00:00Z"
          }
        ],
        "total": 1500,
        "page": 1,
        "totalPages": 15
      }
    }
    ```

#### `GET` `/admin/students/:id`
*   **Description**: View student information profile.
*   **Validation (Params)**:
    *   `id` (string, required): Valid MongoDB ObjectID.
*   **Action**: `AdminController.getStudent`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Student retrieved",
      "data": {
        "student": {
          "id": "student-id",
          "name": "John Doe",
          "email": "john@example.com",
          "overallScore": 75,
          "totalMocks": 3
        }
      }
    }
    ```

#### `GET` `/admin/students/:id/achievements`
*   **Description**: List student badges.
*   **Action**: `AdminController.getStudentAchievements`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `PATCH` `/admin/students/:id`
*   **Description**: Modify student metadata properties manually.
*   **Action**: `AdminController.updateStudent`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `DELETE` `/admin/students/:id`
*   **Description**: Delete student data.
*   **Action**: `AdminController.deleteStudent`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `POST` `/admin/students`
*   **Description**: Create new student.
*   **Action**: `AdminController.createStudent`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `POST` `/admin/students/export`
*   **Description**: Export all students' performance history as CSV.
*   **Action**: `AdminController.exportStudents`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Export successful",
      "data": {
        "downloadUrl": "https://api.teampillar.com/exports/students_20260612.csv"
      }
    }
    ```

#### `POST` `/admin/students/remind`
*   **Description**: Send push nudge or study reminders.
*   **Action**: `AdminController.sendReminder`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

---

### User Security Account Operations

#### `GET` `/admin/users`
*   **Description**: View all user security accounts.
*   **Action**: `AdminController.getAllUsers`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `GET` `/admin/users/:userId`
*   **Description**: Retrieve user security details.
*   **Action**: `AdminController.getUserById`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "User retrieved",
      "data": {
        "user": {
          "_id": "user-id",
          "email": "student@example.com",
          "name": "John Doe",
          "role": "STUDENT",
          "createdAt": "2026-01-01T00:00:00Z"
        }
      }
    }
    ```

#### `PUT` `/admin/users/:userId`
*   **Description**: Admin update user account properties.
*   **Action**: `AdminController.adminUpdateUser`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `PATCH` `/admin/users/:userId/promote`
*   **Description**: Toggle role permissions between standard users and Admin.
*   **Action**: `AdminController.toggleAdminStatus`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `POST` `/admin/users/:userId/otp`
*   **Description**: Manually send code OTP reset instructions.
*   **Action**: `AdminController.adminTriggerOTP`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `POST` `/admin/users/create-admin`
*   **Description**: Create root administration login.
*   **Action**: `AdminController.createAdmin`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `DELETE` `/admin/users/:userId`
*   **Description**: Remove user login credentials profiles.
*   **Action**: `AdminController.deleteUserProfile`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

---

### System Analytics & Monitoring

#### `GET` `/admin/analytics/reports`
*   **Description**: Summary database analytics.
*   **Validation (Query)**:
    *   `from` (string, optional): ISO date string.
    *   `to` (string, optional): ISO date string.
    *   `subjectId` (string, optional): Non-empty filter.
*   **Action**: `AdminController.analyticsReports`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Analytics reports retrieved",
      "data": {
        "reports": [
          {
            "subjectId": "subj-id",
            "subjectName": "Mathematics",
            "averageScore": 65,
            "totalAttempts": 1500
          }
        ]
      }
    }
    ```

#### `GET` `/admin/dashboard/stats`
*   **Description**: Return summary dashboard numbers.
*   **Action**: `AdminController.dashboardStats`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Dashboard stats retrieved",
      "data": {
        "totalUsers": 5000,
        "activeSubscriptions": 1200,
        "totalRevenue": 4500000,
        "mockExamsTaken": 8500
      }
    }
    ```

#### `GET` `/admin/live-monitor`
*   **Description**: Return logs of students currently taking mock exams.
*   **Action**: `AdminController.liveMonitorData`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Live monitor data retrieved",
      "data": {
        "activeSessions": [
          {
            "sessionId": "session-id",
            "studentName": "John Doe",
            "subject": "Physics",
            "progress": "40/160",
            "tabSwitches": 1
          }
        ]
      }
    }
    ```

#### `GET` `/admin/tutors`
*   **Description**: List registered educators.
*   **Action**: `AdminController.getTutors`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Tutors retrieved",
      "data": [
        {
          "id": "tutor-id",
          "name": "Dr. Sarah",
          "email": "sarah@example.com",
          "subjectExpertise": ["Chemistry", "Biology"]
        }
      ]
    }
    ```

#### `GET` `/admin/settings`
*   **Description**: View platform setting properties.
*   **Action**: `AdminController.getSettings`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Platform settings retrieved",
      "data": {
        "maintenanceMode": false,
        "allowNewRegistrations": true,
        "aiTokensPerUser": 50
      }
    }
    ```

#### `PUT` `/admin/settings`
*   **Description**: Modify global system parameters (e.g. maintenance mode).
*   **Action**: `AdminController.updateSettings`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

---

### Question & Subject Inventory

#### `GET` `/admin/questions`
*   **Description**: List matching questions.
*   **Action**: `AdminController.listQuestions`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Questions retrieved",
      "data": {
        "questions": [
          {
            "_id": "question-id",
            "subjectId": "subj-id",
            "text": "What is the capital of France?",
            "metadata": { "difficulty": "EASY" }
          }
        ],
        "total": 5000,
        "page": 1,
        "totalPages": 50
      }
    }
    ```

#### `GET` `/admin/questions/stats`
*   **Description**: Return counts of questions loaded by subject.
*   **Action**: `AdminController.questionStats`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `GET` `/admin/questions/:id`
*   **Description**: View details of single question.
*   **Action**: `AdminController.getQuestion`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Question retrieved",
      "data": {
        "question": {
          "_id": "question-id",
          "subjectId": "subj-id",
          "content": { "text": "What is the capital of France?" },
          "options": [
            { "text": "Paris", "isCorrect": true }
          ]
        }
      }
    }
    ```

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
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Questions uploaded successfully",
      "data": {
        "insertedCount": 50
      }
    }
    ```

#### `PUT` `/admin/questions/:id`
*   **Description**: Update question properties.
*   **Action**: `AdminController.updateQuestion`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `DELETE` `/admin/questions/:id`
*   **Description**: Remove question item.
*   **Action**: `AdminController.deleteQuestion`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `GET` `/admin/subjects`
*   **Description**: List subjects.
*   **Action**: `PracticeController.getSubjects`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `POST` `/admin/subjects`
*   **Description**: Create subject classification.
*   **Action**: `PracticeController.createSubject`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Subject created successfully",
      "data": {
        "subject": {
          "_id": "subj-id",
          "name": "Economics",
          "category": "Social Science",
          "isActive": true
        }
      }
    }
    ```

#### `PATCH` `/admin/subjects/:id`
*   **Description**: Update subject details.
*   **Action**: `PracticeController.updateSubject`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `DELETE` `/admin/subjects/:id`
*   **Description**: Delete subject classification.
*   **Action**: `PracticeController.deleteSubject`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

---

### Package & Pricing Management

#### `GET` `/admin/pricing`
*   **Description**: List loaded pricing plan entries.
*   **Action**: `AdminPricingController.listPlans`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Pricing plans retrieved",
      "data": [
        {
          "id": "plan-id",
          "name": "Pro Monthly",
          "price": 5000,
          "durationDays": 30,
          "features": ["Unlimited Mock Tests", "AI Tutor"],
          "isPopular": true
        }
      ]
    }
    ```

#### `POST` `/admin/pricing`
*   **Description**: Create a pricing tier.
*   **Action**: `AdminPricingController.createPlan`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Plan created successfully",
      "data": {
        "plan": {
          "id": "plan-id",
          "name": "Enterprise",
          "price": 10000,
          "durationDays": 365,
          "features": ["Everything"]
        }
      }
    }
    ```

#### `PUT` `/admin/pricing/:id`
*   **Description**: Modify package values.
*   **Action**: `AdminPricingController.updatePlan`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `DELETE` `/admin/pricing/:id`
*   **Description**: Soft-delete a pricing plan.
*   **Action**: `AdminPricingController.softDeletePlan`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

#### `PUT` `/admin/pricing/:id/toggle-popular`
*   **Description**: Toggle isPopular flag.
*   **Action**: `AdminPricingController.togglePopular`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Operation successful",
      "data": {}
    }
    ```

---

## 🎓 15. UTME Mock Exams Router (`/api/v1/mock`)

Dedicated router for full-length 4-subject UTME Mock Exams.

#### `POST` `/mock/start`
*   **Description**: Generate a 160-question mock test based on the student's 4 selected subjects.
*   **Access**: Private (`protectUser`, `onboardingGuard`)
*   **Validation (Custom)**:
    *   Requires exactly 4 subjects selected in user profile.
    *   Requires freemium limit check (max 3 for free users).
*   **Action**: `MockTestController.startMockTest`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Mock test generated successfully",
      "data": {
        "sessionId": "60d5ecb8b392d7...123",
        "questions": [
          {
            "_id": "60f1b2...",
            "subjectId": "60d5eca...",
            "subject": {
              "_id": "60d5eca...",
              "name": "Physics"
            },
            "text": "What is the SI unit of power?",
            "content": {
              "text": "What is the SI unit of power?",
              "type": "text",
              "value": "What is the SI unit of power?"
            },
            "options": [
              { "key": "A", "text": "Joule" },
              { "key": "B", "text": "Watt" },
              { "key": "C", "text": "Newton" },
              { "key": "D", "text": "Pascal" }
            ],
            "metadata": {
              "difficulty": "EASY",
              "year": 2018
            }
          }
        ]
      }
    }
    ```

#### `POST` `/mock/submit`
*   **Description**: Grade an active mock test and calculate the composite score out of 400 and subject breakdowns.
*   **Access**: Private (`protectUser`, `onboardingGuard`)
*   **Validation (Body)**:
    *   `sessionId` (string, required): Valid Mock Session ID.
    *   `responses` (array, required): Array of submitted responses.
*   **Action**: `MockTestController.submitMockTest`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Mock test submitted successfully",
      "data": {
        "compositeScore": 285,
        "sessionId": "60d5ecb8b392d7...123",
        "timeTaken": 5400,
        "subjectScores": [
          {
            "subjectId": "60d5eca...",
            "subjectName": "Physics",
            "score": 75,
            "correct": 30,
            "total": 40
          }
        ]
      }
    }
    ```

#### `GET` `/mock/history`
*   **Description**: Fetch the history of completed mock tests.
*   **Access**: Private (`protectUser`, `onboardingGuard`)
*   **Validation (Query)**:
    *   `page` (integer, optional): Pagination page.
    *   `limit` (integer, optional): Items per page.
*   **Action**: `MockTestController.getMockHistory`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Mock history retrieved",
      "data": {
        "total": 12,
        "page": 1,
        "totalPages": 2,
        "sessions": [
          {
            "sessionId": "60d5ecb...",
            "createdAt": "2026-06-12T14:30:00Z",
            "totalDuration": 7200,
            "compositeScore": 285,
            "subjectScores": [
              {
                "subjectId": "60d5eca...",
                "subjectName": "Physics",
                "score": 75,
                "correct": 30,
                "total": 40
              }
            ],
            "responses": [
              {
                "questionId": "60f1b2...",
                "selectedOption": "A",
                "timeTaken": 45,
                "isCorrect": true,
                "correctAnswer": "A"
              }
            ]
          }
        ]
      }
    }
    ```

#### `GET` `/mock/stats`
*   **Description**: Fetch aggregate mock test statistics (highest score, average score, total taken).
*   **Access**: Private (`protectUser`, `onboardingGuard`)
*   **Action**: `MockTestController.getMockStats`
*   **Response**:
    ```json
    {
      "success": true,
      "message": "Mock stats retrieved",
      "data": {
        "totalMocksTaken": 5,
        "highestMockScore": 285,
        "avgMockScore": 240,
        "predictedScore": 265
      }
    }
    ```
