


const express = require("express");
const router = express.Router();

const userControllers = require("../controllers/user.controller");
const authMiddleware  = require("../middlewares/auth.middleware");
const upload          = require("../middlewares/multer.middleware"); // same multer used for messages

// GET CURRENT USER
router.get("/me", authMiddleware, userControllers.getCurrentUser);

// GET ALL USERS (connections)
router.get("/", authMiddleware, userControllers.getAllUsers);

// SEARCH USERS
router.get("/search", authMiddleware, userControllers.searchUsers);

// CONNECT / DISCONNECT
router.post("/connect",    authMiddleware, userControllers.connectUser);
router.post("/disconnect", authMiddleware, userControllers.disconnectUser);

// UPDATE PROFILE (name, email, password)
router.patch("/update-profile", authMiddleware, userControllers.updateProfile);

// 🔥 UPLOAD AVATAR — multer handles the multipart/form-data file
router.post("/upload-avatar", authMiddleware, upload.single("avatar"), userControllers.uploadAvatar);

// 🔥 REMOVE AVATAR — reset back to initials
router.delete("/remove-avatar", authMiddleware, userControllers.removeAvatar);

module.exports = router;


