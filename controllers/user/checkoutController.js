const Address = require("../../models/addressModel");
const Product = require("../../models/productModel");
const Order = require("../../models/orderModel");
const User = require("../../models/userModel");
const Coupon = require("../../models/couponModel");

//function for rendering checkout page
const renderCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.userData._id;
    // Fetch addresses with status true from the database
    const user = await User.findById(userId)
      .populate({
        path: "addresses",
        match: { status: true }, // Only populate addresses with status true
      })
      .populate("wallet");

    // Get tax, shipping, and total price from session data
    const tax = req.session.tax; // Assuming tax is stored in session.cart
    const shipping = req.session.shipping; // Assuming shipping is stored in session.cart
    const totalPrice = req.session.totalPrice;

    let fullName = req.session.userData.fullname;
    let addresses = user.addresses;
    const errors = req.flash("error");

    const walletBalance = user.wallet.balance;
    res.render("checkout", {
      addresses,
      tax,
      shipping,
      totalPrice,
      fullName,
      discountedAmount: 0,
      user,
      errors,
      RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
      walletBalance,
    });
  } catch (error) {
    console.error("Error rendering checkout page:", error);
    res.status(500).send("Internal Server Error");
  }
};

//function for validating coupon
const validateAndApplyCoupon = async (req, res, next) => {
  try {
    const couponCode = req.body.coupon; // Get the coupon code from the request body
    const userId = req.session.userData._id;
    const cart = req.session.cart;
    const totalPrice = req.session.totalPrice;

    // Find the coupon by code
    const coupon = await Coupon.findOne({ code: couponCode });

    if (!coupon) {
      // If coupon is not found, return an error message
      return res.status(400).json({ message: "Invalid coupon code" });
    }

    // Check if the coupon is valid for the current date
    const currentDate = new Date();
    if (currentDate < coupon.validFrom || currentDate > coupon.validTo) {
      return res.status(400).json({ message: "Coupon is expired" });
    }

    // Check if the coupon is applicable to the current user (if oncePerUser is true)
    if (coupon.oncePerUser) {
      // Check if the user has already used the coupon
      const usedCoupon = await User.findOne({
        _id: userId,
        usedCoupons: { $elemMatch: { $eq: coupon } },
      });

      if (usedCoupon) {
        return res
          .status(400)
          .json({ message: "Coupon can be used only once per user" });
      }
    }

    if (!(coupon.minPurchaseAmount <= totalPrice)) {
      return res.status(400).json({
        message: `Coupon can be used only above the total price ${coupon.minPurchaseAmount}`,
      });
    }

    // Calculate the discount amount based on the coupon type
    let discountAmount;
    if (coupon.discountType === "percentage") {
      discountAmount = (req.session.totalPrice * coupon.discountAmount) / 100;
    } else {
      discountAmount = coupon.discountAmount;
    }

    // Check if the coupon is applicable to a specific category
    if (coupon.applicableToCategory) {
      const cartProductCategories = await Product.find(
        { _id: { $in: cart.map((item) => item._id) } },
        "category"
      );
      const categoryMatch = cartProductCategories.every((product) =>
        product.category.equals(coupon.applicableToCategory)
      );

      if (!categoryMatch) {
        return res.status(400).json({
          message: "Coupon is not applicable to the selected products",
        });
      }
    }

    const discountedTotalPrice = req.session.totalPrice - discountAmount;
    req.session.discountedTotalPrice = discountedTotalPrice;

    res.status(200).json({ discountAmount, discountedTotalPrice });
  } catch (error) {
    console.error("Error validating and applying coupon:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = { validateAndApplyCoupon, renderCheckoutPage };
