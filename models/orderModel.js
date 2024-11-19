const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  products: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true }, // Store product price at time of order
    status: {
      type: String,
      enum: [
        "pending",
        "completed",
        "cancelled",
        "returned",
        "returnrequest",
        "paymentpending",
        "Dispatched",
        "In Transit"
      ],
      default: "pending"
    },
    cancelledAmount: { type: Number, default: 0 }, // Amount refunded for this product
    returnedAmount: { type: Number, default: 0 }, // Amount refunded for return
  }],
  // Price Breakdown
  subtotal: { type: Number, required: true }, // Sum of all products before any discounts
  tax: { type: Number, required: true }, // 5% of (subtotal - discounts)
  shipping: { type: Number, default: 45 },
  couponDiscount: { type: Number, default: 0 },
  walletAmountUsed: {
    type: Number,
    default: 0,
    get: v => parseFloat(v).toFixed(2)
  },
  onlinePaymentAmount: {
    type: Number,
    default: 0,
    get: v => parseFloat(v).toFixed(2)
  },
  codAmount: { type: Number, default: 0 },
  
  // Total amounts
  grandTotal: { type: Number, required: true }, // Final amount after all discounts
  totalPaid: {
    type: Number,
    required: true,
    get: v => parseFloat(v).toFixed(2)
  }, // Actual amount paid
  
  // Refund tracking
  totalRefunded: { type: Number, default: 0 }, // Total amount refunded
  refundBreakdown: [{
    amount: Number,
    type: { type: String, enum: ['cancel', 'return'] },
    productId: mongoose.Schema.Types.ObjectId,
    date: { type: Date, default: Date.now }
  }],

  paymentMethod: {
    type: String,
    enum: ['cash_on_delivery', 'pay_by_wallet', 'pay_on_online', 'wallet_and_online'],
    required: true
  },
  
  address: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Address",
    required: true
  },
  
  coupon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Coupon"
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
      "Dispatched",
      "In Transit"
    ],
    default: "pending"
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Pre-save middleware to update timestamps
orderSchema.pre("save", function(next) {
  this.updatedAt = new Date();
  next();
});

// Method to calculate refund amount for a product
orderSchema.methods.calculateProductRefund = function(productId) {
  const product = this.products.find(p => p.product.toString() === productId.toString());
  if (!product) return 0;

  const productTotal = product.price * product.quantity;
  const productShare = productTotal / this.subtotal;
  
  // Calculate proportional discounts
  const discountShare = this.couponDiscount * productShare;
  const taxAmount = (productTotal - discountShare) * 0.05;
  
  // Add shipping only if it's the last active product
  const activeProducts = this.products.filter(p => 
    p.status !== 'cancelled' && p.status !== 'returned'
  ).length;
  const shippingShare = activeProducts === 1 ? this.shipping : 0;

  return (productTotal - discountShare + taxAmount + shippingShare).toFixed(2);
};

// Method to check if order can be cancelled
orderSchema.methods.canBeCancelled = function() {
  return ['pending', 'paymentpending'].includes(this.status);
};

// Method to check if order can be returned
orderSchema.methods.canBeReturned = function() {
  if (this.status !== 'completed') return false;
  
  const returnWindow = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  return (Date.now() - this.createdAt.getTime()) <= returnWindow;
};

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
