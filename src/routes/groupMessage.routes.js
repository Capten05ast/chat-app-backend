

const express = require("express");
const router = express.Router();
const groupMessageControllers = require("../controllers/groupMessage.controller");
const authMiddleware = require("../middlewares/auth.middleware");

router.get("/:groupId", authMiddleware, groupMessageControllers.getGroupMessages);
router.post("/:groupId", authMiddleware, groupMessageControllers.sendGroupMessage);

module.exports = router;


