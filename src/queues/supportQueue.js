import { Queue, Worker } from "bullmq";
import SupportTicket from "../models/SupportTicketModel.js";
import { getIO } from "../config/socket.js";
import { logger } from "../core/logger.js";
import "../config/env.js";

const hostParts = process.env.REDIS_HOST ? process.env.REDIS_HOST.split(":") : ["127.0.0.1"];
const host = hostParts[0];
const port = process.env.REDIS_PORT || hostParts[1] || 6379;
const password = process.env.REDIS_PASSWORD || undefined;

const connection = { host, port, password };

export const supportQueue = new Queue("support", { connection });

export const supportWorker = new Worker("support", async (job) => {
  try {
    if (job.name === "ticket.created") {
      const ticket = job.data.ticket;
      
      try {
        const io = getIO();
        io.to("admin:dashboard").emit("ticket:new", ticket);
      } catch (err) {
        logger.warn("Socket.io not ready or error emitting ticket:new", { message: err.message });
      }

      const User = (await import("../models/UserModel.js")).default;
      const admins = await User.find({ role: "ADMIN", isActive: true }).select("_id").lean();
      
      const notifications = admins.map(admin => ({
        userId: admin._id,
        title: "New Support Ticket",
        message: `Ticket ${ticket.ticketId} created: ${ticket.subject}`,
        type: "support",
        meta: { link: `/admin/support/${ticket.ticketId}` },
        isRead: false
      }));

      const NotificationModel = (await import("../models/NotificationModel.js")).default;
      if (notifications.length > 0) {
        await NotificationModel.insertMany(notifications);
      }
      
    } else if (job.name === "ticket.reply") {
      const { ticketId, studentId } = job.data;
      
      const NotificationModel = (await import("../models/NotificationModel.js")).default;
      await NotificationModel.create({
        userId: studentId,
        title: "Support Reply",
        message: `Admin replied to your ticket ${ticketId}`,
        type: "support",
        meta: { link: `/support/${ticketId}` },
        isRead: false
      });
      
    } else if (job.name === "ticket.auto_close") {
      const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
      const tickets = await SupportTicket.find({
        status: "resolved",
        resolvedAt: { $lte: threeDaysAgo }
      });
      
      for (const ticket of tickets) {
        ticket.status = "closed";
        await ticket.save();
        logger.info(`Auto-closed ticket ${ticket.ticketId}`);
      }
    }
  } catch (error) {
    logger.error(`Error processing job ${job.name} in supportQueue:`, { message: error.message });
    throw error;
  }
}, { connection });

// Schedule auto-close to run every hour
supportQueue.add("ticket.auto_close", {}, {
  repeat: {
    pattern: "0 * * * *"
  }
});

logger.info("Support BullMQ worker initialized");
