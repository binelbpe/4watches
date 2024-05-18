const bcrypt = require("bcrypt");
const User = require("../../models/userModel");
const Product = require("../../models/productModel");
const categoryModel = require("../../models/catergoryModel");
const Address = require("../../models/addressModel");

//function for product view
const getProductView = async (req, res) => {
  try {
    // Retrieve the product ID from the request parameters
    const productId = req.params.productId;

    // Fetch the product details from the database based on the product ID
    const product = await Product.findById(productId);

    // Fetch similar products based on the category of the current product
    const similarProducts = await Product.find({
      category: product.category,
      _id: { $ne: productId },
      status: true,
    }).limit(4);

    // Initialize a variable to hold the full name of the user
    let fullName = "";

    // Check if userData exists in session
    if (req.session.userData) {
      // If userData exists, extract the email from it
      const { email } = req.session.userData;

      // Find the user in the database based on the email
      const user = await User.findOne({ email, status: false });

      // If user exists, assign the full name to the variable
      if (user) {
        fullName = user.fullname;
      }
    }

    // Render the product view page and pass the product data, similar products, and full name to the template
    return res.render("productView", { product, similarProducts, fullName });
  } catch (error) {
    // Handle errors appropriately, such as redirecting to an error page
    res.redirect("/error");
  }
};

//function for render mens page
const getMenProducts = async (req, res) => {
  try {
    let fullName = "";

    // Check if userData exists in session
    if (req.session.userData) {
      const { email } = req.session.userData;
      const user = await User.findOne({ email, status: false });

      // If user exists, assign the full name to the variable
      if (user) {
        fullName = user.fullname;
      }
    }

    // Find categories marked as "Men" that are not active (status: false)
    const categories = await categoryModel.find({
      category: "Men",
      status: true,
    });

    // Early return if no categories found
    if (!categories.length) {
      return res.render("men", { products: [], fullName });
    }

    // Map over categories to extract category names
    const categoryNames = categories.map((cat) => cat.category);

    // Find products that belong to any of the inactive "Men" categories
    const menProducts = await Product.find({
      category: { $in: categoryNames },
      status: true,
    });

    // Render your view with products and user information
    res.render("men", { products: menProducts, fullName });
  } catch (error) {
    console.error("Failed to fetch men products:", error);
    res.status(500).send("Server error");
  }
};

//function for render womens page
const getwomenProducts = async (req, res) => {
  try {
    let fullName = "";

    if (req.session.userData) {
      const { email } = req.session.userData;
      const user = await User.findOne({ email, status: false });

      if (user) {
        fullName = user.fullname;
      }
    }

    const categories = await categoryModel.find({
      category: "Women",
      status: true,
    });

    if (!categories.length) {
      return res.render("women", { products: [], fullName });
    }

    const categoryNames = categories.map((cat) => cat.category);

    const womenProducts = await Product.find({
      category: { $in: categoryNames },
      status: true,
    });

    return res.render("women", { products: womenProducts, fullName });
  } catch (error) {
    console.error("Error rendering women's page:", error);
    res.status(500).send("Internal Server Error");
  }
};

//function for render kids page
const getkidsProducts = async (req, res) => {
  try {
    let fullName = "";

    if (req.session.userData) {
      const { email } = req.session.userData;
      const user = await User.findOne({ email, status: false });

      if (user) {
        fullName = user.fullname;
      }
    }
    const categories = await categoryModel.find({
      category: "kids",
      status: true,
    });

    if (!categories.length) {
      return res.render("kids", { products: [], fullName });
    }

    const categoryNames = categories.map((cat) => cat.category);

    const kidsProducts = await Product.find({
      category: { $in: categoryNames },
      status: true,
    });

    return res.render("kids", { products: kidsProducts, fullName });
  } catch (error) {
    console.error("Error rendering kid's page:", error);
    res.status(500).send("Internal Server Error");
  }
};

