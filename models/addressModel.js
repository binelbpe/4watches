const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  address: {
    type: String,
    required: true,
  },
  addressline2: {
    type: String, // Capitalized "String"
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
    type: String, // Capitalized "String"
  },
  status: {
    type: Boolean, // Capitalized "Boolean"
    default: false,
  },
});

const Address = mongoose.model("Address", userSchema);
module.exports = Address;
