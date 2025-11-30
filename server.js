// server.js
import express from "express";
import Stripe from "stripe";
import cors from "cors";

// Read secret key from environment variable
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Very simple in-memory store (OK for assignment/demo)
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

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("SplitBill backend is running.");
});

app.post("/create-checkout-session", async (req, res) => {
  try {
    const { name, total, payment_method } = req.body;

    const amount = Math.round((Number(total) || 0) * 100); // RM -> sen

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
      success_url:
        "https://wx345.github.io/bill-summary/success.html?status=success",
      cancel_url:
        "https://wx345.github.io/bill-summary/cancel.html?status=cancel",
    });

    res.json({ sessionId: session.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to create checkout session" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
