

const jwt = require("jsonwebtoken");

async function authMiddleware(req, res, next) {
  try {
    // Get token from cookies
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({
        message: "Unauthorized - No token",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user id to request
    req.user = decoded.id;

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Unauthorized - Invalid token",
    });
  }
}

module.exports = authMiddleware;




