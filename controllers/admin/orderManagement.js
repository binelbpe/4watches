const Order = require("../../models/orderModel");
const Product = require("../../models/productModel");
const User = require("../../models/userModel");
const mongoose = require("mongoose");
const WalletHelper = require("../../utils/walletHelper");

// Add this function at the top of the file
function calculateOrderPrices(order) {
  try {
    // Calculate subtotal from products
    const subtotal = order.products.reduce((sum, item) => {
      return sum + (parseFloat(item.price) * parseInt(item.quantity));
    }, 0);

    // Calculate tax
    const tax = subtotal * 0.05; // 5% tax
    
    // Fixed shipping
    const shipping = 45;

    // Get other amounts
    const discountAmount = parseFloat(order.couponDiscount || 0);
    const walletAmount = parseFloat(order.walletAmountUsed || 0);
    const onlineAmount = parseFloat(order.onlinePaymentAmount || 0);

    // Calculate final amount based on order status
    let finalAmount = 0;
    if (order.status === "cancelled" || order.status === "returned") {
      finalAmount = 0;
    } else {
      // Calculate total after discount
      const afterDiscount = subtotal - discountAmount;
      finalAmount = afterDiscount + tax + shipping;
    }

    return {
      baseAmount: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      shipping: shipping.toFixed(2),
      discountAmount: discountAmount.toFixed(2),
      walletAmount: walletAmount.toFixed(2),
      onlineAmount: onlineAmount.toFixed(2),
      finalAmount: finalAmount.toFixed(2)
    };
  } catch (error) {
    console.error('Error calculating order prices:', error);
    // Return default values in case of error
    return {
      baseAmount: "0.00",
      tax: "0.00",
      shipping: "45.00",
      discountAmount: "0.00",
      walletAmount: "0.00",
      onlineAmount: "0.00",
      finalAmount: "0.00"
    };
  }
}

//function to change order status
const changeOrderStatus = async (req, res) => {
  try {
    const { orderId, newStatus } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!["pending", "Dispatched", "In Transit", "completed"].includes(order.status)) {
      return res.status(400).json({
        message: "Invalid status change requested"
      });
    }

    // Update order status
    order.status = newStatus;
    order.products.forEach((product) => {
      if (["pending", "Dispatched", "In Transit"].includes(product.status)) {
        product.status = newStatus;
      }
    });

    await order.save();

    res.status(200).json({ 
      success: true,
      message: `Order status updated to ${newStatus}`
    });
  } catch (err) {
    console.error("Error updating order status:", err);
    res.status(500).json({ 
      success: false,
      message: "Failed to update order status"
    });
  }
};

//function for cancel the order
const cancelOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId)
      .populate('products.product')
      .populate('user')
      .session(session);

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status === 'cancelled') {
      throw new Error('Order is already cancelled');
    }

    if (order.status === 'completed') {
      throw new Error('Completed orders cannot be cancelled');
    }

    // Update order and product status
    order.status = 'cancelled';
    order.products.forEach(product => {
      if (product.status === 'pending' || product.status === 'Dispatched' || product.status === 'In Transit') {
        product.status = 'cancelled';
      }
    });

    // Restore product quantities
    await Promise.all(
      order.products.map(async (orderItem) => {
        if (orderItem.status === 'cancelled') {
          await Product.findByIdAndUpdate(
            orderItem.product._id,
            { $inc: { stock: orderItem.quantity } },
            { session }
          );
        }
      })
    );

    // Process refund if payment was made
    if (order.paymentMethod !== 'cash_on_delivery') {
      let refundAmount = 0;

      if (order.paymentMethod === 'pay_by_wallet') {
        refundAmount = parseFloat(order.walletAmountUsed);
      } else if (order.paymentMethod === 'pay_on_online') {
        refundAmount = parseFloat(order.onlinePaymentAmount);
      } else if (order.paymentMethod === 'wallet_and_online') {
        refundAmount = parseFloat(order.walletAmountUsed) + parseFloat(order.onlinePaymentAmount);
      }

      if (refundAmount > 0) {
        await WalletHelper.processWalletTransaction(
          order.user._id,
          refundAmount,
          'credit',
          `Refund for cancelled order ${order._id}`,
          session
        );

        // Update order with refund information
        order.totalRefunded = refundAmount;
        order.refundBreakdown.push({
          amount: refundAmount,
          type: 'cancel',
          date: new Date()
        });
      }
    }

    await order.save({ session });
    await session.commitTransaction();

    res.status(200).json({ 
      success: true, 
      message: 'Order cancelled successfully',
      refundAmount: order.totalRefunded
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error cancelling order:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error cancelling order' 
    });
  } finally {
    session.endSession();
  }
};

