const express = require("express"); // Import the Express.js framework
const router = express.Router(); // Create a new router instance
const passport = require("passport"); // Import the Passport.js authentication middleware
const User = require("../models/userModel"); // Import the User model
const {
  checkoutMiddleware,
  isAuth,
  isAuthSIGNUP,
  isAuthcommon,
} = require("../middleware/authMiddleware"); // Import authentication middleware functions
const nocacheMiddleware = require("../middleware/noCache"); // Import middleware to prevent caching
const authController = require("../controllers/user/authController"); // Import the authentication controller
const profileController = require("../controllers/user/profileController"); // Import the profile controller
const otpController = require("../controllers/user/otpController"); // Import the OTP controller
const userProductController = require("../controllers/user/userProductController"); // Import the product controller
const wishlistController = require("../controllers/user/wishListController"); // Import the wishlist controller
const addToCartController = require("../controllers/user/addToCartcontroller"); // Import the cart controller
const checkoutController = require("../controllers/user/checkoutController"); // Import the checkout controller
const orderController = require("../controllers/user/orderController"); // Import the order controller
const walletController = require("../controllers/user/walletController"); // Import the wallet controller
const { checkUserStatus } = require("../middleware/blockedStatus"); // Import middleware to check user's blocked status

// Routes for adding and editing user addresses
router.get(
  "/add-address",
  isAuth,
  checkUserStatus,
  profileController.renderAddAddressPage
);
router.post(
  "/add-address",
  isAuth,
  checkUserStatus,
  profileController.addAddress
);
router.get("/logout", profileController.logout);

// Google authentication routes
router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);
router.get("/auth/google/callback", async (req, res, next) => {
  // Handle Google authentication callback
});

// Route to render the home page
router.get("/", nocacheMiddleware(), profileController.homePage);

// Routes for signup and login
router.get("/signup", nocacheMiddleware(), isAuthSIGNUP, (req, res) => {
  res.redirect("/");
});
router.get("/login", nocacheMiddleware(), isAuth, (req, res) => {
  res.redirect("/");
});
router.post("/login", isAuthcommon, nocacheMiddleware(), authController.login);
router.post(
  "/signup",
  isAuthcommon,
  nocacheMiddleware(),
  authController.signup
);

// Routes for OTP verification and resend
router.post(
  "/verifyOTP",
  isAuthcommon,
  nocacheMiddleware(),
  otpController.verifyOTP
);
router.post(
  "/resendOTP",
  isAuthcommon,
  nocacheMiddleware(),
  otpController.resendOTP
);
router.get("/otp", isAuthcommon, nocacheMiddleware(), otpController.otppage);

// Routes for products and categories
router.get("/product/:productId", userProductController.getProductView);
router.get("/men", userProductController.getMenProducts);
router.get("/menfilter", userProductController.menfilterProduct);
router.get("/women", userProductController.getwomenProducts);
router.get("/womenfilter", userProductController.womenfilterProduct);
router.get("/kids", userProductController.getkidsProducts);
router.get("/kidsfilter", userProductController.kidsfilterProduct);
router.get("/collection", userProductController.getcollectionProducts);
router.get("/collectionfilter", userProductController.collectionfilterProduct);
router.get("/about", userProductController.about);
router.post("/search", userProductController.search);

// Routes for user profile management
router.get("/profile", isAuth, checkUserStatus, profileController.profile);
router.get(
  "/view-addresses",
  isAuth,
  checkUserStatus,
  profileController.viewAddresses
);
router.get(
  "/edit-address/:id",
  isAuth,
  checkUserStatus,
  profileController.editAddress
);
router.get(
  "/delete-address/:id",
  isAuth,
  checkUserStatus,
  profileController.deleteAddress
);
router.get(
  "/set-active/:id",
  isAuth,
  checkUserStatus,
  profileController.setActiveAddress
);
router.post(
  "/edit-address/:id",
  isAuth,
  checkUserStatus,
  profileController.editedAddress
);
router.get("/edit-profile", isAuth, profileController.renderEditProfilePage);
router.post(
  "/edit-profile",
  isAuth,
  checkUserStatus,
  profileController.updateProfile
);
router.get(
  "/change-password",
  isAuth,
  checkUserStatus,
  profileController.renderchangepassPage
);
router.post(
  "/password-change",
  isAuth,
  checkUserStatus,
  profileController.passschangevalid
);

