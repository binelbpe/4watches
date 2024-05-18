const categoryModel = require("../../models/catergoryModel");
const productModel = require("../../models/productModel");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

//function for render product list page in admin side
const getProduct = async (req, res) => {
  try {
    let page = +req.query.page || 1; // Get page number from query parameters or default to 1
    const ITEMS_PER_PAGE = 8;
    const totalProducts = await productModel.countDocuments(); // Get total number of products
    let totalPages = Math.ceil(totalProducts / ITEMS_PER_PAGE); // Calculate total number of pages

    // Adjust totalPages to at least 1 to prevent calculation errors when there are no products
    totalPages = Math.max(totalPages, 1);

    // Ensure the page number is within the valid range
    if (page < 1) {
      page = 1;
    } else if (page > totalPages) {
      page = totalPages;
    }

    // Calculate skip only after adjusting page and totalPages
    const skipAmount = Math.max(0, (page - 1) * ITEMS_PER_PAGE);

    // Find products with pagination
    const products = await productModel
      .find()
      .skip(skipAmount)
      .limit(ITEMS_PER_PAGE);

    // Calculate previous and next page numbers
    let prev = page > 1 ? page - 1 : null;
    let next = page < totalPages ? page + 1 : null;

    // Retrieve categories and message, if any
    let msg = req.query.msg || "";
    const category = await categoryModel.find({});

    // Render the adminProduct page with all the necessary data
    res.render("adminProduct", {
      data: products,
      prev: prev,
      next: next,
      totalPages: totalPages,
      currentPage: page,
      CatData: category,
      msg: msg,
    });
  } catch (error) {
    console.log("Error in getProduct:", error);
    res.redirect("/admin/error");
  }
};

//function to render add product page
const productAddPage = async (req, res) => {
  try {
    let catergory = await categoryModel.find({});
    res.render("adminProduct-add", { data: catergory });
  } catch (e) {
    console.log("error in the productAddPage", e);
    res.redirect("/admin/error");
  }
};

//function for create new product
const addProduct = async (req, res) => {
  try {
    // Check if files were uploaded
    if (!req.files) {
      return res.status(400).send("No files were uploaded.");
    }

    const files = req.files;

    const uploadedImages = [];

    for (const file of files) {
      const resizedImageBuffer = await sharp(file.path)
        .resize({ width: 200, height: 200 })
        .toBuffer();

      const fileName = Date.now() + "-" + file.originalname;
      const filePath = path.join("./public/uploads/", fileName);
      fs.writeFileSync(filePath, resizedImageBuffer);
      let newPath = filePath.replace(/\\/g, "/").replace(/public/, "");
      uploadedImages.push({
        originalname: file.originalname,
        mimetype: file.mimetype,
        path: newPath,
      });
    }

    const {
      productName,
      category,
      description,
      about,
      price,
      stock,
      offerPrice,
    } = req.body;
    const newProduct = new productModel({
      product: productName,
      price: price,
      offerPrice: offerPrice || 0,
      description: description,
      category: category,
      stock: stock,
      image: uploadedImages,
      about: about,
    });

    await newProduct.save();
    res.redirect("/admin/Product");
  } catch (e) {
    console.log("error in the addProduct ", e);
    res.redirect("/admin/error");
  }
};

//function for edit product details
const editProduct = async (req, res) => {
  try {
    const proId = req.params.id;
    const product = await productModel.findById(proId);
    const exImage = product.image || []; // Ensure exImage is an array even if it's null
    const files = req.files || []; // Ensure files is an array even if it's null
    let updImages = [];
    let newImages = [];
    const { croppedImage } = req.body;
    // Remove the selected images from the exImage array
    const removeImages = Array.isArray(req.body.removeImages)
      ? req.body.removeImages
      : req.body.removeImages
      ? [req.body.removeImages]
      : [];
    const removeImagesArray = removeImages.toString().split(",");

    if (croppedImage) {
      // Process the cropped image data (e.g., save it to the file system, upload to a storage service)
      const croppedImageBuffer = Buffer.from(
        croppedImage.split(",")[1],
        "base64"
      );
      const croppedImagePath = path.join(
        "path/to/uploads",
        `cropped-${Date.now()}.jpg`
      );
      fs.writeFileSync(croppedImagePath, croppedImageBuffer);

      // Update the product model with the cropped image path
      updImages.push({
        path: croppedImagePath.replace(/\\/g, "/").replace(/public/, ""),
      });
    }
    // Extract original names from exImage
    const exImageOriginalNames = exImage.map((img) => img.originalname);

    // Filter out images that exist in the exImage array based on their originalname
    const validRemoveImages = removeImagesArray.filter((originalname) =>
      exImageOriginalNames.includes(originalname)
    );
    // Remove the matched images from the exImage array
    const remainingImages = exImage.filter(
      (img) => !validRemoveImages.includes(img.originalname)
    );
    // Construct the $pull update query using the validRemoveImages array
    const removeImagesResult = await productModel.findByIdAndUpdate(
      proId,
      {
        $set: { image: remainingImages }, // Update the image array with the remaining images
      },
      { new: true }
    );

    if (files.length > 0) {
      // Check if files were uploaded
      for (const file of files) {
        const resizedImageBuffer = await sharp(file.path)
          .resize({ width: 500, height: 500 })
          .toBuffer();

        const fileName = Date.now() + "-" + file.originalname;
        const filePath = path.join("./public/uploads/", fileName);
        fs.writeFileSync(filePath, resizedImageBuffer);
        let newPath = filePath.replace(/\\/g, "/").replace(/public/, "");
        newImages.push({
          originalname: file.originalname,
          mimetype: file.mimetype,
          path: newPath,
        });
      }
      updImages = [...remainingImages, ...newImages];
    } else {
      updImages = remainingImages;
    }

    const {
      productName,
      price,
      description,
      about,
      category,
      stock,
      offerPrice,
    } = req.body;

    // Update the product
    const updatedProduct = await productModel.findByIdAndUpdate(
      proId,
      {
        product: productName,
        price: price,
        offerPrice: offerPrice || 0,
        description: description,
        category: category,
        stock: stock,
        about: about,
        is_blocked: false,
        image: updImages,
      },
      { new: true } // Return the updated document
    );

    if (!updatedProduct) {
      return res.redirect("/admin/error");
    }

    res.redirect("/admin/Product?msg=Product Edited successful");
  } catch (e) {
    console.log("error in the editProduct :", e);
    res.redirect("/admin/error");
  }
};

//function for change status of product
const changeStatus = async (req, res) => {
  try {
    const data = await productModel.findOne({ _id: req.query.id });
    if (data.status) {
      await productModel.updateOne({ _id: req.query.id }, { status: false });
    } else {
      await productModel.updateOne({ _id: req.query.id }, { status: true });
    }
    res.redirect("/admin/Product");
  } catch (e) {
    console.log("error in the changeStatus", e);
    res.redirect("/admin/error");
  }
};

module.exports = {
  getProduct,
  productAddPage,
  addProduct,
  editProduct,
  changeStatus,
};
