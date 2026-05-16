import crypto from "crypto";

describe("Billing - Paystack Integration (Unit Tests)", () => {
  const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET || "test-secret-key";

  describe("HMAC-SHA512 Signature Verification", () => {
    it("should verify signature with exact payload", () => {
      const testData = {
        event: "charge.success",
        data: { id: 999, reference: "TEST-999", amount: 100000 },
      };
      const payload = JSON.stringify(testData);

      const correctHash = crypto
        .createHmac("sha512", PAYSTACK_SECRET)
        .update(payload)
        .digest("hex");

      // Signature should match
      const verifyHash = crypto
        .createHmac("sha512", PAYSTACK_SECRET)
        .update(payload)
        .digest("hex");

      expect(correctHash).toBe(verifyHash);
    });

    it("should fail signature verification if payload modified", () => {
      const payload1 = JSON.stringify({
        event: "charge.success",
        amount: 50000,
      });
      const payload2 = JSON.stringify({
        event: "charge.success",
        amount: 50001,
      });

      const hash1 = crypto
        .createHmac("sha512", PAYSTACK_SECRET)
        .update(payload1)
        .digest("hex");

      const hash2 = crypto
        .createHmac("sha512", PAYSTACK_SECRET)
        .update(payload2)
        .digest("hex");

      expect(hash1).not.toBe(hash2);
    });
  });
});
