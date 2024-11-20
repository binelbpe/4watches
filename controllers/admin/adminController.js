const userModel = require("../../models/userModel");
const Order = require("../../models/orderModel");
const Category = require("../../models/catergoryModel");
const Product = require("../../models/productModel");
const PDFDocument = require("pdfkit");
const Coupon = require("../../models/couponModel");
const ExcelJS = require("exceljs");
const bcrypt = require("bcrypt");
const path = require("path");

// Add this helper function at the top of the file
const formatCurrency = (amount) => {
  // Handle undefined, null, or invalid values
  if (amount === undefined || amount === null) {
    return '₹0.00';
  }

  // Convert to number if it's a string
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  // Check if it's a valid number
  if (isNaN(numericAmount)) {
    return '₹0.00';
  }

  // Format the number with 2 decimal places
  try {
    return `₹${numericAmount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  } catch (error) {
    console.error('Error formatting currency:', error);
    return `₹${numericAmount.toFixed(2)}`;
  }
};

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
    const page = req.query.page || 1;
    const skip = (page - 1) * limit;
    const orders = await Order.find({})
      .populate("products.product", "price category")
      .populate("coupon")
      .populate("user", "fullname")
      .populate("address", "address")
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

const getSalesReportPage = async (req, res) => {
  try {
    res.render("adminSalesReport");
  } catch (error) {
    console.error("Error in getSalesReportPage:", error);
    res.redirect("/admin/error");
  }
};

//fetching sales report data
const getSalesReportData = async (req, res) => {
  try {
    const startDate = new Date(req.query.startDate);
    const endDate = new Date(req.query.endDate);
    endDate.setDate(endDate.getDate() + 1);

    const orders = await Order.find({
      createdAt: { $gte: startDate, $lte: endDate },
    })
      .populate({
        path: "products.product",
        select: "product price category",
      })
      .populate("user", "fullname email phone")
      .populate("coupon")
      .populate("address")
      .lean();

    if (!orders || orders.length === 0) {
      return res.status(200).json({
        orders: [],
        overallSalesCount: 0,
        overallOrderAmount: 0,
        overallDiscount: 0,
        summary: {
          totalOrders: 0,
          completedOrders: 0,
          pendingOrders: 0,
          cancelledOrders: 0,
          returnedOrders: 0,
          averageOrderValue: 0,
        },
      });
    }

    // Calculate statistics
    let overallSalesCount = 0;
    let overallOrderAmount = 0;
    let overallDiscount = 0;

    const formattedOrders = orders.map((order) => {
      // Calculate order totals
      if (order.status === "completed") {
        overallSalesCount++;
        overallOrderAmount += order.totalPrice || 0;
        overallDiscount += order.discountedAmount || 0;
      }

      return {
        _id: order._id,
        user: {
          fullname: order.user?.fullname || "N/A",
          email: order.user?.email,
          phone: order.user?.phone,
        },
        products: order.products.map((p) => ({
          name: p.product?.product || "Unknown",
          quantity: p.quantity || 1,
          price: p.product?.price || 0,
          status: p.status,
        })),
        totalPrice: order.totalPrice || 0,
        paymentMethod: order.paymentMethod,
        status: order.status,
        createdAt: order.createdAt,
        discountedAmount: order.discountedAmount || 0,
      };
    });

    const summary = {
      totalOrders: orders.length,
      completedOrders: orders.filter((o) => o.status === "completed").length,
      pendingOrders: orders.filter((o) => o.status === "pending").length,
      cancelledOrders: orders.filter((o) => o.status === "cancelled").length,
      returnedOrders: orders.filter((o) => o.status === "returned").length,
      averageOrderValue:
        overallSalesCount > 0
          ? (overallOrderAmount / overallSalesCount).toFixed(2)
          : 0,
    };

    res.status(200).json({
      orders: formattedOrders,
      overallSalesCount,
      overallOrderAmount,
      overallDiscount,
      summary,
    });
  } catch (error) {
    console.error("Error in getSalesReportData:", error);
    res.status(500).json({
      error: "Failed to generate report",
      details: error.message,
    });
  }
};

//function for download sales report as pdf
const downloadSalesReportPDF = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Validate dates
    if (!startDate || !endDate) {
      throw new Error('Start date and end date are required');
    }

    const orders = await Order.find({
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      },
      status: { $in: ['completed', 'returned'] }
    }).populate('products.product');

    const doc = new PDFDocument();
    const filename = `sales_report_${startDate}_to_${endDate}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    // Add report header
    doc.fontSize(20).text('Sales Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Period: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`, { align: 'center' });
    doc.moveDown();

    // Initialize totals
    let totalRevenue = 0;
    let totalOrders = orders.length;
    let totalProducts = 0;

    // Add orders table
    doc.fontSize(12).text('Order Details:', { underline: true });
    doc.moveDown();

    orders.forEach((order, index) => {
      try {
        // Safely calculate order totals
        const orderTotal = parseFloat(order.grandTotal) || 0;
        totalRevenue += orderTotal;
        totalProducts += order.products.length;

        // Add order information
        doc.text(`Order #${index + 1}`);
        doc.text(`Date: ${order.createdAt.toLocaleDateString()}`);
        doc.text(`Status: ${order.status}`);
        doc.text(`Total Amount: ${formatCurrency(orderTotal)}`);

        // Add products table
        order.products.forEach(product => {
          if (product.product) {
            const productTotal = parseFloat(product.price) * parseInt(product.quantity);
            doc.text(`  - ${product.product.product || 'Unknown Product'}`);
            doc.text(`    Quantity: ${product.quantity}`);
            doc.text(`    Price: ${formatCurrency(productTotal)}`);
          }
        });

        doc.moveDown();
      } catch (error) {
        console.error(`Error processing order ${order._id}:`, error);
      }
    });

    // Add summary
    doc.moveDown();
    doc.fontSize(14).text('Summary:', { underline: true });
    doc.fontSize(12);
    doc.text(`Total Orders: ${totalOrders}`);
    doc.text(`Total Products Sold: ${totalProducts}`);
    doc.text(`Total Revenue: ${formatCurrency(totalRevenue)}`);

    doc.end();

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error generating sales report',
      error: error.message 
    });
  }
};

