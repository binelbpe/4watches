const userModel = require("../../models/userModel");
const Order = require("../../models/orderModel");
const Category = require("../../models/catergoryModel");
const Product = require("../../models/productModel");
const PDFDocument = require("pdfkit");
const Coupon = require("../../models/couponModel");
const ExcelJS = require("exceljs");
const bcrypt = require("bcrypt");
const path = require("path");

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

    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      bufferPages: true,
      autoFirstPage: false,
    });

    // Add first page
    doc.addPage();

    const formatCurrency = (amount) => {
      return `Rs. ${amount.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
      })}`;
    };

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=sales_report.pdf"
    );
    doc.pipe(res);

    doc
      .image("public/images/logo.png", 50, 45, { width: 50 })
      .fontSize(22)
      .font("Helvetica-Bold")
      .text("4WATCHES", 110, 50)
      .fontSize(16)
      .font("Helvetica")
      .text("Sales Report", 110, 75)
      .moveDown();

    doc
      .fontSize(12)
      .text("Report Period:", 50, 120)
      .font("Helvetica-Bold")
      .text(
        `${startDate.toLocaleDateString(
          "en-IN"
        )} to ${endDate.toLocaleDateString("en-IN")}`,
        150,
        120
      )
      .moveDown(2);

    const totalRevenue = orders.reduce(
      (sum, order) => sum + (order.totalPrice || 0),
      0
    );
    const totalDiscount = orders.reduce(
      (sum, order) => sum + (order.discountedAmount || 0),
      0
    );
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

    const summaryY = doc.y + 20;

    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .text("Summary", 50, summaryY)
      .moveDown();

    const summaryBoxes = [
      { label: "Total Orders", value: orders.length },
      { label: "Total Revenue", value: formatCurrency(totalRevenue) },
      { label: "Total Discount", value: formatCurrency(totalDiscount) },
      { label: "Average Order Value", value: formatCurrency(avgOrderValue) },
    ];

    let boxY = doc.y;
    summaryBoxes.forEach((box, index) => {
      const boxX = 50 + (index % 2) * 250;
      if (index % 2 === 0 && index > 0) boxY += 80;

      doc
        .rect(boxX, boxY, 200, 60)
        .stroke()
        .fontSize(12)
        .font("Helvetica")
        .text(box.label, boxX + 10, boxY + 10)
        .font("Helvetica-Bold")
        .fontSize(14)
        .text(box.value, boxX + 10, boxY + 30);
    });

    // Calculate space needed for order details
    const remainingSpace = doc.page.height - (boxY + 150); // Increased margin for safety

    let currentY;
    if (remainingSpace >= 200) {
      doc.moveDown(2);
      currentY = doc.y;
    } else {
      doc.addPage();
      currentY = 50;
    }

    // Add order details header
    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .text("Order Details", 50, currentY)
      .moveDown();

    // Table headers
    const tableHeaders = ["Order ID", "Customer", "Products", "Amount", "Date"];
    const columnWidths = [80, 120, 160, 80, 80];

    // Draw header background
    doc.rect(50, doc.y, 520, 20).fill("#f4f4f4");

    // Add headers
    let xPos = 50;
    doc.fontSize(10).fill("#000000");
    tableHeaders.forEach((header, i) => {
      doc.text(header, xPos + 5, doc.y - 15, { width: columnWidths[i] });
      xPos += columnWidths[i];
    });

    doc.moveDown();

    // Track the last used Y position
    let lastUsedY = doc.y;
    let currentPage = 0;

    // Process orders
    orders.forEach((order, index) => {
      const productsText = order.products
        .map((p) => {
          if (p.product && p.product.product) {
            return `${p.product.product} (${p.quantity || 1})`;
          }
          return "Unknown Product";
        })
        .join("\n");

      const productsHeight = doc.heightOfString(productsText, {
        width: 160,
        align: "left",
      });

      const rowHeight = Math.max(30, productsHeight + 10);

      // Check if we need a new page
      if (lastUsedY + rowHeight > doc.page.height - 100) {
        doc.addPage();
        currentPage++;

        // Redraw headers on new page
        doc.rect(50, 50, 520, 20).fill("#f4f4f4");

        xPos = 50;
        doc.fontSize(10).fill("#000000");
        tableHeaders.forEach((header, i) => {
          doc.text(header, xPos + 5, 55, { width: columnWidths[i] });
          xPos += columnWidths[i];
        });

        lastUsedY = 80;
      }

      // Draw row
      if (index % 2 === 0) {
        doc.rect(50, lastUsedY, 520, rowHeight).fill("#f9f9f9");
      }

      // Add row content
      const verticalPadding = (rowHeight - 10) / 2;
      doc.fill("#000000");

      doc.text(
        order._id.toString().slice(-8),
        55,
        lastUsedY + verticalPadding,
        { width: 70 }
      );

      doc.text(
        order.user?.fullname || "N/A",
        130,
        lastUsedY + verticalPadding,
        { width: 110 }
      );

      doc.text(productsText, 250, lastUsedY + 5, {
        width: 160,
        align: "left",
        lineGap: 2,
      });

      doc.text(
        formatCurrency(order.totalPrice),
        410,
        lastUsedY + verticalPadding,
        { width: 80 }
      );

      // Date
      doc.text(
        new Date(order.createdAt).toLocaleDateString("en-IN"),
        490,
        lastUsedY + verticalPadding,
        { width: 80 }
      );

      // Draw cell borders
      doc.rect(50, lastUsedY, 520, rowHeight).stroke("#dddddd");
      [80, 120, 160, 80, 80].reduce((x, width) => {
        doc
          .moveTo(x + width, lastUsedY)
          .lineTo(x + width, lastUsedY + rowHeight)
          .stroke("#dddddd");
        return x + width;
      }, 50);

      // Update last used Y position
      lastUsedY += rowHeight;
    });

    doc.end();
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).send("Error generating PDF report");
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
