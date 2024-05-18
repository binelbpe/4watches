const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
  },
  discountType: {
    type: String,
    default: "fixed",
  },
  discountAmount: {
    type: Number,
    required: true,
  },
  minPurchaseAmount: {
    type: Number,
    default: 0,
  },
  validFrom: {
    type: Date,
    required: true,
  },
  validTo: {
    type: Date,
    required: true,
  },
  oncePerUser: {
    type: Boolean,
    required: true,
    default: false,
  },
});

const Coupon = mongoose.model("Coupon", couponSchema);

module.exports = Coupon;
