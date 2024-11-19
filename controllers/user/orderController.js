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

// Add this helper function at the top of the file
function calculateOrderPrices(order) {
  // Base amount calculation (excluding tax and shipping)
  const baseAmount = (order.grandTotalPrice - 45) / 1.05; // Remove shipping and 5% tax

  // Calculate tax on base amount
  const tax = baseAmount * 0.05;

  // Fixed shipping
  const shipping = 45;

  // Get other amounts
  const discountAmount = order.discountedAmount || 0;
  const walletAmount = order.walletAmount || 0;
  const reducedAmount = order.reducedPrice || 0;
  const returnedAmount = order.returnedPrice || 0;

  // Calculate final amount based on order status
  let finalAmount = order.grandTotalPrice;

  if (order.status === "cancelled" || order.status === "returned") {
    finalAmount = 0;
  } else {
    // Subtract discounts, refunds, and returns
    finalAmount = finalAmount - discountAmount - reducedAmount - returnedAmount;

    // For cancelled/returned orders, don't include shipping
    if (order.status === "cancelled" || order.status === "returned") {
      finalAmount -= shipping;
    }
  }

  return {
    baseAmount: baseAmount.toFixed(2),
    tax: tax.toFixed(2),
    shipping: shipping.toFixed(2),
    discountAmount: discountAmount.toFixed(2),
    walletAmount: walletAmount.toFixed(2),
    reducedAmount: reducedAmount.toFixed(2),
    returnedAmount: returnedAmount.toFixed(2),
    finalAmount: Math.max(0, finalAmount).toFixed(2), // Ensure final amount is never negative
  };
}

//function for rendering user order list
const renderOrderListPage = async (req, res) => {
  try {
    const userId = req.session.userData._id;
    const fullName = req.session.userData.fullname;
    let page = +req.query.page || 1; // Get page number from query parameters or default to 1
    const ITEMS_PER_PAGE = 9; // Define the number of items per page

    const totalOrders = await Order.countDocuments({ user: userId });
    const totalPages = Math.ceil(totalOrders / ITEMS_PER_PAGE);

    // Ensure page number is within valid range
    page = Math.max(1, Math.min(page, totalPages));

    const skipValue = (page - 1) * ITEMS_PER_PAGE; // Calculate skip value

    const orders = await Order.find({ user: userId })
      .populate("address")
      .populate("products.product")
      .sort({ createdAt: -1 })
      .skip(skipValue)
      .limit(ITEMS_PER_PAGE);

    res.render("userOrderList", {
      orders,
      fullName,
      currentPage: page,
      totalPages,
      RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
      calculateOrderPrices, // Pass the function to the view
    });
  } catch (error) {
    console.error("Error rendering order list page:", error);
    res.status(500).send("Internal Server Error");
  }
};

const cancelOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId);

    if (order.status === "Cancelled") {
      return res
        .status(400)
        .json({ success: false, message: "Order is already cancelled" });
    }

    // Check if the order is completed
    if (order.status === "completed") {
      return res.status(400).redirect("/orders");
    }

    // Update order status to "Cancelled"
    order.status = "cancelled";

    order.products.forEach((product) => {
      if (product.status === "pending") {
        product.status = "cancelled";
      }
    });

    await order.save();

    // Restore product quantities
    await Promise.all(
      order.products.map(async (orderItem) => {
        const product = await Product.findById(orderItem.product);
        if (product) {
          product.stock += orderItem.quantity;
          await product.save();
        }
      })
    );

    if (
      order.paymentMethod !== "cash_on_delivery" &&
      order.paymentMethod !== "pay_by_wallet"
    ) {
      const user = await User.findById(req.session.userData._id).populate(
        "wallet"
      );

      if (!user || !user.wallet) {
        return res.status(404).json({ error: "User or wallet not found" });
      }

      user.wallet.balance = (
        parseFloat(user.wallet.balance) +
        parseFloat(order.totalPrice) +
        (order.walletAmount ? parseFloat(order.walletAmount) : 0) -
        parseFloat(order.reducedPrice)
      ).toFixed(2);

      // Add a new transaction to the wallet
      user.wallet.transactions.push({
        type: "credit",
        amount:
          parseFloat(order.totalPrice) +
          (order.walletAmount ? parseFloat(order.walletAmount) : 0) -
          parseFloat(order.reducedPrice),
        description: `Order ${order._id} cancelled`,
      });

      // Save the updated wallet
      await user.wallet.save();
    } else if (order.paymentMethod == "pay_by_wallet") {
      const user = await User.findById(req.session.userData._id).populate(
        "wallet"
      );

      if (!user || !user.wallet) {
        return res.status(404).json({ error: "User or wallet not found" });
      }

      user.wallet.balance =
        user.wallet.balance +
        order.walletAmount -
        parseFloat(order.reducedPrice);

      // Add a new transaction to the wallet
      user.wallet.transactions.push({
        type: "credit",
        amount: order.walletAmount - parseFloat(order.reducedPrice),
        description: `Order ${order._id} cancelled`,
      });

      // Save the updated wallet
      await user.wallet.save();
    }

    const userId = req.session.userData._id;
    const fullName = req.session.userData.fullname;
    const orders = await Order.find({ user: userId })
      .populate("address")
      .populate("products.product")
      .sort({ createdAt: -1 });
    res.status(200).redirect("/orders");
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
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
    const orderProduct = order.products.find(p => p.product._id.toString() === productId);

    if (!orderProduct || orderProduct.status !== 'pending') {
      throw new Error('Product cannot be cancelled');
    }

    // Calculate refund amount for this product
    const refundAmount = calculateRefundAmount(order, orderProduct);

    // Update product stock
    await Product.findByIdAndUpdate(
      productId,
      { $inc: { stock: orderProduct.quantity } },
      { session }
    );

    // Update product status
    orderProduct.status = 'cancelled';

    // Check if this is the last active product
    const remainingActiveProducts = order.products.filter(
      p => p.status !== 'cancelled' && p.status !== 'returned'
    );

    // If this was the last active product, cancel the entire order
    if (remainingActiveProducts.length === 0) {
      order.status = 'cancelled';
    }

    // Process refund if payment was made
    if (order.paymentMethod !== 'cash_on_delivery') {
      const user = await User.findById(order.user)
        .populate('wallet')
        .session(session);

      if (!user.wallet) {
        throw new Error('User wallet not found');
      }

      // Calculate current wallet balance
      const currentBalance = parseFloat(user.wallet.balance);
      
      // Update wallet balance with proper number formatting
      const newBalance = (currentBalance + parseFloat(refundAmount)).toFixed(2);
      user.wallet.balance = newBalance;

      // Add transaction record
      user.wallet.transactions.push({
        type: 'credit',
        amount: parseFloat(refundAmount),
        description: `Refund for cancelled product in order ${order._id}`
      });

      await user.wallet.save({ session });
    }

    await order.save({ session });
    await session.commitTransaction();

    // Redirect to orders page instead of JSON response
    res.redirect('/orders');

  } catch (error) {
    await session.abortTransaction();
    console.error('Error cancelling product:', error);
    // Redirect to orders page with error message
    req.flash('error', error.message || 'Failed to cancel product');
    res.redirect('/orders');
  } finally {
    session.endSession();
  }
};

