// helpers/scheduledTasks.js
const cron = require("node-cron");
const Order = require("../models/orderModel");
const Product = require("../models/productModel");
const User = require("../models/userModel");

const startScheduledTask = () => {
  // Run this task every minute
  cron.schedule("* * * * *", async () => {
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

      // Find orders with pending payment and creation time older than 10 minutes
      const orders = await Order.find({
        status: "paymentpending",
        createdAt: { $lt: tenMinutesAgo },
      });

      for (const order of orders) {
        // Cancel the order
        order.status = "cancelled";
        order.products.forEach((product) => {
          product.status = "cancelled";
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

        if (order.paymentMethod !== "cash_on_delivery") {
          const user = await User.findById(order.user._id).populate("wallet");

          if (!user || !user.wallet) {
            return res.status(404).json({ error: "User or wallet not found" });
          }

          user.wallet.balance += order.totalPrice;

          // Add a new transaction to the wallet
          user.wallet.transactions.push({
            type: "credit",
            amount: order.totalPrice,
            description: `Order ${order._id} cancelled`,
          });

          // Save the updated wallet
          await user.wallet.save();
        }
      }
    } catch (error) {
      console.error("Error in scheduled task:", error);
    }
  });
};

module.exports = startScheduledTask;
