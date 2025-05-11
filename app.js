import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import User from "./models/User.js";
import Message from "./models/Message.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/user.js";

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT,
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

app.use("/api", userRoutes);
app.use("/api/auth", authRoutes);

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));

const onlineUsers = new Map();

io.on("connection", (socket) => {
  // send-message handler
  socket.on("send-message", async ({ senderId, recipientId, text }) => {
    try {
      const message = new Message({
        sender: senderId,
        recipient: recipientId,
        text,
        timestamp: new Date(),
      });
      await message.save();

      // Emit to specific rooms
      io.to(`user_${senderId}`).emit("receive-message", message);
      io.to(`user_${recipientId}`).emit("receive-message", message);
    } catch (err) {
      console.error("Error saving message:", err);
    }
  });

  // Join rooms
  socket.on("join", async (userId) => {
    onlineUsers.set(socket.id, userId);
    await User.findByIdAndUpdate(userId, { online: true, lastSeen: null });

    // Join the user's personal room
    socket.join(`user_${userId}`);

    io.emit("user-status", { userId, online: true });
  });

  // Track typing users
  const typingUsers = new Map();

  socket.on("typing", ({ senderId, recipientId, isTyping }) => {
    if (isTyping) {
      typingUsers.set(senderId, Date.now());
    } else {
      typingUsers.delete(senderId);
    }

    socket.to(`user_${recipientId}`).emit("typing", {
      senderId,
      isTyping,
    });
  });

  // Clean up stale typing indicators
  setInterval(() => {
    const now = Date.now();
    typingUsers.forEach((timestamp, userId) => {
      if (now - timestamp > 5000) {
        // 5 second timeout
        typingUsers.delete(userId);
        io.emit("typing", {
          senderId: userId,
          isTyping: false,
        });
      }
    });
  }, 1000);

  // Handle disconnection
  socket.on("disconnect", async () => {
    const userId = onlineUsers.get(socket.id);
    if (userId) {
      const lastSeen = new Date();
      await User.findByIdAndUpdate(userId, {
        online: false,
        lastSeen,
      });
      io.emit("user-status", {
        userId,
        online: false,
        lastSeen: lastSeen.toISOString(),
      });
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
