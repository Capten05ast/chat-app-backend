

const express = require("express");
const router = express.Router();

const messageControllers = require("../controllers/chat.controller");
const authMiddleware = require("../middlewares/auth.middleware");

const upload = require("../middlewares/upload.middleware");


// SEND MESSAGE
router.post("/send", authMiddleware, messageControllers.sendMessage);

// GET CHAT WITH A USER
// This gives your chats with other user by entering other users ID and not yours
router.get("/:id", authMiddleware, messageControllers.getMessages);

// MARK AS SEEN
router.put("/seen", authMiddleware, messageControllers.markAsSeen);

// UPLOAD TO IMAGEKIT

router.post(
  "/upload",
  authMiddleware,
  upload.single("image"), // 👈 VERY IMPORTANT
  messageControllers.uploadImage
);

module.exports = router;


