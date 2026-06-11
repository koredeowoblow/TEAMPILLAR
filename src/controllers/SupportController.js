import { sendSuccess } from "../core/response.js";
import SupportTicket from "../models/SupportTicketModel.js";
import { AppError } from "../utils/AppError.js";

class SupportController {
  static async createTicket(req, res) {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      throw new AppError("All fields (name, email, subject, message) are required", 400);
    }

    const ticket = await SupportTicket.create({
      userId: req.user?.id || req.user?._id || null,
      name,
      email,
      subject,
      message,
    });

    return sendSuccess(res, {
      message: "Support ticket submitted successfully",
      data: ticket,
      statusCode: 201,
    });
  }
}

export default SupportController;