// Helper function to calculate refund amount
function calculateRefundAmount(order, orderProduct) {
  // Calculate base product price
  const productTotal = parseFloat(orderProduct.product.price * orderProduct.quantity);
  
  // Calculate proportional discount if any
  let discountAmount = 0;
  if (order.discountedAmount > 0) {
    const orderSubtotal = order.products.reduce(
      (total, p) => total + (p.product.price * p.quantity), 
      0
    );
    discountAmount = (order.discountedAmount * (productTotal / orderSubtotal));
  }

  // Calculate tax
  const afterDiscount = productTotal - discountAmount;
  const tax = afterDiscount * 0.05; // 5% tax

  // Add shipping fee only if it's the last/only product
  const remainingProducts = order.products.filter(
    p => p.status !== 'cancelled' && p.status !== 'returned'
  ).length;
  const shippingFee = remainingProducts === 1 ? 45 : 0;

  // Calculate final refund amount
  const refundAmount = (afterDiscount + tax + shippingFee).toFixed(2);

  return refundAmount;
}

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

    const productId = req.params.productId;
    const product = order.products.find(p => 
      p.product._id.toString() === productId && 
      p.status === 'completed'
    );

    if (!product) {
      throw new Error('Product cannot be returned');
    }

    // Check return window (7 days)
    const returnWindow = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - order.createdAt.getTime() > returnWindow) {
      throw new Error('Return window has expired');
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
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

//function for calculate reduced amount
function calculateReducedPrice(price, discountedAmount, totalPrice) {
  // Convert input values to numbers
  const numericPrice = parseFloat(price);
  const numericDiscountedAmount = parseFloat(discountedAmount);
  const taxtotal = (parseFloat(totalPrice) - 45) / 21;
  const numericTotalPrice = parseFloat(totalPrice) - (45 + taxtotal);

  const discountPercentage =
    (numericDiscountedAmount / numericTotalPrice) * 100;
  const discountedPrice = numericPrice * (discountPercentage / 100);
  const tax = numericPrice * 0.05; // 5% tax
  const deductedAmount = numericPrice - discountedPrice;
  let reducedPrice = deductedAmount + tax;

  // Round reducedPrice to two decimal points
  reducedPrice = reducedPrice.toFixed(2);

  return reducedPrice;
}
const placeOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("Starting order placement...");
    console.log("Request body:", req.body);

    if (!req.session.userData) {
      throw new Error("Authentication required");
    }

    const userId = req.session.userData._id;
    const user = await User.findById(userId)
      .populate("wallet")
      .populate({
        path: "addresses",
        match: { status: true },
      })
      .session(session);

    if (!user) {
      throw new Error("User not found");
    }

    if (!user.addresses || user.addresses.length === 0) {
      throw new Error("No delivery address found");
    }

    const cart = req.session.cart;
    if (!cart || cart.length === 0) {
      throw new Error("Cart is empty");
    }

    const totalPrice = parseFloat(req.body.totalPrice);
    const discountedAmount = parseFloat(req.body.discountedAmount) || 0;
    const paymentMethod = req.body.paymentMethod;
    const useWallet = req.body.useWallet === "true";
    const couponCode = req.body.coupon;

    console.log("Order details:", {
      totalPrice,
      discountedAmount,
      paymentMethod,
      useWallet,
      couponCode,
    });

    // Validate cash on delivery limit
    if (paymentMethod === "cash_on_delivery" && totalPrice > 1000) {
      throw new Error("Cash on delivery not available for orders above ₹1000");
    }

    // Calculate wallet usage
    let walletAmountUsed = 0;
    if (useWallet && user.wallet) {
      const walletBalance = parseFloat(user.wallet.balance);
      const totalAfterDiscount = totalPrice - discountedAmount;

      if (walletBalance >= totalAfterDiscount) {
        walletAmountUsed = totalAfterDiscount;
      } else {
        walletAmountUsed = walletBalance;
      }

      if (walletAmountUsed > 0) {
        if (walletBalance < walletAmountUsed) {
          throw new Error("Insufficient wallet balance");
        }

        user.wallet.balance = (walletBalance - walletAmountUsed).toFixed(2);
        user.wallet.transactions.push({
          type: "debit",
          amount: walletAmountUsed,
          description: `Order payment`,
        });
        await user.wallet.save({ session });
      }
    }

    // Create order
    const orderData = {
      user: userId,
      grandTotalPrice: totalPrice,
      totalPrice: totalPrice - walletAmountUsed,
      paymentMethod:
        walletAmountUsed === totalPrice ? "pay_by_wallet" : paymentMethod,
      address: user.addresses[0]._id,
      products: cart.map((item) => ({
        product: item._id,
        quantity: item.quantity,
        status: "pending",
      })),
      walletAmount: walletAmountUsed,
      discountedAmount,
      status: paymentMethod === "cash_on_delivery" ? "pending" : "pending",
      coupon: couponCode
        ? (await Coupon.findOne({ code: couponCode }))._id
        : null,
    };

    console.log("Creating order with data:", orderData);

    const order = await Order.create([orderData], { session });

    // Update product stock
    await Promise.all(
      cart.map(async (item) => {
        const product = await Product.findById(item._id).session(session);
        if (!product) {
          throw new Error(`Product ${item._id} not found`);
        }
        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${product.product}`);
        }
        product.stock -= item.quantity;
        await product.save({ session });
      })
    );

    // Clear cart
    req.session.cart = [];
    await Cart.findOneAndUpdate({ userId }, { cartItems: [] }, { session });

    await session.commitTransaction();
    console.log("Order created successfully:", order[0]._id);

    // Render success page with autoRedirect flag
    return res.render("orderSuccess", {
      order: order[0],
      fullName: req.session?.userData?.fullName,
      autoRedirect: true,
      message: `Order placed successfully via ${paymentMethod}`,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error placing order:", error);

    // Render failure page with autoRedirect flag
    return res.render("orderFailure", {
      error: { message: error.message || "Error processing order" },
      errorMessage: "There was an issue placing your order",
      fullName: req.session?.userData?.fullName,
      autoRedirect: true,
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
    // Ensure user is authenticated
    if (!req.session.userData) {
      throw new Error("Authentication required");
    }

    const userId = req.session.userData._id;
    const user = await User.findById(userId)
      .populate("wallet")
      .populate({
        path: "addresses",
        match: { status: true },
      })
      .session(session);

    if (!user) {
      throw new Error("User not found");
    }

    if (!user.addresses || user.addresses.length === 0) {
      throw new Error("No delivery address found");
    }

    // Ensure orderRazerpay exists in session
    if (!req.session.orderRazerpay) {
      throw new Error("Order details not found");
    }

    const processOrder = req.session.orderRazerpay;
    const totalPrice = parseFloat(processOrder.amount);
    const grandTotalPrice = parseFloat(
      req.session.totalPrice || processOrder.amount
    );
    const discountedAmount = processOrder.discountedAmount
      ? parseFloat(processOrder.discountedAmount)
      : 0;
    const walletAmount = grandTotalPrice - totalPrice - discountedAmount;

    // Handle wallet payment if applicable
    if (walletAmount > 0 && user.wallet) {
      const currentBalance = parseFloat(user.wallet.balance);
      if (currentBalance < walletAmount) {
        throw new Error("Insufficient wallet balance");
      }

      user.wallet.balance = (currentBalance - walletAmount).toFixed(2);
      user.wallet.transactions.push({
        type: "debit",
        amount: walletAmount,
        description: "Partial payment for order",
      });
      await user.wallet.save({ session });
    }

    // Create order
    const order = await Order.create(
      [
        {
          user: userId,
          grandTotalPrice,
          totalPrice,
          paymentMethod: "Payment on online",
          address: user.addresses[0]._id,
          products: req.session.cart.map((item) => ({
            product: item._id,
            quantity: item.quantity,
            status: "pending",
          })),
          walletAmount,
          discountedAmount,
          status: "pending",
          coupon: processOrder.coupon
            ? (
                await Coupon.findOne({ code: processOrder.coupon })
              )._id
            : null,
        },
      ],
      { session }
    );

    // Update product stock
    await Promise.all(
      req.session.cart.map(async (item) => {
        await Product.findByIdAndUpdate(
          item._id,
          { $inc: { stock: -item.quantity } },
          { session }
        );
      })
    );

    // Clear cart
    req.session.cart = [];
    await Cart.findOneAndUpdate({ userId }, { cartItems: [] }, { session });

    await session.commitTransaction();

    // Render success page with autoRedirect flag
    return res.render("orderSuccess", {
      order: order[0],
      fullName: req.session?.userData?.fullName,
      autoRedirect: true,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error processing payment:", error);

    // Render failure page with autoRedirect flag
    return res.render("orderFailure", {
      error: { message: error.message || "Payment processing failed" },
      errorMessage: "There was an issue with your payment",
      fullName: req.session?.userData?.fullName,
      autoRedirect: true,
    });
  } finally {
    session.endSession();
  }
};

//function for create order for razor pay
const createorder = async (req, res) => {
  try {
    const { amount, orderRazerpay } = req.body;
    req.session.orderRazerpay = orderRazerpay;
    req.session.amount = amount;

    const order = await razorpay.orders.create({
      amount: amount * 100,
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
  try {
    req.session.checkout = false;
    const discountedTotalPrice = req.session.discountedTotalPrice;
    let userId = req.session.userData._id;
    const razorpayOrder = req.session.orderRazerpay;
    const processOrder = req.session.orderRazerpay;
    const totalPrice = parseFloat(razorpayOrder.amount);
    const grandtotalPrice = parseFloat(req.session.totalPrice);
    const amount = req.session.amount;
    const discountedAmount = processOrder.discountedAmount
      ? parseFloat(processOrder.discountedAmount)
      : 0;

    if (isNaN(totalPrice) || isNaN(grandtotalPrice)) {
      throw new Error("Invalid totalPrice or grandtotalPrice");
    }

    // 4. Create the order with the appropriate payment method
    const paymentMethod = "Payment on online";
    const user = await User.findById(req.session.userData._id).populate({
      path: "addresses",
      match: { status: true },
    });
    const coupon = await Coupon.findOne({ code: processOrder.coupon });
    const difference = grandtotalPrice - amount - discountedAmount; // Parse as float
    const activeAddress = user.addresses[0];
    const order = await Order.create({
      user: req.session.userData._id,
      totalPrice,
      grandTotalPrice: grandtotalPrice,
      paymentMethod,
      address: activeAddress._id,
      products: req.session.cart.map((item) => ({
        product: item._id,
        quantity: item.quantity,
        status: "paymentpending",
      })),
      walletAmount: difference.toFixed(2),
      discountedAmount, // Use the discountedAmount value after validation
      coupon: coupon ? coupon._id : null,
      status: "paymentpending",
    });

    if (
      totalPrice != 0 &&
      totalPrice != grandtotalPrice &&
      discountedAmount == 0
    ) {
      const user = await User.findById(userId).populate("wallet");
      const wallet = user.wallet;
      user.wallet.balance = user.wallet.balance - difference.toFixed(2);
      user.wallet.save();
      await wallet.debitBalance(
        difference.toFixed(2),
        `Order ${order._id} placed along with wallet balance`
      );
    }

    if (coupon && coupon.oncePerUser) {
      await User.findByIdAndUpdate(userId, {
        $push: { usedCoupons: coupon._id },
      });
    }

    // Associate the order with the user
    await User.findByIdAndUpdate(userId, {
      $push: { order: order._id },
    });
    // 5. Update product quantities and clear the cart
    await Promise.all(
      req.session.cart.map(async (item) => {
        const product = await Product.findById(item._id);
        if (product) {
          product.stock -= item.quantity;
          await product.save();
        }
      })
    );

    req.session.cart = [];
    await User.findByIdAndUpdate(userId, { cart: [] });

    // 6. Redirect to the order success page or perform any other necessary actions
    return res.render("orderFailure", {
      error: { message: "Payment failed" },
      errorMessage: "Your payment could not be processed",
      fullName: req.session?.userData?.fullName,
      autoRedirect: true,
    });
  } catch (error) {
    console.error("Error handling payment failure:", error);

    // Render failure page for system errors
    return res.render("orderFailure", {
      error: { message: "System error" },
      errorMessage: "Unable to process your request",
      fullName: req.session?.userData?.fullName,
      autoRedirect: true,
    });
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
  try {
    const orderId = req.params.orderId;
    const order = await Order.findById(orderId);
    console.log(order);
    // Check if the order is already cancelled
    if (order.status === "cancelled") {
      return res
        .status(400)
        .json({ success: false, message: "Order is already cancelled" });
    }

    // Check if the order is completed
    if (order.status === "completed") {
      return res.status(400).redirect("/orders");
    }

    // Update order status to "Cancelled"
    order.status = "cancelled";

    order.products.forEach((product) => {
      if (product.status === "paymentpending") {
        product.status = "cancelled";
      }
    });

    await order.save();

    // Restore product quantities
    await Promise.all(
      order.products.map(async (orderItem) => {
        const product = await Product.findById(orderItem.product);
        if (product) {
          product.stock += orderItem.quantity;
          await product.save();
        }
      })
    );

    if (
      order.paymentMethod !== "cash_on_delivery" &&
      order.paymentMethod !== "pay_by_wallet"
    ) {
      const user = await User.findById(req.session.userData._id).populate(
        "wallet"
      );

      if (!user || !user.wallet) {
        return res.status(404).json({ error: "User or wallet not found" });
      }

      user.wallet.balance = (
        parseFloat(user.wallet.balance) +
        (order.walletAmount ? parseFloat(order.walletAmount) : 0)
      ).toFixed(2);
      if (order.walletAmount != 0) {
        // Add a new transaction to the wallet
        user.wallet.transactions.push({
          type: "credit",
          amount:
            (order.walletAmount ? parseFloat(order.walletAmount) : 0) -
            parseFloat(order.reducedPrice),
          description: `Order ${order._id} cancelled`,
        });
      }
      // Save the updated wallet
      await user.wallet.save();
    }

    const userId = req.session.userData._id;
    const fullName = req.session.userData.fullname;
    const orders = await Order.find({ user: userId })
      .populate("address")
      .populate("products.product")
      .sort({ createdAt: -1 });
    res.status(200).redirect("/orders");
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

function calculateOrderAmounts({
  basePrice,
  discountAmount = 0,
  walletAmount = 0,
  shippingFee = 45,
}) {
  // Calculate tax on pre-discount amount
  const tax = basePrice * 0.05;

  // Apply discount
  const afterDiscount = basePrice - discountAmount;

  // Add tax and shipping
  const withTaxAndShipping = afterDiscount + tax + shippingFee;

  // Apply wallet if used
  let walletUsed = 0;
  let finalAmount = withTaxAndShipping;

  if (walletAmount > 0) {
    if (walletAmount >= withTaxAndShipping) {
      walletUsed = withTaxAndShipping;
      finalAmount = 0;
    } else {
      walletUsed = walletAmount;
      finalAmount = withTaxAndShipping - walletAmount;
    }
  }

  return {
    basePrice,
    tax,
    discountAmount,
    shippingFee,
    walletUsed,
    finalAmount,
    total: withTaxAndShipping,
  };
}

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
  calculateOrderPrices,
  showOrderConfirmation,
  showOrderSuccess,
  showOrderFailure,
};
