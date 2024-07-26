const userModel = require("../../models/userModel");
const Order = require("../../models/orderModel");
const Category = require("../../models/catergoryModel");
const Product = require("../../models/productModel");
const PDFDocument = require("pdfkit");
const Coupon = require("../../models/couponModel");
const bcrypt = require("bcrypt");
//rendering admin login page
const admin = (req, res) => {
  try {
    if (req.session.isAdmin) {
      res.redirect("/admin/adminHome");
    } else {
      res.render("adminLogin");
    }
  } catch (e) {
    console.log("error in the admin : ", e);
    res.redirect("/admin/error");
  }
};
//validating admin login credentials
const checkAdmin = async (req, res) => {
  try {
    const adminFound = await userModel.find({
      fullname: req.body.loginUsername,
    });
    if (adminFound.length > 0) {
      if (adminFound[0].isAdmin) {
        const compass = await bcrypt.compare(
          req.body.loginPassword,
          adminFound[0].password
        );
        if (compass) {
          req.session.isAdmin = true;
          res.redirect("/admin/adminHome");
        } else {
          res.redirect("/admin");
        }
      } else {
        res.redirect("/admin");
      }
    } else {
      res.redirect("/admin");
    }
  } catch (e) {
    console.log("error in the checkAdmin controller", e);
    res.redirect("/admin/error");
  }
};
//rendering AdminSalesreport page
const adminSalesPage = async (req, res) => {
  try {
    const limit = 15;
    const page = req.query.page || 1; // Get the current page from the query parameter, or default to 1
    const skip = (page - 1) * limit; // Calculate the number of documents to skip
    const orders = await Order.find({})
      .populate("products.product", "price category")
      .populate("coupon")
      .populate("user", "fullname")
      .populate("address", "address") // Populate the address
      .skip(skip)
      .limit(limit);
    let totalRevenue = 0;
    let overallOrderAmount = 0;
    let completedProductCount = 0;
    let totalCompletedOrderAmount = 0;
    let discountUsage = 0;
    let couponUsage = 0;
    let returns = 0;
    let cancellations = 0;
    const categorySales = {};
    const productSales = {};

    orders.forEach((order) => {
      const completedProducts = order.products.filter(
        (product) => product.status === "completed"
      );
      const canceledProducts = order.products.filter(
        (product) => product.status === "cancelled"
      );
      const returnedProducts = order.products.filter(
        (product) => product.status === "returned"
      );

      const orderCompletedProductRevenue = completedProducts.reduce(
        (acc, product) => {
          const discountedAmount = order.discountedAmount || 0;
          const productRevenue =
            product.product.price * product.quantity - discountedAmount;
          return acc + productRevenue;
        },
        0
      );

      totalRevenue += orderCompletedProductRevenue;
      overallOrderAmount += orderCompletedProductRevenue;
      completedProductCount += completedProducts.length;
      cancellations += canceledProducts.length;
      returns += returnedProducts.length;
      if (
        completedProducts.length === order.products.length &&
        order.status === "completed"
      ) {
        totalCompletedOrderAmount += orderCompletedProductRevenue;

        if (order.discountedAmount > 0) {
          discountUsage++;
        }

        couponUsage = discountUsage;
      }

      completedProducts.forEach((product) => {
        const category = product.product.category;
        const discountedAmount = order.discountedAmount || 0;
        const productRevenue =
          product.product.price * product.quantity - discountedAmount;

        if (categorySales[category]) {
          categorySales[category] += productRevenue;
        } else {
          categorySales[category] = productRevenue;
        }
      });
    });

    const numberCompleted =
      totalCompletedOrderAmount > 0 ? completedProductCount : 0;
    const averageOrderValue =
      numberCompleted > 0 ? totalCompletedOrderAmount / numberCompleted : 0;
    orders.forEach((order) => {
      order.products.forEach((product) => {
        const { name, price, category } = product.product;
        const revenue = price * product.quantity;

        if (productSales[name]) {
          productSales[name].totalSales += revenue;
        } else {
          productSales[name] = {
            name,
            category,
            totalSales: revenue,
          };
        }
      });
    });

    const sortedProductSales = Object.values(productSales).sort(
      (a, b) => b.totalSales - a.totalSales
    );
    const totalCount = await Order.countDocuments({});

    // Calculate the total number of pages
    const totalPages = Math.ceil(totalCount / limit);
    res.render("adminSalesReport", {
      totalRevenue,
      overallOrderAmount,
      numberCompleted,
      averageOrderValue,
      discountUsage,
      couponUsage,
      returns,
      cancellations,
      categorySales,
      orders,
      productSales: sortedProductSales,
      totalPages,
      currentPage: page,
    });
  } catch (error) {
    res.status(500).send(error);
  }
};

