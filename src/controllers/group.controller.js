


const Group = require("../models/group.model");
const User = require("../models/user.model");
const imagekit = require("../utils/imagekit");

// ─────────────────────────────────────────────
// HELPER: ensure every online member's socket is
// joined to the group room before we emit.
// Prevents the need for personal-room fallback emits
// which cause double-delivery bugs.
// ─────────────────────────────────────────────
function ensureMembersInRoom(io, onlineUsers, groupId, members) {
  members.forEach((member) => {
    const id = member._id ? member._id.toString() : member.toString();
    const socketId = onlineUsers?.get(id);
    if (!socketId) return;
    const socket = io.sockets.sockets.get(socketId);
    if (socket && !socket.rooms.has(groupId.toString())) {
      socket.join(groupId.toString());
      console.log(`[room-heal] Re-joined member ${id} to group room ${groupId}`);
    }
  });
}

// 🔥 CREATE GROUP
async function createGroup(req, res) {
  try {
    const { name } = req.body;
    const adminId = req.user;

    if (!name?.trim()) {
      return res.status(400).json({ message: "Group name is required" });
    }

    const group = await Group.create({
      name,
      admin: adminId,
      members: [adminId],
    });

    const io = req.app.get("io");
    const onlineUsers = req.app.get("onlineUsers");
    const adminSocketId = onlineUsers?.get(adminId.toString());

    if (adminSocketId) {
      const adminSocket = io.sockets.sockets.get(adminSocketId);
      if (adminSocket) {
        adminSocket.join(group._id.toString());
        console.log(`Admin ${adminId} joined group room ${group._id}`);
      }
    }

    res.status(201).json(group);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// 🔥 INVITE TO GROUP
async function inviteToGroup(req, res) {
  try {
    const { groupId, userId } = req.body;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    if (group.members.includes(userId))
      return res.status(400).json({ message: "User is already a member" });

    await Group.findByIdAndUpdate(groupId, {
      $addToSet: { pendingInvites: userId },
    });

    const io = req.app.get("io");
    io.to(userId.toString()).emit("new_group_invite");

    res.status(200).json({ message: "Invite sent" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// 🔥 ACCEPT INVITE
async function acceptInvite(req, res) {
  try {
    const userId = req.user;
    const { groupId } = req.body;

    const group = await Group.findByIdAndUpdate(
      groupId,
      {
        $pull: { pendingInvites: userId },
        $addToSet: { members: userId },
      },
      { new: true }
    ).populate("members", "-password");

    if (!group) return res.status(404).json({ message: "Group not found" });

    const io = req.app.get("io");
    const onlineUsers = req.app.get("onlineUsers");

    // Step 1: Make the new member's socket join the group room
    const userSocketId = onlineUsers?.get(userId.toString());
    if (userSocketId) {
      const userSocket = io.sockets.sockets.get(userSocketId);
      if (userSocket) {
        userSocket.join(groupId.toString());
        console.log(`User ${userId} joined group room ${groupId}`);
      }
    }

    // Step 2: Heal the room — ensure ALL existing members' sockets are present.
    // ensureMembersInRoom skips anyone already in the room so no double-joins.
    ensureMembersInRoom(io, onlineUsers, groupId, group.members);

    // Step 3: Single emit to the group room — reaches everyone exactly once.
    // No personal-room fallback forEach needed (that was the double-emit bug).
    io.to(groupId.toString()).emit("group_member_joined", {
      groupId: group._id.toString(),
      members: group.members,
    });

    console.log(
      `Emitted group_member_joined to room for ${group.members.length} members`
    );

    res.status(200).json({ message: "Joined group successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// 🔥 DECLINE INVITE
async function declineInvite(req, res) {
  try {
    const userId = req.user;
    const { groupId } = req.body;

    await Group.findByIdAndUpdate(groupId, {
      $pull: { pendingInvites: userId },
    });

    res.status(200).json({ message: "Invite declined" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// 🔥 GET MY GROUPS
async function getMyGroups(req, res) {
  try {
    const userId = req.user;

    const groups = await Group.find({ members: userId })
      .populate("admin", "-password")
      .populate("members", "-password");

    res.status(200).json(groups);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// 🔥 GET PENDING INVITES
async function getPendingInvites(req, res) {
  try {
    const userId = req.user;

    const groups = await Group.find({ pendingInvites: userId }).populate(
      "admin",
      "-password"
    );

    res.status(200).json(groups);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// 🔥 REMOVE MEMBER — admin only
async function removeMember(req, res) {
  try {
    const adminId = req.user;
    const { groupId } = req.params;
    const { memberId } = req.body;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    if (group.admin.toString() !== adminId.toString())
      return res.status(403).json({ message: "Only admin can remove members" });

    if (memberId === adminId.toString())
      return res
        .status(400)
        .json({ message: "Admin cannot remove themselves" });

    group.members = group.members.filter(
      (id) => id.toString() !== memberId.toString()
    );
    await group.save();

    const populated = await group.populate("members", "-password");

    const io = req.app.get("io");
    const onlineUsers = req.app.get("onlineUsers");

    // Kick the removed member's socket out of the group room
    const removedSocketId = onlineUsers?.get(memberId.toString());
    if (removedSocketId) {
      const removedSocket = io.sockets.sockets.get(removedSocketId);
      if (removedSocket) {
        removedSocket.leave(groupId.toString());
        console.log(`User ${memberId} left group room ${groupId}`);
      }
    }

    // Notify the removed user directly (they've left the room so can't get group emit)
    io.to(memberId.toString()).emit("removed_from_group", { groupId });

    // Notify remaining members via group room — no forEach fallback needed,
    // ensureMembersInRoom keeps the room healthy
    ensureMembersInRoom(io, onlineUsers, groupId, populated.members);

    io.to(groupId.toString()).emit("group_members_updated", {
      groupId,
      members: populated.members,
    });

    res.status(200).json({ message: "Member removed successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// 🔥 DELETE GROUP — admin only
async function deleteGroup(req, res) {
  try {
    const adminId = req.user;
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    if (group.admin.toString() !== adminId.toString())
      return res
        .status(403)
        .json({ message: "Only admin can delete the group" });

    const io = req.app.get("io");

    // Personal-room emit is correct here — group room is being destroyed,
    // so each member needs a direct notification
    group.members.forEach((memberId) => {
      io.to(memberId.toString()).emit("group_deleted", { groupId });
    });

    await Group.findByIdAndDelete(groupId);

    res.status(200).json({ message: "Group deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// 🔥 EDIT GROUP NAME — admin only
async function editGroupName(req, res) {
  try {
    const adminId = req.user;
    const { groupId } = req.params;
    const { name } = req.body;

    if (!name?.trim())
      return res.status(400).json({ message: "Name is required" });

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    if (group.admin.toString() !== adminId.toString())
      return res
        .status(403)
        .json({ message: "Only admin can edit group name" });

    group.name = name.trim();
    await group.save();

    const io = req.app.get("io");
    const onlineUsers = req.app.get("onlineUsers");

    // Heal room then single group-room emit
    ensureMembersInRoom(io, onlineUsers, groupId, group.members);

    io.to(groupId.toString()).emit("group_name_updated", {
      groupId,
      name: group.name,
    });

    res.status(200).json({ message: "Group name updated", name: group.name });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createGroup,
  inviteToGroup,
  acceptInvite,
  declineInvite,
  getMyGroups,
  getPendingInvites,
  removeMember,
  deleteGroup,
  editGroupName,
};


