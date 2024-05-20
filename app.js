// app.js

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

// Import OTP service
const { sendOTP } = require("./helpers/otpService");

// Set up session middleware
app.use(
  "/",
  session({
    genid: (req) => {
      return uuidv4(); // Generate a unique session ID using uuid
    },
    secret: process.env.SESSION_SECRET_USER, // Secret key for signing session ID cookie
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Set secure to true if using HTTPS
  })
);

app.use(flash());

// Logger

// app.use(logger("common"));
startScheduledTask();
app.use(cors());
app.use(nocacheMiddleware());
// // Middleware to handle user blocking
// app.use((req, res, next) => {
//   if (req.session.userblock) {
//     req.session.isAuth = false;
//     return res.redirect("/admin/");
//   }
//   next();
// });

// View engine setup
app.set("view engine", "ejs");
app.set("views", [
  path.join(__dirname, "views/user"),
  path.join(__dirname, "views/admin"),
]);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));
// Middleware to parse JSON bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Use userRoute for routes starting with '/'
app.use("/", userRoute);
app.use("/admin", adminRouter);

app.use((req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0"
  );
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.log(err.stack);
  res.status(500).send("Something went wrong!");
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:8000/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await authController.handleGoogleSignup(profile);
        done(null, user);
      } catch (err) {
        console.error("Error during Google OAuth authentication:", err);
        done(err, null); // Pass the error to Passport
      }
    }
  )
);

// Serialize and deserialize user
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

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
