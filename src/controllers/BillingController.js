import { sendSuccess, sendError } from "../core/response.js";
import { AppError } from "../utils/AppError.js";
import fetch from "node-fetch";
import crypto from "crypto";
import EmailService from "../services/emailService.js";
import { logger } from "../core/logger.js";
import User from "../models/UserModel.js";

const PAYSTACK_INIT_URL = "https://api.paystack.co/transaction/initialize";

class BillingController {
  static async getPlans(_req, res) {
    const plans = [
      {
        id: "basic",
        name: "Basic",
        price: 0,
        period: "monthly",
        features: ["limited"],
      },
      {
        id: "pro",
        name: "Pro",
        price: 5000,
        period: "monthly",
        features: ["ai-explanations", "unlimited"],
      },
    ];
    return sendSuccess(res, {
      message: "Plans retrieved",
      data: plans,
      statusCode: 200,
    });
  }

  static async initialize(req, res) {
    const { planId } = req.body;
    const email = req.body.email || req.user?.email;
    if (!planId) {
      throw new AppError("planId is required", 400);
    }
    if (!email) {
      throw new AppError("Email is required", 400);
    }
    const plan = planId === "pro" ? { amount: 5000 } : { amount: 0 };
    const amountKobo = plan.amount * 100;

    if (!process.env.PAYSTACK_SECRET) {
      return sendSuccess(res, {
        message: "Payment initialized (development mode)",
        data: {
          planId,
          authorization_url: null,
          reference: `dev_${Date.now()}`,
          mode: "development",
        },
        statusCode: 200,
      });
    }

    const body = {
      email,
      amount: amountKobo,
      callback_url:
        process.env.PAYSTACK_CALLBACK_URL ||
        "https://example.com/paystack/callback",
    };

    const initRes = await fetch(PAYSTACK_INIT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await initRes.json();
    if (!initRes.ok) {
      return sendError(res, {
        message: "Payment initialization failed",
        data,
        statusCode: 400,
      });
    }

    return sendSuccess(res, {
      message: "Payment initialized",
      data,
      statusCode: 200,
    });
  }

  static async webhook(req, res) {
    const signature = req.headers["x-paystack-signature"];
    const secret = process.env.PAYSTACK_SECRET || "";
    const payload = JSON.stringify(req.body || {});

    if (secret) {
      const hash = crypto
        .createHmac("sha512", secret)
        .update(payload)
        .digest("hex");
      if (hash !== signature) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid signature" });
      }
    }

    const event = req.body;

    if (event.event === "charge.success") {
      const { customer, amount, currency } = event.data;
      const email = customer.email;

      setImmediate(async () => {
        try {
          const user = await User.findOne({ email });
          await EmailService.sendPaymentConfirmation(email, user?.name || "Customer", {
            planName: "Pro Plan", // This should ideally be derived from metadata
            amount: amount / 100,
            currency,
          });
        } catch (err) {
          logger.error("Failed to send payment confirmation email", {
            email,
            message: err.message,
          });
        }
      });
    }

    return sendSuccess(res, {
      message: "Webhook received",
      data: event,
      statusCode: 200,
    });
  }
}

export default BillingController;
