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
    let searchQuery = "";

    if (req.query.search) {
      searchQuery = req.query.search.trim();
      // Check if the search query is a valid MongoDB ObjectId
      if (mongoose.Types.ObjectId.isValid(searchQuery)) {
        query = { _id: searchQuery };
      } else {
        query = {
          $or: [
            { product: { $regex: searchQuery, $options: "i" } },
            { category: { $regex: searchQuery, $options: "i" } },
          ],
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
      searchQuery: searchQuery,
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

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Get existing images and removed images
    let existingImages = product.image || [];
    const removedImagePaths = req.body.removeImages
      ? req.body.removeImages.split(",").filter(Boolean)
      : [];

    // Remove deleted images from existingImages array
    existingImages = existingImages.filter(
      (img) => !removedImagePaths.includes(img.path)
    );

    // Process new uploaded files
    let newImages = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          // Create unique filename
          const fileName = `${Date.now()}_${file.originalname.replace(
            /\s+/g,
            "_"
          )}`;
          const filePath = path.join("./public/uploads/", fileName);

          // Process and save the image
          const resizedImageBuffer = await sharp(file.path)
            .resize(500, 500, {
              fit: "contain",
              background: { r: 255, g: 255, b: 255, alpha: 1 },
            })
            .toBuffer();

          // Write the file
          fs.writeFileSync(filePath, resizedImageBuffer);

          // Create database path
          const dbPath = `/uploads/${fileName}`;

          // Add to new images array
          newImages.push({
            originalname: file.originalname,
            mimetype: file.mimetype,
            path: dbPath,
          });

          // Clean up temp file
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (error) {
          console.error("Error processing image:", error);
          continue;
        }
      }
    }

    // Process base64 cropped images
    if (req.body.croppedImages) {
      const croppedImages = Array.isArray(req.body.croppedImages)
        ? req.body.croppedImages
        : [req.body.croppedImages];

      for (const base64String of croppedImages) {
        try {
          if (base64String.startsWith("data:image")) {
            const fileName = `${Date.now()}_cropped.jpg`;
            const filePath = path.join("./public/uploads/", fileName);

            // Extract base64 data
            const base64Data = base64String.replace(
              /^data:image\/\w+;base64,/,
              ""
            );

            // Save the base64 image
            fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));

            // Create database path
            const dbPath = `/uploads/${fileName}`;

            // Add to new images array
            newImages.push({
              originalname: "cropped-image.jpg",
              mimetype: "image/jpeg",
              path: dbPath,
            });
          }
        } catch (error) {
          console.error("Error processing cropped image:", error);
        }
      }
    }

    // Combine existing and new images
    const updatedImages = [...existingImages, ...newImages];

    // Validate total images
    if (updatedImages.length > 5) {
      return res.status(400).json({
        error:
          "Maximum 5 images allowed. Please remove some images before adding new ones.",
      });
    }

    // Delete removed images from filesystem
    for (const imagePath of removedImagePaths) {
      try {
        const cleanPath = imagePath.replace(/^\//, "");
        const fullPath = path.join("public", cleanPath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      } catch (error) {
        console.error("Error deleting image:", error);
      }
    }

    // Update product in database
    const updatedProduct = await productModel.findByIdAndUpdate(
      proId,
      {
        $set: {
          product: req.body.productName,
          price: req.body.price,
          offerPrice: req.body.offerPrice || 0,
          description: req.body.description,
          category: req.body.category,
          stock: req.body.stock,
          about: req.body.about,
          image: updatedImages,
        },
      },
      { new: true }
    );

    if (!updatedProduct) {
      throw new Error("Failed to update product");
    }

    console.log("Updated product:", updatedProduct); // Add this for debugging
    res.redirect("/admin/Product?msg=Product updated successfully");
  } catch (error) {
    console.error("Error in editProduct:", error);
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
