


const express = require("express");
const router = express.Router();

const userControllers = require("../controllers/user.controller");
const authMiddleware = require("../middlewares/auth.middleware");

// GET CURRENT USER
router.get("/me", authMiddleware, userControllers.getCurrentUser);

// GET ALL USERS (except me)
router.get("/", authMiddleware, userControllers.getAllUsers);

// SEARCH USERS
router.get("/search", authMiddleware, userControllers.searchUsers);

router.post("/connect", authMiddleware, userControllers.connectUser);

router.post("/disconnect", authMiddleware, userControllers.disconnectUser);
router.patch("/update-profile", authMiddleware, userControllers.updateProfile);

module.exports = router;





