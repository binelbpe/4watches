const User = require("../../models/userModel");
const Wishlist = require("../../models/wishlistModel");

//function for add product to wishlist
const addToWishlist = async (req, res) => {
  try {
    const userId = req.session.userData._id; // Assuming you're using Passport.js for authentication
    const productId = req.params.productId;

    // Find the user by ID
    const user = await User.findById(userId);

    // Check if the product already exists in the wishlist
    if (user.wishlistItems.includes(productId)) {
      return res.redirect("/wishlist"); // Redirect to wishlist page if product already exists
    }

    // Add the product to the user's wishlist
    user.wishlistItems.push(productId);
    await user.save();

    // Redirect to wishlist page after successfully adding the product
    return res.redirect("/wishlist");
  } catch (error) {
    console.error("Error adding product to wishlist:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

//function for remove product from wishlist
const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.session.userData._id; // Assuming you're using Passport.js for authentication
    const productId = req.params.productId;

    // Find the user by ID
    const user = await User.findById(userId);

    // Remove the product from the user's wishlist
    user.wishlistItems = user.wishlistItems.filter(
      (item) => item.toString() !== productId
    );
    await user.save();

    return res
      .status(200)
      .json({ message: "Product removed from wishlist successfully" });
  } catch (error) {
    console.error("Error removing product from wishlist:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

//function for render wishlist page
const renderWishlistPage = async (req, res) => {
  try {
    const userId = req.session.userData._id; // Assuming you're using Passport.js for authentication
    const fullName = req.session.userData.fullname;
    // Find the user by ID and populate the wishlist items
    const user = await User.findById(userId).populate("wishlistItems");

    // Render the wishlist page with the user's wishlist items
    res.render("wishlist", { fullName, wishlist: user.wishlistItems });
  } catch (error) {
    console.error("Error rendering wishlist page:", error);
    res.status(500).send("Internal Server Error");
  }
};

module.exports = {
  renderWishlistPage,
  addToWishlist,
  removeFromWishlist,
};
