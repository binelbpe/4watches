const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  products: [
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      status: {
        type: String,
        enum: [
          "pending",
          "completed",
          "cancelled",
          "returned",
          "returnrequest",
          "paymentpending",
        ],
        default: "pending",
      },
      quantity: { type: Number, default: 1 },
    },
  ],
  totalPrice: { type: Number, required: true },
  grandTotalPrice: { type: Number },
  reducedPrice: { type: Number, default: 0 },
  discountedAmount: { type: Number },
  returnedPrice: { type: Number, default: 0 },
  paymentMethod: { type: String, required: true },
  walletAmount: { type: Number },
  address: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Address",
    required: true,
  },
  coupon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Coupon",
  }, // Store coupon ID
  status: {
    type: String,
    enum: [
      "pending",
      "completed",
      "cancelled",
      "returned",
      "returnrequest",
      "paymentpending",
    ],
    default: "pending",
  },
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
});

orderSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
