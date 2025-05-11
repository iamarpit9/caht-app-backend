import express from "express";
import { protect } from "../middleware/auth.js";
import User from "../models/User.js";
import Message from "../models/Message.js";

const router = express.Router();

router.get("/users", protect, async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/messages", protect, async (req, res) => {
  const { userId, recipientId } = req.query;
  try {
    const messages = await Message.find({
      $or: [
        { sender: userId, recipient: recipientId },
        { sender: recipientId, recipient: userId },
      ],
    }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
