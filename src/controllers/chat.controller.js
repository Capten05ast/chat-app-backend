


const messageModel = require("../models/message.model");
const imagekit = require("../utils/imagekit");

// 🚀 SEND MESSAGE (TEXT + IMAGE)
async function sendMessage(req, res) {
  try {
    const senderId = req.user;
    const { receiverId, text, image } = req.body;

    // 🔥 PREVENT EMPTY MESSAGE
    if (!text && !image) {
      return res.status(400).json({ message: "Message cannot be empty" });
    }

    const newMessage = await messageModel.create({
      senderId,
      receiverId,
      text: text || "",
      image: image
        ? {
            url: image.url,
            fileId: image.fileId,
          }
        : null,
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
    const receiverId = req.user;
    const senderId = req.params.id;

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

// 🚀 MANUAL MARK AS SEEN
async function markAsSeen(req, res) {
  try {
    const receiverId = req.user;
    const { senderId } = req.body;

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
async function uploadImage(req, res) {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const response = await imagekit.upload({
      file: file.buffer,
      fileName: file.originalname,
      folder: "whats-up",
    });

    res.status(200).json({
      url: response.url,
      fileId: response.fileId,
      filePath: response.filePath,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// 🗑️ DELETE MESSAGE (WITH IMAGEKIT DELETE)
async function deleteMessage(req, res) {
  try {
    const userId = req.user;
    const { id } = req.params;

    const message = await messageModel.findById(id);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (message.senderId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "You can only delete your own messages" });
    }

    // 🔥 DELETE IMAGE FROM IMAGEKIT
    if (message.image && message.image.fileId) {
      try {
        await imagekit.deleteFile(message.image.fileId);
      } catch (err) {
        console.log("ImageKit delete error:", err.message);
      }
    }

    await message.deleteOne();

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