//function for collection page
const getcollectionProducts = async (req, res) => {
  try {
    let fullName = "";

    if (req.session.userData) {
      const { email } = req.session.userData;
      const user = await User.findOne({ email, status: false });

      if (user) {
        fullName = user.fullname;
      }
    }
    // Assuming 'Collection' is a category or use a different check if needed
    const categories = await categoryModel.find({ status: true });

    if (!categories.length) {
      return res.render("collection", { categories, products: [], fullName });
    }

    const collectionProducts = await Product.find({ status: true });

    return res.render("collection", {
      categories,
      products: collectionProducts,
      fullName,
    });
  } catch (error) {
    console.error("Error rendering collection page:", error);
    res.status(500).send("Internal Server Error");
  }
};

//function for render about page
const about = async (req, res) => {
  let fullName = "";

  // Check if userData exists in session
  if (req.session.userData) {
    // If userData exists, extract the email from it
    const { email } = req.session.userData;

    // Find the user in the database based on the email
    const user = await User.findOne({ email, status: false });

    // If user exists, assign the full name to the variable
    if (user) {
      fullName = user.fullname;
    }
  }

  // Render the men's page and pass the men's products data to the view
  return res.render("about", { fullName });
};

//function for render womens page with sort/filter
const womenfilterProduct = async (req, res) => {
  try {
    const { category, price, sort } = req.query;

    let filter = {};
    if (category) {
      filter.category = category;
    }
    if (price) {
      const [min, max] = price.split("-");
      filter.price = {
        $gte: parseInt(min),
        $lte: parseInt(max),
      };
    }

    let sortOptions = {};
    switch (sort) {
      case "priceAsc":
        sortOptions = { price: 1 };
        break;
      case "priceDesc":
        sortOptions = { price: -1 };
        break;
      case "ratings":
        sortOptions = { ratings: -1 };
        break;
      case "featured":
        sortOptions = { featured: -1 };
        break;
      case "newArrivals":
        sortOptions = { createdAt: -1 };
        break;
      case "aToZ":
        sortOptions = { product: 1 };
        break;
      case "zToA":
        sortOptions = { product: -1 };
        break;
      default:
        // Default sorting option or no sorting
        break;
    }

    let fullName = "";
    if (req.session.userData) {
      const { email } = req.session.userData;
      const user = await User.findOne({ email, status: false });

      if (user) {
        fullName = user.fullname;
      }
    }

    const categories = await categoryModel.find({
      category: "Women",
      status: true,
    });

    if (!categories.length) {
      return res.render("women", { products: [], fullName });
    }

    const products = await Product.find(
      { status: true, category: "Women", ...filter },
      null,
      { sort: sortOptions }
    );
    res.render("women", { products, fullName });
  } catch (err) {
    console.error("Error filtering products:", err);
    res.status(500).send("Internal Server Error");
  }
};

//function for render mens page with sort or filter
const menfilterProduct = async (req, res) => {
  try {
    const { category, price, sort } = req.query;

    let filter = {};
    if (category) {
      filter.category = category;
    }
    if (price) {
      const [min, max] = price.split("-");
      filter.price = {
        $gte: parseInt(min),
        $lte: parseInt(max),
      };
    }

    let sortOptions = {};
    switch (sort) {
      case "priceAsc":
        sortOptions = { price: 1 };
        break;
      case "priceDesc":
        sortOptions = { price: -1 };
        break;
      case "ratings":
        sortOptions = { ratings: -1 };
        break;
      case "featured":
        sortOptions = { featured: -1 };
        break;
      case "newArrivals":
        sortOptions = { createdAt: -1 };
        break;
      case "aToZ":
        sortOptions = { product: 1 };
        break;
      case "zToA":
        sortOptions = { product: -1 };
        break;
      default:
        // Default sorting option or no sorting
        break;
    }

    let fullName = "";
    if (req.session.userData) {
      const { email } = req.session.userData;
      const user = await User.findOne({ email, status: false });

      if (user) {
        fullName = user.fullname;
      }
    }

    const categories = await categoryModel.find({
      category: "Men",
      status: true,
    });

    if (!categories.length) {
      return res.render("men", { products: [], fullName });
    }

    const products = await Product.find(
      { status: true, category: "Men", ...filter },
      null,
      {
        sort: sortOptions,
      }
    );
    res.render("men", { products, fullName });
  } catch (err) {
    console.error("Error filtering products:", err);
    res.status(500).send("Internal Server Error");
  }
};

