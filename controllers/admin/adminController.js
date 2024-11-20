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

// Add this helper function at the top
const formatCurrencyForExcel = (amount) => {
  if (amount === undefined || amount === null) {
    return '₹0.00';
  }
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numericAmount)) {
    return '₹0.00';
  }
  return `₹${numericAmount.toFixed(2)}`;
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
      status: { $in: ['completed', 'returned'] }  // Include only completed and returned orders
    })
      .populate({
        path: "products.product",
        select: "product price category",
      })
      .populate("user", "fullname email phone")
      .populate("coupon")
      .lean();

    // Calculate totals
    const totals = orders.reduce((acc, order) => {
      // Calculate order subtotal
      const subtotal = order.subtotal || 0;
      
      // Get discounts
      const couponDiscount = order.couponDiscount || 0;
      const walletDiscount = order.walletAmountUsed || 0;
      const totalDiscount = couponDiscount + walletDiscount;
      
      // Get tax and shipping
      const tax = order.tax || 0;
      const shipping = order.shipping || 0;

      // Calculate total products in order
      const productCount = order.products.reduce((sum, product) => sum + (product.quantity || 0), 0);

      return {
        totalRevenue: acc.totalRevenue + (order.totalPaid || 0),
        totalSubtotal: acc.totalSubtotal + subtotal,
        totalTax: acc.totalTax + tax,
        totalShipping: acc.totalShipping + shipping,
        totalCouponDiscount: acc.totalCouponDiscount + couponDiscount,
        totalWalletDiscount: acc.totalWalletDiscount + walletDiscount,
        totalDiscount: acc.totalDiscount + totalDiscount,
        orderCount: acc.orderCount + 1,
        productCount: acc.productCount + productCount
      };
    }, {
      totalRevenue: 0,
      totalSubtotal: 0,
      totalTax: 0,
      totalShipping: 0,
      totalCouponDiscount: 0,
      totalWalletDiscount: 0,
      totalDiscount: 0,
      orderCount: 0,
      productCount: 0
    });

    // Format orders for display
    const formattedOrders = orders.map(order => ({
      _id: order._id,
      user: {
        fullname: order.user?.fullname || 'N/A',
        email: order.user?.email,
        phone: order.user?.phone
      },
      products: order.products.map(p => ({
        name: p.product?.product || 'Unknown',
        quantity: p.quantity || 0,
        price: p.price || 0,
        status: p.status
      })),
      subtotal: order.subtotal || 0,
      tax: order.tax || 0,
      shipping: order.shipping || 0,
      couponDiscount: order.couponDiscount || 0,
      walletAmountUsed: order.walletAmountUsed || 0,
      totalPaid: order.totalPaid || 0,
      paymentMethod: order.paymentMethod,
      status: order.status,
      createdAt: order.createdAt
    }));

    res.status(200).json({
      orders: formattedOrders,
      summary: {
        totalOrders: totals.orderCount,
        totalProducts: totals.productCount,
        totalRevenue: totals.totalRevenue,
        totalSubtotal: totals.totalSubtotal,
        totalTax: totals.totalTax,
        totalShipping: totals.totalShipping,
        totalCouponDiscount: totals.totalCouponDiscount,
        totalWalletDiscount: totals.totalWalletDiscount,
        totalDiscount: totals.totalDiscount,
        averageOrderValue: totals.orderCount > 0 ? 
          totals.totalRevenue / totals.orderCount : 0
      }
    });

  } catch (error) {
    console.error("Error in getSalesReportData:", error);
    res.status(500).json({
      error: "Failed to generate report",
      details: error.message
    });
  }
};

