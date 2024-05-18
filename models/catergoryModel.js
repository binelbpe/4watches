const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
  },
  status: {
    type: Boolean,
    default: true,
  },
  offerPrice: { type: Number, default: 0 },
});
module.exports = mongoose.model("Category", categorySchema);