//function for render kids page with sort / filter
const kidsfilterProduct = async (req, res) => {
  try {
    const { category, price, sort } = req.query;

    let filter = {};
    if (category) {
      filter.category = category;
    }
    if (price) {
      const [min, max] = price.split("-");
      filter.price = {
        $gte: parseInt(min),
        $lte: parseInt(max),
      };
    }

    let sortOptions = {};
    switch (sort) {
      case "priceAsc":
        sortOptions = { price: 1 };
        break;
      case "priceDesc":
        sortOptions = { price: -1 };
        break;
      case "ratings":
        sortOptions = { ratings: -1 };
        break;
      case "featured":
        sortOptions = { featured: -1 };
        break;
      case "newArrivals":
        sortOptions = { createdAt: -1 };
        break;
      case "aToZ":
        sortOptions = { product: 1 };
        break;
      case "zToA":
        sortOptions = { product: -1 };
        break;
      default:
        // Default sorting option or no sorting
        break;
    }

    let fullName = "";
    if (req.session.userData) {
      const { email } = req.session.userData;
      const user = await User.findOne({ email, status: false });

      if (user) {
        fullName = user.fullname;
      }
    }

    const categories = await categoryModel.find({
      category: "kids",
      status: true,
    });

    if (!categories.length) {
      return res.render("kids", { products: [], fullName });
    }

    const products = await Product.find(
      { status: true, category: "kids", ...filter },
      null,
      {
        sort: sortOptions,
      }
    );
    res.render("kids", { products, fullName });
  } catch (err) {
    console.error("Error filtering products:", err);
    res.status(500).send("Internal Server Error");
  }
};

//function for render collection page with filter or sort
const collectionfilterProduct = async (req, res) => {
  try {
    const { category, price, sort } = req.query;

    let filter = {};
    if (category) {
      filter.category = category;
    }
    if (price) {
      const [min, max] = price.split("-");
      filter.price = { $gte: parseInt(min), $lte: parseInt(max) };
    }

    let sortOptions = {};
    switch (sort) {
      case "priceAsc":
        sortOptions = { price: 1 };
        break;
      case "priceDesc":
        sortOptions = { price: -1 };
        break;
      case "ratings":
        sortOptions = { ratings: -1 };
        break;
      case "featured":
        sortOptions = { featured: -1 };
        break;
      case "newArrivals":
        sortOptions = { createdAt: -1 };
        break;
      case "aToZ":
        sortOptions = { product: 1 };
        break;
      case "zToA":
        sortOptions = { product: -1 };
        break;
      default:
        // Default sorting option or no sorting
        break;
    }

    let fullName = "";
    if (req.session.userData) {
      const { email } = req.session.userData;
      const user = await User.findOne({ email, status: false });

      if (user) {
        fullName = user.fullname;
      }
    }

    const categories = await categoryModel.find({ status: true });

    if (!categories.length) {
      return res.render("collection", { categories, products: [], fullName });
    }

    let products;
    if (Object.keys(filter).length > 0) {
      // If there are filter options, apply them
      products = await Product.find({ filter, status: true }).sort(sortOptions);
    } else {
      // If no filter options, just get all products with sorting
      products = await Product.find().sort(sortOptions);
    }

    res.render("collection", { categories, products, fullName });
  } catch (err) {
    console.error("Error filtering products:", err);
    res.status(500).send("Internal Server Error");
  }
};

//function for search option
const search = async (req, res) => {
  try {
    const { search } = req.body; // Retrieve the search query from request query parameters
    let fullName = "";
    if (req.session.userData) {
      const { email } = req.session.userData;
      const user = await User.findOne({ email, status: false });

      if (user) {
        fullName = user.fullname;
      }
    }
    // Perform a case-insensitive search for product names containing the search query
    const products = await Product.find({
      product: { $regex: search, $options: "i" },
      status: true,
    });
    res.render("searchResult", { products, fullName }); // Render a separate view for displaying search results
  } catch (error) {
    console.error("Error occurred while searching for products:", error);
    res.status(500).send("Internal Server Error");
  }
};

module.exports = {
  about,
  getProductView,
  getMenProducts,
  getwomenProducts,
  getkidsProducts,
  getcollectionProducts,
  womenfilterProduct,
  kidsfilterProduct,
  menfilterProduct,
  collectionfilterProduct,
  search,
};
