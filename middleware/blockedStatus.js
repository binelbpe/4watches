const User = require("../models/userModel");
const checkUserStatus = async (req, res, next) => {
  try {
    const userId = req.session.userData ? req.session.userData._id : null;
    if (!userId) {
      req.flash("error_msg", "Please log in");
      return res.status(403).redirect("/login");
    }
    const user = await User.findById(userId);
    if (!user || user.status) {
      req.flash("error_msg", "Your account has been blocked");
      req.session.isAuth = false;
      return res.render("login", {
        errorMessage: "Your account has been blocked",
      });
    }
    next();
  } catch (error) {
    console.error("Error checking user status:", error);
    req.flash("error_msg", "Internal Server Error");
    res.status(500).redirect("/login");
  }
};

module.exports = { checkUserStatus };
