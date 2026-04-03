


// REQUIRING EXPRESS MIDDLEWARES :-
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const path = require("path");

// 🔥 Validate required env vars at startup — fail fast if something is missing
const required = ["MONGO_URI", "JWT_SECRET", "CLIENT_URL"];
required.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

// REQUIRING ROUTES :-
const authRoutes = require("./routes/auth.routes");
const messageRoutes = require("./routes/message.routes");
const userRoutes = require("./routes/user.routes");
const groupRoutes = require("./routes/group.routes");
const groupMessageRoutes = require("./routes/groupMessage.routes");

// USING EXPRESS MIDDLEWARES :-
const app = express();

// 🔥 CORS — uses env var so it works both locally and in production
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" })); // 🔥 bumped limit for base64 images in group messages
app.use(cookieParser());

// USING ROUTES :-
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/group-messages", groupMessageRoutes);

// // DEPLOYMENT — serve React build as static files
// app.use(express.static(path.join(__dirname, "../public")));

// // 🔥 Catch-all: send index.html for any non-API route
// // This makes React Router work correctly on page refresh in production
// app.get(/^(?!\/api).*/, (req, res) => {
//   res.sendFile(path.join(__dirname, "../public/index.html"));
// });

module.exports = app;



