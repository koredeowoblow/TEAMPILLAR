import SupportTicket from "../models/SupportTicketModel.js";
import { AppError } from "../utils/AppError.js";
import { getIO } from "../config/socket.js";
import { supportQueue } from "../queues/supportQueue.js";

class SupportService {
  // Student: Create Ticket
  static async createTicket(studentId, { subject, category, firstMessage }) {
    if (!subject || !category || !firstMessage) {
      throw new AppError("Subject, category, and first message are required", 400);
    }
    
    const ticket = await SupportTicket.create({
      studentId,
      subject,
      category,
      messages: [{
        senderId: studentId,
        senderRole: 'student',
        content: firstMessage
      }]
    });
    
    const io = getIO();
    io.to("admin:dashboard").emit("ticket:new", ticket);
    await supportQueue.add("ticket.created", { ticket });
    
    return ticket;
  }

  // Student: List Own Tickets
  static async listStudentTickets(studentId, { status, page = 1, limit = 10 }) {
    const query = { studentId };
    if (status) query.status = status;
    
    const tickets = await SupportTicket.find(query)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select({ messages: { $slice: -1 }, studentId: 1, ticketId: 1, subject: 1, category: 1, priority: 1, status: 1, resolvedAt: 1, updatedAt: 1, createdAt: 1 })
      .lean();
      
    const total = await SupportTicket.countDocuments(query);
    return { tickets, total, pages: Math.ceil(total / limit) };
  }

  // Student & Admin: Get Ticket Details
  static async getTicket(ticketIdStr, userId, isAdmin) {
    const ticket = await SupportTicket.findOne({ ticketId: ticketIdStr }).populate("studentId", "name email subscriptionStatus");
    if (!ticket) throw new AppError("Ticket not found", 404);
    
    if (!isAdmin && ticket.studentId._id.toString() !== userId.toString()) {
      throw new AppError("Forbidden", 403);
    }
    
    return ticket;
  }

  // Student & Admin: Send Message
  static async addMessage(ticketIdStr, senderId, senderRole, content) {
    const ticket = await SupportTicket.findOne({ ticketId: ticketIdStr });
    if (!ticket) throw new AppError("Ticket not found", 404);
    
    if (senderRole === 'student' && ticket.studentId.toString() !== senderId.toString()) {
      throw new AppError("Forbidden", 403);
    }
    if (ticket.status === 'closed' || ticket.status === 'resolved') {
      throw new AppError("Cannot send message to a closed or resolved ticket", 400);
    }
    
    const message = {
      senderId,
      senderRole,
      content,
      read: false
    };
    
    ticket.messages.push(message);
    
    // Automatically shift status if admin replies to an open ticket
    if (senderRole === 'admin' && ticket.status === 'open') {
      ticket.status = 'in_progress';
    }
    
    await ticket.save();
    
    const savedMessage = ticket.messages[ticket.messages.length - 1];
    
    const io = getIO();
    io.to(`ticket:${ticketIdStr}`).emit("message:new", { ticketId: ticketIdStr, message: savedMessage });
    
    if (senderRole === 'admin') {
      await supportQueue.add("ticket.reply", { ticketId: ticketIdStr, studentId: ticket.studentId.toString(), message: savedMessage });
    }
    
    return savedMessage;
  }

  // Admin: List All Tickets
  static async listAdminTickets({ status, category, priority, studentId, page = 1, limit = 20 }) {
    const query = {};
    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (studentId) query.studentId = studentId;
    
    const tickets = await SupportTicket.find(query)
      .populate("studentId", "name email")
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select({ messages: { $slice: -1 }, studentId: 1, ticketId: 1, subject: 1, category: 1, priority: 1, status: 1, resolvedAt: 1, updatedAt: 1, createdAt: 1 })
      .lean();
      
    const total = await SupportTicket.countDocuments(query);
    return { tickets, total, pages: Math.ceil(total / limit) };
  }

  // Admin: Update Status or Priority
  static async updateTicket(ticketIdStr, updates) {
    const ticket = await SupportTicket.findOne({ ticketId: ticketIdStr });
    if (!ticket) throw new AppError("Ticket not found", 404);
    
    if (updates.status) ticket.status = updates.status;
    if (updates.priority) ticket.priority = updates.priority;
    
    await ticket.save();
    
    const io = getIO();
    io.to(`ticket:${ticketIdStr}`).emit("ticket:status_changed", { ticketId: ticketIdStr, status: ticket.status, priority: ticket.priority });
    
    return ticket;
  }
  
  // Admin: Stats
  static async getStats() {
    const stats = await SupportTicket.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    
    // Resolve resolved today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    const resolvedTodayCount = await SupportTicket.countDocuments({
      status: "resolved",
      resolvedAt: { $gte: startOfToday }
    });
    
    const result = stats.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, { open: 0, in_progress: 0, resolved: 0, closed: 0 });
    
    result.resolvedToday = resolvedTodayCount;
    // Mock avg response time for now, or keep it generic
    result.avgResponseTime = "under 2 hours";
    
    return result;
  }
}

export default SupportService;
