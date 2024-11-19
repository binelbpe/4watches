const twilio = require("twilio");

require("dotenv").config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = twilio(accountSid, authToken);

const sendOTP = async (to, otp) => {
  try {
    console.log("to",to)
    const message = await twilioClient.messages.create({
      body: `Your OTP for verification is: ${otp}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      
      to: `+919074465607`,
    });
    console.log(`otp: ${otp}`);

    console.log("OTP sent successfully:", message.sid);
  } catch (error) {
    console.error("Error sending OTP:", error);
  }
};

module.exports = { sendOTP };
