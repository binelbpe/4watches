const User = require('../models/userModel');
const Wallet = require('../models/walletModel');

const walletHelper = {
  async processWalletTransaction(userId, amount, type, description, session) {
    try {
      const safeAmount = parseFloat(parseFloat(amount).toFixed(2));
      if (isNaN(safeAmount) || safeAmount <= 0) {
        throw new Error(`Invalid amount: ${amount}`);
      }

      const user = await User.findById(userId)
        .populate('wallet')
        .session(session);

      if (!user || !user.wallet) {
        throw new Error('User wallet not found');
      }

      const currentBalance = parseFloat(user.wallet.balance);

      if (type === 'debit') {
        if (currentBalance < safeAmount) {
          throw new Error(`Insufficient wallet balance. Available: ${currentBalance}, Required: ${safeAmount}`);
        }
        await user.wallet.debitBalance(safeAmount, description);
      } else if (type === 'credit') {
        await user.wallet.creditBalance(safeAmount, description);
      }

      return user.wallet;
    } catch (error) {
      console.error('Wallet transaction error:', error);
      throw error;
    }
  },

  async calculateRefundAmount(order, product = null) {
    try {
      // For single product refund
      if (product) {
        const productTotal = parseFloat(product.price) * parseInt(product.quantity);
        const orderTotal = order.products.reduce((sum, p) => 
          sum + (parseFloat(p.price) * parseInt(p.quantity)), 0);
        
        // Calculate proportional discount
        let discountAmount = 0;
        if (order.couponDiscount > 0) {
          discountAmount = (order.couponDiscount * (productTotal / orderTotal));
        }

        // Calculate tax
        const afterDiscount = productTotal - discountAmount;
        const tax = afterDiscount * 0.05;

        // Add shipping only if it's the last active product
        const remainingProducts = order.products.filter(p => 
          p.status !== 'cancelled' && p.status !== 'returned'
        ).length;
        const shipping = remainingProducts === 1 ? 45 : 0;

        const refundAmount = afterDiscount + tax + shipping;
        return parseFloat(refundAmount.toFixed(2));
      }
      
      // For full order refund
      const subtotal = order.subtotal;
      const tax = order.tax;
      const shipping = order.shipping;
      const discount = order.couponDiscount || 0;

      const refundAmount = subtotal + tax + shipping - discount;
      return parseFloat(refundAmount.toFixed(2));
    } catch (error) {
      console.error('Error calculating refund:', error);
      throw error;
    }
  }
};

module.exports = walletHelper; 