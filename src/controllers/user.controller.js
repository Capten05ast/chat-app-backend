


const userModel = require("../models/user.model");
const bcrypt = require("bcryptjs");
const imagekit = require("../utils/imagekit"); // same imagekit instance

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

    currentUser.connections.push(targetUser._id);
    targetUser.connections.push(currentUserId);

    await currentUser.save();
    await targetUser.save();

    const io = req.app.get("io");
    if (io) {
      io.to(currentUserId.toString()).emit("new_connection", {
        userId: targetUser._id.toString(),
      });
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

// ✏️ UPDATE PROFILE (name, email, password)
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

// 🖼️ UPLOAD / UPDATE AVATAR
// - Uploads to ImageKit in a dedicated "insta-dopamine-avatars" folder
// - If user had a previous avatar, deletes the old one from ImageKit first
// - Saves new avatar URL + fileId to user doc
// - Emits "profile_pic_updated" to ALL connections so their sidebars update live
async function uploadAvatar(req, res) {
  try {
    const userId = req.user;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const user = await userModel.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // 🔥 Delete old avatar from ImageKit if it exists
    if (user.avatarFileId) {
      try {
        await imagekit.deleteFile(user.avatarFileId);
        console.log("Old avatar deleted from ImageKit:", user.avatarFileId);
      } catch (err) {
        // Don't fail the request if delete fails — just log it
        console.log("Could not delete old avatar from ImageKit:", err.message);
      }
    }

    // 🔥 Upload new avatar to ImageKit — separate folder from message images
    const response = await imagekit.upload({
      file: file.buffer,
      fileName: `avatar_${userId}_${Date.now()}`,
      folder: "insta-dopamine-avatars", // 🔥 dedicated folder, not "whats-up"
    });

    // Save avatar URL and fileId to user
    user.avatar    = response.url;
    user.avatarFileId = response.fileId;
    await user.save();

    // 🔥 Emit "profile_pic_updated" to all connections so their UI updates live
    // Also emit to self so Home.jsx / navbar updates instantly
    const io = req.app.get("io");
    if (io) {
      const payload = {
        userId: userId.toString(),
        avatar: response.url,
      };

      // Notify self (navbar avatar updates)
      io.to(userId.toString()).emit("profile_pic_updated", payload);

      // Notify all connections (their sidebars + open chats update)
      const populatedUser = await userModel
        .findById(userId)
        .populate("connections", "_id");

      populatedUser.connections.forEach((connection) => {
        io.to(connection._id.toString()).emit("profile_pic_updated", payload);
      });

      console.log(
        `Avatar updated for ${userId}, notified ${populatedUser.connections.length} connections`
      );
    }

    const updated = user.toObject();
    delete updated.password;

    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// 🗑️ REMOVE AVATAR (reset to initials)
async function removeAvatar(req, res) {
  try {
    const userId = req.user;
    const user = await userModel.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Delete from ImageKit
    if (user.avatarFileId) {
      try {
        await imagekit.deleteFile(user.avatarFileId);
      } catch (err) {
        console.log("Could not delete avatar from ImageKit:", err.message);
      }
    }

    user.avatar       = "";
    user.avatarFileId = "";
    await user.save();

    // Notify self + all connections
    const io = req.app.get("io");
    if (io) {
      const payload = { userId: userId.toString(), avatar: "" };
      io.to(userId.toString()).emit("profile_pic_updated", payload);

      const populatedUser = await userModel
        .findById(userId)
        .populate("connections", "_id");
      populatedUser.connections.forEach((connection) => {
        io.to(connection._id.toString()).emit("profile_pic_updated", payload);
      });
    }

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
  uploadAvatar,
  removeAvatar,
};

