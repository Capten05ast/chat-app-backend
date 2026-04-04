


const mongoose = require("mongoose");

const groupMessageSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    message: {
      type: String,
      default: "",
    },

    // ✅ Changed from plain String to object — matches what the controller saves
    // and what GroupMessage.jsx reads (msg.image?.url)
    image: {
      url: { type: String, default: "" },
      fileId: { type: String, default: "" },
    },

    seenBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("GroupMessage", groupMessageSchema);


