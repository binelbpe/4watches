const Order = require("../../models/orderModel");
const Product = require("../../models/productModel");
const User = require("../../models/userModel");

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
    if (order.status !== "pending"&& order.status !== "Dispatched" && order.status !== "In Transit") {
      return res.status(400).json({
        message:
          "Order status can only be changed from 'pending' to 'completed'",
      });
    }

    // Set new status if the validation passes
    order.status = newStatus;

    order.products.forEach((product) => {
      if (product.status === "pending"||product.status ==="Dispatched"||product.status ==="In Transit") {
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
      if (product.status === "pending"|| product.status ==="Dispatched" || product.status ==="In Transit") {
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
    const page = parseInt(req.query.page) || 1; // Get page number from query parameter, default to 1
    const pageSize = parseInt(req.query.pageSize) || 10; // Get page size from query parameter, default to 10

    // Calculate skip value for pagination
    const skip = (page - 1) * pageSize;

    // Fetch orders for the current page with pagination
    const order = await Order.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate("user")
      .populate("products.product")
      .populate("address");

    // Count total number of orders for pagination
    const totalOrders = await Order.countDocuments();

    // Calculate total pages
    const totalPages = Math.ceil(totalOrders / pageSize);

    res.render("adminOrder", {
      order,
      currentPage: page,
      totalPages,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
};

//function for cancel products in order in admin side
const cancelProductAsAdmin = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    const productId=req.params.productId
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !=="pending" && order.status !=="Dispatched"&&order.status !=="In Transit") {
      return res
        .status(400)
        .json({ error: "Cannot cancel product for this order" });
    }

    const productIndex = order.products.findIndex(
      (p) => p.product.toString() === productId
    );

    if (productIndex === -1) {
      return res.status(404).json({ error: "Product not found in the order" });
    }

    const product = order.products[productIndex];
    const productObj = await Product.findById(product.product);
    const productPrice = parseFloat(productObj.price) || 0;
    const productQuantity = product.quantity;

    if (isNaN(productPrice) || isNaN(productQuantity)) {
      return res
        .status(400)
        .json({ error: "Invalid product price or quantity" });
    }

    const discountedAmount = parseFloat(order.discountedAmount) || 0;
    const totalPrice = parseFloat(order.grandTotalPrice)
      ? parseFloat(order.grandTotalPrice)
      : 0;
    const reducedPrice = calculateReducedPrice(
      productPrice * productQuantity,
      discountedAmount,
      totalPrice
    );

    const isLastCompleted =
      order.products.filter(
        (p) => p.status === "completed" && p.product.toString() !== productId
      ).length === 0;
    product.status = "cancelled";

    const updatedOrder = await order.save();

    productObj.stock += productQuantity;
    await productObj.save();

    const remainingProducts = order.products.filter(
      (p) => p.status !== "cancelled"
    );

    if (remainingProducts.length === 0) {
      order.status = "cancelled";

      await order.save();
    }
    if (order.paymentMethod !== "cash_on_delivery") {
      const user = await User.findById(order.user).populate("wallet");

      if (!user || !user.wallet) {
        return res.status(404).json({ error: "User or wallet not found" });
      }
      {
        order.reducedPrice =
          parseFloat(order.reducedPrice) + parseFloat(reducedPrice);
        await order.save();
      }
      user.wallet.balance = (
        parseFloat(user.wallet.balance) +
        parseFloat(reducedPrice) +
        (remainingProducts.length === 0 ? 45 : 0)
      ).toFixed(2);
      user.wallet.transactions.push({
        type: "credit",
        amount:
          parseFloat(reducedPrice) + (remainingProducts.length === 0 ? 45 : 0),
        description: `Order ${order._id} cancelled`,
      });

      await user.wallet.save();
    }
    res.json({ success: true, message: "Product cancelled successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

//function for return products which approved by admin in admin side
const returnProductAsAdmin = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    const productId = req.params.productId;

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const productIndex = order.products.findIndex(
      (p) => p.product.toString() === productId
    );

    if (productIndex === -1) {
      return res.status(404).json({ error: "Product not found in the order" });
    }

    const product = order.products[productIndex];
    const productObj = await Product.findById(product.product);
    const productPrice = parseFloat(productObj.price) || 0;
    const productQuantity = product.quantity;

    if (isNaN(productPrice) || isNaN(productQuantity)) {
      return res
        .status(400)
        .json({ error: "Invalid product price or quantity" });
    }

    const discountedAmount = order.discountedAmount
      ? parseFloat(order.discountedAmount)
      : 0;
    const totalPrice = parseFloat(order.grandTotalPrice)
      ? parseFloat(order.grandTotalPrice)
      : 0;
    const reducedPrice = calculateReducedPrice(
      productPrice * productQuantity,
      discountedAmount,
      totalPrice
    );

    const isLastCompleted =
      order.products.filter(
        (p) => p.status === "completed" && p.product.toString() !== productId
      ).length === 0;
    product.status = "returned";

    const updatedOrder = await order.save();

    productObj.stock += productQuantity;
    await productObj.save();
    const remainingProducts = order.products.filter(
      (p) => p.status !== "returned"
    );
    if (remainingProducts.length === 0) {
      order.status = "returned";
      await order.save();
    }

    const user = await User.findById(order.user).populate("wallet");
    console.log(order.user);

    if (!user || !user.wallet) {
      return res.status(404).json({ error: "User or wallet not found" });
    }
    {
      order.returnedPrice =
        parseFloat(order.returnedPrice) + parseFloat(reducedPrice);
      await order.save();
    }
    user.wallet.balance = (
      parseFloat(user.wallet.balance) +
      parseFloat(reducedPrice) +
      (remainingProducts.length === 0 ? 45 : 0)
    ).toFixed(2);
    user.wallet.transactions.push({
      type: "credit",
      amount:
        parseFloat(reducedPrice) + (remainingProducts.length === 0 ? 45 : 0),
      description: `Order ${order._id} returned`,
    });

    await user.wallet.save();

    res.json({ success: true, message: "Product returned successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

const returnOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "returnrequest") {
      return res.status(400).json({ error: "Order cannot be returned" });
    }

    // Retain the product quantities
    order.products.forEach((product) => {
      product.quantity = product.quantity;
    });

    // Set the order status to "returned"
    order.status = "returned";

    const updateProductStatusPromises = order.products.map(
      async (productItem) => {
        if (productItem.status === "completed") {
          productItem.status = "returned";
          await productItem.save();
        }
      }
    );

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
    const user = await User.findById(order.user).populate("wallet");

    if (!user || !user.wallet) {
      return res.status(404).json({ error: "User or wallet not found" });
    }
    const reduceTotal =
      (parseFloat(order.returnedPrice) ? parseFloat(order.returnedPrice) : 0) +
      (parseFloat(order.reducedPrice) ? parseFloat(order.reducedPrice) : 0);
    user.wallet.balance = (
      parseFloat(user.wallet.balance) +
      parseFloat(order.grandTotalPrice - order.discountedAmount) -
      reduceTotal
    ).toFixed(2);

    // Add a new transaction to the wallet
    user.wallet.transactions.push({
      type: "credit",
      amount:
        parseFloat(order.grandTotalPrice - order.discountedAmount) -
        reduceTotal,
      description: `Order ${order._id} returned`,
    });

    // Save the updated wallet
    await user.wallet.save();
    return res.status(200).redirect("/admin/order");
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
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
};
