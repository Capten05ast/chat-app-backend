


const express = require("express");
const router = express.Router();
const groupControllers = require("../controllers/group.controller");
const authMiddleware = require("../middlewares/auth.middleware");

// all routes are protected
router.post("/create", authMiddleware, groupControllers.createGroup);
router.post("/invite", authMiddleware, groupControllers.inviteToGroup);
router.post("/accept", authMiddleware, groupControllers.acceptInvite);
router.post("/decline", authMiddleware, groupControllers.declineInvite);
router.get("/my-groups", authMiddleware, groupControllers.getMyGroups);
router.get("/pending-invites", authMiddleware, groupControllers.getPendingInvites);
router.post("/remove-member", authMiddleware, groupControllers.removeMember);
router.delete("/:groupId", authMiddleware, groupControllers.deleteGroup);

router.post("/:groupId/remove-member", authMiddleware, groupControllers.removeMember);

router.patch("/:groupId/name", authMiddleware, groupControllers.editGroupName);

module.exports = router;



