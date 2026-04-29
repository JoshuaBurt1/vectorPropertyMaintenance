import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import cron from "node-cron";
import * as admin from "firebase-admin";
import path from "path";
import nodemailer from "nodemailer";

const app = express();
const PORT = Number(process.env.PORT) || 8080;

// =========================================================
// 1. HEALTH CHECKS
// =========================================================
app.get("/", (req, res) => res.send("Vector Property Maintenance API is Live."));
app.get("/health", (req, res) => res.json({ status: "API is running." }));

// =========================================================
// 2. SAFE INITIALIZATION
// =========================================================
let db: admin.firestore.Firestore;
let transporter: nodemailer.Transporter;

try {
  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } else {
    const serviceAccountPath = path.resolve(__dirname, "../service-account.json");
    serviceAccount = require(serviceAccountPath);
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://vectorpm-df058.firebaseio.com" 
  });

  db = admin.firestore();
  console.log("✅ Firebase Admin connected");
} catch (error) {
  console.error("❌ Firebase Init Failed:", error);
}

try {
  transporter = nodemailer.createTransport({
    service: "gmail", 
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
} catch (error) {
  console.error("❌ Nodemailer Init Failed:", error);
}

// =========================================================
// 3. MIDDLEWARE
// =========================================================
app.use(express.json()); 

const allowedOrigins = [
  "http://localhost:3000",
  "https://vectorpm-df058.web.app",
  "https://vectorpm-df058.firebaseapp.com",
  "https://vector-property-maintenance.web.app"
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

// =========================================================
// 4. GLOBAL HELPERS & PAYPAL
// =========================================================
const getTodayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_APP_SECRET = process.env.PAYPAL_APP_SECRET;
const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

async function generatePayPalAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_APP_SECRET}`).toString("base64");
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    body: "grant_type=client_credentials",
    headers: { Authorization: `Basic ${auth}` },
  });
  const data = await response.json();
  return data.access_token;
}

// =========================================================
// 5. ROUTE OPTIMIZATION LOGIC (OSRM)
// =========================================================
const HOME_BASE = { lat: 44.3894, lng: -79.6903 };

function getDistance(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = (p2.lat - p1.lat) * (Math.PI / 180);
  const dLon = (p2.lng - p1.lng) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1.lat * (Math.PI / 180)) * Math.cos(p2.lat * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function getRoadData(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${p1.lng},${p1.lat};${p2.lng},${p2.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes?.[0]) {
      return {
        distance: data.routes[0].distance / 1000,
        coords: data.routes[0].geometry.coordinates 
      };
    }
    return { distance: 0, coords: [] };
  } catch (error) {
    console.error("[OSRM Error]:", error);
    return { distance: 0, coords: [] };
  }
}

async function generateDailyRoute(dateString: string) {
  const slots = ["Morning", "Afternoon", "Evening"];
  const batch = db.batch();
  let currentPos = HOME_BASE;
  let totalRoadDist = 0, totalStraightDist = 0, jobCount = 0;
  let fullDailyRoute: any[] = [], coordinate_route: string[] = []; 

  for (const slot of slots) {
    const docRef = db.collection("schedule").doc(`${dateString}_${slot}`);
    const doc = await docRef.get();
    if (doc.exists) {
      const bookings = doc.data()?.bookings || [];
      let unvisited = [...bookings], sorted = [];
      while (unvisited.length > 0) {
        let bestIdx = 0, minDist = Infinity;
        unvisited.forEach((b, i) => {
          const d = getDistance(currentPos, { lat: b.location[0], lng: b.location[1] });
          if (d < minDist) { minDist = d; bestIdx = i; }
        });
        const next = unvisited.splice(bestIdx, 1)[0];
        const road = await getRoadData(currentPos, { lat: next.location[0], lng: next.location[1] });
        totalStraightDist += minDist;
        totalRoadDist += road.distance;
        if (road.coords) coordinate_route.push(...road.coords.map((c: any) => `${c[0]},${c[1]}`));
        currentPos = { lat: next.location[0], lng: next.location[1] };
        jobCount++;
        fullDailyRoute.push(next);
        sorted.push(next);
      }
      batch.update(docRef, { bookings: sorted });
    }
  }
  const backHome = await getRoadData(currentPos, HOME_BASE);
  totalRoadDist += backHome.distance;
  await batch.commit();
  return { route: fullDailyRoute, coordinate_route, distance: totalRoadDist, straightLineTotal: totalStraightDist };
}

// =========================================================
// 6. ENDPOINTS
// =========================================================

let clients: Response[] = [];

app.get("/api/schedule/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  clients.push(res);
  req.on("close", () => clients = clients.filter(c => c !== res));
});

const broadcastUpdate = (data: any) => clients.forEach(c => c.write(`data: ${JSON.stringify(data)}\n\n`));

app.get("/api/schedule", async (req, res) => {
  try {
    const snap = await db.collection("schedule").where("dateString", ">=", getTodayStr()).get();
    const bookings = snap.docs.map(doc => ({
      date: doc.data().dateString,
      timeSlot: doc.data().timeSlot,
      count: doc.data().bookings?.length || 0
    }));
    res.json(bookings);
  } catch (e) { res.status(500).json({ error: "Fetch failed" }); }
});

// --- THE SIMPLIFIED BOOKING ENDPOINT ---
app.post("/api/book", async (req: Request, res: Response) => {
  try {
    const { name, email, address, phone, location, service, date, timeSlot } = req.body;

    if (!name || !email || !address || !date || !timeSlot) {
       return res.status(400).json({ error: "Missing fields" });
    }

    const dateString = date.substring(0, 10);
    const slotSlug = timeSlot.split(' ')[0]; 
    const documentId = `${dateString}_${slotSlug}`;

    const newBooking = {
      name, email, phone, address, location, service,
      period: slotSlug.toLowerCase(),
      createdAt: new Date().toISOString(),
      status: "pending",
      transactionId: req.body.transactionId || `tx_${Date.now()}`
    };

    // Use arrayUnion: No transaction, no lock, extremely fast.
    await db.collection("schedule").doc(documentId).set({
      dateString,
      timeSlot,
      bookings: admin.firestore.FieldValue.arrayUnion(newBooking)
    }, { merge: true });

    broadcastUpdate({ type: "REFRESH_SCHEDULE", documentId });

    // Send Email (Fire and forget to avoid delaying the response)
    const mailOptions = {
      from: `"Vector PM" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Booking Confirmed: ${service}`,
      html: `<h3>Hi ${name}, your booking for ${service} on ${dateString} is confirmed.</h3>`
    };
    transporter.sendMail(mailOptions).catch(e => console.error("Email error:", e));

    res.status(201).json({ success: true, documentId });
  } catch (error) {
    console.error("Booking error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// =========================================================
// 7. PAYPAL & ADMIN ENDPOINTS (Maintained as provided)
// =========================================================

app.post("/api/paypal/create-order", async (req, res) => {
  try {
    const token = await generatePayPalAccessToken();
    const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ amount: { currency_code: "CAD", value: "50.00" } }],
      }),
    });
    const order = await response.json();
    res.json({ id: order.id });
  } catch (e) { res.status(500).send("Paypal Error"); }
});

app.post("/api/paypal/capture-order", async (req, res) => {
  try {
    const token = await generatePayPalAccessToken();
    const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${req.body.orderID}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    res.json(await response.json());
  } catch (e) { res.status(500).send("Capture Error"); }
});

app.post("/api/admin/create-worker", async (req, res) => {
  try {
    const { email, fullName } = req.body;
    const tempPass = `Vector${Math.floor(1000 + Math.random() * 9000)}!`;
    const user = await admin.auth().createUser({ email, password: tempPass, displayName: fullName });
    await db.collection("admin_workers").doc(fullName).set({
      uid: user.uid, name: fullName, email, password: tempPass, role: "field_worker", status: "active", createdAt: new Date().toISOString()
    });
    res.status(201).json({ success: true, uid: user.uid });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post("/api/admin/assign-schedule", async (req, res) => {
  try {
    const { workerName, dateString } = req.body;
    const routeData = await generateDailyRoute(dateString);
    await db.collection("admin_workersSchedule").doc(dateString).set({
      worker: workerName, date: dateString, assignedRoute: routeData.route, coordinate_route: routeData.coordinate_route,
      distance: routeData.distance, updatedAt: new Date().toISOString()
    }, { merge: true });
    res.json({ success: true });
  } catch (e) { res.status(500).send("Assign Error"); }
});

// =========================================================
// 8. BACKGROUND CRON TASKS
// =========================================================

cron.schedule("*/15 * * * *", async () => {
  if (!db) return;
  try {
    const today = getTodayStr();
    const snap = await db.collection("schedule").where("dateString", ">=", today).get();
    const dates = Array.from(new Set(snap.docs.map(d => d.data().dateString)));

    for (const dStr of dates) {
      console.log(`[SYNC] Optimizing ${dStr}...`);
      const routeData = await generateDailyRoute(dStr);
      await db.collection("admin_workersSchedule").doc(dStr).set({
        assignedRoute: routeData.route,
        coordinate_route: routeData.coordinate_route,
        distance: routeData.distance,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
  } catch (e) { console.error("Cron Error", e); }
}, { timezone: "America/Toronto" });

// =========================================================
// 9. SERVER START
// =========================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 VectorPM Server on port ${PORT}`);
});