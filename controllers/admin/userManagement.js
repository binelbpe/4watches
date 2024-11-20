const userDetails = require("../../models/userModel");
const Address = require("../../models/addressModel");
const Wallet = require("../../models/walletModel");
const Cart = require("../../models/addtocartModel");
const Order = require("../../models/orderModel");

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
      .skip((page - 1) * ITEMS_PER_PAGE)
      .limit(ITEMS_PER_PAGE)
      .sort({ createdAt: -1 });

    // Format user data according to models
    const formattedUsers = await Promise.all(users.map(async (user) => {
      // Get cart items count from Cart model
      const cart = await Cart.findOne({ userId: user._id });
      const cartCount = cart ? cart.cartItems.length : 0;

      // Get orders for this user
      const orders = await Order.find({ user: user._id });
      const completedOrders = orders.filter(order => order.status === 'completed');
      
      // Get orders with coupons
      const ordersWithCoupons = orders.filter(order => order.coupon != null);

      return {
        _id: user._id,
        fullname: user.fullname,
        email: user.email,
        phone: user.phone,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        googleuser: user.googleuser,

        addresses: user.addresses?.map(addr => ({
          address: addr.address,
          addressline2: addr.addressline2 || "",
          city: addr.city,
          state: addr.state,
          pincode: addr.pincode,
          status: addr.status,
          userid: user._id,
        })) || [],

        wallet: {
          balance: user.wallet?.balance || 0,
          transactions: user.wallet?.transactions
            .map(trans => ({
              type: trans.type,
              amount: trans.amount,
              description: trans.description,
              date: trans.date,
            }))
            .sort((a, b) => b.date - a.date) || [],
        },

        wishlistCount: user.wishlistItems?.length || 0,
        cartCount: cartCount,
        orderCount: completedOrders.length,
        orders: orders.map(order => ({
          orderNumber: order._id,
          totalAmount: order.totalPaid,
          status: order.status,
          date: order.createdAt,
          paymentMethod: order.paymentMethod,
          products: order.products
        })),
        usedCouponsCount: ordersWithCoupons.length,
        
        isAdmin: user.isAdmin,
        googleId: user.googleId || null,
      };
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
