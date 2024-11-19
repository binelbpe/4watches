const User = require("../../models/userModel");
const Product = require("../../models/productModel");
const Address = require("../../models/addressModel");
const Cart = require("../../models/addtocartModel");
const createError = require('http-errors');
// Function to add or update product in the cart
const addToCart = async (req, res) => {
  try {
    const productId = req.params.productId;
    const userId = req.session.userData._id;

    // Find the product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check product stock
    if (product.stock <= 0) {
      return res.redirect("/add-to-cart");
    }

    // Calculate effective price
    const effectivePrice = (product.offerPrice && 
                          product.offerPrice > 0 && 
                          product.offerPrice < product.price) 
                          ? product.offerPrice 
                          : product.price;

    let cart = await Cart.findOne({ userId: userId });

    if (!cart) {
      cart = new Cart({ 
        userId, 
        cartItems: [] 
      });
    }

    const cartItemIndex = cart.cartItems.findIndex(item => 
      item.product.toString() === productId
    );

    if (cartItemIndex > -1) {
      if (cart.cartItems[cartItemIndex].quantity >= 5) {
        return res.redirect("/add-to-cart");
      }

      if (product.stock < cart.cartItems[cartItemIndex].quantity + 1) {
        return res.redirect("/add-to-cart");
      }

      cart.cartItems[cartItemIndex].quantity += 1;
      cart.cartItems[cartItemIndex].price = effectivePrice; // Update price
    } else {
      if (product.stock < 1) {
        return res.redirect("/add-to-cart");
      }

      cart.cartItems.push({ 
        product: productId, 
        quantity: 1,
        price: effectivePrice // Store effective price
      });
    }

    await cart.save();
    return res.redirect("/add-to-cart");
  } catch (error) {
    console.error("Error adding product to cart:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


//function for remove product from cart
const removeFromCart = async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.session.userData._id;

    // Remove the item from cart
    await Cart.findOneAndUpdate(
      { userId: userId },
      { $pull: { cartItems: { product: productId } } }
    );

    res.json({ success: true, message: 'Product removed from cart' });
  } catch (error) {
    console.error('Error removing product from cart:', error);
    res.status(500).json({ success: false, message: 'Failed to remove product from cart' });
  }
};

// Function to render the cart page
const renderCartPage = async (req, res, next) => {
  try {
    if (!req.session.userData) {
      return next(createError(401, 'Please login to view cart'));
    }

    const userId = req.session.userData._id;
    const fullName = req.session.userData.fullname;

    const cart = await Cart.findOne({ userId: userId })
      .populate({
        path: "cartItems.product",
        select: "product price offerPrice image status stock"
      });

    if (!cart || !cart.cartItems.length) {
      return res.render("addtocart", { 
        fullName, 
        products: [] 
      });
    }

    // Filter out products and calculate effective prices
    const filteredProducts = cart.cartItems.filter(item => 
      item.product && item.product.status === true
    ).map(item => {
      // Calculate effective price
      const effectivePrice = (item.product.offerPrice && 
                            item.product.offerPrice > 0 && 
                            item.product.offerPrice < item.product.price) 
                            ? item.product.offerPrice 
                            : item.product.price;

      return {
        product: {
          ...item.product.toObject(),
          effectivePrice: effectivePrice // Add effective price to product object
        },
        quantity: item.quantity
      };
    });

    req.session.checkout = true;
    res.render("addtocart", { 
      fullName, 
      products: filteredProducts 
    });
  } catch (error) {
    console.error('Error rendering cart page:', error);
    next(createError(500, 'Error loading cart'));
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

const updateCartQuantity = async (req, res) => {
  try {
    const productId = req.params.productId;
    const { quantity } = req.body;
    const userId = req.session.userData._id;

    let cart = await Cart.findOne({ userId: userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const cartItemIndex = cart.cartItems.findIndex(item => 
      item.product.toString() === productId.trimStart()
    );

    if (cartItemIndex === -1) {
      return res.status(404).json({ message: "Product not found in cart" });
    }

    // Get the product to check current price/offer price
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Calculate effective price
    const effectivePrice = (product.offerPrice && 
                          product.offerPrice > 0 && 
                          product.offerPrice < product.price) 
                          ? product.offerPrice 
                          : product.price;

    // Update quantity and price
    cart.cartItems[cartItemIndex].quantity = quantity;
    cart.cartItems[cartItemIndex].price = effectivePrice;

    await cart.save();

    res.json({ 
      message: "Quantity updated successfully",
      effectivePrice: effectivePrice
    });
  } catch (error) {
    console.error("Error updating quantity:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};



module.exports = {
  checkout,
  renderCartPage,
  addToCart,
  removeFromCart,
  updateCartQuantity,
};
