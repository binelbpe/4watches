const User = require("../../models/userModel");
const Product = require("../../models/productModel");
const Address = require("../../models/addressModel");

//function for to add product to cart
const addToCart = async (req, res) => {
  try {
    const productId = req.params.productId;
    const userId = req.session.userData._id;

    // Find the user by ID
    const user = await User.findById(userId);

    // Ensure that user.cart exists and is an array
    if (!user.cart || !Array.isArray(user.cart)) {
      user.cart = []; // Initialize user.cart if it's undefined or not an array
    }

    // Check if the product already exists in the cart
    if (user.cart.includes(productId)) {
      return res.redirect("/add-to-cart"); // Redirect to cart page if product already exists
    }

    // Add the product to the user's cart
    user.cart.push(productId);
    await user.save();

    // Redirect to cart page after successfully adding the product
    return res.redirect("/add-to-cart");
  } catch (error) {
    console.error("Error adding product to cart:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

//function for remove product from cart
const removeFromCart = async (req, res) => {
  try {
    const productId = req.params.productId;
    const userId = req.session.userData._id;

    // Find the user by ID
    const user = await User.findById(userId);

    // Remove the product from the user's cart
    user.cart = user.cart.filter((item) => item.toString() !== productId);
    await user.save();

    return res
      .status(200)
      .json({ message: "Product removed from cart successfully" });
  } catch (error) {
    console.error("Error removing product from cart:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

//function for render cart page
const renderCartPage = async (req, res) => {
  try {
    const userId = req.session.userData._id;
    const fullName = req.session.userData.fullname;

    // Find the user by ID and populate the cart items
    const user = await User.findById(userId).populate("cart");

    // Check if the user has any cart items
    if (!user.cart || user.cart.length === 0) {
      return res.render("addtocart", { fullName, products: [] }); // Render the template with an empty array
    }

    // Filter out products with status true
    const filteredProducts = user.cart.filter(
      (product) => product.status === true
    );

    // Update user's cart with only the products with status true
    user.cart = filteredProducts;
    await user.save();
req.session.checkout=true
    // Render the cart page with the updated cart items
    res.render("addtocart", { fullName, products: filteredProducts });
  } catch (error) {
    console.error("Error rendering cart page:", error);
    res.status(500).send("Internal Server Error");
  }
};

//function for order checkout
const checkout = (req, res) => {
  // Retrieve cart data and total price from the request body
  const { cartData, totalPrice, shipping, tax } = req.body;

  // Parse cart data from JSON string to JavaScript object
  const products = JSON.parse(cartData);

  // Store cart data and total price in session
  req.session.cart = products;
  req.session.totalPrice = totalPrice;
  req.session.shipping = shipping;
  req.session.tax = tax;

  // Redirect to the checkout page or perform any other actions
  res.redirect("/checkout");
};

module.exports = {
  checkout,
  renderCartPage,
  addToCart,
  removeFromCart,
};
