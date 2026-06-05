import express from "express";
import request from "supertest";
import AuthRoute from "../src/routes/AuthRoute.js";
import { userRepository } from "../src/repository/UserRepository.js";
import { tokenRepository } from "../src/repository/TokenRepository.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

jest.mock("../src/repository/UserRepository.js");
jest.mock("../src/repository/TokenRepository.js");
jest.mock("bcryptjs");
jest.mock("jsonwebtoken");
jest.mock("../src/repository/AuthRepository.js", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => {
      return {
        findSessionByToken: jest.fn().mockResolvedValue({ _id: "sessionId", isLoggedOut: false, createdAt: new Date() }),
        invalidateSession: jest.fn().mockResolvedValue(true),
        touchToken: jest.fn().mockResolvedValue(true),
        createSession: jest.fn().mockResolvedValue(true)
      };
    })
  };
});


const app = express();
app.use(express.json());
app.use("/api/v1/auth", AuthRoute);

// A simple protected route for testing
import { protectUser, protectAdmin } from "../src/middleware/authMiddleware.js";
import { globalErrorHandler } from "../src/core/error.js";
app.get("/api/v1/protected", protectUser, (req, res) => res.status(200).json({ success: true }));
app.get("/api/v1/admin-only", protectUser, protectAdmin, (req, res) => res.status(200).json({ success: true }));

app.use(globalErrorHandler);

describe("Auth Flow & Protection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
    userRepository.findByEmail = userRepository.findOne;
  });

  describe("Login", () => {
    it("returns a valid JWT on successful login", async () => {
      userRepository.findOne.mockResolvedValue({
        _id: "userId1",
        email: "test@test.com",
        password: "hashedPassword",
        role: "STUDENT"
      });
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue("mocked-jwt-token");

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "test@test.com", password: "password123" });

      expect(res.status).toBe(200);
      expect(res.body.data.token).toBe("mocked-jwt-token");
    });

    it("returns 401 on wrong password", async () => {
      userRepository.findOne.mockResolvedValue({
        _id: "userId1",
        email: "test@test.com",
        password: "hashedPassword",
        role: "STUDENT"
      });
      bcrypt.compare.mockResolvedValue(false);

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "test@test.com", password: "wrong" });

      expect(res.status).toBe(401);
    });

    it("returns 401 on non-existent email", async () => {
      userRepository.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "nope@test.com", password: "password123" });

      expect(res.status).toBe(401);
    });
  });

  describe("Registration", () => {
    it("returns 400 on duplicate email", async () => {
      userRepository.findOne.mockResolvedValue({ _id: "existingId" });
      userRepository.findByEmail.mockResolvedValue({ _id: "existingId" });

      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ name: "Test", email: "exist@test.com", password: "Password@123" });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Email already registered/i);
    });
  });

  describe("Protected Routes", () => {
    it("returns 401 when no token is provided", async () => {
      const res = await request(app).get("/api/v1/protected");
      expect(res.status).toBe(401);
    });

    it("returns 403 when a student token is used on an admin route", async () => {
      jwt.verify.mockReturnValue({ id: "studentId", role: "STUDENT" });
      userRepository.findById.mockResolvedValue({ _id: "studentId", role: "STUDENT" });

      const res = await request(app)
        .get("/api/v1/admin-only")
        .set("Authorization", "Bearer student-token");

      expect(res.status).toBe(403);
    });
  });
});
