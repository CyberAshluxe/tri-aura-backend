/**
 * Admin Authorization Middleware
 * Simple middleware to check if user is admin
 * Only affects routes where it's applied
 */

const adminAuthMiddleware = (req, res, next) => {
  try {
    // Check if user exists
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: "Not authenticated. Please login first." 
      });
    }

    // Check if user role is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: `Access denied. Admin role required. Your role: ${req.user.role}` 
      });
    }

    // User is admin, proceed
    next();

  } catch (error) {
    console.error("❌ Admin auth middleware error:", error.message);
    return res.status(500).json({ 
      success: false, 
      message: "Authentication error" 
    });
  }
};

module.exports = adminAuthMiddleware;
