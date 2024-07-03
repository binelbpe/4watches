const bcrypt = require("bcrypt");
const User = require("../../models/userModel");
const { sendOTP } = require("../../helpers/otpService");
const Product = require("../../models/productModel");
const categoryModel = require("../../models/catergoryModel");
const Address = require("../../models/addressModel");
const Wallet = require("../../models/walletModel");

//function for checking credentials of user to login
const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find user by email
    const user = await User.findOne({ email });
    req.session.user = email;
    // If user not found
    if (!user) {
      return res.render("login", {
        errorMessage: "Invalid email or password",
        successMessage: "",
      });
    }

    // Compare passwords
    const passwordMatch = await bcrypt.compare(password, user.password);

    // If passwords don't match
    if (!passwordMatch) {
      return res.render("login", {
        errorMessage: "Invalid email or password",
        successMessage: "",
      });
    } else if (user.status) {
      return res.render("login", {
        errorMessage: "User is blocked!",
        successMessage: "",
        showTimer: true,
      });
    }
    req.session.userData = user;
    // If user and password are correct, redirect to home page
    req.session.isAuth = true;
    res.redirect("/");
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).render("login", {
      errorMessage: "Failed to log in",
      successMessage: "",
    });
  }
};

//function for sign up procedure
const signup = async (req, res) => {
  try {
    const { fullname, phone, email, password } = req.body;

    // Check if all required fields are provided
    if (!fullname || !phone || !email || !password) {
      return res
        .status(400)
        .render("signup", { errorMessage: "All fields are required" });
    }

    // Check if there is an existing user with the same email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(409)
        .render("signup", { errorMessage: "Existing User" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate OTP
    const otp = generateOTP();
    const newWallet = await Wallet.create({ balance: 0 });
    // Save user data in session
    req.session.userData = {
      fullname,
      phone,
      email,
      password: hashedPassword,
      wallet: newWallet._id,
    };
    req.session.otp = otp;

    // Send OTP to user's phone
    await sendOTP(phone, otp);
    req.session.currentTimestamp = Date.now();

    // Redirect user to OTP page
    res.redirect(`/otp`);
  } catch (error) {
    console.error("Signup error:", error);
    res
      .status(500)
      .render("signup", { errorMessage: "Failed to register user" });
  }
};

//function for handle google signup
const handleGoogleSignup = async (profile) => {
  try {
    // Check if user exists in the database
    let user = await User.findOne({ email: profile.emails[0].value });
    let password="User@123"
    const hashedPassword = await bcrypt.hash(password, 10);
    if (!user) {
      const newWallet = await Wallet.create({ balance: 0 });
      // Create new user
      user = new User({
        googleId: profile.id,
        fullname: profile.displayName,
        email: profile.emails[0].value,
        googleuser: true,
        wallet: newWallet._id,
        password:hashedPassword,
        // Add other relevant user data here
      });
      await user.save();
    } else {
      if (!user.wallet) {
        const newWallet = await Wallet.create({ balance: 0 });
        user.wallet = newWallet._id;
        await user.save();
      }
    }

    return user;
  } catch (err) {
    console.error("Failed to handle Google signup:", err);
    console.error("Error details:", err.message, err.stack);
    throw new Error("Failed to handle Google signup");
  }
};

//function for render forgot password page
const forgotpassword = async (req, res) => {
  res.render("forgotpassemail", { errorMessage: "" });
};

const forgotmail = async (req, res) => {
  try {
    const { email } = req.body;
    req.session.email = email;
    console.log(email);
    // Check if user with the provided email exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      const otp = generateOTP();

      const phone = existingUser.phone;

      req.session.otp = otp;

      // Send OTP to user's phone
      await sendOTP(phone, otp);
      req.session.currentTimestamp = Date.now();

      // Redirect user to OTP page
      res.redirect(`/forgototp`);
    } else {
      // User with the provided email does not exist
      return res
        .status(200)
        .render("forgotpassemail", { errorMessage: "User does not exist" });
    }
  } catch (error) {
    console.error("Error checking existing user:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

//function for forgot otp page
const forgototppage = async (req, res) => {
  res.render("forgototp", {
    showTimer: true,
    email: req.session.email,
    otp: req.session.otp,
    errorMessage: null,
  });
};

//function for generating otp
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000);
};
module.exports = {
  forgototppage,
  forgotmail,
  forgotpassword,
  login,
  signup,
  handleGoogleSignup,
};
