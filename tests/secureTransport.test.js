import express from "express";
import request from "supertest";
import {
  applySecurityHeaders,
  enforceSecureTransport,
} from "../src/middleware/security.js";

jest.mock("../src/core/logger.js", () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe("HTTPS enforcement and security headers", () => {
  let app;

  beforeEach(() => {
    process.env.NODE_ENV = "production";

    app = express();
    app.set("trust proxy", 1);
    app.use(enforceSecureTransport);
    app.use(applySecurityHeaders);
    app.get("/ping", (_req, res) => res.status(200).json({ ok: true }));
  });

  it("redirects insecure requests to HTTPS", async () => {
    const res = await request(app)
      .get("/ping")
      .set("Host", "teampillar.onrender.com")
      .set("X-Forwarded-Proto", "http");

    expect(res.status).toBe(308);
    expect(res.headers.location).toBe("https://teampillar.onrender.com/ping");
  });

  it("adds TLS-related security headers on secure requests", async () => {
    const res = await request(app)
      .get("/ping")
      .set("Host", "teampillar.onrender.com")
      .set("X-Forwarded-Proto", "https");

    expect(res.status).toBe(200);
    expect(res.headers["strict-transport-security"]).toContain(
      "max-age=63072000",
    );
    expect(res.headers["strict-transport-security"]).toContain(
      "includeSubDomains",
    );
    expect(res.headers["strict-transport-security"]).toContain("preload");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["expect-ct"]).toContain("max-age=86400");
    expect(res.headers["expect-ct"]).toContain("enforce");
  });
});
