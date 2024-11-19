const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema({
  balance: {
    type: Number,
    required: true,
    default: 0,
    get: function(v) {
      return parseFloat(parseFloat(v).toFixed(2));
    },
    set: function(v) {
      return parseFloat(parseFloat(v).toFixed(2));
    }
  },
  transactions: [
    {
      type: {
        type: String,
        enum: ["credit", "debit"],
        required: true,
      },
      amount: {
        type: Number,
        required: true,
        get: function(v) {
          return parseFloat(v);
        }
      },
      description: {
        type: String,
        required: true,
      },
      date: {
        type: Date,
        default: Date.now,
      },
    },
  ],
}, { toJSON: { getters: true }, toObject: { getters: true } });

// Add validation to ensure balance and transaction amounts are valid numbers
walletSchema.pre('save', function(next) {
  if (isNaN(this.balance)) {
    next(new Error('Invalid wallet balance'));
  }
  
  this.transactions.forEach(transaction => {
    if (isNaN(transaction.amount)) {
      next(new Error('Invalid transaction amount'));
    }
  });
  
  next();
});

// Method to credit the balance and add a transaction
walletSchema.methods.creditBalance = async function (amount, description) {
  const safeAmount = parseFloat(parseFloat(amount).toFixed(2));
  if (isNaN(safeAmount) || safeAmount <= 0) {
    throw new Error(`Invalid credit amount: ${amount}`);
  }

  const newBalance = parseFloat(this.balance) + safeAmount;
  this.balance = parseFloat(newBalance.toFixed(2));
  
  this.transactions.push({
    type: "credit",
    amount: safeAmount,
    description: description,
  });

  return this.save();
};

// Method to debit the balance and add a transaction
walletSchema.methods.debitBalance = async function (amount, description) {
  const safeAmount = parseFloat(parseFloat(amount).toFixed(2));
  if (isNaN(safeAmount) || safeAmount <= 0) {
    throw new Error('Invalid debit amount');
  }

  const currentBalance = parseFloat(this.balance);
  if (currentBalance < safeAmount) {
    throw new Error(`Insufficient balance. Available: ${currentBalance}, Required: ${safeAmount}`);
  }

  const newBalance = currentBalance - safeAmount;
  this.balance = parseFloat(newBalance.toFixed(2));
  
  this.transactions.push({
    type: "debit",
    amount: safeAmount,
    description: description,
  });

  return this.save();
};

const Wallet = mongoose.model("Wallet", walletSchema);

module.exports = Wallet;
