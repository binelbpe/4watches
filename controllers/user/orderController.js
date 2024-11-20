const mongoose = require("mongoose");
const Order = require("../../models/orderModel");
const Product = require("../../models/productModel");
const User = require("../../models/userModel");
const Address = require("../../models/addressModel");
const Coupon = require("../../models/couponModel");
const razorpay = require("../../helpers/razorpay");
const Wallet = require("../../models/walletModel");
const Cart = require("../../models/addtocartModel");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const ITEMS_PER_PAGE = 5; // Number of orders per page
const walletHelper = require('../../utils/walletHelper');

// Add this helper function at the top of orderController.js
const calculateOrderPrices = (order) => {
  // Base subtotal (before tax and shipping)
  const subtotal = order.products.reduce((sum, item) => {
    return sum + (item.product?.price || 0) * item.quantity;
  }, 0);

  // Calculate tax (5% of subtotal)
  const tax = subtotal * 0.05;

  // Fixed shipping
  const shipping = 45;

  // Get discounts and wallet amounts
  const couponDiscount = order.couponDiscount || 0;
  const walletAmount = order.walletAmountUsed || 0;

  // Calculate grand total
  const grandTotal = subtotal + tax + shipping - couponDiscount;

  // Calculate final amount after wallet
  const finalAmount = grandTotal - walletAmount;

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    tax: parseFloat(tax.toFixed(2)),
    shipping,
    couponDiscount: parseFloat(couponDiscount.toFixed(2)),
    walletAmount: parseFloat(walletAmount.toFixed(2)),
    grandTotal: parseFloat(grandTotal.toFixed(2)),
    finalAmount: parseFloat(finalAmount.toFixed(2))
  };
};

// Keep this at the top with other helper functions
const calculateOrderAmounts = (items, discountAmount = 0, walletAmount = 0, hasAddress = true) => {
  try {
    // If no address, throw error
    if (!hasAddress) {
      throw new Error('Please add a shipping address before applying coupon');
    }

    // Parse inputs to ensure they are numbers
    const parsedDiscountAmount = parseFloat(discountAmount || 0);
    const parsedWalletAmount = parseFloat(walletAmount || 0);

    // Safely calculate base subtotal
    const subtotal = items.reduce((sum, item) => {
      // Handle both possible cart item structures
      const price = parseFloat(item.product?.price || item.price || 0);
      const quantity = parseInt(item.quantity || 1);
      return sum + (price * quantity);
    }, 0);

    // Calculate tax (5% of subtotal)
    const tax = subtotal * 0.05;

    // Fixed shipping
    const shipping = 45;

    // Apply discount if any
    const afterDiscount = subtotal - parsedDiscountAmount;

    // Calculate grand total
    const grandTotal = afterDiscount + tax + shipping;

    // Calculate wallet usage
    let walletUsed = 0;
    let remainingAmount = grandTotal;

    if (parsedWalletAmount > 0) {
      walletUsed = Math.min(parsedWalletAmount, grandTotal);
      remainingAmount = grandTotal - walletUsed;
    }

    // Return all amounts formatted to 2 decimal places
    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      shipping,
      discountAmount: parseFloat(parsedDiscountAmount.toFixed(2)),
      walletUsed: parseFloat(walletUsed.toFixed(2)),
      grandTotal: parseFloat(grandTotal.toFixed(2)),
      remainingAmount: parseFloat(remainingAmount.toFixed(2))
    };
  } catch (error) {
    console.error('Error in calculateOrderAmounts:', error);
    throw error;
  }
};

