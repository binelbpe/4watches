// adminCouponManagement.js

const Coupon = require("../../models/couponModel");
const Category = require("../../models/catergoryModel");

const getAllCoupons = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const perPage = 10;

    const totalCoupons = await Coupon.countDocuments();
    const totalPages = Math.ceil(totalCoupons / perPage);

    const coupons = await Coupon.find()
      .skip((page - 1) * perPage)
      .limit(perPage);

    res.render("adminCoupon", {
      coupons: coupons,
      currentPage: page,
      totalPages: totalPages,
      messages: req.flash(), // Pass flash messages to the template
    });
  } catch (error) {
    console.error("Error fetching coupons:", error);
    req.flash("error", "Error fetching coupons"); // Set error flash message
    res.redirect("/admin/coupons"); // Redirect back to coupons page
  }
};

const createCoupon = async (req, res) => {
  try {
    const {
      code,
      discountType,
      discountAmount,
      minPurchaseAmount,
      validFrom,
      validTo,
      oncePerUser,
    } = req.body;

    const existingCoupon = await checkDuplicateCoupon(code);
    if (existingCoupon) {
      req.flash("error", "Coupon code already exists");
      return res.redirect("/admin/coupons");
    }

    const newCoupon = new Coupon({
      code,
      discountType,
      discountAmount,
      minPurchaseAmount,
      validFrom,
      validTo,
      oncePerUser,
    });

    await newCoupon.save();
    req.flash("success", "Coupon created successfully");
    res.redirect("/admin/coupons");
  } catch (error) {
    console.error("Error creating coupon:", error);
    req.flash("error", "Error creating coupon"); // Set error flash message
    res.redirect("/admin/coupons"); // Redirect back to coupons page
  }
};

const checkDuplicateCoupon = async (code) => {
  try {
    return await Coupon.findOne({
      code: new RegExp("^" + code + "$", "i"),
    });
  } catch (error) {
    console.error("Error checking for duplicate coupons:", error);
    throw error;
  }
};

const updateCoupon = async (req, res) => {
  try {
    const {
      code,
      discountAmount,
      minPurchaseAmount,
      validFrom,
      validTo,
      oncePerUser,
    } = req.body;

    if (
      !code ||
      !discountAmount ||
      !minPurchaseAmount ||
      !validFrom ||
      !validTo ||
      oncePerUser === undefined
    ) {
      req.flash("error", "All required fields must be provided");
      return res.redirect("/admin/coupons");
    }

    const { id } = req.params;

    const existingCoupon = await checkDuplicateCoupon(code);
    if (existingCoupon && existingCoupon._id.toString() !== id) {
      req.flash("error", "Coupon code already exists");
      return res.redirect("/admin/coupons");
    }

    const coupon = await Coupon.findById(id);

    if (!coupon) {
      req.flash("error", "Coupon not found");
      return res.redirect("/admin/coupons");
    }

    coupon.code = code;
    coupon.discountAmount = discountAmount;
    coupon.minPurchaseAmount = minPurchaseAmount;
    coupon.validFrom = validFrom;
    coupon.validTo = validTo;
    coupon.oncePerUser = oncePerUser === "true";

    await coupon.save();

    req.flash("success", "Coupon updated successfully");
    res.redirect("/admin/coupons");
  } catch (error) {
    console.error("Error updating coupon:", error);
    req.flash("error", "Error updating coupon"); // Set error flash message
    res.redirect("/admin/coupons"); // Redirect back to coupons page
  }
};

const deleteCoupon = async (req, res) => {
  try {
    const couponId = req.params.id;

    const deletedCoupon = await Coupon.findByIdAndDelete(couponId);

    if (!deletedCoupon) {
      req.flash("error", "Coupon not found"); // Set error flash message
    } else {
      req.flash("success", "Coupon deleted successfully"); // Set success flash message
    }

    res.redirect("/admin/coupons");
  } catch (error) {
    console.error("Error deleting coupon:", error);
    req.flash("error", "Error deleting coupon"); // Set error flash message
    res.redirect("/admin/coupons"); // Redirect back to coupons page
  }
};

module.exports = {
  getAllCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
};
