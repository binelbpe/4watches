const category = require("../../models/catergoryModel");
const ITEMS_PER_PAGE = 5;
//function for rendering category page in admin
const getCategory = async (req, res) => {
  try {
    let page = +req.query.page || 1;
    const ITEMS_PER_PAGE = 10;

    const totalCategories = await category.countDocuments();
    const totalPages = Math.ceil(totalCategories / ITEMS_PER_PAGE);

    if (totalCategories === 0) {
      page = 1;
    } else if (page < 1) {
      page = 1;
    } else if (page > totalPages) {
      page = totalPages;
    }

    const categories = await category
      .find()
      .skip((page - 1) * ITEMS_PER_PAGE)
      .limit(ITEMS_PER_PAGE)
      .sort({ _id: -1 });

    const error = req.flash("error")[0] || null;

    res.render("adminCategory", {
      data: categories,
      currentPage: page,
      totalPages: totalPages,
      error: error
    });
  } catch (error) {
    console.log("Error in getCategory:", error);
    res.redirect("/admin/error");
  }
};

//function to create new category
const addCategory = async (req, res) => {
  try {
    const categoryName = req.body.category.trim();

    // Backend validation
    if (!categoryName) {
      req.flash("error", "Category name cannot be empty");
      return res.redirect("/admin/Category");
    }

    if (categoryName.length < 3 || categoryName.length > 30) {
      req.flash("error", "Category name must be between 3 and 30 characters");
      return res.redirect("/admin/Category");
    }

    if (!/^[a-zA-Z\s]+$/.test(categoryName)) {
      req.flash("error", "Category name can only contain letters and spaces");
      return res.redirect("/admin/Category");
    }

    // Case-insensitive check for existing category
    const existingCategory = await category.findOne({
      category: { $regex: new RegExp(`^${categoryName}$`, 'i') }
    });

    if (existingCategory) {
      req.flash("error", "This category already exists");
      return res.redirect("/admin/Category");
    }

    // Create new category
    await category.create({
      category: categoryName
    });

    res.redirect("/admin/Category");
  } catch (error) {
    console.log("Error in adding category:", error);
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

//function to change category status
const deleteCategory = async (req, res) => {
  try {
    let categoryData = await category.findByIdAndDelete(req.query.id );
    res.redirect("/admin/Category");
  } catch (e) {
    console.log("error in the deleteCategory : ", e);
    res.redirect("/admin/error");
  }
};

//function to edit category
const editCategory = async (req, res) => {
  try {
    const oldCategoryName = req.body.oldCat.trim();
    const newCategoryName = req.body.category.trim();
    const categoryId = req.body.id;

    // Backend validation
    if (!newCategoryName) {
      req.flash("error", "Category name cannot be empty");
      return res.redirect("/admin/Category");
    }

    if (newCategoryName.length < 3 || newCategoryName.length > 30) {
      req.flash("error", "Category name must be between 3 and 30 characters");
      return res.redirect("/admin/Category");
    }

    if (!/^[a-zA-Z\s]+$/.test(newCategoryName)) {
      req.flash("error", "Category name can only contain letters and spaces");
      return res.redirect("/admin/Category");
    }

    // If name hasn't changed (case-sensitive)
    if (newCategoryName === oldCategoryName) {
      return res.redirect("/admin/Category");
    }

    // Case-insensitive check for existing category, excluding current category
    const existingCategory = await category.findOne({
      category: { $regex: new RegExp(`^${newCategoryName}$`, 'i') },
      _id: { $ne: categoryId }
    });

    if (existingCategory) {
      req.flash("error", "This category name already exists");
      return res.redirect("/admin/Category");
    }

    // Update category
    await category.findByIdAndUpdate(categoryId, {
      category: newCategoryName
    });

    res.redirect("/admin/Category");
  } catch (error) {
    console.log("Error in editCategory:", error);
    res.redirect("/admin/error");
  }
};

module.exports = {
  addCategory,
  getCategory,
  changeStatus,
  editCategory,
  deleteCategory,
};