//function for rendering user order list
const renderOrderListPage = async (req, res) => {
  try {
    const userId = req.session.userData._id;
    const fullName = req.session.userData.fullname;
    let page = +req.query.page || 1;
    const ITEMS_PER_PAGE = 9;

    const totalOrders = await Order.countDocuments({ user: userId });
    const totalPages = Math.ceil(totalOrders / ITEMS_PER_PAGE);

    // Ensure page number is within valid range
    page = Math.max(1, Math.min(page, totalPages));

    const skipValue = (page - 1) * ITEMS_PER_PAGE;

    const orders = await Order.find({ user: userId })
      .populate("address")
      .populate({
        path: "products.product",
        select: "product price image status stock",
        // Add this to handle deleted products
        match: { $or: [{ status: true }, { status: false }] }
      })
      .sort({ createdAt: -1 })
      .skip(skipValue)
      .limit(ITEMS_PER_PAGE);

    // Process orders to handle deleted products
    const processedOrders = orders.map(order => {
      const processedProducts = order.products.map(product => {
        if (!product.product) {
          // If product is deleted, return a placeholder object
          return {
            ...product,
            product: {
              product: 'Product No Longer Available',
              price: 0,
              image: [{ path: '/images/placeholder.jpg' }],
              status: false
            }
          };
        }
        return product;
      });

      const orderObj = order.toObject();
      return {
        ...orderObj,
        products: processedProducts,
        prices: calculateOrderPrices(orderObj)
      };
    });

    res.render("userOrderList", {
      orders: processedOrders,
      fullName,
      currentPage: page,
      totalPages,
      calculateOrderPrices,
      RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error("Error rendering order list page:", error);
    res.status(500).render("error", {
      error,
      message: "Error loading orders",
      fullName: req.session?.userData?.fullName
    });
  }
};

const cancelOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId).session(session);

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status === "cancelled") {
      throw new Error("Order is already cancelled");
    }

    if (order.status === "completed") {
      throw new Error("Completed orders cannot be cancelled");
    }

    // Update order status to "cancelled"
    order.status = "cancelled";
    order.products.forEach((product) => {
      if (product.status === "pending") {
        product.status = "cancelled";
      }
    });

    // Restore product quantities
    await Promise.all(
      order.products.map(async (orderItem) => {
        if (orderItem.status === "cancelled") {
          await Product.findByIdAndUpdate(
            orderItem.product,
            { $inc: { stock: orderItem.quantity } },
            { session }
          );
        }
      })
    );

    // Process refund if applicable
    if (order.paymentMethod !== "cash_on_delivery") {
      const user = await User.findById(req.session.userData._id)
        .populate("wallet")
        .session(session);

      if (!user || !user.wallet) {
        throw new Error("User wallet not found");
      }

      // Calculate refund amount
      const refundAmount = parseFloat(order.grandTotal);
      if (isNaN(refundAmount)) {
        throw new Error("Invalid refund amount");
      }

      // Update wallet balance
      const currentBalance = parseFloat(user.wallet.balance);
      const newBalance = currentBalance + refundAmount;
      
      if (isNaN(newBalance)) {
        throw new Error("Invalid wallet balance calculation");
      }

      user.wallet.balance = newBalance.toFixed(2);

      // Add transaction record
      user.wallet.transactions.push({
        type: "credit",
        amount: refundAmount,
        description: `Refund for cancelled order ${order._id}`,
      });

      await user.wallet.save({ session });
    }

    await order.save({ session });
    await session.commitTransaction();

    res.redirect("/orders");

  } catch (error) {
    await session.abortTransaction();
    console.error("Error cancelling order:", error);
    req.flash('error', error.message || 'Failed to cancel order');
    res.redirect("/orders");
  } finally {
    session.endSession();
  }
};

//function for view address list in checkout page
const orderviewaddresses = async (req, res) => {
  try {
    const userId = req.session.userData ? req.session.userData._id : null;
    if (!userId) {
      return res.status(403).redirect("/login");
    }
    const user = await User.findById(userId).populate("addresses");

    // Extract addresses from the user object
    const addresses = user.addresses;
    let fullName = user.fullname;
    res.render("orderviewaddresses", { fullName, addresses });
  } catch (error) {
    console.error("Error rendering  page:", error);
    res.status(500).send("Internal Server Error");
  }
};

//function for add address in checkout page
const addAddressorder = async (req, res) => {
  try {
    const { address, addressline2, city, state, pincode } = req.body;
    const userId = req.session.userData ? req.session.userData._id : null;

    if (!userId) {
      return res.status(403).redirect("/login");
    }

    const user = await User.findById(userId).populate("addresses");
    const isFirstAddress = !user.addresses || user.addresses.length === 0;
    const newAddress = new Address({
      address,
      addressline2,
      city,
      state,
      pincode,
      status: isFirstAddress,
    });

    await newAddress.save();
    // Add the new address to the user's addresses array
    await User.findByIdAndUpdate(userId, {
      $push: { addresses: newAddress._id },
    });

    res.redirect("/orderviewaddresses");
  } catch (error) {
    console.error("Error adding address:", error);
    res.status(500).json({ error: "Failed to add address" });
  }
};
//function for cancxel the product in an order
const cancelProduct = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findById(req.params.orderId)
      .populate('products.product')
      .session(session);

    if (!order) {
      throw new Error('Order not found');
    }

    const productId = req.params.productId;
    const orderProduct = order.products.find(p => 
      p.product._id.toString() === productId && 
      p.status === 'pending'
    );

    if (!orderProduct) {
      throw new Error('Product cannot be cancelled');
    }

    // Calculate refund amount
    const productTotal = orderProduct.product.price * orderProduct.quantity;
    const orderTotal = order.products.reduce((sum, p) => 
      sum + (p.product.price * p.quantity), 0
    );

    // Calculate proportional discount if any
    let discountShare = 0;
    if (order.couponDiscount > 0) {
      discountShare = order.couponDiscount * (productTotal / orderTotal);
    }

    // Calculate tax
    const afterDiscount = productTotal - discountShare;
    const tax = afterDiscount * 0.05;

    // Add shipping only if it's the last active product
    const remainingProducts = order.products.filter(p => 
      p.status !== 'cancelled' && p.status !== 'returned'
    ).length;
    const shipping = remainingProducts === 1 ? 45 : 0;

    const refundAmount = afterDiscount + tax + shipping;

    // Update product status and stock
    orderProduct.status = 'cancelled';
    await Product.findByIdAndUpdate(
      productId,
      { $inc: { stock: orderProduct.quantity } },
      { session }
    );

    // Process refund if payment was made
    if (order.paymentMethod !== 'cash_on_delivery') {
      const user = await User.findById(order.user)
        .populate('wallet')
        .session(session);

      if (!user.wallet) {
        throw new Error('User wallet not found');
      }

      // Credit refund to wallet
      await user.wallet.creditBalance(
        refundAmount,
        `Refund for cancelled product in order ${order._id}`
      );
    }

    // Check if all products are cancelled
    const allCancelled = order.products.every(p => 
      p.status === 'cancelled' || p.status === 'returned'
    );
    if (allCancelled) {
      order.status = 'cancelled';
    }

    await order.save({ session });
    await session.commitTransaction();

    res.redirect('/orders');

  } catch (error) {
    await session.abortTransaction();
    console.error('Error cancelling product:', error);
    req.flash('error', error.message || 'Failed to cancel product');
    res.redirect('/orders');
  } finally {
    session.endSession();
  }
};