//function for rendering order list page in admin
const getOrdersWithPagination = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const skip = (page - 1) * pageSize;

    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate({
        path: "user",
        select: "fullname phone email",
      })
      .populate({
        path: "products.product",
        select: "product price image status",
      })
      .populate("address")
      .lean();

    const totalOrders = await Order.countDocuments();
    const totalPages = Math.ceil(totalOrders / pageSize);

    res.render("adminOrder", {
      order: orders,
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
      .populate('user')
      .session(session);

    if (!order) {
      throw new Error('Order not found');
    }

    const productId = req.params.productId;
    const orderProduct = order.products.find(p => 
      p.product._id.toString() === productId && 
      (p.status === 'pending' || p.status === 'Dispatched' || p.status === 'In Transit')
    );

    if (!orderProduct) {
      throw new Error('Product cannot be cancelled');
    }

    // Calculate refund amount for this product
    const refundAmount = await WalletHelper.calculateRefundAmount(order, orderProduct);

    // Update product stock
    await Product.findByIdAndUpdate(
      productId,
      { $inc: { stock: orderProduct.quantity } },
      { session }
    );

    // Update product status
    orderProduct.status = 'cancelled';

    // Process refund if payment was made
    if (order.paymentMethod !== 'cash_on_delivery') {
      await WalletHelper.processWalletTransaction(
        order.user._id,
        refundAmount,
        'credit',
        `Refund for cancelled product in order ${order._id}`,
        session
      );

      // Update order refund information
      order.totalRefunded = (parseFloat(order.totalRefunded || 0) + refundAmount).toFixed(2);
      order.refundBreakdown.push({
        amount: refundAmount,
        type: 'cancel',
        productId: orderProduct.product._id,
        date: new Date()
      });
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

    res.status(200).json({
      success: true,
      message: 'Product cancelled successfully',
      refundAmount
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error cancelling product:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error cancelling product' 
    });
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

    res.redirect('/admin/order');
  } catch (error) {
    await session.abortTransaction();
    console.error('Error processing return:', error);
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

// Helper function to calculate refund amount
function calculateRefundAmount(order, product = null) {
  if (product) {
    // For single product refund
    const productTotal = product.price * product.quantity;
    const productShare = productTotal / order.subtotal;
    
    // Calculate proportional amounts
    const discountShare = order.couponDiscount * productShare;
    const taxShare = (productTotal - discountShare) * 0.05;
    
    // Add shipping only if it's the last active product
    const activeProducts = order.products.filter(p => 
      p.status !== 'cancelled' && p.status !== 'returned'
    ).length;
    const shippingShare = activeProducts === 1 ? order.shipping : 0;

    return parseFloat((productTotal - discountShare + taxShare + shippingShare).toFixed(2));
  }

  // For full order refund
  const subtotal = order.subtotal;
  const tax = order.tax;
  const shipping = order.shipping;
  return parseFloat((subtotal + tax + shipping).toFixed(2));
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
  getOrdersWithPagination,
  changeOrderStatus,
  cancelOrder,
  returnOrder,
  returnProductAsAdmin,
  cancelProductAsAdmin,
  calculateOrderPrices,
};
