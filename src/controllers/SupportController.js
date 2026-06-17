import { sendSuccess } from "../core/response.js";
import SupportService from "../services/SupportService.js";
import LogService from "../services/LogService.js";

class SupportController {
  // STUDENT
  static async createTicket(req, res) {
    const studentId = req.user._id;
    const data = await SupportService.createTicket(studentId, req.body);
    LogService.logAction({
      userId: studentId,
      userRole: req.user?.role,
      category: "support",
      action: "ticket_created",
      description: `Support ticket created`,
      metadata: { ticketId: data.ticketId || data._id },
      req,
    });
    return sendSuccess(res, { data, statusCode: 201 });
  }

  static async listStudentTickets(req, res) {
    const data = await SupportService.listStudentTickets(req.user._id, req.query);
    return sendSuccess(res, { data });
  }

  static async getTicket(req, res) {
    const isAdmin = req.user.isAdmin || req.user.role === 'ADMIN';
    const data = await SupportService.getTicket(req.params.id, req.user._id, isAdmin);
    return sendSuccess(res, { data });
  }

  static async studentSendMessage(req, res) {
    const data = await SupportService.addMessage(req.params.id, req.user._id, 'student', req.body.content);
    return sendSuccess(res, { data, statusCode: 201 });
  }

  // ADMIN
  static async listAdminTickets(req, res) {
    const data = await SupportService.listAdminTickets(req.query);
    return sendSuccess(res, { data });
  }

  static async updateTicket(req, res) {
    const data = await SupportService.updateTicket(req.params.id, req.body);
    LogService.logAction({
      userId: req.user?._id,
      userRole: req.user?.role,
      category: "support",
      action: "ticket_updated",
      description: `Ticket ${req.params.id} updated`,
      metadata: { ticketId: req.params.id, updates: req.body },
      req,
    });
    return sendSuccess(res, { data });
  }

  static async adminSendMessage(req, res) {
    const data = await SupportService.addMessage(req.params.id, req.user._id, 'admin', req.body.content);
    LogService.logAction({
      userId: req.user?._id,
      userRole: req.user?.role,
      category: "support",
      action: "admin_reply",
      description: `Admin replied to ticket ${req.params.id}`,
      metadata: { ticketId: req.params.id },
      req,
    });
    return sendSuccess(res, { data, statusCode: 201 });
  }

  static async getStats(req, res) {
    const data = await SupportService.getStats();
    return sendSuccess(res, { data });
  }
}

export default SupportController;