//admin logout function
const adminLogout = async (req, res) => {
  try {
    req.session.isAdmin = false;

    res.redirect("/admin");
  } catch (e) {
    console.log("error in the adminLogout : ", e);
    res.redirect("/admin/error");
  }
};

//rendering adminSalesReport page
const getSalesReportPage = async (req, res) => {
  try {
    const orders = await Order.find({})
      .populate("products.product", "name price category")
      .populate("coupon")
      .populate({ path: "user", select: "fullname" })
      .populate("address", "address");

    res.render("adminSalesReport", { orders });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

//fetching sales report data
const getSalesReportData = async (req, res) => {
  const startDate = new Date(req.query.startDate);
  const endDate = new Date(req.query.endDate);
  endDate.setDate(endDate.getDate() + 1); // Include the end date in the range

  try {
    const orders = await Order.find({
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    })
      .sort({ createdAt: -1 })
      .populate("products.product", " price category")
      .populate("coupon")
      .populate({ path: "user", select: "fullname" })
      .populate("address", "address");

    const ordersReport = await Order.find({
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    })
      .sort({ createdAt: -1 })
      .populate("products.product", " price category")
      .populate("coupon")
      .populate({ path: "user", select: "fullname" })
      .populate("address", "address");

    const salesData = calculateSalesData(ordersReport);

    res.status(200).json(salesData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

function calculateSalesData(orders) {
  let overallSalesCount = 0;
  let overallOrderAmount = 0;
  let overallDiscount = 0;
  const productSales = {};

  orders.forEach((order) => {
    const completedProducts = order.products.filter(
      (product) => product.status === "completed"
    );

    if (completedProducts.length > 0) {
      overallSalesCount += completedProducts.length;

      const orderRevenue = completedProducts.reduce((acc, product) => {
        return acc + product.product.price * product.quantity;
      }, 0);

      overallOrderAmount += order.totalPrice;

      if (order.discountedAmount && order.discountedAmount > 0) {
        overallDiscount += order.discountedAmount;
      }

      completedProducts.forEach((product) => {
        const { name, price, category } = product.product;
        const revenue = price * product.quantity;

        if (productSales[name]) {
          productSales[name].totalSales += revenue;
        } else {
          productSales[name] = {
            name,
            category,
            totalSales: revenue,
          };
        }
      });
    }
  });

  const sortedProductSales = Object.values(productSales).sort(
    (a, b) => b.totalSales - a.totalSales
  );

  return {
    orders,
    overallSalesCount,
    overallOrderAmount,
    overallDiscount,
    productSales: sortedProductSales,
  };
}

//function for download sales report as pdf
const downloadSalesReportPDF = async (req, res) => {
  const startDate = new Date(req.query.startDate);
  const endDate = new Date(req.query.endDate);
  endDate.setDate(endDate.getDate() + 1); // Include the end date in the range

  try {
    const orders = await Order.find({
      createdAt: { $gte: startDate, $lte: endDate },
      status: "completed",
    })
      .sort({ createdAt: -1 })
      .populate("products.product")
      .populate("coupon")
      .populate("user");

    const salesData = calculateSalesData(orders);
    const pdfDoc = new PDFDocument({ size: "A4", layout: "landscape" }); // Set landscape orientation
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="sales_report.pdf"'
    );
    pdfDoc.pipe(res);

    // Add sales report data to the PDF document
    pdfDoc.fontSize(18).text("Sales Report", { align: "center" });
    pdfDoc.moveDown();

    // Add overall sales data
    pdfDoc
      .fontSize(14)
      .text(`Overall Sales Count: ${salesData.overallSalesCount}`);
    pdfDoc.moveDown();
    pdfDoc
      .fontSize(14)
      .text(`Overall Order Amount: ${salesData.overallOrderAmount}`);
    pdfDoc.moveDown();
    pdfDoc.fontSize(14).text(`Overall Discount: ${salesData.overallDiscount}`);
    pdfDoc.moveDown();

    // Start order details on a new page
    pdfDoc.addPage();

    pdfDoc.fontSize(16).text("Order Details", { underline: true });
    pdfDoc.moveDown();

    const tableHeader = [
      "Username",
      "Product ID",
      "Price",
      "Quantity",
      "Order ID",
      "Coupon",
      "Discount",
      "Total",
      "Date",
    ];
    const tableData = orders.flatMap((order) =>
      order.products.map((product) => [
        order.user ? order.user.fullname : "-",
        product.product._id.toString(),
        product.product.price.toFixed(2),
        product.quantity,
        order._id.toString(),
        order.coupon ? order.coupon.code : "-",
        order.discountedAmount ? order.discountedAmount.toFixed(2) : "-",
        order.totalPrice ? order.totalPrice.toFixed(2) : "-",
        order.createdAt.toDateString(),
      ])
    );

    const columnWidths = [80, 120, 50, 70, 120, 60, 60, 80, 80]; // Adjust these values as needed
    const columnAligns = [
      "left",
      "left",
      "right",
      "right",
      "left",
      "left",
      "right",
      "right",
      "left",
    ];
    drawTable(pdfDoc, tableHeader, tableData, columnWidths, columnAligns);

    pdfDoc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
};

function drawTable(pdfDoc, tableHeader, tableData, columnWidths, columnAligns) {
  const headerFont = "Helvetica-Bold";
  const bodyFont = "Helvetica";
  const headerFontSize = 10;
  const bodyFontSize = 8;
  const lineHeight = 20;
  const padding = 5;
  const rowsPerPage = 15;

  let rowIndex = 0;

  const drawHeaderRow = () => {
    const headerY = pdfDoc.y;
    let currentX = pdfDoc.page.margins.left;

    tableHeader.forEach((headerText, index) => {
      const cellWidth = columnWidths[index];
      const align = columnAligns[index];

      pdfDoc
        .font(headerFont)
        .fontSize(headerFontSize)
        .text(headerText || "", currentX + padding, headerY + padding, {
          width: cellWidth - 2 * padding,
          align: align,
          continued: false,
        });

      currentX += cellWidth;
    });

    pdfDoc
      .moveTo(pdfDoc.page.margins.left, headerY + lineHeight)
      .lineTo(
        pdfDoc.page.width - pdfDoc.page.margins.right,
        headerY + lineHeight
      )
      .stroke();

    pdfDoc.moveDown(1); // Move down a bit for the next row
  };

  const drawBodyRow = (row) => {
    if (rowIndex >= rowsPerPage) {
      pdfDoc.addPage();
      drawHeaderRow();
      rowIndex = 0;
    }

    const rowY = pdfDoc.y;
    let currentX = pdfDoc.page.margins.left;

    row.forEach((cellText, index) => {
      const cellWidth = columnWidths[index];
      const align = columnAligns[index];

      pdfDoc
        .font(bodyFont)
        .fontSize(bodyFontSize)
        .text(cellText || "", currentX + padding, rowY + padding, {
          width: cellWidth - 2 * padding,
          align: align,
          continued: false,
        });

      currentX += cellWidth;
    });

    pdfDoc.moveDown(1); // Move down a bit for the next row
    rowIndex++;
  };

  drawHeaderRow();
  tableData.forEach(drawBodyRow);
}

//rendering admin Dashboard page
const adminDashboard = async (req, res) => {
  try {
    const { period } = req.query;
    let startDate, endDate;

    switch (period) {
      case "daily":
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0); // Start of the day
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999); // End of the day
        break;
      case "weekly":
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7); // Last 7 days
        endDate = new Date();
        break;
      case "monthly":
        startDate = new Date();
        startDate.setDate(1); // First day of the month
        endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(0); // Last day of the month
        break;
      case "yearly":
        startDate = new Date();
        startDate.setMonth(0, 1); // First day of the year
        endDate = new Date();
        endDate.setMonth(11, 31); // Last day of the year
        break;
      default:
        startDate = new Date();
        endDate = new Date();
        break;
    }

    const orders = await Order.find({
      status: "completed",
      createdAt: { $gte: startDate, $lte: endDate },
    })
      .populate("products.product", "product category")
      .populate("coupon")
      .populate("user");

    const products = await Product.find({});
    const categories = await Category.find({});

    let bestSellingProducts = [];
    let bestSellingCategories = [];
    let mostUsedCoupons = [];

    // Get best selling products
    const productSales = products.map((product) => {
      const quantitySold = orders.reduce((acc, order) => {
        const productSold = order.products.find(
          (item) =>
            item.product &&
            item.product._id.toString() === product._id.toString()
        );
        return productSold ? acc + productSold.quantity : acc;
      }, 0);
      return { ...product.toObject(), quantitySold };
    });
    bestSellingProducts = productSales
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 10);

    // Get best selling categories based on quantity sold
    const allCategories = await Category.find({});
    const categoryMap = new Map(
      allCategories.map((category) => [
        category.category,
        category._id.toString(),
      ])
    );

    const categorySales = orders.reduce((acc, order) => {
      const categoriesInOrder = order.products.reduce((categories, item) => {
        if (item.product && item.product.category) {
          const categoryValue = item.product.category;
          const categoryId = categoryMap.get(categoryValue.toString());
          if (categoryId) {
            const quantity = item.quantity || 0;
            if (categories[categoryId]) {
              categories[categoryId].quantitySold += quantity;
            } else {
              const categoryDoc = allCategories.find(
                (cat) => cat._id.toString() === categoryId
              );
              categories[categoryId] = {
                category: categoryDoc.category,
                quantitySold: quantity,
              };
            }
          }
        }
        return categories;
      }, {});

      // Merge categoriesInOrder with acc
      for (const [categoryId, categoryData] of Object.entries(
        categoriesInOrder
      )) {
        if (acc[categoryId]) {
          acc[categoryId].quantitySold += categoryData.quantitySold;
        } else {
          acc[categoryId] = categoryData;
        }
      }

      return acc;
    }, {});

    bestSellingCategories = Object.values(categorySales)
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 10);

    const userCount = await userModel.countDocuments({});
    const productCount = await Product.countDocuments({});
    const orderCount = await Order.countDocuments({ status: "completed" });
    const cashOnDeliveryOrders = await Order.aggregate([
      { $match: { paymentMethod: "cash_on_delivery", status: "completed" } },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]);

    const onlinePaymentOrders = await Order.aggregate([
      { $match: { paymentMethod: "Payment on online", status: "completed" } },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]);
    const walletPaymentOrders = await Order.aggregate([
      { $match: { paymentMethod: "pay_by_wallet", status: "completed" } },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]);
    res.render("adminHome", {
      bestSellingProducts,
      bestSellingCategories,
      userCount,
      productCount,
      orderCount,
      cashOnDeliveryOrderCount:
        cashOnDeliveryOrders.length > 0 ? cashOnDeliveryOrders[0].count : 0,
      onlinePaymentOrderCount:
        onlinePaymentOrders.length > 0 ? onlinePaymentOrders[0].count : 0,
      walletPaymentOrderCount:
        walletPaymentOrders.length > 0 ? walletPaymentOrders[0].count : 0,
      period: period, // Add this line
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};

module.exports = {
  admin,
  checkAdmin,
  adminSalesPage,
  adminLogout,
  getSalesReportPage,
  getSalesReportData,
  downloadSalesReportPDF,
  adminDashboard,
};