//function for generate order return request
const returnOrderRequest = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);

    if (!order) {
      throw new Error("Order not found");
    }

    // Validate return eligibility
    if (order.status !== "completed") {
      throw new Error("Only completed orders can be returned");
    }

    // Check return window (7 days)
    const returnWindow = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - order.createdAt.getTime() > returnWindow) {
      throw new Error("Return window has expired");
    }

    // Update status to returnrequest - actual return happens after admin approval
    order.status = "returnrequest";
    order.products.forEach((product) => {
      if (product.status === "completed") {
        product.status = "returnrequest";
      }
    });

    await order.save();
    return res.status(200).redirect("/orders");
  } catch (error) {
    console.error("Return request error:", error);
    return res.status(400).json({ error: error.message });
  }
};

//function for generate product return request
const returnProductRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findById(req.params.orderId)
      .populate('products.product')
      .session(session);

    if (!order) {
      throw new Error('Order not found');
    }

    // Check if order can be returned using model method
    if (!order.canBeReturned()) {
      throw new Error('Order is not eligible for return');
    }

    const productId = req.params.productId;
    const product = order.products.find(p => 
      p.product._id.toString() === productId && 
      p.status === 'completed'
    );

    if (!product) {
      throw new Error('Product cannot be returned');
    }

    // Update product status to return request
    product.status = 'returnrequest';

    // Check if this is the last active product
    const remainingActiveProducts = order.products.filter(
      p => p.status === 'completed'
    );

    // If this was the last active product, update order status
    if (remainingActiveProducts.length === 0) {
      order.status = 'returnrequest';
    }

    await order.save({ session });
    await session.commitTransaction();

    res.redirect('/orders');
  } catch (error) {
    await session.abortTransaction();
    console.error('Error requesting return:', error);
    req.flash('error', error.message || 'Failed to request return');
    res.redirect('/orders');
  } finally {
    session.endSession();
  }
};

const placeOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!req.session.userData) {
      throw new Error('Authentication required');
    }

    const userId = req.session.userData._id;
    const user = await User.findById(userId)
      .populate('wallet')
      .populate({
        path: "addresses",
        match: { status: true },
      })
      .session(session);

    if (!user || !user.addresses.length) {
      throw new Error('No delivery address found');
    }

    const cart = req.session.cart;
    if (!cart || !cart.length) {
      throw new Error('Cart is empty');
    }

    // Get payment details from request
    const { paymentMethod, useWallet, coupon } = req.body;

    // Calculate all amounts
    const amounts = calculateOrderAmounts(
      cart,
      req.body.discountedAmount,
      useWallet ? user.wallet.balance : 0
    );

    // Validate payment method specific conditions
    if (paymentMethod === 'cash_on_delivery' && amounts.grandTotal > 1000) {
      throw new Error('Cash on delivery not available for orders above ₹1000');
    }

    // Handle wallet payment if used
    if (useWallet && amounts.walletUsed > 0) {
      await walletHelper.processWalletTransaction(
        userId,
        amounts.walletUsed,
        'debit',
        'Order payment',
        session
      );
    }

    // Create order with proper amounts
    const orderData = {
      user: userId,
      products: cart.map(item => ({
        product: item.product?._id || item._id,
        quantity: item.quantity,
        price: item.product?.price || item.price,
        status: 'pending'
      })),
      subtotal: amounts.subtotal,
      tax: amounts.tax,
      shipping: amounts.shipping,
      couponDiscount: amounts.discountAmount,
      walletAmountUsed: amounts.walletUsed,
      onlinePaymentAmount: amounts.remainingAmount,
      grandTotal: amounts.grandTotal,
      totalPaid: amounts.remainingAmount + amounts.walletUsed,
      paymentMethod: paymentMethod,
      address: user.addresses[0]._id,
      coupon: coupon ? (await Coupon.findOne({ code: coupon }))._id : null,
      status: 'pending'
    };

    const order = await Order.create([orderData], { session });

    // Update product stock
    await Promise.all(cart.map(async (item) => {
      const productId = item.product?._id || item._id;
      await Product.findByIdAndUpdate(
        productId,
        { $inc: { stock: -(item.quantity) } },
        { session }
      );
    }));

    // Clear cart
    req.session.cart = [];
    await Cart.findOneAndUpdate(
      { userId },
      { cartItems: [] },
      { session }
    );

    await session.commitTransaction();

    // Render success page
    return res.render('orderSuccess', {
      order: order[0],
      fullName: req.session?.userData?.fullName,
      autoRedirect: true
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error placing order:', error);
    return res.render('orderFailure', {
      error: { message: error.message || 'Error processing order' },
      errorMessage: 'There was an issue placing your order',
      fullName: req.session?.userData?.fullName,
      autoRedirect: true
    });
  } finally {
    session.endSession();
  }
};

