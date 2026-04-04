


const userModel = require("../models/user.model");
const bcrypt = require("bcryptjs");

// GET CURRENT USER
async function getCurrentUser(req, res) {
  try {
    const user = await userModel.findById(req.user).select("-password");
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// GET ALL USERS (connections of logged-in user)
async function getAllUsers(req, res) {
  try {
    const user = await userModel
      .findById(req.user)
      .populate("connections", "-password");
    res.status(200).json(user.connections);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// SEARCH USERS
async function searchUsers(req, res) {
  try {
    const keyword = req.query.q;
    const users = await userModel.find({
      $and: [
        {
          $or: [
            { "fullName.firstName": { $regex: keyword, $options: "i" } },
            { "fullName.lastName":  { $regex: keyword, $options: "i" } },
            { email:                { $regex: keyword, $options: "i" } },
          ],
        },
        { _id: { $ne: req.user } },
      ],
    }).select("-password");
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// 🔗 CONNECT USER BY EMAIL
async function connectUser(req, res) {
  try {
    const currentUserId = req.user;
    const { email } = req.body;

    const targetUser = await userModel.findOne({ email });

    if (!targetUser) {
      return res.status(404).json({ message: "No user found with that email" });
    }

    if (currentUserId.toString() === targetUser._id.toString()) {
      return res.status(400).json({ message: "Cannot connect to yourself" });
    }

    const currentUser = await userModel.findById(currentUserId);

    if (currentUser.connections.includes(targetUser._id)) {
      return res.status(400).json({ message: "Already connected" });
    }

    // Add both sides
    currentUser.connections.push(targetUser._id);
    targetUser.connections.push(currentUserId);

    await currentUser.save();
    await targetUser.save();

    // 🔥 Emit to BOTH users so their sidebars refresh live — no page reload needed
    const io = req.app.get("io");
    if (io) {
      // Tell the person who sent the request — they added a new connection
      io.to(currentUserId.toString()).emit("new_connection", {
        userId: targetUser._id.toString(),
      });
      // Tell the person who was added — they now have a new connection too
      io.to(targetUser._id.toString()).emit("new_connection", {
        userId: currentUserId.toString(),
      });
    }

    res.status(200).json({ message: "Connected successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// DISCONNECT USER
async function disconnectUser(req, res) {
  try {
    const currentUserId = req.user;
    const { userId } = req.body;

    await userModel.findByIdAndUpdate(currentUserId, {
      $pull: { connections: userId },
    });
    await userModel.findByIdAndUpdate(userId, {
      $pull: { connections: currentUserId },
    });

    // 🔥 Emit to both users so sidebar updates live on disconnect too
    const io = req.app.get("io");
    if (io) {
      io.to(currentUserId.toString()).emit("connection_removed", { userId });
      io.to(userId.toString()).emit("connection_removed", { userId: currentUserId.toString() });
    }

    res.status(200).json({ message: "Disconnected successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ✏️ UPDATE PROFILE
async function updateProfile(req, res) {
  try {
    const userId = req.user;
    const { firstName, lastName, email, currentPassword, newPassword } = req.body;

    const user = await userModel.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (email && email !== user.email) {
      const existing = await userModel.findOne({ email });
      if (existing) return res.status(400).json({ message: "Email already in use" });
      user.email = email;
    }

    if (firstName) user.fullName.firstName = firstName;
    if (lastName)  user.fullName.lastName  = lastName;

    if (currentPassword && newPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) return res.status(400).json({ message: "Current password is incorrect" });
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
    }

    await user.save();

    const updated = user.toObject();
    delete updated.password;

    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = {
  getCurrentUser,
  getAllUsers,
  searchUsers,
  connectUser,
  disconnectUser,
  updateProfile,
};


