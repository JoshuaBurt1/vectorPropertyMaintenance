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

// 1. PLACE THIS FIRST - Absolute top of the middleware stack
app.use(express.json()); 

// 2. PLACE CORS SECOND
const allowedOrigins = [
  "http://localhost:3000",
  "https://vectorpm-df058.web.app",
  "https://vectorpm-df058.firebaseapp.com",
  "https://vector-property-maintenance.web.app"
];

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

const transporter = nodemailer.createTransport({
  service: "gmail", 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});


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

    const now = new Date();
    const currentHour = now.getHours();
    const isToday = new Date(date).toDateString() === now.toDateString();

    if (isToday) {
      let isExpired = false;
      // Check if current time has hit the start of the period
      if (timeSlot.startsWith("Morning") && currentHour >= 8) isExpired = true;
      if (timeSlot.startsWith("Afternoon") && currentHour >= 12) isExpired = true;
      if (timeSlot.startsWith("Evening") && currentHour >= 16) isExpired = true;

      if (isExpired) {
        res.status(400).json({ 
          error: "This time slot has already started and is no longer available for booking." 
        });
        return;
      }
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

// ADMIN ENDPOINT: Create a new Field Worker account
app.post("/api/admin/create-worker", async (req: Request, res: Response): Promise<void> => {
  console.log("Incoming Headers:", req.headers['content-type']);
  console.log("Incoming Body:", req.body);
  try {
    const { email, fullName, phoneNumber } = req.body;

    // Basic validation
    if (!email || !fullName) {
      res.status(400).json({ error: "Email and Full Name are required." });
      return;
    }

    // 1. Generate a temporary password
    const temporaryPassword = `Vector${Math.floor(1000 + Math.random() * 9000)}!`;

    // 2. Create the user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password: temporaryPassword,
      displayName: fullName,
      phoneNumber: phoneNumber || undefined,
    });

    // 3. Initialize the Worker Profile in Firestore
    await db.collection("admin_workers").doc(fullName).set({
      uid: userRecord.uid,
      name: fullName,
      name_lowercase: fullName.toLowerCase(),
      email: email,
      password: temporaryPassword,
      role: "field_worker",
      status: "active",
      createdAt: new Date().toISOString(),
    });

    // 4. Send Invitation Email
    try {
      const mailOptions = {
        from: `"Vector Admin" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Welcome to Vector Property Maintenance - Worker Account Created",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; color: #333;">
            <h2>Welcome to the Team, ${fullName}!</h2>
            <p>Your worker account has been created. You can now log in to the Mobile App.</p>
            <hr />
            <p><b>Login Email:</b> ${email}</p>
            <p><b>Temporary Password:</b> <code style="background: #eee; padding: 2px 5px;">${temporaryPassword}</code></p>
            <hr />
            <p><i>Please change your password immediately after your first login.</i></p>
            <p>Best regards,<br/>Vector Management</p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log(`[ADMIN] Invitation sent to ${email}`);
    } catch (emailError) {
      console.error("❌ Worker created, but invitation email failed:", emailError);
    }

    res.status(201).json({ 
      success: true, 
      message: "Worker account created and invitation sent.",
      uid: userRecord.uid 
    });

  } catch (error: any) {
    console.error("❌ Error creating worker account:", error);
    res.status(500).json({ error: error.message || "Failed to create worker account." });
  }
});

// Assign work schedule to a worker
app.post("/api/admin/assign-schedule", async (req: Request, res: Response): Promise<void> => {
  try {
    const { workerName, dateString } = req.body;

    if (!workerName || !dateString) {
      res.status(400).json({ error: "workerName and dateString are required." });
      return;
    }

    // 1. Verify worker exists in admin_workers
    const workerDoc = await db.collection("admin_workers").doc(workerName).get();
    if (!workerDoc.exists) {
      res.status(404).json({ error: "Worker not found in admin_workers." });
      return;
    }

    // 2. Combine routes from Morning, Afternoon, and Evening
    const periods = ["Morning", "Afternoon", "Evening"];
    let assignedRoute: any[] = [];

    for (const period of periods) {
      const docId = `${dateString}_${period}`;
      const slotDoc = await db.collection("schedule").doc(docId).get();

      if (slotDoc.exists) {
        const data = slotDoc.data();
        const bookings = data?.bookings || [];
        assignedRoute.push(...bookings);
      }
    }

    // 3. Update admin_workersSchedule with the combined route
    const scheduleRef = db.collection("admin_workersSchedule").doc(dateString);
    
    await scheduleRef.set({
      worker: workerName,
      date: dateString,
      assignedRoute: assignedRoute,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    console.log(`[SCHEDULE] Assigned ${assignedRoute.length} jobs to ${workerName} for ${dateString}`);
    
    res.status(200).json({ 
      success: true, 
      message: `Schedule assigned to ${workerName}`,
      jobCount: assignedRoute.length 
    });

  } catch (error: any) {
    console.error("❌ Error assigning schedule:", error);
    res.status(500).json({ error: "Internal server error assigning schedule." });
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