const downloadSalesReportExcel = async (req, res) => {
  try {
    const startDate = new Date(req.query.startDate);
    const endDate = new Date(req.query.endDate);
    endDate.setDate(endDate.getDate() + 1);
    const orders = await Order.find({
      createdAt: { $gte: startDate, $lte: endDate },
      status: "completed",
    })
      .populate({
        path: "products.product",
        select: "product price category",
        model: "Product",
      })
      .populate({
        path: "user",
        select: "fullname email phone",
        model: "User",
      })
      .populate("coupon")
      .populate("address")
      .lean();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Report");

    const headerStyle = {
      font: { bold: true, size: 12 },
      fill: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      },
      alignment: { horizontal: "center", vertical: "middle" },
    };

    worksheet.mergeCells("A1:F1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "4WATCHES Sales Report";
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: "center" };

    worksheet.mergeCells("A2:F2");
    const periodCell = worksheet.getCell("A2");
    periodCell.value = `Period: ${startDate.toLocaleDateString(
      "en-IN"
    )} to ${endDate.toLocaleDateString("en-IN")}`;
    periodCell.alignment = { horizontal: "center" };

    const totalRevenue = orders.reduce(
      (sum, order) => sum + (order.totalPrice || 0),
      0
    );
    const totalDiscount = orders.reduce(
      (sum, order) => sum + (order.discountedAmount || 0),
      0
    );
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

    worksheet.addRow([]);
    worksheet.addRow(["Summary"]);
    worksheet.addRow(["Total Orders", orders.length]);
    worksheet.addRow([
      "Total Revenue",
      `₹${totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    ]);
    worksheet.addRow([
      "Total Discount",
      `₹${totalDiscount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    ]);
    worksheet.addRow([
      "Average Order Value",
      `₹${avgOrderValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    ]);
    worksheet.addRow([]);

    const headers = [
      "Order ID",
      "Customer Name",
      "Products",
      "Amount",
      "Payment Method",
      "Date",
    ];

    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    orders.forEach((order, index) => {
      const row = worksheet.addRow([
        order._id.toString(),
        order.user?.fullname || "N/A",
        order.products
          .map((p) => {
            if (p.product && p.product.product) {
              return `${p.product.product} (${p.quantity || 1})`;
            }
            return "Unknown Product";
          })
          .join(", "),
        `₹${order.totalPrice.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
        })}`,
        order.paymentMethod,
        new Date(order.createdAt).toLocaleDateString("en-IN"),
      ]);

      if (index % 2) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF9F9F9" },
          };
        });
      }

      // Center align cells
      row.eachCell((cell) => {
        cell.alignment = { vertical: "middle" };
      });
    });

    worksheet.getColumn(1).width = 30;
    worksheet.getColumn(2).width = 25;
    worksheet.getColumn(3).width = 40;
    worksheet.getColumn(4).width = 15;
    worksheet.getColumn(5).width = 20;
    worksheet.getColumn(6).width = 15;

    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    // Set response headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=sales_report.xlsx"
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generating Excel:", error);
    res.status(500).send("Error generating Excel report");
  }
};

//rendering admin Dashboard page
const adminDashboard = async (req, res) => {
  try {
    const { period } = req.query;
    let startDate, endDate;

    switch (period) {
      case "daily":
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        break;
      case "weekly":
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        endDate = new Date();
        break;
      case "monthly":
        startDate = new Date();
        startDate.setDate(1);
        endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(0);
        break;
      case "yearly":
        startDate = new Date();
        startDate.setMonth(0, 1);
        endDate = new Date();
        endDate.setMonth(11, 31);
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
      period: period,
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
  downloadSalesReportExcel,
};
