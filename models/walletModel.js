const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema({
  balance: {
    type: Number,
    default: 0,
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
});

// Method to credit the balance and add a transaction
walletSchema.methods.creditBalance = async function (amount, description) {
  this.balance += amount;
  this.transactions.push({
    type: "credit",
    amount: amount,
    description: description,
  });
  await this.save();
};

// Method to debit the balance and add a transaction
walletSchema.methods.debitBalance = async function (amount, description) {
  this.balance -= amount;
  this.transactions.push({
    type: "debit",
    amount: amount,
    description: description,
  });
  await this.save();
};

const Wallet = mongoose.model("Wallet", walletSchema);

module.exports = Wallet;
