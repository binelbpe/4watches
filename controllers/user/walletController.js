const User = require("../../models/userModel");
const Wallet = require("../../models/walletModel");

//function for render wallet page
const getWalletPage = async (req, res) => {
  try {
    const userId = req.session.userData._id;
    const user = await User.findById(userId).populate("wallet");
    if (!user) {
      return res.status(404).send("User not found");
    }
    if (!user.wallet) {
      const newWallet = await Wallet.create({ balance: 0 });
      user.wallet = newWallet._id;
      await user.save();
    }
    const wallet = await Wallet.findById(user.wallet._id);
    const fullName = req.session.userData.fullname;

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;

    const limit = 10; // Number of transactions per page

    // Ensure transactions are sorted in descending order of transaction date
    wallet.transactions.sort((a, b) => b.date - a.date);

    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    // Fetch only the required transactions for the current page
    const transactions = wallet.transactions.slice(startIndex, endIndex);

    const totalPages = Math.ceil(wallet.transactions.length / limit);

    res.render("wallet", {
      fullName,
      wallet,
      transactions,
      currentPage: page,
      totalPages,
    });
  } catch (error) {
    console.error("Error fetching wallet:", error);
    res.status(500).send("Internal Server Error");
  }
};

module.exports = { getWalletPage };
