import express from "express";
import Stripe from "stripe";
import cors from "cors";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const payments = new Map();

function updatePayment(paymentId, payload) {
  const prev = payments.get(paymentId) || {};
  const next = { ...prev, ...payload, updatedAt: Date.now() };
  payments.set(paymentId, next);
  return next;
}

const app = express();

app.use(
  cors({
    origin: [
      "https://wx345.github.io",
      "http://localhost:3000",
      "capacitor://localhost",
      "http://localhost"
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.send("SplitBill backend is running.");
});

app.post("/create-checkout-session", async (req, res) => {
  try {
    const { name, total, payment_method, paymentId } = req.body;
    if (!paymentId) {
      return res.status(400).json({ error: "paymentId is required for tracking status" });
    }

    const amount = Math.round((Number(total) || 0) * 100);

    updatePayment(paymentId, {
      status: "pending",
      name,
      amount: total,
    });

    const paymentMethodTypes =
      payment_method === "bank" ? ["card"] : ["card"];

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

app.post("/api/payment-status", (req, res) => {
  const { paymentId, status } = req.body;
  if (!paymentId || !status) {
    return res.status(400).json({ error: "paymentId and status are required" });
  }

  const updated = updatePayment(paymentId, { status });
  console.log("[payment-status] updated", paymentId, "=>", updated);
  res.json(updated);
});

app.get("/api/payment-status/:paymentId", (req, res) => {
  const paymentId = req.params.paymentId;
  const info = payments.get(paymentId);
  if (!info) {
    return res.json({ status: "pending" });
  }
  res.json({ status: info.status || "pending" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// NEW endpoint for Android PaymentSheet
app.post("/create-payment-intent-mobile", async (req, res) => {
  try {
    const { amount, paymentId, currency = "myr" } = req.body;

    if (!paymentId) {
      return res.status(400).json({ error: "paymentId is required" });
    }

    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const stripeAmount = Math.round(amountNum * 100); // RM → sen

    updatePayment(paymentId, {
      status: "pending",
      amount: amountNum,
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: stripeAmount,
      currency,
      // let Stripe decide payment methods
      automatic_payment_methods: { enabled: true },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to create PaymentIntent" });
  }
});

