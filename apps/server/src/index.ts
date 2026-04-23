//server/src/index.ts
import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import cron from "node-cron";
import * as admin from "firebase-admin";
import path from "path";
import nodemailer from "nodemailer";

// ROUTE OPTIMIZATION LOGIC

const HOME_BASE = { lat: 44.3894, lng: -79.6903 };

function getDistance(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = (p2.lat - p1.lat) * (Math.PI / 180);
  const dLon = (p2.lng - p1.lng) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(p1.lat * (Math.PI / 180)) * Math.cos(p2.lat * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function optimizeDayRoute(dateString: string) {
  const slots = ["Morning", "Afternoon", "Evening"];
  const batch = db.batch();
  
  // Start the day at the shop
  let currentPos = HOME_BASE;
  let totalDistance = 0;

  for (const slot of slots) {
    const docId = `${dateString}_${slot}`;
    const docRef = db.collection("schedule").doc(docId);
    const doc = await docRef.get();

    if (doc.exists) {
      const data = doc.data();
      const bookings = data?.bookings || [];

      if (bookings.length > 0) {
        // 1. Sort the bookings by distance from the worker's current location
        bookings.sort((a: any, b: any) => {
          const distA = getDistance(currentPos, { lat: a.location[0], lng: a.location[1] });
          const distB = getDistance(currentPos, { lat: b.location[0], lng: b.location[1] });
          return distA - distB;
        });

        // 2. Accumulate distance and update currentPos for each booking
        for (const b of bookings) {
          const bLoc = { lat: b.location[0], lng: b.location[1] };
          totalDistance += getDistance(currentPos, bLoc);
          currentPos = bLoc;
        }

        // 3. Add the sorted array to our update batch
        batch.update(docRef, { bookings });
      }
    }
  }

  // 4. Update the daily log with the total projected distance
  const logRef = db.collection("daily_log").doc(dateString);
  //totalDistance += getDistance(currentPos, HOME_BASE); // distance back to HOME_BASE
  batch.set(logRef, { 
    distance: Number(totalDistance.toFixed(2)) 
  }, { merge: true });

  await batch.commit();
}

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  // Use the environment variable
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
} else {
  // Fall back to local file for localhost development
  const serviceAccountPath = path.resolve(__dirname, "../service-account.json");
  serviceAccount = require(serviceAccountPath);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://vectorpm-df058.firebaseio.com" 
});

const db = admin.firestore();
console.log("✅ VectorPM Firebase Admin connected");

// Test writing a piece of data to DB
const testConnection = async () => {
  try {
    await db.collection('system_checks').add({
      status: 'online',
      timestamp: new Date().toISOString()
    });
    console.log("🚀 Firestore connection verified! Test document written.");
  } catch (e) {
    console.error("❌ Firestore connection failed:", e);
  }
};

testConnection();

const app = express();
const PORT = process.env.PORT || 8080;

// MIDDLEWARE
const allowedOrigins = [
  "http://localhost:3000",
  "https://vectorpm-df058.web.app",
  "https://vectorpm-df058.firebaseapp.com",
  "https://vector-property-maintenance.web.app"
];

const transporter = nodemailer.createTransport({
  service: "gmail", 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile or Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

app.use(express.json());

// GET SCHEDULES ENDPOINT: reads the database so the frontend knows which slots are taken.
app.get("/api/schedule", async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    // Only fetching dates from today onwards to save read costs
    const todayStr = new Date().toISOString().split('T')[0];
    const snapshot = await db.collection("schedule")
      .where("dateString", ">=", todayStr)
      .get();
    
    // send the dates, timeSlots, and fullness count to the frontend
    const bookings = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        date: data.dateString,
        timeSlot: data.timeSlot,
        count: data.bookings ? data.bookings.length : 0
      };
    });

    res.status(200).json(bookings);
  } catch (error) {
    console.error("Error fetching schedule:", error);
    res.status(500).json({ error: "Internal server error fetching schedule." });
  }
});

let clients: Response[] = [];

app.get("/api/schedule/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Add this user to notification list
  clients.push(res);

  // Remove them when they close the tab
  req.on("close", () => {
    clients = clients.filter(client => client !== res);
  });
});

