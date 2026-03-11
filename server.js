
// ===============================
// IMPORTS
// ===============================
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const axios = require('axios');
const PDFDocument = require('pdfkit');

const app = express();
app.use(cors({
  origin: [
    "https://coaching-web-xi.vercel.app",
    "http://localhost:4200"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(express.json());

// ===============================
// MYSQL CONNECTION
// ===============================
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: 38847,
   ssl: {
    rejectUnauthorized: false
  }
});

db.connect((err) => {
  if (err) {
    console.error('❌ DB connection failed:', err);
    return;
  }
  console.log('✅ MySQL Connected');
});

// ===============================
// EMAIL TRANSPORTER
// ===============================

// ===============================
// SEND OTP (EMAIL)
// ===============================
app.post('/api/auth/send-email-otp', async (req, res) => {
  const { email } = req.body;

  if (!email)
    return res.status(400).json({ message: 'Email required' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  try {
    // Purana OTP delete
    await db.promise().query(
      'DELETE FROM email_otps WHERE email = ?',
      [email]
    );

    // Naya OTP insert
    await db.promise().query(
      'INSERT INTO email_otps (email, otp, expires_at) VALUES (?, ?, ?)',
      [email, otp, expiresAt]
    );

    // Email send
    await sendOtpEmail(email, otp);

    console.log('📧 OTP:', otp);
    res.json({ success: true, message: 'OTP sent to email' });

  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===============================
// VERIFY OTP (EMAIL)
// ===============================
app.post('/api/auth/verify-email-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp)
    return res.status(400).json({ message: 'Email & OTP required' });

  try {
    const [rows] = await db.promise().query(
      'SELECT * FROM email_otps WHERE email = ? AND otp = ?',
      [email, otp]
    );

    if (rows.length === 0)
      return res.status(400).json({ message: 'Invalid OTP' });

    const record = rows[0];

    if (new Date(record.expires_at) < new Date())
      return res.status(400).json({ message: 'OTP expired' });

    // OTP used → delete
    await db.promise().query(
      'DELETE FROM email_otps WHERE email = ?',
      [email]
    );

    res.json({ success: true, message: 'Login successful' });

  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===============================
// SEND EMAIL FUNCTION
// ===============================

async function sendOtpEmail(email, otp) {

  await axios.post(
    "https://api.brevo.com/v3/smtp/email",
    {
      sender: {
        name: "Institute App",
        email: process.env.BREVO_USER
      },

      to: [
        { email: email }
      ],

      subject: "OTP for Institute App Login",

      htmlContent: `
        <h2>Your OTP is: ${otp}</h2>
        <p>This OTP is valid for 10 minutes.</p>
      `
    },

    {
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json"
      }
    }
  );

}
// ===============================
// RAZORPAY ORDER CREATE
// ===============================
const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

app.post('/api/payment/create-order', async (req, res) => {
  const { amount, email } = req.body;

  try {
     
    console.log("BODY:", req.body);
    console.log("KEY_ID:", process.env.RAZORPAY_KEY_ID);
    console.log("KEY_SECRET:", process.env.RAZORPAY_KEY_SECRET);

    const order = await razorpay.orders.create({
      amount: amount * 100, // ₹ → paise
      currency: 'INR',
      receipt: 'rcpt_' + Date.now()
    });

    await db.promise().query(
      `INSERT INTO payments (email, razorpay_order_id, amount, status)
       VALUES (?, ?, ?, 'created')`,
      [email, order.id, amount]
    );

    res.json({
      orderId: order.id,
      key: process.env.RAZORPAY_KEY_ID
    });

  } catch (err) {
    res.status(500).json({ message: 'Order creation failed' });
  }
});

// ===============================
// VERIFY PAYMENT
// ===============================
app.post('/api/payment/verify', async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  } = req.body;

  const generatedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + '|' + razorpay_payment_id)
    .digest('hex');

  if (generatedSignature !== razorpay_signature) {
    return res.status(400).json({ message: 'Invalid signature' });
  }

  await db.promise().query(
    `UPDATE payments 
     SET razorpay_payment_id=?, razorpay_signature=?, status='paid'
     WHERE razorpay_order_id=?`,
    [razorpay_payment_id, razorpay_signature, razorpay_order_id]
  );

  res.json({ success: true });
});

// ===============================
// DOWNLOAD PAYMENT INVOICE
// ===============================

app.get('/api/payment/invoice/:paymentId', async (req, res) => {

  const paymentId = req.params.paymentId;

  const [rows] = await db.promise().query(
    "SELECT * FROM payments WHERE razorpay_payment_id=?",
    [paymentId]
  );

  const payment = rows[0];

  const doc = new PDFDocument({ margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=invoice.pdf');

  doc.pipe(res);

  // Header
  doc
    .fontSize(22)
    .fillColor('#0b5ed7')
    .text('Kundan Institute App', { align: 'center' });

  doc.moveDown(0.5);

  doc
    .fontSize(16)
    .fillColor('black')
    .text('INVOICE', { align: 'center' });

  doc.moveDown(2);

  // Customer Info
  doc.fontSize(12).text(`Email: ${payment.email}`);
  doc.text(`Order ID: ${payment.razorpay_order_id}`);
  doc.text(`Payment ID: ${payment.razorpay_payment_id}`);
  doc.text(`Date: ${payment.created_at}`);

  doc.moveDown(2);

  // Table header
  doc.fontSize(14).text('Course', 50);
  doc.text('Amount', 400);

  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();

  doc.moveDown(0.5);

  // Table data
  doc.fontSize(12).text('Class 10 Maths', 50);
  doc.text(`RS${payment.amount}`, 400);

  doc.moveDown(2);

  doc.fontSize(14).fillColor('green').text('Status: PAID');

  doc.moveDown(2);

  doc
    .fillColor('black')
    .fontSize(10)
    .text('Thank you for purchasing from Kundan Institute App.', {
      align: 'center'
    });

  doc.end();

});

// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
