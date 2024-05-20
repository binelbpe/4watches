// authMiddleware.js

// Define a middleware function to check if user is authenticated
const isAuth = (req, res, next) => {
  // Check if req.session.user exists
  if (req.session.isAuth) {
    // If user is authenticated, proceed to the next middleware
    next();
  } else {
    // If user is not authenticated, render the login page
    res.render("login", { errorMessage: "", successMessage: "" });
  }
};
const isAuthSIGNUP = (req, res, next) => {
  // Check if req.session.user exists
  if (req.session.isAuth) {
    // If user is authenticated, proceed to the next middleware
    next();
  } else {
    // If user is not authenticated, render the login page
    res.render("signup", { errorMessage: "", successMessage: "" });
  }
};
const checkoutMiddleware = (req, res, next) => {
  // Check if the user is coming from the cart page
 

  // Ensure referer exists and includes the cart page URL
  if (req.session.checkout) {
    // User is coming from the cart page, proceed to the checkout page
    return next();
  } else {
    // User is trying to access the checkout page directly or from any other page
    // Redirect the user to the cart page
    return res.redirect("/add-to-cart");
  }
};

const isAuthcommon = (req, res, next) => {
  // Check if req.session.user exists
  if (!req.session.isAuth) {
    // If user is authenticated, proceed to the next middleware
    next();
  } else {
    // If user is not authenticated, render the login page
    res.redirect("/");
  }
};

module.exports = { isAuthcommon, isAuth, isAuthSIGNUP, checkoutMiddleware };
