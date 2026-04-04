



const GroupMessage = require("../models/groupMessage.model");
const Group = require("../models/group.model");

// 🔥 GET GROUP MESSAGES
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

      // Emit to group room first
      io.to(groupId.toString()).emit("group_messages_seen", {
        groupId,
        seenBy: userId,
      });

      // Fallback: also emit to each member's personal room in case their
      // socket isn't in the group room (e.g. after a reconnect)
      group.members.forEach((memberId) => {
        const id = memberId._id ? memberId._id.toString() : memberId.toString();
        if (id === userId.toString()) return; // no need to notify yourself
        io.to(id).emit("group_messages_seen", {
          groupId,
          seenBy: userId,
        });
      });
    }

    // Send response after all side effects are done
    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// 🔥 SEND GROUP MESSAGE
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

    // Emit to group room
    io.to(groupId.toString()).emit("new_group_message", {
      groupId,
      message: populated,
    });

    // Fallback: emit to each member's personal room in case their socket
    // missed the group room join (same fix as acceptInvite)
    group.members.forEach((memberId) => {
      const id = memberId._id ? memberId._id.toString() : memberId.toString();
      if (id === senderId.toString()) return; // sender doesn't need their own message echoed
      io.to(id).emit("new_group_message", {
        groupId,
        message: populated,
      });
    });

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = { getGroupMessages, sendGroupMessage };



