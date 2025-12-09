// server.js
import express from "express";
import Stripe from "stripe";
import cors from "cors";

// Read secret key from environment variable
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ---------------------------------------------------------------------
// Very simple in-memory store (OK for assignment/demo)
// ---------------------------------------------------------------------
const payments = new Map(); // key: paymentId, value: { status, name, amount, updatedAt }

// Helper to upsert payment
function updatePayment(paymentId, payload) {
  const prev = payments.get(paymentId) || {};
  const next = {
    ...prev,
    ...payload,
    updatedAt: Date.now(),
  };
  payments.set(paymentId, next);
  return next;
}

// ---------------------------------------------------------------------
// Express setup
// ---------------------------------------------------------------------
const app = express();

app.use(
  cors({
    origin: [
      "https://wx345.github.io",          // your GitHub Pages
      "http://localhost:3000",            // dev (optional)
      "capacitor://localhost",            // Android WebView
      "http://localhost",                 // Android WebView variations
      "splitbill-backend-is66.onrender.com"
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: false
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.send("SplitBill backend is running.");
});

// ---------------------------------------------------------------------
// 1. Create Checkout Session  (this is your create-checkout-session)
// ---------------------------------------------------------------------
app.post("/create-checkout-session", async (req, res) => {
  try {
    // ⬅️ now also expect paymentId from the frontend
    const { name, total, payment_method, paymentId } = req.body;

    if (!paymentId) {
      return res
        .status(400)
        .json({ error: "paymentId is required for tracking status" });
    }

    const amount = Math.round((Number(total) || 0) * 100); // RM -> sen

    // Save "pending" status before redirecting to Stripe
    updatePayment(paymentId, {
      status: "pending",
      name,
      amount: total,
    });

    const paymentMethodTypes =
      payment_method === "bank"
        ? ["card"] // later: ["card", "fpx"] once you enable FPX in Stripe
        : ["card"];

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: paymentMethodTypes,
      line_items: [
        {
          price_data: {
            currency: "myr",
            product_data: { name: `Bill for ${name}` },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      // pass paymentId through to your success/cancel pages
      success_url:
        "https://wx345.github.io/bill-summary/success.html?status=success&paymentId=" +
        encodeURIComponent(paymentId),
      cancel_url:
        "https://wx345.github.io/bill-summary/cancel.html?status=cancel&paymentId=" +
        encodeURIComponent(paymentId),
    });

    res.json({ sessionId: session.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to create checkout session" });
  }
});

// ---------------------------------------------------------------------
// 2. Endpoint called by success.html / cancel.html
//    → tells backend: approved / declined
// ---------------------------------------------------------------------
app.post("/api/payment-status", (req, res) => {
  const { paymentId, status } = req.body;
  if (!paymentId || !status) {
    return res
      .status(400)
      .json({ error: "paymentId and status are required" });
  }

  const updated = updatePayment(paymentId, { status });

  console.log("[payment-status] updated", paymentId, "=>", updated);

  res.json(updated);
});


// ---------------------------------------------------------------------
// 3. Endpoint called by Android app to poll payment status
// ---------------------------------------------------------------------
app.get("/api/payment-status/:paymentId", (req, res) => {
  const paymentId = req.params.paymentId;
  const info = payments.get(paymentId);

  if (!info) {
    // If we don't know this payment yet, just say "pending"
    return res.json({ status: "pending" });
  }

  // Only send what Android actually needs
  res.json({
    status: info.status || "pending",
  });
});

// ---------------------------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
