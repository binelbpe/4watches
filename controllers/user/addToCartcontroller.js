const User = require("../../models/userModel");
const Product = require("../../models/productModel");
const Address = require("../../models/addressModel");
const Cart = require("../../models/addtocartModel");
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
      // return res.status(400).json({ message: "Product out of stock" });
      return res.redirect("/add-to-cart");
    }

    let cart = await Cart.findOne({ userId: userId });

    if (!cart) {
      cart = new Cart({ userId, cartItems: [] });
    }


    const cartItemIndex = cart.cartItems.findIndex(item => item.product.toString() === productId);

    if (cartItemIndex > -1) {
      if (cart.cartItems[cartItemIndex].quantity >= 5) {
        // return res.status(400).json({ message: "Cannot add more than 5 of this product to the cart" });
        return res.redirect("/add-to-cart");
      }

      // Check if adding one more item would exceed stock
      if (product.stock < cart.cartItems[cartItemIndex].quantity + 1) {
        // return res.status(400).json({ message: "Not enough stock available" });
        return res.redirect("/add-to-cart");
      }

      cart.cartItems[cartItemIndex].quantity += 1;
    } else {
      if (product.stock < 1) {
        // return res.status(400).json({ message: "Not enough stock available" });
        return res.redirect("/add-to-cart");
      }

      cart.cartItems.push({ product: productId, quantity: 1 });
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
    const productId = req.params.productId;
    const userId = req.session.userData._id;

    // Find the cart for the user
    let cart = await Cart.findOne({ userId: userId });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    // Find the index of the product in the cart
    const cartItemIndex = cart.cartItems.findIndex(item => item.product.toString() === productId);

    if (cartItemIndex > -1) {
      // Remove the product from the cart
      cart.cartItems.splice(cartItemIndex, 1);

      // Save the updated cart
      await cart.save();

     
      return res.redirect("/add-to-cart");
    } else {
      return res.status(404).json({ message: "Product not found in cart" });
    }
  } catch (error) {
    console.error("Error removing product from cart:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Function to render the cart page
const renderCartPage = async (req, res) => {
  try {
    const userId = req.session.userData._id;
    const fullName = req.session.userData.fullname;

    // Find the user's cart
    const cart = await Cart.findOne({ userId: userId }).populate("cartItems.product");

    if (!cart || cart.cartItems.length === 0) {
      // Render the template with an empty array if there are no cart items
      return res.render("addtocart", { fullName, products: [] });
    }

    // Filter out products with status true and prepare the cart items for rendering
    const filteredProducts = cart.cartItems.filter(item => item.product.status === true);

    // Prepare the data to render, including quantities
    const cartData = filteredProducts.map((item) => ({
      product: item.product,
      quantity: item.quantity
    }));
    req.session.checkout=true;
    // Render the cart page with the updated cart items and their quantities
    res.render("addtocart", { fullName, products: cartData });
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

const updateCartQuantity = async (req, res) => {
  try {
    const productId = req.params.productId;
    const { quantity } = req.body; // Get new quantity from request body
    const userId = req.session.userData._id;
   

    // Find the user's cart
    let cart = await Cart.findOne({ userId: userId });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

   

    // Find the index of the product in the cart
    const cartItemIndex = cart.cartItems.findIndex(item => item.product.toString() === productId.trimStart());
 

    if (cartItemIndex === -1) {
      return res.status(404).json({ message: "Product not found in cart" });
    }

    // Update the quantity
    cart.cartItems[cartItemIndex].quantity = quantity;

    // Save the updated cart
    await cart.save();

    res.json({ message: "Quantity updated successfully" });
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
