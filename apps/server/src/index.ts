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

// --- Helper for Road Distance & Geometry ---
async function getRoadData(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): Promise<{ distance: number, coords: number[][] }> {
  try {
    // Calculate Haversine (Straight Line) for comparison
    const straightLineDist = getDistance(p1, p2);
    
    // overview=full gives the detailed path. geometries=geojson returns [lng, lat] arrays.
    const url = `https://router.project-osrm.org/route/v1/driving/${p1.lng},${p1.lat};${p2.lng},${p2.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.routes && data.routes[0]) {
      const roadDistKm = data.routes[0].distance / 1000;
      
      // Calculate the "Curvature Factor" (Road Distance / Straight Distance)
      const ratio = straightLineDist > 0 ? (roadDistKm / straightLineDist).toFixed(2) : "1.00";

      // COMPARISON LOG
      console.log(
        `[Distance Check] \n` +
        `   Straight Line: ${straightLineDist.toFixed(2)} km \n` +
        `   OSRM Road:     ${roadDistKm.toFixed(2)} km \n` +
        `   Increase:      ${((roadDistKm - straightLineDist) / straightLineDist * 100).toFixed(1)}% (Factor: ${ratio}x)`
      );

      return {
        distance: roadDistKm,
        coords: data.routes[0].geometry.coordinates // Array of [lng, lat]
      };
    }
    return { distance: 0, coords: [] };
  } catch (error) {
    console.error("[OSRM Error]:", error);
    return { distance: 0, coords: [] };
  }
}

// Route Optimization
async function optimizeDayRoute(dateString: string) {
  console.log(`Starting Route Optimization for ${dateString}`);
  const slots = ["Morning", "Afternoon", "Evening"];
  const batch = db.batch();
  
  let currentPos = HOME_BASE;
  let totalRoadDist = 0;
  let totalStraightDist = 0;
  let jobCount = 0;
  let fullDailyRoute: any[] = []; // Stores the completely sorted schedule for the day
  let coordinate_route: number[][] = []; // Stores the full path for the map

  for (const slot of slots) {
    const docId = `${dateString}_${slot}`;
    const docRef = db.collection("schedule").doc(docId);
    const doc = await docRef.get();

    if (doc.exists) {
      const data = doc.data();
      const bookings = data?.bookings || [];

      if (bookings.length > 0) {
        bookings.sort((a: any, b: any) => {
          const distA = getDistance(currentPos, { lat: a.location[0], lng: a.location[1] });
          const distB = getDistance(currentPos, { lat: b.location[0], lng: b.location[1] });
          return distA - distB;
        });

        for (const b of bookings) {
          const bLoc = { lat: b.location[0], lng: b.location[1] };
          
          // Track the theoretical straight line
          totalStraightDist += getDistance(currentPos, bLoc);
          
          // Get distance AND coordinates
          const roadData = await getRoadData(currentPos, bLoc);
          totalRoadDist += roadData.distance;
          coordinate_route.push(...roadData.coords); 
          
          currentPos = bLoc;
          jobCount++;

          // Push the sorted booking to the day's master route
          fullDailyRoute.push(b);
        }
        batch.update(docRef, { bookings });
      }
    }
  }

  // Return to base
  totalStraightDist += getDistance(currentPos, HOME_BASE);
  const finalReturnRoad = await getRoadData(currentPos, HOME_BASE);
  totalRoadDist += finalReturnRoad.distance;
  coordinate_route.push(...finalReturnRoad.coords);

  const logRef = db.collection("daily_log").doc(dateString);
  batch.set(logRef, { 
    distance: Number(totalRoadDist.toFixed(2)),
    straightLineTotal: Number(totalStraightDist.toFixed(2)),
    unit: "km",
    route: fullDailyRoute, // Save the complete sorted route to the daily log
    coordinate_route: coordinate_route, // Stored for frontend mapping
    updatedAt: new Date().toISOString()
  }, { merge: true });

  await batch.commit();
  
  // FINAL COMPARISON SUMMARY
  console.log(`--- Optimization Complete ---`);
  console.log(`Jobs: ${jobCount}`);
  console.log(`Theoretical (Straight): ${totalStraightDist.toFixed(2)} km`);
  console.log(`Actual (Road Path):     ${totalRoadDist.toFixed(2)} km`);
  console.log(`Difference:            ${(totalRoadDist - totalStraightDist).toFixed(2)} km extra due to roads.`);
  console.log(`------------------------------------------`);
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
    const todayStr = new Date().toLocaleDateString('en-CA');
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
        period: slotSlug.toLowerCase(),
        originalDate: date,
        transactionId: req.body.transactionId,
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

    // 2. Fetch the pre-optimized route directly from daily_log
    const logDoc = await db.collection("daily_log").doc(dateString).get();
    let assignedRoute: any[] = [];
    let coordinate_route: number[][] = [];
    
    if (logDoc.exists) {
      const logData = logDoc.data();
      assignedRoute = logData?.route || [];
      coordinate_route = logData?.coordinate_route || []; // Fetch the polyline data
    } else {
      console.warn(`[SCHEDULE WARNING] No daily_log found for ${dateString}. assignedRoute will be empty.`);
    }

    // 3. Update admin_workersSchedule with the fully optimized route
    const scheduleRef = db.collection("admin_workersSchedule").doc(dateString);
    
    await scheduleRef.set({
      worker: workerName,
      date: dateString,
      assignedRoute: assignedRoute,
      coordinate_route: coordinate_route, // Copy to worker's schedule
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