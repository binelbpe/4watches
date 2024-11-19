const Order = require("../../models/orderModel");
const Product = require("../../models/productModel");
const User = require("../../models/userModel");
const mongoose = require("mongoose");

// Add this function at the top of the file
function calculateOrderPrices(order) {
  // Base subtotal (before tax and shipping)
  const subtotal = order.grandTotalPrice - 45;
  const baseAmount = subtotal / 1.05; // Remove 5% tax to get base amount
  const tax = subtotal * 0.05; // 5% tax
  const shipping = 45; // Fixed shipping

  // Discounts and wallet
  const discountAmount = order.discountedAmount || 0;
  const walletAmount = order.walletAmount || 0;
  const reducedAmount = order.reducedPrice || 0;
  const returnedAmount = order.returnedPrice || 0;

  // Calculate final amount based on order status
  let finalAmount = order.grandTotalPrice;
  if (order.status === "cancelled" || order.status === "returned") {
    finalAmount = 0;
  } else {
    finalAmount = finalAmount - discountAmount - reducedAmount - returnedAmount;
  }

  return {
    baseAmount: baseAmount.toFixed(2),
    tax: tax.toFixed(2),
    shipping: shipping.toFixed(2),
    discountAmount: discountAmount.toFixed(2),
    walletAmount: walletAmount.toFixed(2),
    reducedAmount: reducedAmount.toFixed(2),
    returnedAmount: returnedAmount.toFixed(2),
    finalAmount: finalAmount.toFixed(2),
  };
}

//function to change order status
const changeOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.body;
    const newStatus = req.body.newStatus; // Admin can only set to completed

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if the current order status is 'pending'
    if (
      order.status !== "pending" &&
      order.status !== "Dispatched" &&
      order.status !== "In Transit"
    ) {
      return res.status(400).json({
        message:
          "Order status can only be changed from 'pending' to 'completed'",
      });
    }

    // Set new status if the validation passes
    order.status = newStatus;

    order.products.forEach((product) => {
      if (
        product.status === "pending" ||
        product.status === "Dispatched" ||
        product.status === "In Transit"
      ) {
        product.status = newStatus;
      }
    });

    await order.save();

    res
      .status(200)
      .json({ message: "Order status updated successfully to completed" });
  } catch (err) {
    console.error("Error updating order status", { error: err, orderId });
    res.status(500).send("Internal Server Error");
  }
};

//function for cancel the order
const cancelOrder = async (req, res) => {
  const { orderId } = req.params;

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if the order is already cancelled
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
      if (
        product.status === "pending" ||
        product.status === "Dispatched" ||
        product.status === "In Transit"
      ) {
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
      const user = await User.findById(order.user).populate("wallet");

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
      const user = await User.findById(order.user).populate("wallet");

      if (!user || !user.wallet) {
        return res.status(404).json({ error: "User or wallet not found" });
      }

      user.wallet.balance =
        user.wallet.balance + order.walletAmount - parseFloat(reducedPrice);

      // Add a new transaction to the wallet
      user.wallet.transactions.push({
        type: "credit",
        amount: order.walletAmount - parseFloat(reducedPrice),
        description: `Order ${order._id} cancelled`,
      });

      // Save the updated wallet
      await user.wallet.save();
    }
    const user = await User.findById(order.user);
    // const userId = req.session.userData._id;
    // const fullName = req.session.userData.fullname;
    const orders = await Order.find({ user: user._id })
      .populate("address")
      .populate("products.product")
      .sort({ createdAt: -1 });

    res.status(200).json({ message: "Order cancelled successfully" });
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

//function for rendering order list page in admin
const getOrdersWithPagination = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const skip = (page - 1) * pageSize;

    // Fetch orders with populated fields
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate({
        path: "user",
        select: "fullname phone email", // Select only needed fields
      })
      .populate({
        path: "products.product",
        select: "product price image status",
      })
      .populate("address")
      .lean(); // Convert to plain JavaScript objects

    // Validate and sanitize order data
    const validatedOrders = orders.map((order) => ({
      ...order,
      user: order.user || {
        fullname: "User Not Found",
        phone: "N/A",
        email: "N/A",
      },
      products: order.products.map((product) => ({
        ...product,
        product: product.product || {
          product: "Product Not Available",
          price: 0,
          image: [],
          status: false,
        },
      })),
      address: order.address || {
        address: "Address Not Available",
        city: "N/A",
        state: "N/A",
        pincode: "N/A",
      },
    }));

    const totalOrders = await Order.countDocuments();
    const totalPages = Math.ceil(totalOrders / pageSize);

    res.render("adminOrder", {
      order: validatedOrders,
      currentPage: page,
      totalPages,
      calculateOrderPrices,
    });
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).send("Internal Server Error");
  }
};

