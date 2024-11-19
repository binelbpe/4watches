const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  address: {
    type: String,
    required: true,
  },
  addressline2: {
    type: String, 
  },
  city: {
    type: String,
    required: true,
  },
  state: {
    type: String,
    required: true,
  },
  pincode: {
    type: Number,
    required: true,
  },
  userid: {
    type: String, 
  },
  status: {
    type: Boolean, 
    default: false,
  },
});

const Address = mongoose.model("Address", userSchema);
module.exports = Address;
