import { sendSuccess, sendError } from "../core/response.js";
import { AppError } from "../utils/AppError.js";
import fetch from "node-fetch";
import crypto from "crypto";
import EmailService from "../services/emailService.js";
import { logger } from "../core/logger.js";
import User from "../models/UserModel.js";

import PricingPlan from "../models/PricingPlanModel.js";

const PAYSTACK_INIT_URL = "https://api.paystack.co/transaction/initialize";

class BillingController {
  static async initializeSubscription(req, res) {
    const { planId, billingCycle } = req.body;
    const email = req.user.email;

    const plan = await PricingPlan.findById(planId);
    if (!plan) throw new AppError("Plan not found", 404);

    const cycle = plan.billingCycles.find((c) => c.label === billingCycle);
    if (!cycle) throw new AppError("Invalid billing cycle", 400);

    const body = {
      email,
      amount: cycle.price,
      plan: cycle.paystackPlanCode,
      callback_url: process.env.PAYSTACK_CALLBACK_URL,
      metadata: {
        userId: req.user.id,
        planId: plan._id,
        tier: plan.tier,
        billingCycle,
      },
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
    if (!initRes.ok) throw new AppError("Payment initialization failed", 400);

    return sendSuccess(res, { data });
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

    switch (event.event) {
      case "charge.success":
        await this.handleChargeSuccess(event.data);
        break;
      case "subscription.create":
        await this.handleSubscriptionCreate(event.data);
        break;
      case "invoice.payment_failed":
        await this.handlePaymentFailed(event.data);
        break;
      case "subscription.disable":
        await this.handleSubscriptionDisabled(event.data);
        break;
    }

    return sendSuccess(res, {
      message: "Webhook received",
      data: event,
      statusCode: 200,
    });
  }

  static async handleChargeSuccess(data) {
    const { customer, amount, currency, metadata } = data;
    const email = customer.email;

    setImmediate(async () => {
      try {
        const user = await User.findOne({ email });
        if (!user) return;

        // If it was a one-time payment that should upgrade them
        if (metadata?.tier === "pro") {
          user.subscription = "pro";
          await user.save();
        }

        await EmailService.sendPaymentConfirmation(
          email,
          user?.name || "Customer",
          {
            planName: metadata?.planName || "Pro Plan",
            amount: amount / 100,
            currency,
          }
        );
      } catch (err) {
        logger.error("Failed to handle charge success", {
          email,
          message: err.message,
        });
      }
    });
  }

  static async handleSubscriptionCreate(data) {
    const { customer, subscription_code, next_payment_date, plan, metadata } =
      data;
    const email = customer.email;

    try {
      const user = await User.findOne({ email });
      if (!user) return;

      user.subscription = "pro";
      user.subscriptionDetails = {
        paystackSubscriptionCode: subscription_code,
        nextPaymentDate: new Date(next_payment_date),
        billingCycle: metadata?.billingCycle,
      };
      await user.save();

      logger.info(`Subscription created for ${email}: ${subscription_code}`);
    } catch (err) {
      logger.error("Failed to handle subscription create", {
        email,
        message: err.message,
      });
    }
  }

  static async handlePaymentFailed(data) {
    const { customer } = data;
    const email = customer.email;

    try {
      const user = await User.findOne({ email });
      if (!user) return;

      user.subscription = "free";
      await user.save();

      await EmailService.sendEmail(
        email,
        "Subscription Payment Failed",
        "<p>Your subscription payment failed. Your account has been reverted to the free tier.</p>"
      );
    } catch (err) {
      logger.error("Failed to handle payment failed", {
        email,
        message: err.message,
      });
    }
  }

  static async handleSubscriptionDisabled(data) {
    const { customer } = data;
    const email = customer.email;

    try {
      const user = await User.findOne({ email });
      if (!user) return;

      user.subscription = "free";
      await user.save();

      logger.info(`Subscription disabled for ${email}`);
    } catch (err) {
      logger.error("Failed to handle subscription disabled", {
        email,
        message: err.message,
      });
    }
  }
}

export default BillingController;
