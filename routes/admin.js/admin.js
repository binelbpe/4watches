const express = require("express"); // Importing the express module
const router = express.Router(); // Creating a new router instance

// Importing the required controllers
const adminController = require("../../controllers/admin/adminController");
const userManagementController = require("../../controllers/admin/userManagement");
const categoryManagement = require("../../controllers/admin/catergoryManagement");
const productManagement = require("../../controllers/admin/productManagement");
const orderManagement = require("../../controllers/admin/orderManagement");
const adminCouponManagement = require("../../controllers/admin/adminCouponManagement");

// Importing the required middleware
const adminAuth = require("../../middleware/adminAuth");
const upload = require("../../middleware/multer");
const nocacheMiddleware = require("../../middleware/noCache");

// Admin routes
router.get("/", nocacheMiddleware(), adminController.admin);
router.post("/", adminController.checkAdmin);
router.get("/adminHome", adminAuth.isLogin, adminController.adminDashboard);
router.get("/Oders", (req, res) => {
  res.render("adminOders");
});

// User management routes
router.get(
  "/User",
  adminAuth.isLogin,
  userManagementController.userManagementPage
);
router.get(
  "/changeStatus",
  adminAuth.isLogin,
  userManagementController.changeStatus
);

// Category management routes
router.get("/Category", adminAuth.isLogin, categoryManagement.getCategory);
router.get(
  "/categoryStatus",
  adminAuth.isLogin,
  categoryManagement.changeStatus
);
router.get(
  "/categoryDelete",
  adminAuth.isLogin,
  categoryManagement.deleteCategory
);
router.post("/editCategory", categoryManagement.editCategory);
router.post("/category", categoryManagement.addCategory);

// Product management routes
router.get("/Product", adminAuth.isLogin, productManagement.getProduct);
router.get("/Product-add", adminAuth.isLogin, productManagement.productAddPage);
router.post(
  "/addProduct",
  adminAuth.isLogin,
  upload.array("images", 5),
  productManagement.addProduct
);
router.get("/productstatus", adminAuth.isLogin, productManagement.changeStatus);
router.get("/productDelete", adminAuth.isLogin, productManagement.deleteProduct);
router.post(
  "/editProduct/:id",
  adminAuth.isLogin,
  upload.array("images", 5),
  productManagement.editProduct
);

// Order management routes
router.get(
  "/order",
  adminAuth.isLogin,
  orderManagement.getOrdersWithPagination
);
router.post(
  "/order/change-status",
  adminAuth.isLogin,
  orderManagement.changeOrderStatus
);
router.get("/logout", adminController.adminLogout);
router.post(
  "/order/cancel/:orderId",
  adminAuth.isLogin,
  orderManagement.cancelOrder
);
router.post(
  "/order/return/:orderId",
  adminAuth.isLogin,
  orderManagement.returnOrder
);
router.post(
  "/order/return-product/:orderId/:productId",
  adminAuth.isLogin,
  orderManagement.returnProductAsAdmin
);
router.post(
  "/order/cancel-product/:orderId/:productId",
  adminAuth.isLogin,
  orderManagement.cancelProductAsAdmin
);

// Coupon management routes
router.get("/coupons", adminAuth.isLogin, adminCouponManagement.getAllCoupons);
router.post("/coupons", adminAuth.isLogin, adminCouponManagement.createCoupon);
router.post(
  "/coupons/:id",
  adminAuth.isLogin,
  adminCouponManagement.updateCoupon
);
router.get(
  "/deletecoupons/:id",
  adminAuth.isLogin,
  adminCouponManagement.deleteCoupon
);

// Sales and reporting routes
router.get("/sales", adminAuth.isLogin, adminController.adminSalesPage);
router.get(
  "/salesReport",
  adminAuth.isLogin,
  adminController.getSalesReportPage
);
router.get(
  "/salesReport/data",
  adminAuth.isLogin,
  adminController.getSalesReportData
);
router.get(
  "/salesReport/download",
  adminAuth.isLogin,
  adminController.downloadSalesReportPDF
);

router.get(
  "/salesReport/downloadExcel",
  adminAuth.isLogin,
  adminController.downloadSalesReportExcel
);

// Order Details Report
// router.get("/order-details", adminController.getOrderDetailsReport);

// Product Sales Report
// router.get("/product-sales", adminController.getProductSalesReport);

// router.get("/error", adminController.errorPage);
router.get("/data", adminController.getSalesReportData);

module.exports = router; // Exporting the router