//function for placing new order using online payment
const processpayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!req.session.userData || !req.session.userData._id) {
      throw new Error('User authentication required');
    }

    const userId = req.session.userData._id;
    const user = await User.findById(userId)
      .populate('wallet')
      .populate({
        path: "addresses",
        match: { status: true },
      })
      .session(session);

    if (!user || !user.wallet) {
      throw new Error('User or wallet not found');
    }

    // Calculate cart total (sum of product prices * quantities)
    const cartTotal = req.session.cart.reduce((total, item) => {
      return total + (parseFloat(item.product?.price || item.price) * parseInt(item.quantity));
    }, 0);

    // Get discount amount if any
    const processOrder = req.session.orderRazerpay;
    const discountAmount = parseFloat(processOrder?.discountedAmount || 0);

    // Calculate amounts
    const subtotal = cartTotal;
    const tax = subtotal * 0.05; // 5% tax
    const shipping = 45; // Fixed shipping charge
    
    // Calculate total after discount
    const afterDiscount = subtotal - discountAmount;
    const totalWithTaxAndShipping = afterDiscount + tax + shipping;

    // Get the actual paid amount from Razorpay
    const paidAmount = parseFloat(processOrder.amount || 0);

    // Calculate wallet amount needed (if any)
    const walletAmountNeeded = totalWithTaxAndShipping - paidAmount;
console.log(walletAmountNeeded);
console.log(user.wallet.balance);
    // Verify and process wallet payment if needed
    if (walletAmountNeeded > 0) {
      if (user.wallet.balance < walletAmountNeeded.toFixed(2)) {
        throw new Error('Insufficient wallet balance');
      }

      // Deduct from wallet
      user.wallet.balance = (parseFloat(user.wallet.balance) - walletAmountNeeded.toFixed(2)).toFixed(2);

      // Add transaction record
      user.wallet.transactions.push({
        type: 'debit',
        amount: walletAmountNeeded,
        description: `Partial payment for order using wallet balance`
      });

      await user.wallet.save({ session });
    }

    // Create order with proper amounts
    const orderData = {
      user: userId,
      products: req.session.cart.map(item => ({
        product: item.product?._id || item._id,
        quantity: parseInt(item.quantity),
        price: parseFloat(item.product?.price || item.price),
        status: 'pending'
      })),
      subtotal: subtotal,
      tax: tax.toFixed(2),
      shipping: shipping,
      couponDiscount: discountAmount,
      walletAmountUsed: walletAmountNeeded > 0 ? walletAmountNeeded.toFixed(2) : 0,
      onlinePaymentAmount: paidAmount.toFixed(2),
      grandTotal: totalWithTaxAndShipping.toFixed(2),
      totalPaid: (paidAmount + (walletAmountNeeded > 0 ? walletAmountNeeded : 0)).toFixed(2),
      paymentMethod: walletAmountNeeded > 0 ? 'wallet_and_online' : 'pay_on_online',
      address: user.addresses[0]._id,
      status: 'pending'
    };

    // Verify total paid matches required amount
    if (parseFloat(orderData.totalPaid) !== parseFloat(orderData.grandTotal)) {
      throw new Error('Payment amount mismatch');
    }

    // Handle coupon if used
    if (processOrder.coupon) {
      const coupon = await Coupon.findOne({ code: processOrder.coupon }).session(session);
      if (coupon) {
        orderData.coupon = coupon._id;
        if (coupon.oncePerUser) {
          await User.findByIdAndUpdate(
            userId,
            { $push: { usedCoupons: coupon._id } },
            { session }
          );
        }
      }
    }

    // Create order
    const order = await Order.create([orderData], { session });

    // Update product stock
    await Promise.all(req.session.cart.map(async (item) => {
      const productId = item.product?._id || item._id;
      await Product.findByIdAndUpdate(
        productId,
        { $inc: { stock: -parseInt(item.quantity) } },
        { session }
      );
    }));

    // Clear cart
    req.session.cart = [];
    await Cart.findOneAndUpdate(
      { userId },
      { cartItems: [] },
      { session }
    );

    await session.commitTransaction();

    return res.render('orderSuccess', {
      order: order[0],
      fullName: req.session?.userData?.fullName,
      autoRedirect: true
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error processing payment:', error);
    
    return res.render('orderFailure', {
      error: { 
        message: error.message || 'Payment processing failed',
        details: error.stack
      },
      errorMessage: 'There was an issue with your payment',
      fullName: req.session?.userData?.fullName,
      autoRedirect: true
    });
  } finally {
    session.endSession();
  }
};

