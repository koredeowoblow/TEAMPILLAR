import mongoose from "mongoose";

const pricingPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // e.g. "Pro", "Free"
    tier: {
      type: String,
      enum: ["free", "pro", "enterprise"],
      required: true,
    },
    isActive: { type: Boolean, default: true },
    isPopular: { type: Boolean, default: false },
    billingCycles: [
      {
        label: { type: String, required: true }, // "Monthly" | "Yearly"
        price: { type: Number, required: true }, // in kobo (Paystack standard)
        currency: { type: String, default: "NGN" },
        discountPercent: { type: Number, default: 0 }, // e.g. 40 for "Save 40%"
        paystackPlanCode: { type: String }, // Paystack plan code for this cycle
      },
    ],
    features: [
      {
        label: { type: String, required: true }, // e.g. "Unlimited AI Explanations"
        included: { type: Boolean, default: true }, // true = checkmark, false = strikethrough
      },
    ],
    limits: {
      dailyAIExplanations: { type: Number, default: null }, // null = unlimited
      subjects: { type: Number, default: null }, // null = unlimited
      mockTests: { type: Number, default: null }, // null = unlimited
      offlineMode: { type: Boolean, default: false },
      prioritySupport: { type: Boolean, default: false },
    },
    displayOrder: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

const PricingPlan = mongoose.model("PricingPlan", pricingPlanSchema);

export default PricingPlan;
