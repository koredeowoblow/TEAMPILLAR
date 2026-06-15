import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { userRepository } from "../repository/UserRepository.js";
import AuthRepository from "../repository/AuthRepository.js";
import AuthService from "../services/AuthService.js";
import { logger } from "../core/logger.js";

const authRepository = new AuthRepository();

let io;

export function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: "*", // Allowing all origins for socket.io temporarily or mirror Express CORS
      methods: ["GET", "POST"]
    }
  });

  // Middleware for authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) return next(new Error("Authentication error: No token provided"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
      const tokenHash = AuthService.hashToken(token);
      
      const [session, user] = await Promise.all([
        authRepository.findSessionByToken(tokenHash),
        userRepository.findById(decoded.id, { lean: true, select: "_id name email role isAdmin" })
      ]);

      if (!session || session.isLoggedOut) return next(new Error("Authentication error: Invalid session"));
      if (!user) return next(new Error("Authentication error: User not found"));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Authentication error: " + err.message));
    }
  });

  io.on("connection", (socket) => {
    logger.info(`User connected to socket: ${socket.user.name} (${socket.id})`);

    // If admin, join admin dashboard room for global notifications
    if (socket.user.isAdmin || socket.user.role === 'ADMIN') {
      socket.join('admin:dashboard');
      logger.info(`Admin ${socket.user.name} joined admin:dashboard room`);
    }

    // Join a specific ticket room
    socket.on("join_ticket", (ticketId) => {
      socket.join(`ticket:${ticketId}`);
      logger.info(`User ${socket.user.name} joined ticket:${ticketId}`);
    });

    // Leave a ticket room
    socket.on("leave_ticket", (ticketId) => {
      socket.leave(`ticket:${ticketId}`);
    });

    // Typing indicators
    socket.on("typing:start", (ticketId) => {
      socket.to(`ticket:${ticketId}`).emit("typing:start", { ticketId, user: socket.user.name });
    });

    socket.on("typing:stop", (ticketId) => {
      socket.to(`ticket:${ticketId}`).emit("typing:stop", { ticketId, user: socket.user.name });
    });

    socket.on("disconnect", () => {
      logger.info(`User disconnected: ${socket.user.name} (${socket.id})`);
    });
  });

  return io;
}

export function getIO() {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
}
