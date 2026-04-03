


const GroupMessage = require("../models/groupMessage.model");
const Group = require("../models/group.model");

// 🔥 GET GROUP MESSAGES
async function getGroupMessages(req, res) {
  try {
    const userId = req.user;
    const { groupId } = req.params;

    // make sure user is a member
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    if (!group.members.includes(userId)) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    const messages = await GroupMessage.find({ groupId })
      .populate("sender", "-password")
      .sort({ createdAt: 1 });

    // 🔥 Mark all unread messages as seen by this user
    await GroupMessage.updateMany(
      { groupId, seenBy: { $ne: userId } },
      { $addToSet: { seenBy: userId } }
    );

    // 🔥 FIX: notify everyone in the group room that this user has seen messages
    // so sender's checkmarks update in real time without refresh
    const io = req.app.get("io");
    io.to(groupId.toString()).emit("group_messages_seen", {
      groupId,
      seenBy: userId,
    });

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

    // make sure user is a member
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
      seenBy: [senderId], // sender has already seen it
    });

    const populated = await newMessage.populate("sender", "-password");

    // 🔥 FIX: emit ONCE to the group room instead of looping through each member
    // All members are already in this room (joined on connect or on invite accept)
    const io = req.app.get("io");
    io.to(groupId.toString()).emit("new_group_message", {
      groupId,
      message: populated,
    });

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = { getGroupMessages, sendGroupMessage };


