const bcrypt = require("bcrypt");
const User = require("../../models/userModel");
const Product = require("../../models/productModel");
const categoryModel = require("../../models/catergoryModel");
const Address = require("../../models/addressModel");
const { sendOTP } = require("../../helpers/otpService");

//function for generate otp
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000);
};

//function for rendering home page
const homePage = async (req, res) => {
  try {
    let fullName = null; // Default to null if user is not logged in

    // Check if user is logged in
    if (req.session.userData) {
      const { email } = req.session.userData;
      const users = await User.findOne({ email });
      if (users) {
        fullName = users.fullname;
        if (users.status) {
          req.session.isAuth = false;
          fullName = null;
        }
        // If user is found, use user's fullname
      }
    }

    // Assuming the categories to be fetched for the homepage
    const categories = await categoryModel.find({
      status: true, // Modify this according to actual active status logic
    });

    if (!categories.length) {
      // No active categories, render empty page
      return res.render("home", { fullName, products: [], newProducts: [] });
    }

    const categoryNames = categories.map((cat) => cat.category);

    // Fetch products only from active categories, limited to 12 items
    const products = await Product.find({
      category: { $in: categoryNames },
      status: true,
    }).limit(12);

    // Fetch latest 4 products sorted by creation date
    const newProducts = await Product.find({}).sort({ createdAt: -1 }).limit(8);

    // Render home page with user's name, product listings, and new arrivals
    return res.render("home", { fullName, products, newProducts });
  } catch (error) {
    console.error("Error rendering home page:", error);
    res.redirect("/login");
  }
};

//function for rendering profile
const profile = async (req, res) => {
  try {
    if (!req.session.userData) {
      // Handle unauthenticated user
      return res.redirect("/login");
    }
    const userId = req.session.userData._id;
    const user = await User.findById(userId).populate({
      path: "addresses",
      match: { status: true }, // Only populate addresses with status true
    });
    res.render("userprofile", { user, fullName: req.session.fullname });
  } catch (error) {
    console.error("Error rendering profile page:", error);
    res.status(500).send("Internal Server Error");
  }
};

const logout = async (req, res) => {
  req.session.destroy();
  res.redirect("/");
};

//function for rendering address list page
const renderAddAddressPage = (req, res) => {
  const fullName = req.session.userData ? req.session.userData.fullname : "";
  res.render("add-address", { fullName });
};
//function for rendering address list in order
const renderAddAddressPageorder = (req, res) => {
  const fullName = req.session.userData ? req.session.userData.fullname : "";
  res.render("add-addressorder", { fullName });
};

//function for create new address
const addAddress = async (req, res) => {
  try {
    const { address, addressline2, city, state, pincode } = req.body;
    const userId = req.session.userData ? req.session.userData._id : null;

    if (!userId) {
      return res.status(403).redirect("/login");
    }

    const newAddress = new Address({
      address,
      addressline2,
      city,
      state,
      pincode,
      userId: req.session.userData._id,
    });

    await newAddress.save();

    // Add the new address to the user's addresses array
    await User.findByIdAndUpdate(userId, {
      $push: { addresses: newAddress._id },
    });

    // Fetch user with populated addresses with status true
    const user = await User.findById(userId).populate({
      path: "addresses",
      match: { status: true }, // Only populate addresses with status true
    });

    res.render("userprofile", {
      user,
      fullName: req.session.userData.fullname,
    });
  } catch (error) {
    console.error("Error adding address:", error);
    res.status(500).json({ error: "Failed to add address" });
  }
};

//function for create new address in order
const addAddressorder = async (req, res) => {
  try {
    const { address, addressline2, city, state, pincode } = req.body;
    const userId = req.session.userData ? req.session.userData._id : null;

    if (!userId) {
      return res.status(403).redirect("/login");
    }

    const newAddress = new Address({
      address,
      addressline2,
      city,
      state,
      pincode,
    });

    await newAddress.save();

    // Add the new address to the user's addresses array
    await User.findByIdAndUpdate(userId, {
      $push: { addresses: newAddress._id },
    });

    res.redirect("/orderviewaddresses");
  } catch (error) {
    console.error("Error adding address:", error);
    res.status(500).json({ error: "Failed to add address" });
  }
};

