const mongoose = require("mongoose");

const wishlistSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  cartItems: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
});

const Cart = mongoose.model("cart", wishlistSchema);

module.exports = Cart;