//function for cancel products in order in admin side
const cancelProductAsAdmin = async (req, res) => {
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

    // Calculate refund amount
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

      // Update wallet balance with proper number formatting
      const currentBalance = parseFloat(user.wallet.balance);
      const newBalance = (currentBalance + parseFloat(refundAmount)).toFixed(2);
      user.wallet.balance = newBalance;

      // Add transaction record
      user.wallet.transactions.push({
        type: 'credit',
        amount: parseFloat(refundAmount),
        description: `Refund for cancelled product in order ${order._id} (by admin)`
      });

      await user.wallet.save({ session });
    }

    await order.save({ session });
    await session.commitTransaction();

    res.redirect('/admin/orders');

  } catch (error) {
    await session.abortTransaction();
    console.error('Error cancelling product:', error);
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

//function for return products which approved by admin in admin side
const returnProductAsAdmin = async (req, res) => {
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
      p.status === 'returnrequest'
    );

    if (!orderProduct) {
      throw new Error('Product not found or not in return request status');
    }

    // Update product stock
    await Product.findByIdAndUpdate(
      productId,
      { $inc: { stock: orderProduct.quantity } },
      { session }
    );

    // Calculate refund amount
    const refundAmount = calculateRefundAmount(order, orderProduct);

    // Update product status
    orderProduct.status = 'returned';

    // Check if this is the last active product
    const remainingActiveProducts = order.products.filter(
      p => p.status !== 'returned' && p.status !== 'cancelled'
    );

    // If this was the last active product, update order status and include shipping in refund
    if (remainingActiveProducts.length === 0) {
      order.status = 'returned';
      // Add shipping fee to refund amount
      const finalRefundAmount = parseFloat(refundAmount) + 45;

      // Process refund with shipping included
      const user = await User.findById(order.user)
        .populate('wallet')
        .session(session);

      if (!user.wallet) {
        throw new Error('User wallet not found');
      }

      // Update wallet balance
      const currentBalance = parseFloat(user.wallet.balance);
      user.wallet.balance = (currentBalance + finalRefundAmount).toFixed(2);

      // Add transaction record
      user.wallet.transactions.push({
        type: 'credit',
        amount: finalRefundAmount,
        description: `Refund for full order return #${order._id}`
      });

      await user.wallet.save({ session });
    } else {
      // Process regular refund without shipping
      const user = await User.findById(order.user)
        .populate('wallet')
        .session(session);

      if (!user.wallet) {
        throw new Error('User wallet not found');
      }

      // Update wallet balance
      const currentBalance = parseFloat(user.wallet.balance);
      user.wallet.balance = (currentBalance + parseFloat(refundAmount)).toFixed(2);

      // Add transaction record
      user.wallet.transactions.push({
        type: 'credit',
        amount: parseFloat(refundAmount),
        description: `Refund for returned product in order ${order._id}`
      });

      await user.wallet.save({ session });
    }

    await order.save({ session });
    await session.commitTransaction();

    res.redirect('/admin/orders');
  } catch (error) {
    await session.abortTransaction();
    console.error('Error processing return:', error);
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

// Helper function to calculate refund amount
function calculateRefundAmount(order, orderProduct) {
  // Get product price and quantity
  const productTotal = orderProduct.product.price * orderProduct.quantity;

  // Calculate proportional discount if any
  let discountAmount = 0;
  if (order.discountedAmount > 0) {
    const orderSubtotal = order.products.reduce(
      (total, p) => total + p.product.price * p.quantity,
      0
    );
    discountAmount = order.discountedAmount * (productTotal / orderSubtotal);
  }

  // Calculate tax on discounted amount
  const afterDiscount = productTotal - discountAmount;
  const tax = afterDiscount * 0.05;

  // Add shipping fee only if it's the last/only product
  const remainingProducts = order.products.filter(
    (p) => p.status !== "cancelled" && p.status !== "returned"
  ).length;
  const shippingFee = remainingProducts === 1 ? 45 : 0;

  return (afterDiscount + tax + shippingFee).toFixed(2);
}

// Function to handle full order return
const returnOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findById(req.params.orderId)
      .populate("products.product")
      .session(session);

    if (!order) {
      throw new Error("Order not found");
    }

    if (order.status !== "returnrequest") {
      throw new Error("Order is not in return request status");
    }

    // Update product stocks
    await Promise.all(
      order.products.map(async (orderProduct) => {
        if (orderProduct.status === "returnrequest") {
          const product = await Product.findById(
            orderProduct.product._id
          ).session(session);
          if (product) {
            product.stock += orderProduct.quantity;
            await product.save({ session });
          }
          orderProduct.status = "returned";
        }
      })
    );

    // Calculate total refund amount
    const refundAmount = order.products.reduce((total, product) => {
      if (product.status === "returned") {
        return total + product.product.price * product.quantity;
      }
      return total;
    }, 0);

    // Add tax and shipping to refund
    const tax = refundAmount * 0.05;
    const totalRefund = (refundAmount + tax + 45).toFixed(2); // Including shipping

    // Process refund to wallet
    const user = await User.findById(order.user)
      .populate("wallet")
      .session(session);

    if (!user.wallet) {
      throw new Error("User wallet not found");
    }

    // Update wallet balance
    user.wallet.balance = (
      parseFloat(user.wallet.balance) + parseFloat(totalRefund)
    ).toFixed(2);
    user.wallet.transactions.push({
      type: "credit",
      amount: parseFloat(totalRefund),
      description: `Refund for returned order ${order._id}`,
    });

    // Update order status and returned price
    order.status = "returned";
    order.returnedPrice = totalRefund;

    // Save all changes
    await Promise.all([order.save({ session }), user.wallet.save({ session })]);

    await session.commitTransaction();
    res.redirect("/admin/order");
  } catch (error) {
    await session.abortTransaction();
    console.error("Error processing return:", error);
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

//function to calculate reduced price
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

module.exports = {
  returnOrder,
  returnProductAsAdmin,
  cancelProductAsAdmin,
  cancelOrder,
  getOrdersWithPagination,
  changeOrderStatus,
  calculateOrderPrices, // Add to exports
};
