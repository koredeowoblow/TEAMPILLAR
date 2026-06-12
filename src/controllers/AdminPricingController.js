import PricingPlan from "../models/PricingPlanModel.js";
import { sendSuccess } from "../core/response.js";
import { AppError } from "../utils/AppError.js";
import Joi from "joi";

const planSchema = Joi.object({
  name: Joi.string().required(),
  tier: Joi.string().valid("free", "pro", "enterprise").required(),
  isActive: Joi.boolean(),
  isPopular: Joi.boolean(),
  billingCycles: Joi.array().items(
    Joi.object({
      label: Joi.string().required(),
      price: Joi.number().required(),
      currency: Joi.string().default("NGN"),
      discountPercent: Joi.number().default(0),
      paystackPlanCode: Joi.string(),
    })
  ),
  features: Joi.array().items(
    Joi.object({
      label: Joi.string().required(),
      included: Joi.boolean().default(true),
    })
  ),
  limits: Joi.object({
    dailyAIExplanations: Joi.number().allow(null),
    subjects: Joi.number().allow(null),
    mockTests: Joi.number().allow(null),
    offlineMode: Joi.boolean(),
    prioritySupport: Joi.boolean(),
  }),
  displayOrder: Joi.number(),
});

class AdminPricingController {
  static async listPlans(req, res) {
    const plans = await PricingPlan.find().sort({ displayOrder: 1 }).lean();
    return sendSuccess(res, { data: plans });
  }

  static async createPlan(req, res) {
    const { error, value } = planSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const plan = await PricingPlan.create(value);
    return sendSuccess(res, { data: plan, statusCode: 201 });
  }

  static async updatePlan(req, res) {
    const { error, value } = planSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const plan = await PricingPlan.findByIdAndUpdate(req.params.id, value, {
      new: true,
    });
    if (!plan) throw new AppError("Plan not found", 404);

    return sendSuccess(res, { data: plan });
  }

  static async softDeletePlan(req, res) {
    const plan = await PricingPlan.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!plan) throw new AppError("Plan not found", 404);
    return sendSuccess(res, { message: "Plan deactivated" });
  }

  static async togglePopular(req, res) {
    const plan = await PricingPlan.findById(req.params.id);
    if (!plan) throw new AppError("Plan not found", 404);

    plan.isPopular = !plan.isPopular;
    await plan.save();

    return sendSuccess(res, { data: plan });
  }

  static async getPublicPlans(req, res) {
    const plans = await PricingPlan.find({ isActive: true }).sort({
      displayOrder: 1,
    }).lean();
    return sendSuccess(res, { data: plans });
  }
}

export default AdminPricingController;
