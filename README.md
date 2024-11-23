<div align="center">

# 4Watches ⌚
[![Live Store](https://img.shields.io/badge/Live-4watches.shop-blue?style=for-the-badge)](https://4watches.shop)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-black?style=for-the-badge&logo=github)](https://github.com/binelbpe/4watches.git)

A modern e-commerce platform specialized in luxury timepieces with secure payment integration.

</div>

## ✨ Features

- 🛍️ Browse and purchase premium watches
- 👤 User authentication (Local + Google OAuth)
- 💳 Secure payment integration with Razorpay
- 📱 OTP verification via Twilio
- 📊 Admin dashboard with sales analytics
- 📋 Order management system
- 📷 Image optimization for products
- 📄 PDF invoice generation
- 📈 Excel report generation
- 📨 Email notifications
- 🛒 Cart management
- ⭐ Product reviews and ratings

## 🚀 Tech Stack

### Backend
- Node.js & Express
- MongoDB with Mongoose
- EJS templating engine
- Passport.js for authentication
- Twilio for OTP services
- Sharp for image processing
- PDFKit for document generation
- ExcelJS for report generation

### Payment Integration
- Razorpay payment gateway
- Secure transaction handling

### Security & Sessions
- Express-session with MongoDB store
- Bcrypt for password hashing
- CORS enabled
- No-cache middleware
- Method override support

## 📝 Prerequisites

Before running this project, ensure you have:
- Node.js (v14 or higher)
- MongoDB database
- npm package manager
- Razorpay account
- Twilio account
- Google OAuth credentials

## 🛠️ Installation

1. **Clone the repository**
```bash
git clone https://github.com/binelbpe/4watches.git
cd 4watches
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
Create a `.env` file with:
```env
PORT=4000
MONGO_URI=your_mongodb_uri
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
SERVICE_SID=your_service_sid
TWILIO_PHONE_NUMBER=your_twilio_number
SESSION_SECRET_ADMIN=your_admin_secret
SESSION_SECRET_USER=your_user_secret
GOOGLE_CLIENT_SECRET=your_google_secret
GOOGLE_CLIENT_ID=your_google_client_id
RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_SECRET=your_razorpay_secret
```

## 🚦 Running the Project

```bash
# Development mode
npm start

# The application will be available at http://localhost:4000
```

## 📦 Key Features Explained

### User Features
- Account creation and management
- Google OAuth integration
- Mobile number verification via OTP
- Product browsing and filtering
- Shopping cart management
- Secure checkout process
- Order tracking
- Product reviews

### Admin Features
- Product management
- Order management
- User management
- Sales reports generation
- Inventory tracking
- Analytics dashboard
- Category management

### Payment Processing
- Secure Razorpay integration
- Multiple payment methods
- Order confirmation
- Invoice generation

### Security Features
- Password hashing
- Session management
- Protected routes
- Input validation
- Secure file uploads

## 📊 Database Schema

The project uses MongoDB with the following main collections:
- Users
- Products
- Orders
- Categories
- Cart
- Reviews

## 🔧 Configuration

### Required Services
1. MongoDB Atlas account
2. Twilio account for OTP
3. Google Developer Console project
4. Razorpay account

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🐛 Bug Reporting

Found a bug? Please open an issue with a detailed description.

## 📄 License

This project is licensed under the ISC License.

## 👨‍💻 Author

Created by [binelbpe](https://github.com/binelbpe)