// Create a function to shout to everyone
const broadcastUpdate = (data: any) => {
  clients.forEach(client => client.write(`data: ${JSON.stringify(data)}\n\n`));
};

// BOOKING ENDPOINT
app.post("/api/book", async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, address, location, service, date, timeSlot } = req.body;

    if (!name || !email || !address || !location || !service || !date || !timeSlot) {
      res.status(400).json({ error: "Missing required booking fields." });
      return;
    }

    const dateObj = new Date(date);
    const dateString = dateObj.toISOString().split('T')[0]; // "YYYY-MM-DD"
    const slotSlug = timeSlot.split(' ')[0]; // extracts "Morning", "Afternoon", or "Evening"
    const documentId = `${dateString}_${slotSlug}`; // document ID

    // 1. Transaction to ensure we never exceed 2 bookings per slot concurrently
    await db.runTransaction(async (t) => {
      const slotRef = db.collection("schedule").doc(documentId);
      const doc = await t.get(slotRef);
      
      let currentBookings = [];
      if (doc.exists) {
        currentBookings = doc.data()?.bookings || [];
        if (currentBookings.length >= 2) {
          throw new Error("SLOT_FULL");
        }
      }

      currentBookings.push({
        name,
        name_lowercase: name.toLowerCase(),
        email,
        address,
        location,
        service,
        originalDate: date,
        status: "pending",
        createdAt: new Date().toISOString()
      });

      t.set(slotRef, {
        dateString,
        timeSlot,
        bookings: currentBookings
      }, { merge: true });
    });

    await optimizeDayRoute(dateString);

    console.log(`[BOOKING] Slot updated & Route Optimized: ${documentId}`);
    broadcastUpdate({ type: "REFRESH_SCHEDULE", documentId });

    // 2. Wrap Email in a separate try/catch so it doesn't break the response
    try {
      const formattedDate = new Date(date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const mailOptions = {
        from: `"Vector Property Maintenance" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `Booking Confirmed: ${service}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; color: #333;">
            <h2>Booking Confirmation</h2>
            <p>Hi <b>${name}</b>,</p>
            <p>We've received your request for <b>${service}</b>.</p>
            <hr />
            <p><b>Date:</b> ${formattedDate}</p>
            <p><b>Time Window:</b> ${timeSlot}</p>
            <p><b>Location:</b> ${address}</p>
            <p><b>Geocoordinate:</b> ${location}</p>
            <hr />
            <p>Best regards,<br/>The Vector Team</p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log(`[EMAIL] Sent to ${email}`);
    } catch (emailError) {
      console.error("❌ Failed to send confirmation email:", emailError);
    }

    // 3. Always return success if the DB write worked
    res.status(201).json({ success: true, documentId });
    
  } catch (error: any) {
    if (error.message === "SLOT_FULL") {
      res.status(409).json({ error: "This time slot is already fully booked." });
      return;
    }
    console.error("❌ Critical error during booking:", error);
    res.status(500).json({ error: "Internal server error during booking." });
  }
});

// Scheduling Task: Runs every 15 minutes (this could be every 4 hours)
cron.schedule("*/15 * * * *", async () => {
  console.log("Running scheduled archiving task...");
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Find all schedule documents where the date is strictly before today
    const snapshot = await db.collection("schedule")
      .where("dateString", "<", todayStr)
      .get();

    if (snapshot.empty) {
      return;
    }

    const batch = db.batch();

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const completedRef = db.collection("completedWorkOrders").doc(doc.id);
      
      // Copy to completedWorkOrders
      batch.set(completedRef, data);
      
      // Delete from schedule
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`Successfully archived ${snapshot.size} past schedule documents.`);
  } catch (error) {
    console.error("Error running cron task:", error);
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "API is running, scheduler is active." });
});

const isProd = process.env.NODE_ENV === "production";
const SERVER_URL = isProd 
  ? "https://vectorpropertymaintenance.onrender.com" 
  : `http://localhost:${PORT}`;

app.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log(`📡 Health check: ${SERVER_URL}/health`);
});