//function for create order for razor pay
const createorder = async (req, res) => {
  try {
    const { amount, orderRazerpay } = req.body;
    
    // Add wallet usage information to orderRazerpay
    const useWallet = req.body.useWallet === 'true';
    orderRazerpay.useWallet = useWallet;
    
    req.session.orderRazerpay = orderRazerpay;
    req.session.amount = amount;

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // Convert to paise and ensure it's an integer
      currency: "INR",
      receipt: "binelbpe@gmail.com",
    });

    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
};

//function for create invoice as pdf for invoice download
const invoice = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await Order.findById(orderId)
      .populate("products.product")
      .populate("address")
      .populate("coupon");
    const user = await User.findOne({ _id: order.user._id });

    if (
      !order ||
      (order.status !== "completed" && order.status !== "returned")
    ) {
      return res
        .status(404)
        .json({ error: "Order not found or not in a valid status" });
    }

    const doc = new PDFDocument({
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });
    const fileName = `invoice_${orderId}.pdf`;
    const filePath = path.join(__dirname, "invoices", fileName);

    // Create WriteStream to save the PDF file
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);
    doc.pipe(res);

    // Set up logo and company name
    doc.image("public/images/logo.png", 50, 50, { width: 50 });
    doc.moveDown(3); // Add space after the logo
    doc
      .fillColor("#bca374")
      .fontSize(18)
      .text("4WATCHES", 400, 65, { align: "right" });
    doc.moveDown(0.5); // Add space before the customer name
    doc
      .fillColor("#333333")
      .fontSize(12)
      .text(`Ordered Date: ${order.createdAt.toDateString()}`, 300, 130, {
        align: "right",
      });

    doc.moveDown(2);

    // Add user and address details
    doc
      .fillColor("#333333")
      .fontSize(14)
      .text(`Customer: ${user.fullname}`, 50, 130); // Adjust vertical position
    doc.fillColor("#333333").fontSize(12).text(
      `Address: ${order.address.address}, ${order.address.city}, ${order.address.state} - ${order.address.pincode}`,
      50,
      150 // Adjust vertical position
    );
    doc.moveDown(2);

    // Draw a box around order details with a heading
    const boxTop = 200; // Adjust vertical position
    const boxHeight = 250;

    doc
      .fillColor("#bca374")
      .fontSize(16)
      .text(`Invoice for Order #${order._id}`, { align: "center" });

    doc.rect(50, boxTop, 500, boxHeight).stroke("#bca374").moveDown(1);

    // Add order details table inside the box
    const completedAndReturnedProducts = order.products.filter(
      (item) => item.status === "completed"
    );
    const table = {
      headers: ["Product", "Quantity", "Price"],
      rows: completedAndReturnedProducts.map((item) => [
        item.product.product,
        item.quantity,
        `Rs.${item.product.price}`,
      ]),
    };
    generateTable(
      doc,
      table,
      boxTop + 30,
      [200, 100, 100],
      [100, 350, 450],
      "#bca374",
      { align: "left" }
    );

    // Add payment method
    doc
      .fillColor("#333333")
      .fontSize(12)
      .text(
        `Payment Method: ${order.paymentMethod}`,
        50,
        boxTop + boxHeight + 20
      );

    let total = completedAndReturnedProducts.reduce(
      (acc, item) => acc + item.product.price * item.quantity,
      0
    );
    const tax = total * 0.05; // 5% tax

    // Add order totals
    doc
      .fillColor("#bca374")
      .fontSize(14)
      .text("Order Totals:", 350, boxTop + boxHeight + 20);
    doc
      .fillColor("#333333")
      .fontSize(12)
      .text(`Tax: Rs.${tax.toFixed(2)}`, 350, boxTop + boxHeight + 40);
    doc
      .fillColor("#333333")
      .fontSize(12)
      .text(`Shipping: Rs.${45}`, 350, boxTop + boxHeight + 60);

    // Add coupon details if applied
    if (order.coupon) {
      doc
        .fillColor("#333333")
        .fontSize(12)
        .text(
          `Coupon Code: ${order.coupon.code}`,
          350,
          boxTop + boxHeight + 80
        );
      const totalTax = (order.grandTotalPrice - 45) / 21;
      const totalAfterTaxAndShipping = order.grandTotalPrice - 45 - totalTax;
      var discount =
        (order.discountedAmount / totalAfterTaxAndShipping) * total;
      total = total - discount;
      doc
        .fillColor("#333333")
        .fontSize(12)
        .text(
          `Discount: Rs.${discount.toFixed(2)}`,
          350,
          boxTop + boxHeight + 100
        );
    }

    // Display wallet balance used
    if (order.paymentMethod === "pay_by_wallet") {
      doc
        .fillColor("#333333")
        .fontSize(12)
        .text(
          `Wallet Balance Used: Rs.${
            order.walletAmount -
            order.discountedAmount -
            order.returnedPrice.toFixed(2)
          }`,
          350,
          boxTop + boxHeight + 120
        );
    } else if (order.walletAmount > 0) {
      doc
        .fillColor("#333333")
        .fontSize(12)
        .text(
          `Wallet Balance Used: Rs.${order.walletAmount.toFixed(2)}`,
          350,
          boxTop + boxHeight + 120
        );
    }

    doc
      .fillColor("#333333")
      .fontSize(12)
      .text(
        `Total Price: Rs.${(total + tax + 45).toFixed(2)}`,
        350,
        boxTop + boxHeight + 140
      );

    doc
      .fillColor("#333333")
      .fontSize(12)
      .text(
        `This is a computer generated invoice`,
        50,
        boxTop + boxHeight + 200
      );

    // Add a horizontal line to separate the totals
    doc
      .moveTo(50, boxTop + boxHeight + 180)
      .lineTo(550, boxTop + boxHeight + 180)
      .stroke("#bca374");

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
// Function to generate a table in PDFKit
function generateTable(
  doc,
  table,
  startY,
  columnWidths,
  columnPositions,
  color,
  options = {}
) {
  const initialPosition = 70; // Adjust based on your layout
  const rowHeight = 20;
  const padding = 5; // Adjust padding as needed

  doc.font("Helvetica-Bold");
  table.headers.forEach((header, i) => {
    doc
      .fillColor(color)
      .text(header, columnPositions[i] + padding, startY, options);
  });

  doc.font("Helvetica");
  let yPos = startY + rowHeight;
  table.rows.forEach((row) => {
    row.forEach((cell, i) => {
      doc
        .fillColor(color)
        .text(cell, columnPositions[i] + padding, yPos, options);
    });
    yPos += rowHeight;
  });
}

