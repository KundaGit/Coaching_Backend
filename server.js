// // ===============================
// // IMPORTS
// // ===============================
// require('dotenv').config();
// const express = require('express');
// const mysql = require('mysql2');
// const cors = require('cors');
// const axios = require('axios');
// const app = express();
// app.use(cors());
// app.use(express.json());

// // ===============================
// // MYSQL CONNECTION
// // ===============================
// const db = mysql.createConnection({
//   host: 'localhost',
//   user: 'root',
//   password: 'Anitak@123',
//   database: 'otp_auth'
// });

// // Db connection test
// db.connect((err) => {
//   if (err) {
//     console.error("DB connection failed:", err);
//     return;
//   }
//   console.log("MySQL Connected");
// });

// // ===============================
// // SEND OTP API
// // ===============================


// app.post('/api/auth/send-otp', (req, res) => {
//   const { mobile } = req.body;

//   if (!mobile)
//     return res.status(400).json({ message: 'Mobile required' });

//   const otp = Math.floor(100000 + Math.random() * 900000).toString();
//   const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

//   db.query('DELETE FROM otps WHERE mobile = ?', [mobile]);

//   db.query(
//     'INSERT INTO otps (mobile, otp, expires_at) VALUES (?, ?, ?)',
//     [mobile, otp, expiresAt],
//     async () => {
//       await sendOtpSMS(mobile, otp);
//         console.log('OTP:', otp); // 🔥 SMS later
//       res.json({ success: true, message: 'OTP sent' });
//     }
//   );
// });

// // ===============================
// // VERIFY OTP API
// // ===============================
// app.post('/api/auth/verify-otp', (req, res) => {
//   const { mobile, otp } = req.body;

//   db.query(
//     'SELECT * FROM otps WHERE mobile = ? AND otp = ?',
//     [mobile, otp],
//     (err, results) => {
//       if (results.length === 0)
//         return res.status(400).json({ message: 'Invalid OTP' });

//       const record = results[0];

//       if (new Date(record.expires_at) < new Date())
//         return res.status(400).json({ message: 'OTP expired' });

//       // delete otp after success
//       db.query('DELETE FROM otps WHERE mobile = ?', [mobile]);

//       res.json({ success: true, message: 'Login successful' });
//     }
//   );
// });

// async function sendOtpSMS(mobile, otp) {

//   // 🔍 DEBUG CHECK (YAHI ADD KARNA HAI)
//   console.log('AUTHKEY:', process.env.MSG91_AUTH_KEY ? 'OK' : 'MISSING');
//   console.log('TEMPLATE:', process.env.MSG91_TEMPLATE_ID ? 'OK' : 'MISSING')
//   if (process.env.USE_SMS !== 'true') {
//     console.log('📴 SMS OFF | OTP:', otp);
//     return;
//   }

//   try {
//     await axios.post(
//       'https://control.msg91.com/api/v5/otp',
//       {
//         template_id: process.env.MSG91_TEMPLATE_ID,
//         mobile: '91' + mobile,
//         otp: otp
//       },
//       {
//         headers: {
//           authkey: process.env.MSG91_AUTH_KEY,
//           'Content-Type': 'application/json'
//         }
//       }
//     );

//     console.log('📱 OTP sent via MSG91 to', mobile);
//   } catch (err) {
//     console.error(
//       '❌ MSG91 error:',
//       err.response?.data || err.message
//     );
//   }
// }
// app.listen(5000, () => {
//   console.log('🚀 Server running on http://localhost:5000');
// });



// ===============================
// IMPORTS
// ===============================
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

// ===============================
// MYSQL CONNECTION
// ===============================
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
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
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

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
  await transporter.sendMail({
    from: `"Institute App" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'OTP for Institute App Login',
    html: `
      <div style="font-family: Arial, sans-serif; background:#f4f6f8; padding:20px">
        <div style="max-width:600px; margin:auto; background:#ffffff; border:1px solid #ddd">

          <!-- HEADER -->
          <div style="background:#0b5ed7; color:#fff; padding:15px; text-align:center">
            <h2 style="margin:0">Institute App</h2>
          </div>

          <!-- BODY -->
          <div style="padding:20px; color:#000">
            <p>Dear <b>Candidate</b>,</p>

            <p>
              You have successfully generated OTP for <b>Institute App</b>.
            </p>

            <p>
              OTP is valid for <b>10 minutes</b>.
            </p>

            <p>
              Do not share the OTP with anyone to avoid misuse of your account.
            </p>

            <p style="font-size:18px; margin:20px 0">
              <b>The OTP is: 
                <span style="letter-spacing:2px; font-size:22px">${otp}</span>
              </b>
            </p>

            <p>
              If you have not done this activity, please contact the
              <b>"Support Team"</b> immediately.
            </p>

            <br />

            <p>
              Thank You,<br />
              <b>Institute App Team</b>
            </p>
          </div>

          <!-- FOOTER -->
          <div style="background:#f1f1f1; padding:10px; text-align:center; font-size:12px">
            <p style="margin:0">
              Note: This is a system generated email. Please do not reply.
            </p>
          </div>

        </div>
      </div>
    `
  });
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
     console.log('BODY:', req.body);
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
// START SERVER
// ===============================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});