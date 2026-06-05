import mongoose from "mongoose";
import "../../src/config/env.js";
import PricingPlan from "../models/PricingPlanModel.js";
import { connectMongoDB } from "../config/mongodb.js";

const plans = [
  {
    name: "Free",
    tier: "free",
    isActive: true,
    isPopular: false,
    displayOrder: 1,
    billingCycles: [
      {
        label: "Monthly",
        price: 0,
        currency: "NGN",
        discountPercent: 0,
        paystackPlanCode: "",
      },
      {
        label: "Yearly",
        price: 0,
        currency: "NGN",
        discountPercent: 0,
        paystackPlanCode: "",
      },
    ],
    features: [
      { label: "10 AI Explanations / day", included: true },
      { label: "2 Subjects Access", included: true },
      { label: "5 Mock Tests Total", included: true },
      { label: "Offline Study Mode", included: false },
      { label: "Priority Support", included: false },
    ],
    limits: {
      dailyAIExplanations: 10,
      subjects: 2,
      mockTests: 5,
      offlineMode: false,
      prioritySupport: false,
    },
  },
  {
    name: "Pro",
    tier: "pro",
    isActive: true,
    isPopular: true,
    displayOrder: 2,
    billingCycles: [
      {
        label: "Monthly",
        price: 450000, // 4,500 NGN in kobo
        currency: "NGN",
        discountPercent: 0,
        paystackPlanCode: "PLN_monthly_pro_code", // Replace with real Paystack plan code
      },
      {
        label: "Yearly",
        price: 1200000, // 12,000 NGN in kobo
        currency: "NGN",
        discountPercent: 77, // (4500*12 - 12000) / (4500*12) * 100
        paystackPlanCode: "PLN_yearly_pro_code", // Replace with real Paystack plan code
      },
    ],
    features: [
      { label: "Unlimited AI Explanations", included: true },
      { label: "All UTME Subjects", included: true },
      { label: "Unlimited Mock Exams", included: true },
      { label: "Offline Study Mode", included: true },
      { label: "Priority 24/7 Support", included: true },
    ],
    limits: {
      dailyAIExplanations: null,
      subjects: null,
      mockTests: null,
      offlineMode: true,
      prioritySupport: true,
    },
  },
];

async function seedPricing() {
  try {
    await connectMongoDB();
    console.log("Connected to MongoDB for seeding...");

    // Clear existing plans
    await PricingPlan.deleteMany({});
    console.log("Cleared existing pricing plans.");

    // Insert new plans
    await PricingPlan.insertMany(plans);
    console.log("✅ Pricing plans seeded successfully!");

  } catch (error) {
    console.error("❌ Seeding failed:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

seedPricing();
