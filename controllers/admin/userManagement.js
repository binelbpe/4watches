const userDetails = require("../../models/userModel");
const Address = require("../../models/addressModel");
const Wallet = require("../../models/walletModel");

const ITEMS_PER_PAGE = 10;

const userManagementPage = async (req, res) => {
  try {
    let page = +req.query.page || 1;
    const totalUsers = await userDetails.countDocuments({ isAdmin: false });
    const totalPages = Math.ceil(totalUsers / ITEMS_PER_PAGE);

    // Validate page number
    if (totalUsers === 0) {
      page = 1;
    } else if (page < 1) {
      page = 1;
    } else if (page > totalPages) {
      page = totalPages;
    }

    // Fetch users with all related data
    const users = await userDetails
      .find({ isAdmin: false })
      .populate({
        path: "addresses",
        model: "Address",
        select: "address addressline2 city state pincode status",
      })
      .populate({
        path: "wallet",
        model: "Wallet",
        select: "balance transactions",
      })
      .populate("wishlistItems")
      .populate("cart")
      .populate({
        path: "order",
        select: "orderNumber totalAmount status createdAt",
      })
      .populate("usedCoupons")
      .skip((page - 1) * ITEMS_PER_PAGE)
      .limit(ITEMS_PER_PAGE)
      .sort({ createdAt: -1 });

    // Format user data according to models
    const formattedUsers = users.map((user) => ({
      _id: user._id,
      fullname: user.fullname,
      email: user.email,
      phone: user.phone,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      googleuser: user.googleuser,

      // Format addresses according to addressModel
      addresses: user.addresses
        ? user.addresses.map((addr) => ({
            address: addr.address,
            addressline2: addr.addressline2 || "",
            city: addr.city,
            state: addr.state,
            pincode: addr.pincode,
            status: addr.status,
            userid: user._id,
          }))
        : [],

      // Format wallet according to walletModel
      wallet: {
        balance: user.wallet ? user.wallet.balance : 0,
        transactions: user.wallet
          ? user.wallet.transactions
              .map((trans) => ({
                type: trans.type,
                amount: trans.amount,
                description: trans.description,
                date: trans.date,
              }))
              .sort((a, b) => b.date - a.date)
          : [],
      },

      // Additional user statistics
      wishlistCount: user.wishlistItems ? user.wishlistItems.length : 0,
      cartCount: user.cart ? user.cart.length : 0,
      orderCount: user.order ? user.order.length : 0,
      orders: user.order
        ? user.order.map((order) => ({
            orderNumber: order.orderNumber,
            totalAmount: order.totalAmount,
            status: order.status,
            date: order.createdAt,
          }))
        : [],
      usedCouponsCount: user.usedCoupons ? user.usedCoupons.length : 0,

      // Additional user details from userModel
      isAdmin: user.isAdmin,
      googleId: user.googleId || null,
    }));

    res.render("adminUser", {
      data: formattedUsers,
      currentPage: page,
      totalPages: totalPages,
    });
  } catch (error) {
    console.log("Error in userManagementPage:", error);
    res.redirect("/admin/error");
  }
};

const changeStatus = async (req, res) => {
  try {
    const userId = req.query.id;
    const userData = await userDetails.findById(userId);

    if (!userData) {
      throw new Error("User not found");
    }

    const newStatus = !userData.status;
    await userDetails.findByIdAndUpdate(userId, { status: newStatus });

    return res.redirect("/admin/User");
  } catch (error) {
    console.log("Error in changeStatus:", error);
    res.redirect("/admin/error");
  }
};

module.exports = {
  userManagementPage,
  changeStatus,
};