//function for view address list in profile
const viewAddresses = async (req, res) => {
  try {
    // Fetch user with populated addresses from the database
    const userId = req.session.userData ? req.session.userData._id : null;
    if (!userId) {
      return res.status(403).redirect("/login");
    }

    const user = await User.findById(userId).populate("addresses");

    // Extract addresses from the user object
    const addresses = user.addresses;
    let fullName = user.fullname;

    // Render the view addresses page with address data
    res.render("viewAddresses", { addresses, fullName });
  } catch (error) {
    console.error("Error rendering view addresses page:", error);
    res.status(500).send("Internal Server Error");
  }
};

//function for render edit user address page
const editAddress = async (req, res) => {
  try {
    const address = await Address.findById(req.params.id);
    if (!address) {
      return res.status(404).send("Address not found");
    }
    // Assuming fullName is retrieved from req.user or somewhere else
    const fullName = req.session.userData.fullname; // Check the correct property name
    res.render("editaddress", { address, fullName });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

//function for delete user address
const deleteAddress = async (req, res) => {
  try {
    const address = await Address.findByIdAndDelete(req.params.id);
    if (!address) {
      return res.status(404).send("Address not found");
    }
    res.redirect("/view-addresses");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

//function for make default address
const setActiveAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    const userId = req.session.userData ? req.session.userData._id : null;

    if (!userId) {
      return res.status(403).redirect("/login");
    }

    const address = await Address.findById(addressId);
    if (!address) {
      return res.status(404).send("Address not found");
    }

    const user = await User.findById(userId);
    // Set active status of all addresses belonging to the user to false
    for (const addressId of user.addresses) {
      await Address.findByIdAndUpdate(addressId, { status: false });
    }

    // Set the selected address as active
    const addr = await Address.findByIdAndUpdate(addressId, {
      $set: { status: true },
    });

    console.log("addr:", addr);
    res.redirect("/view-addresses");
  } catch (err) {
    console.error("Error setting active address:", err);
    res.status(500).send("Server Error");
  }
};

//function for make default address in order
const setActiveAddressorder = async (req, res) => {
  try {
    const addressId = req.params.id;
    const userId = req.session.userData ? req.session.userData._id : null;

    if (!userId) {
      return res.status(403).redirect("/login");
    }

    const address = await Address.findById(addressId);
    if (!address) {
      return res.status(404).send("Address not found");
    }

    const user = await User.findById(userId);

    for (const addressId of user.addresses) {
      await Address.findByIdAndUpdate(addressId, { status: false });
    }
    // Set the selected address as active
    await Address.findByIdAndUpdate(addressId, { $set: { status: true } });

    res.redirect("/orderviewaddresses");
  } catch (err) {
    console.error("Error setting active address:", err);
    res.status(500).send("Server Error");
  }
};

//function for edit user address
const editedAddress = async (req, res) => {
  try {
    // Extract address details from the form submission
    const { address, addressline2, city, state, pincode } = req.body;

    // Find the address by ID
    const addressId = req.params.id;
    const existingAddress = await Address.findById(addressId);

    // Update address fields
    existingAddress.address = address;
    existingAddress.addressline2 = addressline2;
    existingAddress.city = city;
    existingAddress.state = state;
    existingAddress.pincode = pincode;

    // Save the updated address
    await existingAddress.save();

    // Redirect to a success page or send a success response
    res.redirect("/view-Addresses");
  } catch (err) {
    // Handle errors
    console.error("Error editing address:", err);
    res.status(500).send("Error editing address");
  }
};

//function for rendder edit profile page
const renderEditProfilePage = async (req, res) => {
  const user = await User.findOne({ fullname: req.session.userData.fullname }); // Assuming user data is available in req.user
  let errorMessage = req.session.errorMessage; // Assuming the error message is stored in the session
  req.session.errorMessage = null; // Clear the error message after retrieving it
  let fullName = req.session.userData.fullname;
  res.render("editProfile", { user, errorMessage, fullName });
};

//function for edit profile
const updateProfile = async (req, res) => {
  try {
    // Retrieve user ID from the session
    const userId = req.session.userData._id;

    // Destructure form data
    const { fullname, phone, email } = req.body;

    // Check if the provided email already exists in the database (excluding the current user's email)
    const existingUser = await User.findOne({ email, _id: { $ne: userId } });
    if (existingUser) {
      // If email exists, set an error message in session
      req.session.errorMessage =
        "Email already exists. Please choose a different one.";

      // Redirect back to edit profile page
      return res.redirect("/edit-profile");
    }

    // Find the user by ID and update their information
    await User.findByIdAndUpdate(userId, { fullname, phone, email });

    // Redirect to the profile page after successful update
    return res.redirect("/profile");
  } catch (error) {
    // Log and handle errors
    console.error("Error updating profile:", error);
    return res.status(500).send("Internal Server Error");
  }
};

//function for render password change page
const renderchangepassPage =async (req, res) => {
  const user=await User.findById(req.session.userData._id)
  res.render("password-change", { user,errorMessage: "" });
};

// Assuming you have a user model and appropriate methods for updating the password

// POST endpoint for handling password change
const passschangevalid = async (req, res) => {
  const { oldPassword, newPassword, confirmNewPassword } = req.body;

  try {
    // Check if old password matches the current password of the user
    const user = await User.findById(req.session.userData._id); // Assuming you're using MongoDB and Mongoose
    if (!user) {
      return res
        .status(400)
        .render("password-change", { errorMessage: "Invalid old password" });
    }

    const passwordMatch = await bcrypt.compare(oldPassword, user.password);
    // Validate old password
    if (!passwordMatch) {
      return res
        .status(400)
        .render("password-change", { errorMessage: "Invalid old password" });
    }

    // Validate new password and confirm password
    if (newPassword !== confirmNewPassword) {
      return res.status(400).render("password-change", {
        errorMessage: "New passwords do not match",
      });
    }

    // Hash the new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    req.session.newPassword = hashedNewPassword;

    // Generate OTP
    const otp = generateOTP();

    req.session.otp = otp;
    const { phone } = req.session.userData;
    // Send OTP to user's phone
    await sendOTP(phone, otp);
    req.session.currentTimestamp = Date.now();

    // Redirect to a success page or the password change page
    return res.redirect("/changepassword");
  } catch (error) {
    console.error("Error occurred during password change:", error);
    return res.status(500).render("error", {
      errorMessage: "An unexpected error occurred, please try again later",
    });
  }
};

//function for reset password
const changeForgotPassword = async (req, res) => {
  try {
    const { newPassword, confirmNewPassword } = req.body;
    const email = req.session.email;
    // Validate new password and confirm password
    if (newPassword !== confirmNewPassword) {
      return res.render("forgotpasschange", {
        errorMessage: "Passwords do not match",
      });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Find the user by email and update the password field
    const user = await User.findOne({ email });

    if (!user) {
      return res.render("forgotpasschange", { errorMessage: "User not found" });
    }

    user.password = hashedPassword; // Update password field with hashed new password
    await user.save(); // Save the updated user object

    // Redirect user to login page after password change
    res.redirect("/login");
  } catch (error) {
    console.error("Error changing forgot password:", error);
    res
      .status(500)
      .render("forgotpasschange", { errorMessage: "Internal server error" });
  }
};

module.exports = {
  addAddressorder,
  setActiveAddressorder,
  changeForgotPassword,
  passschangevalid,
  renderchangepassPage,
  renderEditProfilePage,
  updateProfile,
  setActiveAddress,
  deleteAddress,
  editAddress,
  viewAddresses,
  homePage,
  profile,
  logout,
  addAddress,
  renderAddAddressPage,
  editedAddress,
  renderAddAddressPageorder,
};