//function for handle payment fail in razor pay
const paymentFail = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.session.userData._id;
    const processOrder = req.session.orderRazerpay;
    const cart = req.session.cart;

    if (!cart || !cart.length) {
      throw new Error('Cart is empty');
    }

    // Calculate all amounts using the helper function
    const amounts = calculateOrderAmounts(
      cart,
      processOrder?.discountedAmount || 0,
      processOrder?.useWallet ? req.session.userData.wallet?.balance : 0
    );

    // Create order with proper amounts and valid payment method
    const orderData = {
      user: userId,
      products: cart.map(item => ({
        product: item.product?._id || item._id,
        quantity: parseInt(item.quantity),
        price: parseFloat(item.product?.price || item.price),
        status: 'paymentpending'
      })),
      subtotal: amounts.subtotal,
      tax: amounts.tax,
      shipping: amounts.shipping,
      couponDiscount: amounts.discountAmount,
      walletAmountUsed: amounts.walletUsed,
      onlinePaymentAmount: amounts.remainingAmount,
      grandTotal: amounts.grandTotal,
      totalPaid: 0, // No payment was successful
      paymentMethod: 'pay_on_online', // Use valid enum value
      address: (await User.findById(userId).populate({
        path: "addresses",
        match: { status: true },
      })).addresses[0]._id,
      status: 'paymentpending'
    };

    // Handle coupon if used
    if (processOrder?.coupon) {
      const coupon = await Coupon.findOne({ code: processOrder.coupon }).session(session);
      if (coupon) {
        orderData.coupon = coupon._id;
      }
    }

    // Create the order
    const order = await Order.create([orderData], { session });

    // If wallet was used, revert the wallet transaction
    if (amounts.walletUsed > 0) {
      await walletHelper.processWalletTransaction(
        userId,
        amounts.walletUsed,
        'credit',
        'Refund for failed payment',
        session
      );
    }

    await session.commitTransaction();

    // Clear session data
    req.session.checkout = false;
    req.session.orderRazerpay = null;

    return res.render("orderFailure", {
      error: { message: "Payment failed" },
      errorMessage: "Your payment could not be processed",
      fullName: req.session?.userData?.fullName,
      autoRedirect: true
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("Error handling payment failure:", error);

    return res.render("orderFailure", {
      error: { message: "System error", details: error.message },
      errorMessage: "Unable to process your request",
      fullName: req.session?.userData?.fullName,
      autoRedirect: true
    });
  } finally {
    session.endSession();
  }
};

