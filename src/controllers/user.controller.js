


const userModel = require("../models/user.model");

// GET CURRENT USER
async function getCurrentUser(req, res) {
  try {
    const user = await userModel.findById(req.user).select("-password");

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// GET ALL USERS (except logged-in user)
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
            { "fullName.lastName": { $regex: keyword, $options: "i" } },
            { email: { $regex: keyword, $options: "i" } },
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


// 🔗 CONNECT USER BY ID
// 🔗 CONNECT USER BY EMAIL
async function connectUser(req, res) {
  try {
    const currentUserId = req.user;
    const { email } = req.body; // 🔥 receive email instead of userId

    // Find target user by email
    const targetUser = await userModel.findOne({ email });

    if (!targetUser) {
      return res.status(404).json({ message: "No user found with that email" });
    }

    if (currentUserId.toString() === targetUser._id.toString()) {
      return res.status(400).json({ message: "Cannot connect to yourself" });
    }

    const currentUser = await userModel.findById(currentUserId);

    // Already connected?
    if (currentUser.connections.includes(targetUser._id)) {
      return res.status(400).json({ message: "Already connected" });
    }

    // Add both sides
    currentUser.connections.push(targetUser._id);
    targetUser.connections.push(currentUserId);

    await currentUser.save();
    await targetUser.save();

    res.status(200).json({ message: "Connected successfully" });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

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

    res.status(200).json({ message: "Disconnected successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}


const bcrypt = require("bcryptjs");

// ✏️ UPDATE PROFILE
async function updateProfile(req, res) {
  try {
    const userId = req.user;
    const { firstName, lastName, email, currentPassword, newPassword } = req.body;

    const user = await userModel.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // 🔥 email change — check not taken by someone else
    if (email && email !== user.email) {
      const existing = await userModel.findOne({ email });
      if (existing) return res.status(400).json({ message: "Email already in use" });
      user.email = email;
    }

    if (firstName) user.fullName.firstName = firstName;
    if (lastName)  user.fullName.lastName  = lastName;

    // 🔥 password change — only if currentPassword provided and correct
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
  updateProfile
};
