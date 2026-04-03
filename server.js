


require("dotenv").config();
const app = require("./src/App");

const connectDB = require("./src/db/db");
connectDB();

const http = require("http");
const { Server } = require("socket.io");
const Group = require("./src/models/group.model");

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    credentials: true,
  },
});

// 🔥 onlineUsers Map — only used for tracking who's online
// NOT used for message routing anymore (we use rooms instead)
const onlineUsers = new Map();

app.set("io", io);
app.set("onlineUsers", onlineUsers);

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // JOIN
  socket.on("join", async (userId) => {
    onlineUsers.set(userId, socket.id);

    // 🔥 Each user joins a personal room named after their userId
    // This means io.to(userId) works from anywhere — controllers, here, anywhere
    socket.join(userId);
    console.log("User joined personal room:", userId);

    // 🔥 Also join all group rooms so io.to(groupId) reaches them
    try {
      const groups = await Group.find({ members: userId });
      groups.forEach((group) => {
        socket.join(group._id.toString());
        console.log(`User ${userId} joined group room: ${group._id}`);
      });
    } catch (err) {
      console.log("Error joining group rooms:", err);
    }

    io.emit("online_users", Array.from(onlineUsers.keys()));
  });

  // SEND MESSAGE
  // 🔥 FIX: use io.to(receiverId) room instead of looking up socket ID from Map
  socket.on("send_message", (data) => {
    io.to(data.receiverId).emit("receive_message", data);
  });

  // ✍️ TYPING
  // 🔥 FIX: use io.to(receiverId) room
  socket.on("typing", ({ senderId, receiverId }) => {
    io.to(receiverId).emit("typing", { senderId });
  });

  // 🛑 STOP TYPING
  // 🔥 FIX: use io.to(receiverId) room
  socket.on("stop_typing", ({ senderId, receiverId }) => {
    io.to(receiverId).emit("stop_typing", { senderId });
  });

  // SEEN
  // 🔥 FIX: use io.to(senderId) room — notify the original message sender
  socket.on("seen", ({ senderId, receiverId }) => {
    io.to(senderId).emit("message_seen", { receiverId });
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    for (let [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
    io.emit("online_users", Array.from(onlineUsers.keys()));
  });
});

server.listen(3000, () => {
  console.log("Server running with socket on port 3000");
});