//function for handle repayment using razorpay
const repayment = async (req, res) => {
  try {
    const { amount, orderId } = req.body;
    req.session.orderPaymentPending = await Order.findById(orderId);
    req.session.amount = amount;
    const userId = req.session.userData._id;
    const receipt = `repayment_order_${orderId}`;

    // Convert amount to paise
    const amountInPaise = Math.round(amount * 100);

    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt,
    };

    const order = await razorpay.orders.create(options);

    if (!order) {
      return res
        .status(500)
        .json({ success: false, message: "Error creating Razorpay order" });
    }

    res.status(200).json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
};

//function for create order for razor pay of failed payments order
const repaymentOrderCreation = async (req, res) => {
  try {
    const orderId = req.session.orderPaymentPending._id;
    const order = await Order.findById(orderId);
    const userId = req.session.userData._id;
    order.status = "pending";

    order.products.forEach((product) => {
      if (product.status === "paymentpending") {
        product.status = "pending";
      }
    });
    await order.save();
    req.session.cart = [];

    // Clear cart in the database
    await Cart.findOneAndUpdate({ userId: userId }, { cartItems: [] });
    console.log("sxdascfdvgth", userId);

    res.redirect("/orders");
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
};

//function for abort the order which is in payment pending status
const orderAbort = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const orderId = req.params.orderId;
    const order = await Order.findById(orderId).session(session);

    if (!order) {
      throw new Error('Order not found');
    }

    // Check if the order is already cancelled
    if (order.status === "cancelled") {
      throw new Error("Order is already cancelled");
    }

    // Check if the order is completed
    if (order.status === "completed") {
      throw new Error("Completed orders cannot be cancelled");
    }

    // Update order status to "cancelled"
    order.status = "cancelled";
    order.products.forEach((product) => {
      if (product.status === "paymentpending") {
        product.status = "cancelled";
      }
    });

    // Restore product quantities
    await Promise.all(
      order.products.map(async (orderItem) => {
        if (orderItem.status === "cancelled") {
          await Product.findByIdAndUpdate(
            orderItem.product,
            { $inc: { stock: orderItem.quantity } },
            { session }
          );
        }
      })
    );

    // Handle wallet refund if wallet was used
    if (order.walletAmountUsed > 0) {
      const user = await User.findById(req.session.userData._id)
        .populate("wallet")
        .session(session);

      if (!user || !user.wallet) {
        throw new Error("User wallet not found");
      }

      // Calculate refund amount - ensure it's a valid number
      const refundAmount = parseFloat(order.walletAmountUsed);
      
      if (isNaN(refundAmount)) {
        throw new Error("Invalid wallet amount");
      }

      // Update wallet balance
      const currentBalance = parseFloat(user.wallet.balance);
      const newBalance = currentBalance + refundAmount;
      
      if (isNaN(newBalance)) {
        throw new Error("Invalid wallet calculation");
      }

      user.wallet.balance = newBalance.toFixed(2);

      // Add transaction record with validated amount
      user.wallet.transactions.push({
        type: "credit",
        amount: refundAmount,
        description: `Refund for aborted order ${order._id}`
      });

      await user.wallet.save({ session });
    }

    await order.save({ session });
    await session.commitTransaction();

    res.status(200).redirect("/orders");

  } catch (error) {
    await session.abortTransaction();
    console.error("Error cancelling order:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to abort order" 
    });
  } finally {
    session.endSession();
  }
};

async function handleWalletTransaction(
  user,
  amount,
  orderId,
  type,
  description
) {
  try {
    if (!user.wallet) {
      user.wallet = await Wallet.create({ balance: 0 });
      await user.save();
    }

    const wallet = await Wallet.findById(user.wallet._id);

    if (type === "debit") {
      await wallet.debitBalance(
        amount,
        description || `Order ${orderId} payment`
      );
    } else {
      await wallet.creditBalance(
        amount,
        description || `Order ${orderId} refund`
      );
    }

    return wallet;
  } catch (error) {
    console.error("Wallet transaction error:", error);
    throw error;
  }
}

// Use this function for refunds
async function processRefund(order, amount, description) {
  const user = await User.findById(order.user).populate("wallet");

  // Calculate refund components
  const refundDetails = calculateRefundAmount(order, amount);

  // Process the refund
  await handleWalletTransaction(
    user,
    refundDetails.totalRefund,
    order._id,
    "credit",
    description || `Refund for order ${order._id}: ${refundDetails.breakdown}`
  );

  // Update order refund amounts
  order.returnedPrice = (
    parseFloat(order.returnedPrice) + refundDetails.totalRefund
  ).toFixed(2);
  await order.save();
}

function calculateRefundAmount(order, amount) {
  // Calculate base refund
  const baseAmount = parseFloat(amount);

  // Calculate proportional tax refund (5% of base amount)
  const taxRefund = baseAmount * 0.05;

  // Determine if shipping should be refunded (only if entire order is being refunded)
  const shippingRefund = order.products.every(
    (p) => p.status === "cancelled" || p.status === "returned"
  )
    ? 45
    : 0;

  // Calculate total refund
  const totalRefund = baseAmount + taxRefund + shippingRefund;

  return {
    totalRefund: totalRefund.toFixed(2),
    breakdown: `Base: ₹${baseAmount.toFixed(2)}, Tax: ₹${taxRefund.toFixed(
      2
    )}, Shipping: ₹${shippingRefund.toFixed(2)}`,
  };
}