//function for download sales report as pdf
const downloadSalesReportPDF = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const orders = await Order.find({
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      },
      status: { $in: ['completed', 'returned'] }
    })
    .populate('products.product')
    .populate('user', 'fullname')
    .populate('coupon', 'code discountType discountAmount')
    .lean();

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      bufferPages: true
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=sales_report_${startDate}_to_${endDate}.pdf`);
    doc.pipe(res);

    // Add header
    doc.fontSize(20).text('4WATCHES Sales Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Period: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(2);

    // Calculate totals
    const totals = orders.reduce((acc, order) => ({
      revenue: acc.revenue + (order.totalPaid || 0),
      subtotal: acc.subtotal + (order.subtotal || 0),
      tax: acc.tax + (order.tax || 0),
      shipping: acc.shipping + (order.shipping || 0),
      couponDiscount: acc.couponDiscount + (order.couponDiscount || 0),
      walletDiscount: acc.walletDiscount + (order.walletAmountUsed || 0)
    }), {
      revenue: 0, subtotal: 0, tax: 0, shipping: 0, couponDiscount: 0, walletDiscount: 0
    });

    // Add summary section
    doc.fontSize(14).text('Summary', { underline: true });
    doc.fontSize(10);
    doc.text(`Total Orders: ${orders.length}`);
    doc.text(`Total Revenue: ${formatCurrency(totals.revenue)}`);
    doc.text(`Total Discounts: ${formatCurrency(totals.couponDiscount + totals.walletDiscount)}`);
    doc.text(`- Coupon Discounts: ${formatCurrency(totals.couponDiscount)}`);
    doc.text(`- Wallet Discounts: ${formatCurrency(totals.walletDiscount)}`);
    doc.moveDown(2);

    // Add orders table
    doc.fontSize(14).text('Order Details', { underline: true });
    doc.moveDown();

    // Define table columns
    const tableTop = doc.y;
    const columns = {
      order: { x: 50, width: 80 },
      customer: { x: 130, width: 80 },
      products: { x: 210, width: 120 },
      amount: { x: 330, width: 80 },
      discount: { x: 410, width: 80 },
      total: { x: 490, width: 70 }
    };

    // Draw table header
    doc.fontSize(8);
    drawTableRow(doc, {
      order: 'Order ID',
      customer: 'Customer',
      products: 'Products',
      amount: 'Amount',
      discount: 'Discount',
      total: 'Total Paid'
    }, tableTop, columns, true);

    let y = tableTop + 20;

    // Draw order rows
    orders.forEach((order, index) => {
      // Check if we need a new page
      if (y > doc.page.height - 100) {
        doc.addPage();
        y = 50;
        // Redraw header on new page
        drawTableRow(doc, {
          order: 'Order ID',
          customer: 'Customer',
          products: 'Products',
          amount: 'Amount',
          discount: 'Discount',
          total: 'Total Paid'
        }, y, columns, true);
        y += 20;
      }

      const productsList = order.products
        .map(p => `${p.product?.product || 'Unknown'} (${p.quantity})`)
        .join(', ');

      const discountDetails = [];
      if (order.couponDiscount > 0) {
        discountDetails.push(`Coupon: ${formatCurrency(order.couponDiscount)}`);
      }
      if (order.walletAmountUsed > 0) {
        discountDetails.push(`Wallet: ${formatCurrency(order.walletAmountUsed)}`);
      }

      drawTableRow(doc, {
        order: order._id.toString().slice(-6),
        customer: order.user?.fullname || 'N/A',
        products: productsList,
        amount: formatCurrency(order.subtotal),
        discount: discountDetails.join('\n') || 'None',
        total: formatCurrency(order.totalPaid)
      }, y, columns);

      y += 30;
    });

    // Add footer
    doc.fontSize(8)
       .text('Generated on: ' + new Date().toLocaleString(), 50, doc.page.height - 50);

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

// Helper function to draw table rows
function drawTableRow(doc, data, y, columns, isHeader = false) {
  const height = 20;
  
  // Draw background for header
  if (isHeader) {
    doc.fillColor('#f0f0f0')
       .rect(50, y, 510, height)
       .fill()
       .fillColor('#000');
  }

  // Draw cell borders and content
  Object.keys(columns).forEach(key => {
    const column = columns[key];
    
    // Draw cell border
    doc.rect(column.x, y, column.width, height).stroke();
    
    // Draw cell content
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
       .fontSize(8)
       .text(
         data[key],
         column.x + 2,
         y + 2,
         {
           width: column.width - 4,
           height: height - 4,
           lineBreak: true
         }
       );
  });
}

const downloadSalesReportExcel = async (req, res) => {
  try {
    const startDate = new Date(req.query.startDate);
    const endDate = new Date(req.query.endDate);
    endDate.setDate(endDate.getDate() + 1);
    
    const orders = await Order.find({
      createdAt: { $gte: startDate, $lte: endDate },
      status: { $in: ['completed', 'returned'] }
    }).populate([
      {
        path: "products.product",
        select: "product price category"
      },
      {
        path: "user",
        select: "fullname email phone"
      },
      {
        path: "coupon",
        select: "code discountType discountAmount"
      }
    ]).lean();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Report");

    // Calculate totals
    const totals = orders.reduce((acc, order) => ({
      revenue: acc.revenue + (order.totalPaid || 0),
      subtotal: acc.subtotal + (order.subtotal || 0),
      tax: acc.tax + (order.tax || 0),
      shipping: acc.shipping + (order.shipping || 0),
      couponDiscount: acc.couponDiscount + (order.couponDiscount || 0),
      walletDiscount: acc.walletDiscount + (order.walletAmountUsed || 0),
      orderCount: acc.orderCount + 1,
      productCount: acc.productCount + order.products.length
    }), {
      revenue: 0, subtotal: 0, tax: 0, shipping: 0,
      couponDiscount: 0, walletDiscount: 0,
      orderCount: 0, productCount: 0
    });

    // Define columns
    worksheet.columns = [
      { header: 'Order ID', key: 'orderId', width: 25 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Customer', key: 'customer', width: 20 },
      { header: 'Products', key: 'products', width: 40 },
      { header: 'Subtotal', key: 'subtotal', width: 15 },
      { header: 'Tax', key: 'tax', width: 15 },
      { header: 'Shipping', key: 'shipping', width: 15 },
      { header: 'Coupon Code', key: 'couponCode', width: 15 },
      { header: 'Coupon Discount', key: 'couponDiscount', width: 15 },
      { header: 'Wallet Used', key: 'walletUsed', width: 15 },
      { header: 'Total Paid', key: 'totalPaid', width: 15 }
    ];

    // Add title
    worksheet.mergeCells('A1:K1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = '4WATCHES Sales Report';
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: 'center' };

    // Add date range
    worksheet.mergeCells('A2:K2');
    const dateCell = worksheet.getCell('A2');
    dateCell.value = `Period: ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;
    dateCell.alignment = { horizontal: 'center' };

    // Add summary section
    worksheet.addRow([]);
    worksheet.addRow(['Summary']);
    worksheet.addRow(['Total Orders', totals.orderCount]);
    worksheet.addRow(['Total Products Sold', totals.productCount]);
    worksheet.addRow(['Total Revenue', formatCurrencyForExcel(totals.revenue)]);
    worksheet.addRow(['Total Subtotal', formatCurrencyForExcel(totals.subtotal)]);
    worksheet.addRow(['Total Tax', formatCurrencyForExcel(totals.tax)]);
    worksheet.addRow(['Total Shipping', formatCurrencyForExcel(totals.shipping)]);
    worksheet.addRow(['Total Coupon Discounts', formatCurrencyForExcel(totals.couponDiscount)]);
    worksheet.addRow(['Total Wallet Discounts', formatCurrencyForExcel(totals.walletDiscount)]);
    worksheet.addRow([]);

    // Add header row
    const headerRow = worksheet.addRow(worksheet.columns.map(col => col.header));
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center' };
    });

    // Add order data
    orders.forEach(order => {
      const row = worksheet.addRow({
        orderId: order._id.toString(),
        date: new Date(order.createdAt).toLocaleDateString(),
        customer: order.user?.fullname || 'N/A',
        products: order.products.map(p => 
          `${p.product?.product || 'Unknown'} (${p.quantity})`
        ).join(', '),
        subtotal: formatCurrencyForExcel(order.subtotal),
        tax: formatCurrencyForExcel(order.tax),
        shipping: formatCurrencyForExcel(order.shipping),
        couponCode: order.coupon?.code || 'None',
        couponDiscount: formatCurrencyForExcel(order.couponDiscount),
        walletUsed: formatCurrencyForExcel(order.walletAmountUsed),
        totalPaid: formatCurrencyForExcel(order.totalPaid)
      });

      // Center align cells
      row.eachCell((cell) => {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
    });

    // Style improvements
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 
      `attachment; filename=sales_report_${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}.xlsx`
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error("Error generating Excel:", error);
    res.status(500).json({
      error: "Failed to generate Excel report",
      details: error.message
    });
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
