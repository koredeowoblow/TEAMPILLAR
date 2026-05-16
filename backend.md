# Pillar UTME Backend Product Requirements Document (PRD) v1.2

## 1. Executive Summary

This document defines the comprehensive technical specifications for the Pillar UTME Preparation Platform backend. It serves as the single source of truth for the API architecture, data models, and business logic required to power the React frontend.

## 2. System Overview & Technology Stack

- **Runtime**: Node.js v18+ (LTS).
- **Framework**: Express.js with a structured Controller-Service-Repository pattern.
- **Database**: MongoDB Atlas (NoSQL).
- **Authentication**: JWT (JSON Web Tokens) with Refresh Token support.
- **Base URL**: `https://api.pillarcbt.com/v1` (Production).

## 3. Global API Standards

### 3.1 Standard Response Envelope

All API responses must follow this structure for consistency across the frontend:

```json
{
  "success": true,
  "data": null,
  "message": "Operation successful",
  "meta": {
    "total": 1240,
    "page": 1,
    "limit": 10
  },
  "errors": null
}
```

### 3.2 HTTP Status Codes

- `200 OK`: Successful GET, PATCH, or DELETE.
- `201 Created`: Successful POST.
- `400 Bad Request`: Validation errors or malformed JSON (`errorCode: ERR_VALIDATION`).
- `401 Unauthorized`: Missing or invalid JWT token (`errorCode: ERR_AUTH_INVALID`).
- `403 Forbidden`: Authenticated user lacks required permissions (`errorCode: ERR_FORBIDDEN`).
- `500 Internal Server Error`: Unhandled exceptions (`errorCode: ERR_INTERNAL`).

## 4. Extensive Data Models (MongoDB)

### 4.1 User Collection

| Field        | Type    | Validation / Constraint                      | Description                      |
| :----------- | :------ | :------------------------------------------- | :------------------------------- |
| `name`       | String  | Required, min 3 chars                        | Full name of student/admin.      |
| `email`      | String  | Required, Unique, Regex Email                | Primary login identifier.        |
| `password`   | String  | Required, Hashed (Bcrypt)                    | Min 8 chars, 1 upper, 1 special. |
| `role`       | Enum    | `STUDENT`, `ADMIN`, `TUTOR`                  | Defines RBAC permissions.        |
| `isPro`      | Boolean | Default: `false`                             | Access to premium content.       |
| `onboarding` | Object  | `{ subjects: [], targetScore: Number, ... }` | Onboarding progress.             |
| `stats`      | Object  | `{ streak: Number, avgScore: Number, ... }`  | Real-time performance metrics.   |

### 4.2 Question Collection

- `subjectId`: ObjectId (Ref: Subject).
- `content`: Object { `text`: String, `image`: String (URL), `equation`: String (LaTeX) }.
- `options`: Array of 4 Objects { `id`: String, `text`: String, `isCorrect`: Boolean }.
- `explanation`: String (Rich text + AI-generated insights).
- `metadata`: Object { `year`: Number, `topic`: String, `difficulty`: Enum }.

### 4.3 PracticeSession Collection

- `userId`: ObjectId (Ref: User).
- `sessionStatus`: Enum (`ACTIVE`, `COMPLETED`, `EXPIRED`).
- `responses`: Array of { `questionId`: ObjectId, `selectedOption`: String, `timeTaken`: Number }.
- `analytics`: Object { `accuracy`: Number, `speedPerQuestion`: Number, `topMistakeTopic`: String }.
- `security`: Object { `tabSwitches`: Number, `ipAddress`: String }.

## 5. Detailed API Endpoint Registry

### 5.1 Authentication & Profile

| Method | Path             | Role   | Description                           |
| :----- | :--------------- | :----- | :------------------------------------ |
| `POST` | `/auth/register` | Public | Registers a new student account.      |
| `POST` | `/auth/login`    | Public | Authenticates and returns JWT + User. |
| `GET`  | `/auth/me`       | User   | Returns the current user's profile.   |

### 5.2 Student Platform & CBT Engine

| Method | Path                       | Role    | Description                               |
| :----- | :------------------------- | :------ | :---------------------------------------- |
| `GET`  | `/student/me/dashboard`    | Student | personalized stats, plan, and activity.   |
| `GET`  | `/practice/subjects`       | Student | List available subjects with metadata.    |
| `GET`  | `/practice/questions`      | Student | randomized set based on `subjectId`.      |
| `POST` | `/practice/submit`         | Student | Process grading and calculate UTME score. |
| `GET`  | `/practice/results/:id`    | Student | Review session with AI explanations.      |
| `POST` | `/student/me/onboarding/*` | Student | Persist subjects, target score, and plan. |

### 5.3 Admin & Analytics

| Method | Path                 | Role  | Description                                  |
| :----- | :------------------- | :---- | :------------------------------------------- |
| `GET`  | `/students`          | Admin | List all students (paginated + search).      |
| `GET`  | `/students/:id`      | Admin | Deep dive into student performance history.  |
| `GET`  | `/analytics/reports` | Admin | Global trends (SVG paths) and failure rates. |
| `POST` | `/admin/questions`   | Admin | Bulk upload questions via CSV/JSON.          |

## 6. Core Business Logic & Algorithms

### 6.1 The Scoring Engine

- Calculates scores on a 400-point scale (English: 100, others: 100 each).
- Tracks "Mastery Level" per topic to drive the Automated Study Plan.

### 6.2 Anti-Cheat Logic

- If `tabSwitchCount > 5`, the session is flagged for review.
- Time-drift verification: Cross-checks `startTime` vs `endTime` vs total reported `timeTaken`.

## 7. Performance, Security & DevOps

- **Caching**: Redis for session state management (Optional).
- **Rate Limiting**: 100 reqs/15m for sensitive routes.
- **CI/CD**: GitHub Actions deploying to Render/AWS.
- **Monitoring**: Sentry for error tracking; MongoDB Atlas for automated backups.
- **Integrations**: Paystack (Payments), Cloudinary (Assets), Postmark (Email).
