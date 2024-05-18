const mongoose = require("mongoose");
const Wallet = require("../models/walletModel");

const userSchema = new mongoose.Schema({
  fullname: {
    type: String,
    required: true,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
  },
  phone: {
    type: Number,
  },
  status: {
    type: Boolean,
    default: false,
  },
  googleuser: {
    type: Boolean,
    default: false,
  },
  googleId: {
    type: String,
  },
  addresses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Address" }],
  wishlistItems: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
  cart: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
  order: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
  createdAt: {
    type: Date,
    default: Date.now,
    required: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
    required: true,
  },
  usedCoupons: [{ type: mongoose.Schema.Types.ObjectId, ref: "Coupon" }],
  wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet" },
});

// Update the updatedAt field before saving the document
userSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const User = mongoose.model("User", userSchema);
module.exports = User;
