


const messageModel = require("../models/message.model");

// 🚀 SEND MESSAGE (TEXT + IMAGE)
async function sendMessage(req, res) {
  try {
    const senderId = req.user;
    const { receiverId, text, image } = req.body;

    const newMessage = await messageModel.create({
      senderId,
      receiverId,
      text: text || "",
      image: image || "",
      seen: false,
    });

    // ✅ No socket emit here — DM delivery is handled entirely by the
    // client-side socket.emit("send_message") in ChatBox.jsx, which
    // server.js picks up and forwards as "receive_message" to the receiver.
    // Adding an extra emit here would use a different event name and
    // could cause duplicate messages on the receiver's screen.

    res.status(201).json({
      message: "Message sent",
      data: newMessage,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// 🚀 GET CHAT + MARK AS SEEN
async function getMessages(req, res) {
  try {
    const receiverId = req.user;
    const senderId = req.params.id;

    // Only hit the DB + emit if there are actually unread messages —
    // avoids a pointless write and socket event every time the chat is opened
    const unreadCount = await messageModel.countDocuments({
      senderId,
      receiverId,
      seen: false,
    });

    if (unreadCount > 0) {
      await messageModel.updateMany(
        { senderId, receiverId, seen: false },
        { seen: true }
      );

      // Notify the sender their messages were seen so checkmarks update instantly
      const io = req.app.get("io");
      io.to(senderId.toString()).emit("message_seen", { receiverId });
    }

    const messages = await messageModel
      .find({
        $or: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      })
      .sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// 🚀 MANUAL MARK AS SEEN (socket fallback — call from the client
// when the chat is already open and a new incoming message arrives)
async function markAsSeen(req, res) {
  try {
    const receiverId = req.user;
    const { senderId } = req.body;

    // Only emit if there was actually something to mark
    const result = await messageModel.updateMany(
      { senderId, receiverId, seen: false },
      { seen: true }
    );

    if (result.modifiedCount > 0) {
      const io = req.app.get("io");
      io.to(senderId.toString()).emit("message_seen", { receiverId });
    }

    res.status(200).json({ message: "Messages marked as seen" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// 🖼️ UPLOAD IMAGE (MULTER + IMAGEKIT)
const imagekit = require("../utils/imagekit");

async function uploadImage(req, res) {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const response = await imagekit.upload({
      file: file.buffer,
      fileName: file.originalname,
    });

    res.status(200).json({ url: response.url });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// 🗑️ DELETE A MESSAGE
async function deleteMessage(req, res) {
  try {
    const userId = req.user;
    const { id } = req.params;

    const message = await messageModel.findById(id);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Only the sender can delete their own message
    if (message.senderId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "You can only delete your own messages" });
    }

    await message.deleteOne();

    // Notify the receiver in real-time so their screen updates instantly
    const io = req.app.get("io");
    io.to(message.receiverId.toString()).emit("message_deleted", {
      messageId: message._id,
    });

    res.status(200).json({ message: "Message deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = {
  sendMessage,
  getMessages,
  markAsSeen,
  uploadImage,
  deleteMessage,
};


