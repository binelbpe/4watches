// helpers/scheduledTasks.js
const cron = require("node-cron");
const Order = require("../models/orderModel");
const Product = require("../models/productModel");
const User = require("../models/userModel");
const Wallet = require("../models/walletModel");

const startScheduledTask = () => {
  // Run this task every minute
  cron.schedule("* * * * *", async () => {
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

      // Find orders with pending payment and creation time older than 10 minutes
      const orders = await Order.find({
        status: "paymentpending",
        createdAt: { $lt: tenMinutesAgo },
      }).populate('products.product');

      for (const order of orders) {
        try {
          // Start cancellation process
          console.log(`Processing order cancellation for order ID: ${order._id}`);

          // Update order status
          order.status = "cancelled";
          order.products.forEach((product) => {
            product.status = "cancelled";
          });

          // Restore product quantities
          await Promise.all(
            order.products.map(async (orderItem) => {
              if (orderItem.product) {
                const product = await Product.findById(orderItem.product._id);
                if (product) {
                  product.stock += orderItem.quantity;
                  await product.save();
                  console.log(`Restored ${orderItem.quantity} units to product ${product._id}`);
                }
              }
            })
          );

          // Handle refund if payment was made
          if (order.paymentMethod === "Payment on online" || order.paymentMethod === "pay_by_wallet") {
            const user = await User.findById(order.user).populate("wallet");

            if (user && user.wallet) {
              // Calculate refund amount including any wallet amount used
              const refundAmount = order.totalPrice + (order.walletAmount || 0);

              // Update wallet balance
              user.wallet.balance = (parseFloat(user.wallet.balance) + refundAmount).toFixed(2);

              // Add transaction record
              user.wallet.transactions.push({
                type: "credit",
                amount: refundAmount,
                description: `Refund for cancelled order #${order._id}`,
                date: new Date()
              });

              await user.wallet.save();
              console.log(`Refunded ${refundAmount} to user wallet for order ${order._id}`);
            }
          }

          // Save the updated order
          await order.save();
          console.log(`Successfully cancelled order ${order._id}`);

        } catch (error) {
          console.error(`Error processing order ${order._id}:`, error);
          // Continue with next order even if current one fails
          continue;
        }
      }
    } catch (error) {
      console.error("Error in scheduled task:", error);
    }
  });

  // Log when the scheduled task starts
  console.log("Scheduled task for order cancellation has been started");
};

module.exports = startScheduledTask;
