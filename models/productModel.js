const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  product: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  stock: {
    type: Number,
    required: true,
  },
  image: {
    type: Array,
    required: true,
  },
  about: {
    type: String,
    required: true,
  },
  status: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now, // Set default value to current date and time
  },
  updatedAt: {
    type: Date,
    default: Date.now, // Set default value to current date and time
  },
  offerPrice: { type: Number, default: 0 },
});

// Middleware to update updatedAt timestamp on every save
productSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("Product", productSchema);
