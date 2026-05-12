# Pillar UTME Preparation Platform - Backend API

A Node.js/Express backend for the Pillar UTME Preparation Platform implementing deterministic scoring, anti-cheat detection, AI-powered explanations, and analytics.

## Table of Contents

- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Environment Variables](#environment-variables)
- [Setup & Installation](#setup--installation)
- [Database Models](#database-models)
- [API Endpoints](#api-endpoints)
- [Authentication & RBAC](#authentication--rbac)
- [Scoring System](#scoring-system)
- [Anti-Cheat Mechanisms](#anti-cheat-mechanisms)
- [Caching Strategy](#caching-strategy)
- [Testing](#testing)
- [Deployment](#deployment)

---

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables (see Environment Variables section)
cp .env.example .env

# Seed admin user
node src/seeders/seedAdmin.js

# Start development server
npm run start

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

Server runs on `http://localhost:3000` by default.

---

## Project Structure

```
src/
├── index.js                    # Express app entry point, route wiring
├── config/                     # Configuration files
│   ├── cloudinary.js          # Cloudinary file upload config
│   ├── email.js               # Email service config
│   ├── env.js                 # Environment variable parser
│   ├── mongodb.js             # MongoDB connection with retry logic
│   └── redis.js               # Redis connection with fallback
├── models/                     # Mongoose schemas
│   ├── AuthModel.js
│   ├── UserModel.js           # Extended: role, isPro, onboarding, stats
│   ├── TokenModel.js
│   ├── SubjectModel.js        # UTME subject catalog
│   ├── QuestionModel.js       # Practice questions with options, explanation
│   └── PracticeSessionModel.js # Session tracking with analytics, security
├── controllers/               # Business logic handlers
│   ├── AuthController.js
│   ├── PracticeController.js  # Practice: questions, sessions, results
│   ├── StudentController.js   # Student: onboarding, dashboard
│   ├── AdminController.js     # Admin: users, questions, tutors, analytics
│   ├── AnalyticsController.js # Analytics: reports, summaries
│   └── BillingController.js   # Billing: plans, Paystack integration
├── services/                  # Business logic (reusable)
│   ├── AuthService.js
│   ├── PracticeService.js     # UTME scoring, session mgmt, anti-cheat
│   ├── AnalyticsService.js    # Data aggregation, reporting
│   ├── AIService.js           # AI explanations, study plans (cached)
│   ├── CloudinaryService.js
│   ├── emailService.js
│   ├── OTPService.js
│   └── TokenService.js
├── repository/                # Data access layer
│   ├── AuthRepository.js
│   ├── UserRepository.js
│   ├── TokenRepository.js
│   ├── QuestionRepository.js
│   └── PracticeRepository.js
├── routes/                    # API endpoint definitions
│   ├── AuthRoute.js           # /auth
│   ├── PracticeRoute.js       # /practice
│   ├── StudentRoute.js        # /student
│   ├── AdminRoute.js          # /admin
│   ├── AnalyticsRoute.js      # /analytics
│   └── BillingRoute.js        # /billing
├── middleware/                # Express middleware
│   ├── authMiddleware.js      # JWT authentication
│   ├── errorHandler.js        # Global error handling
│   ├── rateLimiter.js         # Rate limiting
│   ├── requestMeta.js         # Request metadata (IP, user-agent)
│   ├── rbac.js                # Role-based access control
│   └── Validation/
│       ├── authValidation.js
│       ├── practiceValidation.js
│       ├── studentValidation.js
│       ├── adminValidation.js
│       ├── analyticsValidation.js
│       └── handleValidationErrors.js
├── core/                      # Core utilities
│   ├── error.js               # Custom error classes
│   ├── logger.js              # Logging service
│   └── response.js            # Response envelope helpers (PRD-compliant)
├── utilis/                    # Utility functions
│   ├── AppError.js
│   ├── cache.js               # Redis cache with LRU fallback
│   ├── authSessionCache.js
│   ├── keepAlive.js
│   ├── monitor.js
│   ├── performance.js
│   ├── try-catch.js           # Higher-order fn for async error wrapping
│   └── withTimeout.js
└── seeders/                   # Database seeding
    └── seedAdmin.js           # Admin user seeder (CLI)

tests/
├── practice.test.js           # Practice service tests (deterministic scoring)
└── billing.test.js            # Paystack webhook verification tests

.env.example                   # Environment variable template
package.json
README.md
```

---

## Architecture

**Pattern**: Controller → Service → Repository (strictly maintained)

- **Controllers**: Handle HTTP requests/responses, call services
- **Services**: Implement business logic, call repositories, manage transactions
- **Repositories**: Encapsulate database queries
- **Middleware**: Authentication, validation, rate limiting, error handling
- **Models**: Mongoose schemas with indexes on frequently queried fields

**Response Format** (PRD-compliant):

```json
{
  "success": true,
  "data": {
    /* response data */
  },
  "message": "Operation successful",
  "meta": {
    /* pagination, timestamps */
  },
  "errors": null // or object with error details
}
```

---

## Environment Variables

Create a `.env` file in the project root with the following (copy from `.env.example`):

```env
# Server
NODE_ENV=development
PORT=3000

# Database
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/pillarcbt?retryWrites=true&w=majority
MONGO_RETRY_ATTEMPTS=5
MONGO_RETRY_DELAY=5000

# Redis
REDIS_HOST=redis-host.redislabs.com
REDIS_PORT=12345
REDIS_PASSWORD=your-redis-password

# JWT & Auth
JWT_SECRET=your-jwt-secret-key-min-32-chars
JWT_EXPIRY=7d

# Paystack (Billing)
PAYSTACK_SECRET_KEY=sk_test_your_paystack_secret_key
PAYSTACK_PUBLIC_KEY=pk_test_your_paystack_public_key
PAYSTACK_INITIALIZE_URL=https://api.paystack.co/transaction/initialize

# Groq AI (Free - for AI explanations and study plans)
# Get free API key from https://console.groq.com
GROQ_API_KEY=gsk_your_free_groq_api_key

# Google Vertex AI (Optional - alternative to Groq, paid)
# VERTEX_ENDPOINT=us-central1-aiplatform.googleapis.com
# VERTEX_API_KEY=your-google-cloud-api-key
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Email Service (SendGrid or similar)
EMAIL_API_KEY=your-email-service-api-key
EMAIL_FROM=noreply@pillarcbt.com

# Cloudinary (File uploads)
CLOUDINARY_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Admin Seeding (for seeders/seedAdmin.js)
SEED_ADMIN_EMAIL=admin@pillarcbt.com
SEED_ADMIN_PASSWORD=ChangeMe123!
SEED_ADMIN_NAME=Pillar Admin

# Logging & Monitoring
LOG_LEVEL=info
SENTRY_DSN=optional-sentry-url
```

**Key Variables**:

- `MONGO_URI`: Atlas connection string with database name
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`: Remote Redis instance (LRU fallback if disconnected)
- `JWT_SECRET`: Min 32 characters; use `openssl rand -base64 32` to generate
- `PAYSTACK_SECRET_KEY`: Webhook signature verification (x-paystack-signature header)
- `GROQ_API_KEY`: Free API key from [console.groq.com](https://console.groq.com); enables AI explanation generation via Groq API (Mixtral 8x7B model)
- `SEED_ADMIN_*`: Admin seeder defaults (changeable via env)

---

## Setup & Installation

### Prerequisites

- Node.js v20+ (recommended)
- npm v10+
- MongoDB Atlas account (free tier works)
- Redis instance (RedisLabs free tier works)
- Paystack merchant account (optional, for billing)
- Groq API key (free from [console.groq.com](https://console.groq.com), for AI explanations)

### Installation Steps

1. **Clone & Install**

   ```bash
   git clone <repo-url>
   cd TeamPillar
   npm install
   ```

2. **Set Environment Variables**

   ```bash
   cp .env.example .env
   # Edit .env with your actual credentials
   nano .env
   ```

3. **Seed Admin User** (optional, creates default admin)

   ```bash
   node src/seeders/seedAdmin.js
   # Output: Admin user created/updated
   ```

4. **Start Development Server**

   ```bash
   npm run start
   # Output: Server listening on port 3000, MongoDB connected, Redis connected
   ```

5. **Verify Health Check**
   ```bash
   curl http://localhost:3000/health
   # Response: { "status": "OK" }
   ```

---

## Database Models

### User

```javascript
{
  email: String (unique, indexed),
  phone: String,
  password: String (hashed),
  firstName: String,
  lastName: String,
  dateOfBirth: Date,
  gender: String (MALE|FEMALE|OTHER),
  role: String (STUDENT|TUTOR|ADMIN), // NEW
  isPro: Boolean, // Paid subscription status
  onboarding: {
    subjects: [SubjectId], // Selected subjects
    targetScore: Number (0-400),
    studyPlan: String (1-2 hours|3-4 hours|5+ hours),
    completedAt: Date
  },
  stats: {
    totalSessions: Number,
    averageScore: Number (0-100),
    highestScore: Number (0-100),
    streakDays: Number,
    minutesStudiedToday: Number,
    lastActive: Date
  },
  createdAt: Date (indexed),
  updatedAt: Date
}
```

### Subject

```javascript
{
  name: String (unique, indexed), // e.g., "Mathematics", "English", "Physics"
  description: String,
  metadata: {
    weightInUTME: Number (0-100), // Scoring weight
    topicsCount: Number,
    questionsCount: Number
  }
}
```

### Question

```javascript
{
  subjectId: ObjectId (indexed), // Reference to Subject
  content: {
    type: String (text|image|equation),
    value: String // Text, image URL, or LaTeX equation
  },
  options: [
    {
      text: String,
      isCorrect: Boolean
    }
    // Minimum 2, maximum 5 options
  ],
  explanation: {
    text: String,
    aiInsight: String // Generated by AIService
  },
  metadata: {
    year: Number, // UTME exam year
    topic: String, // e.g., "Quadratic Equations"
    difficulty: String (EASY|MEDIUM|HARD), // indexed for filtering
    usageCount: Number // Analytics
  },
  createdAt: Date,
  updatedAt: Date
}
```

### PracticeSession

```javascript
{
  userId: ObjectId (indexed),
  subjectId: ObjectId (indexed),
  sessionStatus: String (ACTIVE|COMPLETED|EXPIRED), // indexed
  responses: [
    {
      questionId: ObjectId,
      selectedOption: Number,
      isCorrect: Boolean,
      timeSpent: Number (seconds)
    }
  ],
  analytics: {
    accuracy: Number (0-100),
    speedPerQuestion: Number (seconds),
    topMistakeTopic: String,
    strongTopic: String
  },
  security: {
    tabSwitches: Number, // Auto-submit if >= 5
    ipAddress: String,
    userAgent: String
  },
  score: Number (0-100),
  startTime: Date (indexed),
  endTime: Date,
  createdAt: Date
}
```

---

## API Endpoints

### Authentication (`/auth`)

- `POST /auth/register` - Register new student
- `POST /auth/login` - Login (returns JWT)
- `GET /auth/me` - Get current user (protected)
- `PATCH /auth/profile` - Update profile (protected)
- `POST /auth/logout` - Logout (protected)

### Practice (`/practice`)

- `GET /practice/subjects` - Get all subjects
- `GET /practice/questions?subjectId=...` - Get questions for subject (with filters: limit, difficulty, year)
- `POST /practice/start` - Start new session (protected)
- `POST /practice/submit` - Submit session responses (protected)
- `GET /practice/session/:id` - Get session result (protected)
- `POST /practice/session/visibility` - Record tab switch for anti-cheat (protected)

**Example: Start Session**

```bash
POST /practice/start
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "subjectId": "65abc123def456ghi789jkl0"
}

Response:
{
  "success": true,
  "data": {
    "sessionId": "65abc123def456ghi789jkl1",
    "subjectName": "Mathematics",
    "questions": [
      {
        "id": "65abc123def456ghi789jkl2",
        "content": { "type": "text", "value": "What is 2+2?" },
        "options": [
          { "text": "3", "isCorrect": false },
          { "text": "4", "isCorrect": false }, // Correct flag stripped
          { "text": "5", "isCorrect": false },
          { "text": "6", "isCorrect": false }
        ]
      }
      // ... more questions
    ]
  },
  "message": "Session started"
}
```

### Student (`/student`)

- `POST /student/me/onboarding` - Complete onboarding (protected)
- `GET /student/me/dashboard` - Get personal dashboard (protected)

**Example: Dashboard**

```bash
GET /student/me/dashboard?period=month
Authorization: Bearer <jwt-token>

Response:
{
  "success": true,
  "data": {
    "user": {
      "firstName": "John",
      "stats": {
        "totalSessions": 15,
        "averageScore": 72.5,
        "streakDays": 5
      }
    },
    "recentSessions": [
      {
        "subjectName": "Mathematics",
        "score": 85,
        "accuracy": 90,
        "endTime": "2024-01-15T14:30:00Z"
      }
    ]
  }
}
```

### Admin (`/admin`)

- `GET /admin/students?page=1&limit=20` - List students (admin-protected)
- `GET /admin/students/:id` - Get student detail (admin-protected)
- `POST /admin/questions` - Upload questions bulk (admin-protected, array of questions)
- `GET /admin/tutors` - Get tutor list (admin-protected)
- `GET /admin/analytics/reports?from=2024-01-01&to=2024-01-31` - Analytics reports (admin-protected)

### Analytics (`/analytics`)

- `GET /analytics/summary?from=2024-01-01` - Global summary (admin-protected)
- `GET /analytics/student/:id?from=2024-01-01` - Student analytics (admin-protected)

### Billing (`/billing`)

- `GET /billing/plans` - Get subscription plans
- `POST /billing/initialize` - Initialize Paystack payment (protected)
  - Body: `{ "planId": "PLAN_1" }`
- `POST /billing/webhook` - Paystack webhook (signature verification)

---

## Authentication & RBAC

### JWT Flow

1. User logs in → `POST /auth/login`
2. Server returns JWT: `{ token: "eyJ...", expiresIn: "7d" }`
3. Client includes in Authorization header: `Authorization: Bearer eyJ...`
4. Server verifies JWT signature and expiry

### Roles & Permissions

**STUDENT** (default user role)

- Read: practice questions, own analytics, own profile
- Write: practice sessions, onboarding, profile updates
- Cannot: access admin functions, see other students' data

**TUTOR** (educator role)

- Read: practice content, student analytics, student feedback
- Write: feedback on student sessions
- Cannot: modify questions, access billing

**ADMIN** (full access)

- Read: all data (users, questions, sessions, analytics, billing)
- Write: all data (create questions, manage users, view reports)
- Delete: users, sessions (soft-delete)
- Can: approve tutors, view Paystack webhook logs

### Using RBAC Middleware

```javascript
// Protect by role
import { requireRole, authorize } from "../middleware/rbac.js";

// Require specific role
router.get("/admin/users", requireRole("ADMIN"), AdminController.listStudents);

// Require specific permission
router.post(
  "/practice/submit",
  authorize("write:session"),
  PracticeController.submit,
);
```

---

## Scoring System

### UTME Scoring (400-point scale)

**Deterministic Rules**:

1. **English is mandatory** (100 points)
2. **Top 3 other subjects** (100 points each = 300 points)
3. **Maximum total: 400 points**
4. **Fallback**: If English not submitted, use **top 4 subjects**

**Calculation**:

```
1. Extract English score (or 0 if absent)
2. Select top 3 subjects from remaining subjects
3. Sum: English + top3[0] + top3[1] + top3[2]
4. If English = 0 and < 4 subjects available, score is incomplete
5. Otherwise, score = sum (capped at 400)
```

**Example**:

```
Scores: { English: 95, Mathematics: 88, Physics: 92, Chemistry: 75, Biology: 70 }
Result: 95 + 92 + 88 + 75 = 350 points
(Top 3 after English: Physics=92, Mathematics=88, Chemistry=75)
```

**Testing**: Run `npm test` to see deterministic scoring tests passing.

---

## Anti-Cheat Mechanisms

### Tab Switch Detection

- Each `POST /practice/session/visibility` increments `tabSwitches` counter
- **Auto-submit threshold: >= 5 tab switches**
- Session automatically submitted with current progress if threshold reached
- Flagged in analytics for review

### Session Validation

- **Time-drift detection**: If server receives submission >10 seconds after client report, flagged but accepted
- **IP address tracking**: Stored for anomaly detection (same session multiple IPs = suspicious)
- **User-agent consistency**: Checked across session lifecycle

### Rate Limiting

- Global rate limiter on all endpoints (configurable per route)
- Practice submission: 60 requests per minute per user
- Authentication: 5 failed attempts → 15-minute lockout

---

## Caching Strategy

### Cache Layer (`src/utilis/cache.js`)

- **Primary**: Redis (configured via `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`)
- **Fallback**: LRU cache (500-item limit, 1-hour TTL) if Redis unavailable
- **TTL**: Configurable per cache entry (default: 1 hour)

### Cached Endpoints

- `GET /practice/subjects` - 24-hour TTL (invalidated on admin questions upload)
- `AIService.generateExplanation()` - 30-day TTL (cache key: `explanation:${questionId}`)
- `AIService.generateStudyPlan()` - 7-day TTL (cache key: `study-plan:${userId}`)
- `GET /analytics/summary` - 1-hour TTL

### Cache Invalidation

- Admin uploads questions → Invalidate `/practice/subjects` and related question caches
- User completes session → Invalidate user's study plan cache
- Paystack webhook → Invalidate billing cache

---

## Testing

### Run All Tests

```bash
npm test
```

### Run Specific Test File

```bash
npm test -- tests/practice.test.js
npm test -- tests/billing.test.js
```

### Watch Mode (auto-rerun on changes)

```bash
npm run test:watch
```

### Current Tests

#### Practice Service Tests (`tests/practice.test.js`)

- ✅ Deterministic question selection (preserves order when flag set)
- ✅ UTME scoring (English mandatory + top 3 = 300/400 points)

#### Billing Tests (`tests/billing.test.js`)

- ✅ Paystack webhook HMAC-SHA512 signature verification (valid signature)
- ✅ Paystack webhook invalid signature rejection
- ✅ Paystack webhook missing signature header handling
- ✅ GET /billing/plans endpoint
- ✅ POST /billing/initialize validation
- ✅ HMAC-SHA512 signature matching algorithm

### Writing New Tests

```javascript
// test-template.js
import request from "supertest";
import app from "../src/index.js";

describe("My Feature", () => {
  it("should do something", async () => {
    const res = await request(app).get("/endpoint").expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });
});
```

---

## Deployment

### Docker (Optional)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
EXPOSE 3000
CMD ["node", "src/index.js"]
```

Build & run:

```bash
docker build -t pillar-backend .
docker run -p 3000:3000 --env-file .env pillar-backend
```

### Environment-Specific Configuration

**Development**

```env
NODE_ENV=development
LOG_LEVEL=debug
MONGO_RETRY_ATTEMPTS=5
```

**Production**

```env
NODE_ENV=production
LOG_LEVEL=warn
MONGO_RETRY_ATTEMPTS=10
# Use strong JWT_SECRET, API keys from secure vault
```

### Starting on Boot (PM2)

```bash
npm install -g pm2
pm2 start src/index.js --name "pillar-backend" --env production
pm2 save
pm2 startup
```

### Health Checks

```bash
# Liveness probe (is server running?)
curl http://localhost:3000/health

# Readiness probe (is server ready for requests?)
curl http://localhost:3000/readiness
```

---

## Troubleshooting

### MongoDB Connection Fails

- Verify `MONGO_URI` is correct (includes username, password, db name)
- Check IP whitelist in MongoDB Atlas (add 0.0.0.0/0 for dev, restrict in prod)
- Ensure network connectivity: `ping cluster.mongodb.net`

### Redis Connection Fails

- Falls back to LRU cache automatically (check logs for "Using LRU cache")
- Verify `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` are correct
- Test connection: `redis-cli -h <host> -p <port> ping`

### JWT Signature Invalid

- Verify `JWT_SECRET` matches between server instances
- Check token expiry: `jwt.verify(token, secret)` for exact error
- Token format: `Authorization: Bearer <token>` (case-sensitive)

### Paystack Webhook Not Firing

- Verify webhook URL in Paystack dashboard points to `POST /billing/webhook`
- Check `PAYSTACK_SECRET_KEY` matches in Paystack dashboard
- Test with Paystack webhook simulator: `curl -X POST http://localhost:3000/billing/webhook -H "x-paystack-signature: <hash>"`

### Tests Failing

- Ensure `npm test` runs with `NODE_ENV=test`
- Clear Jest cache: `npm test -- --clearCache`
- Check babel config in `package.json` for ESM transform settings

---

## License & Support

For issues, feature requests, or support, contact the development team.

---

**Last Updated**: January 2024 | **Version**: 1.0.0