// Routes for password change with OTP verification
router.get(
  "/changepassword",
  nocacheMiddleware(),
  otpController.otppagepasschange
);
router.post("/verifyOTPpass", nocacheMiddleware(), otpController.verifyOTPpass);
router.post("/resendOTPpass", nocacheMiddleware(), otpController.resendOTPpass);

// Routes for forgot password
router.get("/forgot-password", isAuthcommon, authController.forgotpassword);
router.post("/forgot-password", isAuthcommon, authController.forgotmail);
router.get("/forgototp", isAuthcommon, authController.forgototppage);
router.post("/verifyOTPforgot", isAuthcommon, otpController.verifyOTPforgot);
router.post("/resendOTPforgot", isAuthcommon, otpController.resendOTPforgot);
router.post(
  "/forgot-password/change",
  isAuthcommon,
  profileController.changeForgotPassword
);

// Routes for wishlist
router.post(
  "/add-to-wishlist/:productId",
  isAuth,
  checkUserStatus,
  wishlistController.addToWishlist
);
router.delete(
  "/remove-from-wishlist/:productId",
  isAuth,
  checkUserStatus,
  wishlistController.removeFromWishlist
);
router.get(
  "/wishlist",
  isAuth,
  checkUserStatus,
  wishlistController.renderWishlistPage
);

// Routes for cart
router.get(
  "/add-to-cart",
  isAuth,
  checkUserStatus,
  addToCartController.renderCartPage
);
router.post(
  "/add-to-cart/:productId",
  isAuth,
  checkUserStatus,
  addToCartController.addToCart
);
router.delete(
  "/remove-from-cart/:productId",
  isAuth,
  checkUserStatus,
  addToCartController.removeFromCart
);
router.post(
  "/checkout",
  checkoutMiddleware,
  isAuth,
  checkUserStatus,

  addToCartController.checkout
);

// Routes for checkout and orders
router.get(
  "/orderviewaddresses",
  isAuth,
  checkUserStatus,
  orderController.orderviewaddresses
);
router.get(
  "/checkout",
  isAuth,
  checkUserStatus,
  checkoutMiddleware,
  checkoutController.renderCheckoutPage
);
router.post(
  "/place-order",
  isAuth,
  checkUserStatus,
  orderController.placeOrder
);
router.get(
  "/set-activeorder/:id",
  isAuth,
  checkUserStatus,
  profileController.setActiveAddressorder
);
router.get(
  "/add-addressorder",
  isAuth,
  checkUserStatus,
  profileController.renderAddAddressPageorder
);
router.post(
  "/add-addressorder",
  isAuth,
  checkUserStatus,
  orderController.addAddressorder
);
router.post(
  "/checkout/place-order",
  isAuth,
  checkUserStatus,
  orderController.placeOrder
);
router.get(
  "/orders",
  isAuth,
  checkUserStatus,
  orderController.renderOrderListPage
);
router.post(
  "/orders/cancel/:id",
  isAuth,
  checkUserStatus,
  orderController.cancelOrder
);
router.post(
  "/apply-coupon",
  isAuth,
  checkUserStatus,
  checkoutController.validateAndApplyCoupon
);
router.post(
  "/orders/cancel-product/:orderId/:productId",
  isAuth,
  checkUserStatus,
  orderController.cancelProduct
);

// Routes for wallet and payment
router.get("/wallet", isAuth, checkUserStatus, walletController.getWalletPage);
router.post(
  "/orders/return/:orderId",
  isAuth,
  checkUserStatus,
  orderController.returnOrderRequest
);
router.post(
  "/orders/return-product/:orderId/:productId",
  isAuth,
  checkUserStatus,
  orderController.returnProductRequest
);
router.post(
  "/process-payment",
  isAuth,
  checkUserStatus,
  orderController.processpayment
);
router.post(
  "/create-order",
  isAuth,
  checkUserStatus,
  orderController.createorder
);
router.get(
  "/orders/:orderId/invoice",
  isAuth,
  checkUserStatus,
  orderController.invoice
);
router.post(
  "/repayment/process",
  isAuth,
  checkUserStatus,
  orderController.repayment
);
router.post(
  "/repayment/success",
  isAuth,
  checkUserStatus,
  orderController.repaymentOrderCreation
);
router.post("/payment-fail", isAuth, orderController.paymentFail);
router.post("/orderAbort/:orderId", isAuth, orderController.orderAbort);

module.exports = router;
