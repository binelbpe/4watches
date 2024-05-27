const category = require("../../models/catergoryModel");
const ITEMS_PER_PAGE = 5;
//function for rendering category page in admin
const getCategory = async (req, res) => {
  try {
    let page = +req.query.page || 1; // Get page number from query parameters or default to 1
    const ITEMS_PER_PAGE = 10; // Define the number of items per page

    const totalCategories = await category.countDocuments(); // Count total categories
    const totalPages = Math.ceil(totalCategories / ITEMS_PER_PAGE); // Calculate total pages

    if (totalCategories === 0) {
      page = 1; // No categories but still ensure page is set to 1
    } else if (page < 1) {
      page = 1; // Ensure page number is at least 1
    } else if (page > totalPages) {
      page = totalPages; // Ensure page number does not exceed total pages
    }

    const categories = await category
      .find()
      .skip((page - 1) * ITEMS_PER_PAGE) // Calculate skip based on page number
      .limit(ITEMS_PER_PAGE) // Limit results per page
      .sort({ _id: -1 }); // Sort categories by _id in descending order
    res.render("adminCategory", {
      data: categories,
      currentPage: page,
      totalPages: totalPages,
      error: req.flash("error"),
    });
  } catch (error) {
    console.log("Error in getCategory:", error);
    res.redirect("/admin/error");
  }
};

//function to create new category
const addCategory = async (req, res) => {
  try {
    const categoryName = req.body.category;

    // Use a regular expression to perform a case-insensitive search
    const existingCategory = await category.findOne({
      category: { $regex: new RegExp("^" + categoryName + "$", "i") },
    });

    if (existingCategory) {
      let data = await category.find().sort({ _id: -1 });
      // Pass the error message and the existing data to the template
      req.flash("error", `Category already exists ${categoryName}`);
      return res.redirect("/admin/Category");
    } else {
      // Ensure the category name is stored in a consistent case, e.g., all lower case
      await category.create({
        ...req.body,
        category: categoryName,
      });
      res.redirect("/admin/Category");
    }
  } catch (e) {
    console.log("Error in adding category:", e);
    res.redirect("/admin/error");
  }
};

//function to change category status
const changeStatus = async (req, res) => {
  try {
    let categoryData = await category.findOne({ _id: req.query.id });
    if (categoryData.status) {
      await category.updateOne({ _id: req.query.id }, { status: false });
    } else {
      await category.updateOne({ _id: req.query.id }, { status: true });
    }
    res.redirect("/admin/Category");
  } catch (e) {
    console.log("error in the changeStatus : ", e);
    res.redirect("/admin/error");
  }
};

//function to edit category
const editCategory = async (req, res) => {
  try {
    const oldCategoryName = req.body.oldCat;
    const newCategoryName = req.body.category;
    const categoryId = req.body.id;

    // Use a regular expression to perform a case-insensitive search, excluding current category by _id
    const existingCategory = await category.findOne({
      category: { $regex: new RegExp("^" + newCategoryName + "$", "i") },
      _id: { $ne: categoryId },
    });

    if (existingCategory) {
      const data = await category.find().sort({ _id: -1 });
      req.flash("error","Existing category")
      return res.redirect("/admin/Category");
    } else {
      // Update the category name, ensuring consistency in case
      await category.updateOne(
        { _id: categoryId },
        { category: newCategoryName}
      );
      res.redirect("/admin/Category");
    }
  } catch (e) {
    console.log("Error in editCategory:", e);
    res.redirect("/admin/error");
  }
};

module.exports = {
  addCategory,
  getCategory,
  changeStatus,
  editCategory,
};
