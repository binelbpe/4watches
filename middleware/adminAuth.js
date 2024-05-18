const isLogin = async (req, res, next) => {
  try {
    if (!req.session.isAdmin) {
      return res.redirect("/admin/");
    }
    next();
  } catch (error) {
    console.log(error.message);
  }
};

const errorPage = (req, res) => {
  try {
    res.render("errorPage");
  } catch (e) {
    console.log("error in the errorPage : ", e);
  }
};

module.exports = {
  isLogin,
  errorPage,
};
