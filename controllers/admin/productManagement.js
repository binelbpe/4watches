const categoryModel = require("../../models/catergoryModel");
const productModel = require("../../models/productModel");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

//function for render product list page in admin side
const getProduct = async (req, res) => {
  try {
    let page = +req.query.page || 1;
    const ITEMS_PER_PAGE = 8;
    let query = {};
    let searchQuery = '';

    if (req.query.search) {
      searchQuery = req.query.search.trim();
      // Check if the search query is a valid MongoDB ObjectId
      if (mongoose.Types.ObjectId.isValid(searchQuery)) {
        query = { _id: searchQuery };
      } else {
        query = { 
          $or: [
            { product: { $regex: searchQuery, $options: 'i' } },
            { category: { $regex: searchQuery, $options: 'i' } }
          ]
        };
      }
    }

    const totalProducts = await productModel.countDocuments(query);
    let totalPages = Math.ceil(totalProducts / ITEMS_PER_PAGE);
    totalPages = Math.max(totalPages, 1);

    if (page < 1) {
      page = 1;
    } else if (page > totalPages) {
      page = totalPages;
    }

    const skipAmount = Math.max(0, (page - 1) * ITEMS_PER_PAGE);

    const products = await productModel
      .find(query)
      .skip(skipAmount)
      .limit(ITEMS_PER_PAGE);

    let prev = page > 1 ? page - 1 : null;
    let next = page < totalPages ? page + 1 : null;

    let msg = req.query.msg || "";
    const category = await categoryModel.find({});

    res.render("adminProduct", {
      data: products,
      prev: prev,
      next: next,
      totalPages: totalPages,
      currentPage: page,
      CatData: category,
      msg: msg,
      searchQuery: searchQuery
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
    const exImagePaths = product.image.map((img) => img.path); // Get the paths of existing images
    const files = req.files || []; // Ensure files is an array even if it's null
    let updImages = [...exImage]; // Start with the existing images
    const removedImagesPaths = req.body.removeImages
      ? req.body.removeImages.split(",").filter((path) => path)
      : []; // Get the paths of images to be removed as an array

    if (files.length > 0) {
      // Process new uploaded images
      for (const file of files) {
        const resizedImageBuffer = await sharp(file.path)
          .resize({ width: 500, height: 500 })
          .toBuffer();

        const fileName = Date.now() + "-" + file.originalname;
        const filePath = path.join("./public/uploads/", fileName);
        fs.writeFileSync(filePath, resizedImageBuffer);
        let newPath = filePath.replace(/\\/g, "/").replace(/public/, "");
        updImages.push({
          originalname: file.originalname,
          mimetype: file.mimetype,
          path: newPath,
        });
      }
      // Remove the paths of deleted images from the updImages array
    }
    updImages = updImages.filter(
      (img) => !removedImagesPaths.includes(img.path)
    );

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
      { new: true }
    );

    if (!updatedProduct) {
      return res.redirect("/admin/error");
    }

    // Remove the images from the file system
    const uploadsDir = path.join(__dirname, "..", "..", "public"); // Get the absolute path of the uploads directory
    for (const imagePath of removedImagesPaths) {
      const fullPath = path.join(uploadsDir, imagePath); // Construct the absolute path of the image file
      fs.unlink(fullPath, (err) => {
        if (err) {
          console.error(`Failed to remove file: ${fullPath}`, err);
        }
      });
    }

    res.redirect("/admin/Product?msg=Product Edited successful");
  } catch (e) {
    console.log("error in the editProduct :", e);
    res.redirect("/admin/error");
  }
};

//function for change status of product
const deleteProduct = async (req, res) => {
  try {
    const data = await productModel.findByIdAndDelete(req.query.id);
   
    res.redirect("/admin/Product");
  } catch (e) {
    console.log("error in the changeStatus", e);
    res.redirect("/admin/error");
  }
};
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
  deleteProduct,
};
