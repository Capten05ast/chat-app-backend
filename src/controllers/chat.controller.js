


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
    const receiverId = req.user;      // logged-in user (they are receiving)
    const senderId = req.params.id;   // the other person

    // 🔥 Mark messages from the other person as seen
    await messageModel.updateMany(
      {
        senderId,
        receiverId,
        seen: false,
      },
      { seen: true }
    );

    // 🔥 FIX: notify the original sender their messages were seen
    // Uses the personal room (io.to(userId)) set up in server.js
    const io = req.app.get("io");
    io.to(senderId.toString()).emit("message_seen", { receiverId });

    // Fetch full conversation
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

// 🚀 MANUAL MARK AS SEEN (for socket fallback)
async function markAsSeen(req, res) {
  try {
    const receiverId = req.user;
    const { senderId } = req.body;

    await messageModel.updateMany(
      { senderId, receiverId, seen: false },
      { seen: true }
    );

    // 🔥 Also notify via socket so sender's UI updates instantly
    const io = req.app.get("io");
    io.to(senderId.toString()).emit("message_seen", { receiverId });

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

module.exports = {
  sendMessage,
  getMessages,
  markAsSeen,
  uploadImage,
};



