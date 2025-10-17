# Tri-Aura Project

## What is this project?

Tri-Aura is a web application built with Node.js and Express. It helps manage users, sellers, and admins. People can sign up, log in, make payments, chat with an AI, and send contact messages. It uses a database to store information and has different roles for different types of users.

## Main Features

- **User Accounts**: Users can create accounts, log in with email/password or Google, and view their profiles.
- **Roles**: There are three types of users - regular users, sellers, and admins. Each has different permissions.
- **Payments**: Users can make payments using cards through Flutterwave.
- **AI Chat**: Users can chat with an AI powered by Google Gemini.
- **Contact Form**: People can send messages through a contact form, and emails are sent using Resend.
- **Web Pages**: The app has simple web pages for signing up, logging in, and viewing dashboards.

## Technologies Used

- **Backend**: Node.js with Express.js (for building the server and APIs)
- **Database**: MongoDB with Mongoose (for storing user data)
- **Authentication**: JWT (JSON Web Tokens) for keeping users logged in
- **Payments**: Flutterwave (for processing card payments)
- **AI**: Google Gemini API (for chat features)
- **Emails**: Nodemailer and Resend (for sending emails)
- **Views**: EJS (for creating web pages)
- **Other**: bcryptjs (for password security), cors (for cross-origin requests)

## How to Set Up and Run

### Step 1: Install Node.js
Make sure you have Node.js installed on your computer. You can download it from nodejs.org.

### Step 2: Get the Project
Download or clone this project to your computer.

### Step 3: Install Dependencies
Open a terminal in the project folder and run:
```
npm install
```

### Step 4: Set Up Environment Variables
Create a file named `.env` in the project root. Add these lines (replace with your real values):
```
URI=mongodb://localhost:27017/tri-aura  # Your MongoDB connection string
JWT_SECRET=your_secret_key_here  # A secret key for JWT tokens
EMAIL_USER=your_email@gmail.com  # Your Gmail for sending emails
EMAIL_PASS=your_app_password  # Gmail app password
GOOGLE_CLIENT_ID=your_google_client_id  # From Google Console
GEMINI_API_KEY=your_gemini_api_key  # From Google AI Studio
FLUTTERWAVE_PUBLIC_KEY=your_flutterwave_public_key  # From Flutterwave
FLUTTERWAVE_SECRET_KEY=your_flutterwave_secret_key  # From Flutterwave
FLUTTERWAVE_ENCRYPTION_KEY=your_encryption_key  # From Flutterwave
RESEND_API_KEY=your_resend_api_key  # From Resend
TO_EMAIL=your_email@example.com  # Where contact emails go
PORT=7145  # Port number for the server
```

### Step 5: Start the Server
Run this command:
```
node index.js
```
The server will start on port 7145. Open http://localhost:7145 in your browser.

## API Endpoints

The app has different endpoints for different actions. All responses are in JSON format.

### User Endpoints
- `GET /user/signup` - Get signup page info
- `POST /user/register` - Create a new user account
- `GET /user/signin` - Get signin page info
- `POST /user/login` - Log in a user
- `POST /user/signin` - Alternative login
- `GET /user/profile` - Get user profile (needs token)
- `GET /user/dashboard` - Get user dashboard (needs token)
- `POST /user/google-auth` - Log in with Google

### Seller Endpoints
- `GET /seller/signup` - Get seller signup page
- `POST /seller/register` - Create a new seller account
- `GET /seller/login` - Get seller login page
- `POST /seller/login` - Log in a seller

### Admin Endpoints
- `GET /admin/signup` - Get admin signup page
- `POST /admin/register` - Create a new admin account
- `GET /admin/login` - Get admin login page
- `POST /admin/login` - Log in an admin
- `GET /admin/dashboard` - Get admin dashboard

### Payment Endpoints (all need token)
- `GET /payment/test` - Test payment page
- `POST /payment/initiate` - Start a payment
- `POST /payment/complete` - Finish a payment (with PIN/OTP)
- `GET /payment/verify` - Check if payment was successful
- `GET /payment/history` - Get user's payment history

### Other Endpoints
- `POST /chat` - Send a message to the AI
- `POST /api/contact` - Send a contact message

## How to Use

### Sign Up a User
Send a POST request to `/user/register` with:
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

### Log In
Send a POST request to `/user/login` with:
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```
You'll get a token. Use this token in the Authorization header for protected endpoints: `Bearer your_token_here`

### Make a Payment
1. Start payment: POST to `/payment/initiate` with amount, currency, etc.
2. Complete payment: POST to `/payment/complete` with PIN or OTP.
3. Verify: GET `/payment/verify`

### Chat with AI
Send a POST request to `/chat` with:
```json
{
  "message": "Hello AI",
  "history": []  // Optional chat history
}
```

## File Structure

- `index.js` - Main server file
- `controllers/` - Logic for handling requests (user, seller, admin, payment, contact)
- `models/` - Database schemas (user, seller, admin)
- `routes/` - API endpoint definitions
- `views/` - EJS templates for web pages
- `package.json` - Project dependencies and scripts
- `.env` - Environment variables (not in git)
- `.gitignore` - Files to ignore in git

## Notes

- The app uses MongoDB, so make sure it's running.
- For emails, set up Gmail app password or use another service.
- Payment testing uses test card numbers from Flutterwave.
- AI chat needs a Gemini API key from Google.
- All passwords are hashed for security.
- The app has CORS enabled for cross-origin requests.

## Troubleshooting

- If MongoDB connection fails, check your URI in .env
- If emails don't send, check EMAIL_USER and EMAIL_PASS
- If payments fail, check Flutterwave keys
- If AI doesn't work, check GEMINI_API_KEY

This project is for learning and can be improved. Feel free to add features or fix bugs!
