


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
    origin: process.env.CLIENT_URL,
    credentials: true,
  },
});

const onlineUsers = new Map();

app.set("io", io);
app.set("onlineUsers", onlineUsers);

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // JOIN
  socket.on("join", async (userId) => {
    onlineUsers.set(userId, socket.id);
    socket.join(userId);
    console.log("User joined personal room:", userId);

    // Join all group rooms
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
  socket.on("send_message", (data) => {
    io.to(data.receiverId).emit("receive_message", data);
  });

  // TYPING
  socket.on("typing", ({ senderId, receiverId }) => {
    io.to(receiverId).emit("typing", { senderId });
  });

  // STOP TYPING
  socket.on("stop_typing", ({ senderId, receiverId }) => {
    io.to(receiverId).emit("stop_typing", { senderId });
  });

  // SEEN
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

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});



