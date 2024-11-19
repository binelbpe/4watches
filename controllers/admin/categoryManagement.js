const addCategory = asyncHandler(async (req, res, next) => {
  const categoryName = req.body.category.trim();

  if (!categoryName) {
    return next(createError(400, 'Category name cannot be empty'));
  }

  if (categoryName.length < 3 || categoryName.length > 30) {
    return next(createError(400, 'Category name must be between 3 and 30 characters'));
  }

  if (!/^[a-zA-Z\s]+$/.test(categoryName)) {
    return next(createError(400, 'Category name can only contain letters and spaces'));
  }

  const existingCategory = await Category.findOne({
    category: { $regex: new RegExp(`^${categoryName}$`, 'i') }
  });

  if (existingCategory) {
    return next(createError(409, 'This category already exists'));
  }

  await Category.create({ category: categoryName });
  res.redirect("/admin/Category");
});

const getCategory = asyncHandler(async (req, res, next) => {
  let page = +req.query.page || 1;
  const ITEMS_PER_PAGE = 10;

  const totalCategories = await category.countDocuments();
  if (totalCategories === 0) {
    return next(createError(404, 'No categories found'));
  }

  const totalPages = Math.ceil(totalCategories / ITEMS_PER_PAGE);
  page = Math.max(1, Math.min(page, totalPages));

  const categories = await category
    .find()
    .skip((page - 1) * ITEMS_PER_PAGE)
    .limit(ITEMS_PER_PAGE)
    .sort({ _id: -1 });

  res.render("adminCategory", {
    data: categories,
    currentPage: page,
    totalPages: totalPages,
    error: req.flash("error")[0] || null
  });
});

const deleteCategory = asyncHandler(async (req, res, next) => {
  const categoryId = req.query.id;
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    return next(createError(400, 'Invalid category ID'));
  }

  const categoryData = await category.findById(categoryId);
  if (!categoryData) {
    return next(createError(404, 'Category not found'));
  }

  await category.findByIdAndDelete(categoryId);
  res.redirect("/admin/Category");
}); 