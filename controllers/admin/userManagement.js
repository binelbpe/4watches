const userDetails = require("../../models/userModel");

const ITEMS_PER_PAGE = 5;

//function for rendering user list page
const userManagementPage = async (req, res) => {
  try {
    let page = +req.query.page || 1; // Get page number from query parameters or default to 1
    const ITEMS_PER_PAGE = 10; // Define number of items per page, adjust this as necessary

    const totalUsers = await userDetails.countDocuments({ isAdmin: false });
    const totalPages = Math.ceil(totalUsers / ITEMS_PER_PAGE);

    if (totalUsers === 0) {
      page = 1; // No users but still ensure page is set to 1
    } else if (page < 1) {
      page = 1; // Ensure page number is at least 1
    } else if (page > totalPages) {
      page = totalPages; // Ensure page number does not exceed total pages
    }

    const users = await userDetails
      .find({ isAdmin: false })
      .skip((page - 1) * ITEMS_PER_PAGE)
      .limit(ITEMS_PER_PAGE)
      .sort({ _id: -1 }); // Sorting users by descending order of their ID

    res.render("adminUser", {
      data: users,
      currentPage: page,
      totalPages: totalPages,
    });
  } catch (error) {
    console.log("Error in userManagementPage:", error);
    res.redirect("/admin/error");
  }
};

//function for change status of user
const changeStatus = async (req, res) => {
  try {
    const userData = await userDetails.findOne({ _id: req.query.id });
    if (userData.status) {
      await userDetails.updateOne({ _id: req.query.id }, { status: false });
    } else {
      await userDetails.updateOne({ _id: req.query.id }, { status: true });
    }

    return res.redirect("/admin/User");
  } catch (e) {
    console.log("error in the changeStatus", e);
    console.error("/admin/error");
  }
};

module.exports = {
  userManagementPage,
  changeStatus,
};
