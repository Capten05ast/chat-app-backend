


const GroupMessage = require("../models/groupMessage.model");
const Group = require("../models/group.model");

// ─────────────────────────────────────────────
// HELPER: ensure every online member's socket is
// joined to the group room before we emit.
// This replaces the old "fallback personal-room emit"
// pattern which caused double-delivery bugs.
// ─────────────────────────────────────────────
function ensureMembersInRoom(io, onlineUsers, groupId, members) {
  members.forEach((memberId) => {
    const id = memberId._id ? memberId._id.toString() : memberId.toString();
    const socketId = onlineUsers?.get(id);
    if (!socketId) return;
    const socket = io.sockets.sockets.get(socketId);
    if (socket && !socket.rooms.has(groupId.toString())) {
      socket.join(groupId.toString());
      console.log(`[room-heal] Re-joined member ${id} to group room ${groupId}`);
    }
  });
}

// ─────────────────────────────────────────────
// GET GROUP MESSAGES
// ─────────────────────────────────────────────
async function getGroupMessages(req, res) {
  try {
    const userId = req.user;
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    if (!group.members.includes(userId)) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    const messages = await GroupMessage.find({ groupId })
      .populate("sender", "-password")
      .sort({ createdAt: 1 });

    // Only mark as seen + emit if there are actually unread messages —
    // avoids unnecessary DB writes and socket noise on every open
    const unreadCount = await GroupMessage.countDocuments({
      groupId,
      seenBy: { $ne: userId },
    });

    if (unreadCount > 0) {
      await GroupMessage.updateMany(
        { groupId, seenBy: { $ne: userId } },
        { $addToSet: { seenBy: userId } }
      );

      const io = req.app.get("io");
      const onlineUsers = req.app.get("onlineUsers");

      // Heal the room first so io.to(groupId) reaches everyone
      ensureMembersInRoom(io, onlineUsers, groupId, group.members);

      // Single emit to the group room — no personal-room fallback needed
      // because ensureMembersInRoom already fixed any missing joins
      io.to(groupId.toString()).emit("group_messages_seen", {
        groupId,
        seenBy: userId,
      });
    }

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ─────────────────────────────────────────────
// SEND GROUP MESSAGE
// ─────────────────────────────────────────────
async function sendGroupMessage(req, res) {
  try {
    const senderId = req.user;
    const { groupId } = req.params;
    const { message, image } = req.body;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    if (!group.members.includes(senderId)) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    const newMessage = await GroupMessage.create({
      groupId,
      sender: senderId,
      message,
      image,
      seenBy: [senderId],
    });

    const populated = await newMessage.populate("sender", "-password");

    const io = req.app.get("io");
    const onlineUsers = req.app.get("onlineUsers");

    // Heal the room so every online member's socket is present,
    // then ONE emit to the group room reaches everyone — no duplicate
    // personal-room emits that caused the double-message bug.
    ensureMembersInRoom(io, onlineUsers, groupId, group.members);

    io.to(groupId.toString()).emit("new_group_message", {
      groupId,
      message: populated,
    });

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ─────────────────────────────────────────────
// DELETE GROUP MESSAGE
// ─────────────────────────────────────────────
const imagekit = require("../utils/imagekit");

async function deleteGroupMessage(req, res) {
  try {
    const userId = req.user;
    const { groupId, messageId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    if (!group.members.includes(userId)) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    const message = await GroupMessage.findById(messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });

    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({ message: "You can only delete your own messages" });
    }

    // Delete image from ImageKit if present
    if (message.image && message.image.fileId) {
      try {
        await imagekit.deleteFile(message.image.fileId);
      } catch (err) {
        console.log("ImageKit delete error:", err.message);
      }
    }

    await message.deleteOne();

    const io = req.app.get("io");
    const onlineUsers = req.app.get("onlineUsers");

    // Same pattern: heal the room first, then single group-room emit
    ensureMembersInRoom(io, onlineUsers, groupId, group.members);

    io.to(groupId.toString()).emit("group_message_deleted", {
      groupId,
      messageId: message._id,
    });

    res.status(200).json({ message: "Message deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = { getGroupMessages, sendGroupMessage, deleteGroupMessage };


