import { sendSuccess } from "../core/response.js";
import fetch from "node-fetch";
import crypto from "crypto";

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
    const { planId, email } = req.body;
    if (!planId)
      return sendSuccess(res, {
        message: "planId is required",
        data: null,
        statusCode: 400,
      });
    const plan = planId === "pro" ? { amount: 5000 } : { amount: 0 };
    const amountKobo = plan.amount * 100;

    if (!process.env.PAYSTACK_SECRET) {
      return sendSuccess(res, {
        message: "Payment initialized (stub)",
        data: { planId },
        statusCode: 200,
      });
    }

    const body = {
      email: email || "no-reply@pillarcbt.com",
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
    return sendSuccess(res, {
      message: "Payment initialized",
      data,
      statusCode: initRes.ok ? 200 : 400,
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
    return sendSuccess(res, {
      message: "Webhook received",
      data: event,
      statusCode: 200,
    });
  }
}

export default BillingController;
