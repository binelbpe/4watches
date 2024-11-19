const Address = require("../../models/addressModel");
const Product = require("../../models/productModel");
const Order = require("../../models/orderModel");
const User = require("../../models/userModel");
const Coupon = require("../../models/couponModel");

const calculatePrices = (totalPrice, discountAmount = 0, walletAmount = 0) => {
  // First, remove shipping from total price
  const withoutShipping = parseFloat(totalPrice) - 45;
  
  // Then calculate base amount (removing 5% tax)
  const baseAmount = withoutShipping / 1.05;
  
  // Calculate tax on base amount
  const tax = baseAmount * 0.05;
  
  // Fixed shipping charge
  const shipping = 45;

  // Apply discount to base amount
  const discount = parseFloat(discountAmount) || 0;
  const afterDiscount = baseAmount - discount;

  // Calculate total after discount, then add tax and shipping
  const withTaxAndShipping = afterDiscount + tax + shipping;

  // Handle wallet payment
  const wallet = parseFloat(walletAmount) || 0;
  let walletUsed = 0;
  let finalAmount = withTaxAndShipping;

  if (wallet > 0) {
    if (wallet >= withTaxAndShipping) {
      walletUsed = withTaxAndShipping;
      finalAmount = 0;
    } else {
      walletUsed = wallet;
      finalAmount = withTaxAndShipping - wallet;
    }
  }

  return {
    baseAmount: parseFloat(baseAmount.toFixed(2)),
    tax: parseFloat(tax.toFixed(2)),
    shipping,
    discountAmount: parseFloat(discount.toFixed(2)),
    walletUsed: parseFloat(walletUsed.toFixed(2)),
    finalAmount: parseFloat(finalAmount.toFixed(2)),
    total: parseFloat(withTaxAndShipping.toFixed(2))
  };
};

//function for rendering checkout page
const renderCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.userData._id;
    const user = await User.findById(userId)
      .populate({
        path: "addresses",
      })
      .populate("wallet");

    // Get cart total
    const cartTotal = parseFloat(req.session.totalPrice) || 0;
    
    // Calculate prices correctly
    const prices = calculatePrices(cartTotal);

    res.render("checkout", {
      addresses: user.addresses,
      tax: prices.tax,
      shipping: prices.shipping,
      totalPrice: cartTotal,
      baseAmount: prices.baseAmount,
      finalAmount: prices.finalAmount,
      fullName: req.session.userData.fullname,
      discountedAmount: 0,
      user,
      errors: req.flash("error"),
      RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
      walletBalance: parseFloat(user.wallet?.balance || 0),
    });
  } catch (error) {
    console.error("Error rendering checkout page:", error);
    res.status(500).send("Internal Server Error");
  }
};

//function for validating coupon
const validateAndApplyCoupon = async (req, res) => {
  try {
    const couponCode = req.body.coupon?.trim().toUpperCase();
    const userId = req.session.userData._id;
    const totalPrice = parseFloat(req.session.totalPrice);

    console.log("Validating coupon:", { couponCode, totalPrice });

    // Basic validation
    if (!couponCode) {
      return res.status(400).json({
        success: false,
        message: "Please enter a coupon code",
      });
    }

    // Find coupon
    const coupon = await Coupon.findOne({
      code: couponCode,
      validFrom: { $lte: new Date() },
      validTo: { $gte: new Date() },
    });

    console.log("Found coupon:", coupon);

    if (!coupon) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired coupon code",
      });
    }

    // Check minimum purchase
    if (totalPrice < coupon.minPurchaseAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase amount of ₹${coupon.minPurchaseAmount} required`,
      });
    }

    // Check if user has already used this coupon
    const user = await User.findById(userId).populate("usedCoupons");
    if (
      coupon.oncePerUser &&
      user.usedCoupons.some((uc) => uc._id.toString() === coupon._id.toString())
    ) {
      return res.status(400).json({
        success: false,
        message: "You have already used this coupon",
      });
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === "percentage") {
      discountAmount = (totalPrice * coupon.discountAmount) / 100;
    } else {
      discountAmount = Math.min(coupon.discountAmount, totalPrice);
    }

    const discountedTotalPrice = totalPrice - discountAmount;

    // Store in session
    req.session.appliedCoupon = {
      code: coupon.code,
      discountAmount,
      couponId: coupon._id,
    };

    console.log("Applied discount:", { discountAmount, discountedTotalPrice });

    return res.status(200).json({
      success: true,
      discountAmount,
      discountedTotalPrice,
      message: `Coupon applied successfully! You saved ₹${discountAmount.toFixed(
        2
      )}`,
    });
  } catch (error) {
    console.error("Coupon Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error applying coupon. Please try again.",
    });
  }
};

module.exports = { validateAndApplyCoupon, renderCheckoutPage };