// Function to handle admin return approval
const processReturn = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findById(req.params.orderId).session(session);
    const productId = req.params.productId;

    if (!order) {
      throw new Error("Order not found");
    }

    const product = order.products.find(
      (p) => p.product.toString() === productId && p.status === "returnrequest"
    );

    if (!product) {
      throw new Error("Product not found or not in return request status");
    }

    // Update product stock
    const productObj = await Product.findById(product.product).session(session);
    productObj.stock += product.quantity;
    await productObj.save({ session });

    // Calculate refund amount
    const refundAmount = calculateRefundAmount(order, product);

    // Process refund
    const user = await User.findById(order.user)
      .populate("wallet")
      .session(session);

    if (!user.wallet) {
      throw new Error("User wallet not found");
    }

    // Credit refund to wallet
    await user.wallet.creditBalance(
      refundAmount,
      `Refund for returned product in order ${order._id}`
    );

    // Update product status
    product.status = "returned";

    // Check if all products are returned
    const allReturned = order.products.every((p) => p.status === "returned");
    if (allReturned) {
      order.status = "returned";
    }

    await order.save({ session });
    await session.commitTransaction();

    res.redirect("/admin/orders");
  } catch (error) {
    await session.abortTransaction();
    console.error("Error processing return:", error);
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

// Helper function to calculate refund amount
function calculateRefundAmount(order, product) {
  const productTotal = product.product.price * product.quantity;
  const orderTotal = order.products.reduce(
    (sum, p) => sum + p.product.price * p.quantity,
    0
  );

  // Calculate proportional discount if any
  let discountAmount = 0;
  if (order.discountedAmount > 0) {
    discountAmount = order.discountedAmount * (productTotal / orderTotal);
  }

  // Calculate tax
  const tax = (productTotal - discountAmount) * 0.05;

  // Add shipping fee only if it's the last/only product
  const remainingProducts = order.products.filter(
    (p) => p.status !== "cancelled" && p.status !== "returned"
  );
  const shippingFee = remainingProducts.length === 1 ? 45 : 0;

  return (productTotal - discountAmount + tax + shippingFee).toFixed(2);
}

// Add this function to handle order confirmation
const showOrderConfirmation = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.render("orderFailure", {
        error: { message: "Invalid order ID" },
        errorMessage: "Could not find your order",
        fullName: req.session?.userData?.fullName,
      });
    }

    const order = await Order.findById(orderId)
      .populate("products.product")
      .populate("address");

    if (!order) {
      return res.render("orderFailure", {
        error: { message: "Order not found" },
        errorMessage: "Could not find your order details",
        fullName: req.session?.userData?.fullName,
      });
    }

    // Check order status
    if (order.status === "failed" || order.status === "cancelled") {
      return res.render("orderFailure", {
        error: { message: `Order ${order.status}` },
        errorMessage: `Your order has been ${order.status}`,
        order,
        fullName: req.session?.userData?.fullName,
      });
    }

    // Render success page for successful orders
    res.render("orderSuccess", {
      order,
      fullName: req.session?.userData?.fullName,
    });
  } catch (error) {
    console.error("Error showing order confirmation:", error);
    res.render("orderFailure", {
      error,
      errorMessage: "Error retrieving order details",
      fullName: req.session?.userData?.fullName,
    });
  }
};

// Add these new controller methods
const showOrderSuccess = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.redirect("/order-failure/" + orderId);
    }

    const order = await Order.findById(orderId)
      .populate("products.product")
      .populate("address");

    if (!order) {
      return res.redirect("/order-failure/" + orderId);
    }

    res.render("orderSuccess", {
      order,
      fullName: req.session?.userData?.fullName,
    });
  } catch (error) {
    console.error("Error showing order success:", error);
    res.redirect("/order-failure/" + req.params.orderId);
  }
};

const showOrderFailure = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await Order.findById(orderId);

    res.render("orderFailure", {
      error: { message: "Order processing failed" },
      errorMessage: "There was an issue with your order",
      order,
      fullName: req.session?.userData?.fullName,
    });
  } catch (error) {
    console.error("Error showing order failure:", error);
    res.render("orderFailure", {
      error: { message: "System error" },
      errorMessage: "Unable to process your request",
      fullName: req.session?.userData?.fullName,
    });
  }
};

// Export the new function
module.exports = {
  orderAbort,
  renderOrderListPage,
  returnProductRequest,
  returnOrderRequest,
  createorder,
  placeOrder,
  cancelProduct,
  addAddressorder,
  orderviewaddresses,
  cancelOrder,
  processpayment,
  invoice,
  paymentFail,
  repayment,
  repaymentOrderCreation,
  calculateOrderAmounts,
  showOrderConfirmation,
  showOrderSuccess,
  showOrderFailure,
  calculateOrderPrices,
};
