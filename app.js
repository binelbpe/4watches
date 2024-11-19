require("dotenv").config();
const express = require("express");
const app = express();
const path = require("path");
const userRoute = require("./routes/userRoute");
const mongoConnect = require("./config/dbconnect");
const cors = require("cors");
const session = require("express-session");
const { v4: uuidv4 } = require("uuid");
const passport = require("passport");
const startScheduledTask = require("./helpers/scheduledTasks");
const logger = require("morgan");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("./models/userModel");
const adminRouter = require("./routes/admin.js/admin");
const nocacheMiddleware = require("./middleware/noCache");
const flash = require("express-flash");
const authController = require("./controllers/user/authController");
const methodOverride = require("method-override");
const createError = require("http-errors");
const mongoose = require("mongoose");

const { sendOTP } = require("./helpers/otpService");

// Add this near the top of app.js
const EventEmitter = require('events');
EventEmitter.defaultMaxListeners = 15; // or any higher number as needed

// Define PORT with fallback
const PORT = process.env.PORT || 3000;

app.use(
  "/",
  session({
    genid: (req) => {
      return uuidv4();
    },
    secret: process.env.SESSION_SECRET_USER,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

app.use(flash());

startScheduledTask();
app.use(cors());
app.use(nocacheMiddleware());

// View engine setup
app.set("view engine", "ejs");
app.set("views", [
  path.join(__dirname, "views/user"),
  path.join(__dirname, "views/admin"),
]);

// Move static file serving before routes
// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")));
// Serve uploads directory specifically
app.use('/uploads', express.static(path.join(__dirname, "public/uploads")));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Routes
app.use("/", userRoute);
app.use("/admin", adminRouter);

// Cache control middleware
app.use((req, res, next) => {
  // Skip cache control headers for static files
  if (!req.path.startsWith('/uploads/')) {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, max-age=0"
    );
  }
  next();
});

app.use(methodOverride("_method"));

// Handle 404 errors - Skip for static files
app.use((req, res, next) => {
  // Skip 404 handling for static files and uploads
  if (req.path.startsWith('/uploads/') || req.path.startsWith('/public/')) {
    return next();
  }
  next(createError(404, "Route not found"));
});

// Global error handler
app.use((err, req, res, next) => {
  // Skip error handling for static files and uploads
  if (req.path.startsWith('/uploads/') || req.path.startsWith('/public/')) {
    return next();
  }

  // Log the error
  console.error("Error:", {
    message: err.message,
    stack: err.stack,
    status: err.status || 500,
    path: req.path,
    method: req.method,
  });

  // Set locals for error page
  res.locals.message = err.message;
  res.locals.error = process.env.NODE_ENV === "development" ? err : {};
  res.locals.fullName = req.session?.userData?.fullName || null;

  // Set status
  const status = err.status || 500;
  res.status(status);

  // Handle different types of errors
  if (status === 404) {
    return res.render("404", {
      url: req.url,
      method: req.method,
      fullName: res.locals.fullName,
    });
  }

  // Render error page
  res.render("error", {
    error: res.locals.error,
    status: status,
    message: err.message || "Internal Server Error",
    fullName: res.locals.fullName,
  });
});

// Handle uncaught exceptions and unhandled rejections
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  // Log the error but keep server running
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Log the error but keep server running
});

// Add graceful shutdown
const gracefulShutdown = () => {
  console.info("Received shutdown signal");
  server.close(async () => {
    console.log("HTTP server closed");
    try {
      await mongoose.connection.close(false);
      console.log("MongoDB connection closed");
      process.exit(0);
    } catch (err) {
      console.error("Error during shutdown:", err);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error(
      "Could not close connections in time, forcefully shutting down"
    );
    process.exit(1);
  }, 30000);
};

// Handle various shutdown signals
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

// Passport configuration
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await authController.handleGoogleSignup(profile);
        done(null, user);
      } catch (err) {
        console.error("Error during Google OAuth authentication:", err);
        done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

app.use(passport.initialize());
app.use(passport.session());

// Export app for testing
module.exports = app;
