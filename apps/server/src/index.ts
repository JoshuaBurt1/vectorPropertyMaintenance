//server/src/index.ts
import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import cron from "node-cron";
import * as admin from "firebase-admin";
import path from "path";
import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";

// GLOBAL HELPERS
const getTodayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });

// SECURE PAYPAL INTEGRATION
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_APP_SECRET = process.env.PAYPAL_APP_SECRET;
const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

let emailSystemStatus = {
  status: "Initializing...",
  lastError: null as string | null,
  timestamp: new Date().toISOString()
};

// Helper: Generate PayPal Access Token
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
    const straightLineDist = getDistance(p1, p2);
    const url = `https://router.project-osrm.org/route/v1/driving/${p1.lng},${p1.lat};${p2.lng},${p2.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.routes && data.routes[0]) {
      const roadDistKm = data.routes[0].distance / 1000;
      const ratio = straightLineDist > 0 ? (roadDistKm / straightLineDist).toFixed(2) : "1.00";

      console.log(
        `[Distance Check] \n` +
        `   Straight Line: ${straightLineDist.toFixed(2)} km \n` +
        `   OSRM Road:     ${roadDistKm.toFixed(2)} km \n` +
        `   Increase:      ${((roadDistKm - straightLineDist) / straightLineDist * 100).toFixed(1)}% (Factor: ${ratio}x)`
      );

      return {
        distance: roadDistKm,
        coords: data.routes[0].geometry.coordinates 
      };
    }
    return { distance: 0, coords: [] };
  } catch (error) {
    console.error("[OSRM Error]:", error);
    return { distance: 0, coords: [] };
  }
}

// Route Optimization
async function generateDailyRoute(dateString: string) {
  console.log(`Generating & Optimizing Route Data for ${dateString}`);
  const slots = ["Morning", "Afternoon", "Evening"];
  const batch = db.batch();
  
  let currentPos = HOME_BASE;
  let totalRoadDist = 0;
  let totalStraightDist = 0;
  let jobCount = 0;
  let fullDailyRoute: any[] = []; 
  let coordinate_route: string[] = []; 

  for (const slot of slots) {
    const docId = `${dateString}_${slot}`;
    const docRef = db.collection("schedule").doc(docId);
    const doc = await docRef.get();

    if (doc.exists) {
      const data = doc.data();
      const bookings = data?.bookings || [];

      if (bookings.length > 0) {
        // Greedy approach: Order by nearest OSRM distance inside the slot
        let unvisited = [...bookings];
        let sortedBookingsForSlot = [];

        while (unvisited.length > 0) {
          let bestIdx = 0;
          let minStraightDist = Infinity;

          // 1. PRE-SORT LOCALLY: Find the nearest neighbor using straight-line distance
          for (let i = 0; i < unvisited.length; i++) {
            const b = unvisited[i];
            const bLoc = { lat: b.location[0], lng: b.location[1] };
            const straightDist = getDistance(currentPos, bLoc);
            
            if (straightDist < minStraightDist) {
              minStraightDist = straightDist;
              bestIdx = i;
            }
          }

          // 2. FETCH ROAD DATA ONCE: Now that we have the "likely" winner, get OSRM data
          const nextBooking = unvisited[bestIdx];
          const nextLoc = { lat: nextBooking.location[0], lng: nextBooking.location[1] };
          const bestRoadData = await getRoadData(currentPos, nextLoc);

          // 3. UPDATE TOTALS
          totalStraightDist += minStraightDist;
          totalRoadDist += bestRoadData.distance;

          if (bestRoadData.coords) {
            const flattenedPath = bestRoadData.coords.map((coord: any[]) => `${coord[0]},${coord[1]}`);
            coordinate_route.push(...flattenedPath);
          }

          // Move current position to the new job and remove it from unvisited
          currentPos = nextLoc;
          jobCount++;
          fullDailyRoute.push(nextBooking);
          sortedBookingsForSlot.push(nextBooking);

          unvisited.splice(bestIdx, 1);
        }

        // Save the OSRM-sorted order back to the slot document
        batch.update(docRef, { bookings: sortedBookingsForSlot });
      }
    }
  }

  // Return to base
  totalStraightDist += getDistance(currentPos, HOME_BASE);
  const finalReturnRoad = await getRoadData(currentPos, HOME_BASE);
  totalRoadDist += finalReturnRoad.distance;
  if (finalReturnRoad.coords) {
    const flattenedReturn = finalReturnRoad.coords.map((coord: any[]) => `${coord[0]},${coord[1]}`);
    coordinate_route.push(...flattenedReturn);
  }

  // Commit the sorted bookings to the schedule slots
  await batch.commit();
  
  console.log(`--- Route Generation Complete ---`);
  console.log(`Jobs: ${jobCount} | Road Path: ${totalRoadDist.toFixed(2)} km`);

  return {
    route: fullDailyRoute,
    coordinate_route: coordinate_route,
    distance: Number(totalRoadDist.toFixed(2)),
    straightLineTotal: Number(totalStraightDist.toFixed(2))
  };
}

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

const db = admin.firestore();
console.log("✅ VectorPM Firebase Admin connected");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json()); 

const allowedOrigins = [
  "http://localhost:3000",
  "https://vectorpm-df058.web.app",
  "https://vectorpm-df058.firebaseapp.com",
  "https://vector-property-maintenance.web.app"
];

app.use(cors({
  origin: (origin, callback) => {
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
  host: "74.125.141.108", // Google IPv4
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    servername: "smtp.gmail.com",
    rejectUnauthorized: false 
  }
} as SMTPTransport.Options);

transporter.verify((error, success) => {
  emailSystemStatus.timestamp = new Date().toISOString();
  if (error) {
    emailSystemStatus.status = "FAILED";
    emailSystemStatus.lastError = error.message;
    console.error("❌ [NODEMAILER_ERROR]", error.message);
  } else {
    emailSystemStatus.status = "READY";
    emailSystemStatus.lastError = null;
    console.log("✅ [NODEMAILER_SUCCESS] Connection established");
  }
});

app.get("/api/schedule", async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const todayStr = getTodayStr();
    const snapshot = await db.collection("schedule")
      .where("dateString", ">=", todayStr)
      .get();
    
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

  clients.push(res);
  req.on("close", () => {
    clients = clients.filter(client => client !== res);
  });
});

const broadcastUpdate = (data: any) => {
  clients.forEach(client => client.write(`data: ${JSON.stringify(data)}\n\n`));
};

app.post("/api/book", async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, address, phone, location, service, date, timeSlot } = req.body;

    if (!name || !email || !address || !phone || !location || !service || !date || !timeSlot) {
      res.status(400).json({ error: "Missing required booking fields." });
      return;
    }

    if (!/\d/.test(address)) {
      res.status(400).json({ error: "Address must include a property number." });
      return;
    }

    // --- START REPLACEMENT ---
    const now = new Date();
    
    // Get Toronto-specific Date and Hour
    const torontoDateStr = now.toLocaleDateString("en-CA", { timeZone: "America/Toronto" }); // "YYYY-MM-DD"
    const torontoHour = parseInt(now.toLocaleTimeString("en-US", { 
      timeZone: "America/Toronto", 
      hour12: false, 
      hour: "2-digit" 
    }));

    // FIX: Do NOT use new Date(date). The frontend already sends the exact Toronto string (YYYY-MM-DD).
    const bookingDateOnly = date.substring(0, 10); 
    const isToday = bookingDateOnly === torontoDateStr;

    if (isToday) {
      let isExpired = false;

      // Logic: If it's 9:01 AM, the 8:00 AM Morning slot is expired.
      if (timeSlot.startsWith("Morning") && torontoHour >= 8) isExpired = true;
      if (timeSlot.startsWith("Afternoon") && torontoHour >= 12) isExpired = true;
      if (timeSlot.startsWith("Evening") && torontoHour >= 16) isExpired = true;

      if (isExpired) {
        res.status(400).json({ 
          error: "This time slot is no longer available. Please select a later time." 
        });
        return;
      }
    }

    // Use the perfectly formatted string directly for the database ID
    const dateString = bookingDateOnly;
    const slotSlug = timeSlot.split(' ')[0]; 
    const documentId = `${dateString}_${slotSlug}`; 
    // --- END REPLACEMENT ---

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
        phone,
        address,
        location,
        service,
        period: slotSlug.toLowerCase(),
        originalDate: date,
        transactionId: req.body.transactionId || `tx_${new Date().getTime()}`,
        status: "pending",
        createdAt: new Date().toISOString()
      });

      t.set(slotRef, {
        dateString,
        timeSlot,
        bookings: currentBookings
      }, { merge: true });
    });

    console.log(`[BOOKING] Slot updated: ${documentId}. Route optimization queued for background sync.`);
    broadcastUpdate({ type: "REFRESH_SCHEDULE", documentId });

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

// Route 1: Create Order securely on the server
app.post("/api/paypal/create-order", async (req: Request, res: Response) => {
  try {
    const accessToken = await generatePayPalAccessToken();
    const { serviceName } = req.body;

    const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            description: `${serviceName || 'Service'} - Booking Deposit`,
            amount: {
              currency_code: "CAD",
              value: "50.00", // SERVER-DEFINED: Cannot be tampered with by the client
            },
          },
        ],
      }),
    });

    const order = await response.json();
    res.status(200).json({ id: order.id });
  } catch (error) {
    console.error("Failed to create order:", error);
    res.status(500).json({ error: "Failed to create order." });
  }
});

// Route 2: Capture Order securely on the server
app.post("/api/paypal/capture-order", async (req: Request, res: Response) => {
  try {
    const { orderID } = req.body;
    const accessToken = await generatePayPalAccessToken();

    const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderID}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const captureData = await response.json();
    res.status(200).json(captureData);
  } catch (error) {
    console.error("Failed to capture order:", error);
    res.status(500).json({ error: "Failed to capture order." });
  }
});

app.post("/api/admin/create-worker", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, fullName, phoneNumber } = req.body;

    if (!email || !fullName) {
      res.status(400).json({ error: "Email and Full Name are required." });
      return;
    }

    const temporaryPassword = `Vector${Math.floor(1000 + Math.random() * 9000)}!`;

    const userRecord = await admin.auth().createUser({
      email,
      password: temporaryPassword,
      displayName: fullName,
      phoneNumber: phoneNumber || undefined,
    });

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

app.post("/api/admin/assign-schedule", async (req: Request, res: Response): Promise<void> => {
  try {
    const { workerName, dateString } = req.body;

    if(!workerName || !dateString) {
      res.status(400).json({ error: "workerName and dateString are required." });
      return;
    }

    const routeData = await generateDailyRoute(dateString);
    const scheduleRef = db.collection("admin_workersSchedule").doc(dateString);
    
    await scheduleRef.set({
      worker: workerName,
      date: dateString,
      assignedRoute: routeData.route,
      coordinate_route: routeData.coordinate_route, 
      distance: routeData.distance,
      straightLineTotal: routeData.straightLineTotal,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    console.log(`[SCHEDULE] Assigned ${routeData.route.length} jobs to ${workerName} for ${dateString}`);
    
    res.status(200).json({ 
      success: true, 
      message: `Schedule assigned to ${workerName}`,
      jobCount: routeData.route.length 
    });

  } catch (error: any) {
    console.error("❌ Error assigning schedule:", error);
    res.status(500).json({ error: "Internal server error assigning schedule." });
  }
});


// =========================================================
// BACKGROUND CRON TASKS
// =========================================================

// 1. ROUTE SYNC & OPTIMIZATION (Runs Every 15 Minutes)
cron.schedule("*/15 * * * *", async () => {
  console.log("⏳ [15-MIN SYNC] Checking for unoptimized routes across all active days...");
  
  try {
    const todayStr = getTodayStr();
    const scheduleSnapshot = await db.collection("schedule").where("dateString", ">=", todayStr).get();
    
    const uniqueDates = new Set<string>();
    scheduleSnapshot.docs.forEach((doc) => uniqueDates.add(doc.data().dateString));

    for (const dateStr of uniqueDates) {
      const scheduleRef = db.collection("admin_workersSchedule").doc(dateStr);
      const scheduleDoc = await scheduleRef.get();

      // Gather all raw bookings currently slated for this day across all periods
      const slots = ["Morning", "Afternoon", "Evening"];
      let rawBookings: any[] = [];
      
      for (const slot of slots) {
        const slotDoc = await db.collection("schedule").doc(`${dateStr}_${slot}`).get();
        if (slotDoc.exists) {
          rawBookings.push(...(slotDoc.data()?.bookings || []));
        }
      }

      let workerToAssign: string | null = null;
      let existingBookings: any[] = [];

      if (scheduleDoc.exists) {
        workerToAssign = scheduleDoc.data()?.worker;
        existingBookings = scheduleDoc.data()?.assignedRoute || [];
      } else {
        const workersSnapshot = await db.collection("admin_workers").where("status", "==", "active").get();
        if (!workersSnapshot.empty) {
          const activeWorkers = workersSnapshot.docs.map(doc => doc.id);
          workerToAssign = activeWorkers[Math.floor(Math.random() * activeWorkers.length)];
        }
      }

      if (!workerToAssign) continue;

      // Extract unique identifiers to test if the array has actually changed
      const rawIds = rawBookings.map(b => b.createdAt).sort().join("|");
      const existingIds = existingBookings.map(b => b.createdAt).sort().join("|");

      // Skip recalculation if the bookings haven't changed
      if (scheduleDoc.exists && rawIds === existingIds) {
        continue;
      }

      console.log(`[SYNC] Updating route for ${dateStr}. Diff detected, pulling fresh OSRM data...`);
      const routeData = await generateDailyRoute(dateStr);

      // 1. Build a robust Status Map
      const statusMap: Record<string, string> = {};
      existingBookings.forEach((b: any) => {
        const tId = b.transactionId;
        const cAt = b.createdAt?.toString(); 
        
        if (b.status) {
          if (tId) statusMap[tId] = b.status;
          if (cAt) statusMap[cAt] = b.status;
        }
      });

      // 2. Patch the new route with the preserved status
      const preservedRoute = routeData.route.map((newBooking: any) => {
        const tId = newBooking.transactionId;
        const cAt = newBooking.createdAt?.toString();

        const existingStatus = (tId && statusMap[tId]) || (cAt && statusMap[cAt]);

        return {
          ...newBooking,
          status: existingStatus || "pending"
        };
      });

      // 3. Save the patched route
      await scheduleRef.set({
        worker: workerToAssign,
        date: dateStr,
        assignedRoute: preservedRoute,
        coordinate_route: routeData.coordinate_route,
        distance: routeData.distance,
        straightLineTotal: routeData.straightLineTotal,
        updatedAt: new Date().toISOString(),
        autoAssigned: scheduleDoc.exists ? (scheduleDoc.data()?.autoAssigned || false) : true 
      }, { merge: true });
    }
  } catch (error) {
    console.error("❌ [15-MIN SYNC Error]:", error);
  }
}, { 
  timezone: "America/Toronto" 
});


// 2. END OF DAY MAINTENANCE (Runs at 10:10 PM)
cron.schedule("10 22 * * *", async () => {
  console.log("🚀 [EOD-MAINTENANCE] Starting cleanup and archival tasks...");

  const todayStr = getTodayStr();
  console.log(`[DEBUG] Reference Date -> Today: ${todayStr}`);

  try {
    const batch = db.batch();
    let writeCount = 0;

    // PART 1: DELETE RAW BOOKINGS (Today and Past)
    const scheduleSnapshot = await db.collection("schedule").get();
    scheduleSnapshot.docs.forEach((doc) => {
      const docDate = doc.id.split('_')[0]; 
      if (docDate <= todayStr) {
        batch.delete(doc.ref);
        writeCount++;
      }
    });

    // PART 2: PROCESS & ARCHIVE WORKER ROUTES (Today and Past)
    console.log("[ARCHIVE] Processing 'admin_workersSchedule'...");
    const workerScheduleSnapshot = await db.collection("admin_workersSchedule").get();

    for (const doc of workerScheduleSnapshot.docs) {
      if (doc.id <= todayStr) {
        const data = doc.data();
        const routes: any[] = data.assignedRoute || [];
        
        // 1. Separate parent metadata from the coordinate arrays
        const { coordinate_route: _, assignedRoute: __, ...parentMeta } = data;

        // 2. Helper to filter routes by status and strip child-level coordinates
        const getArchivedSubRoute = (status: string) => {
          const filtered = routes
            .filter((r: any) => r.status === status)
            .map((r: any) => {
              const { coordinate_route, ...routeData } = r;
              return {
                ...routeData,
                // Ensure worker and update info persist in individual items
                worker: r.worker || data.worker,
                updatedAt: r.updatedAt || data.updatedAt
              };
            });
          return filtered.length > 0 ? filtered : null;
        };

        const completed = getArchivedSubRoute("completed");
        const pending = getArchivedSubRoute("pending");

        // 3. Archive Completed jobs to 'admin_complete'
        if (completed) {
          const completeRef = db.collection("admin_complete").doc(doc.id);
          batch.set(completeRef, { 
            ...parentMeta,
            assignedRoute: completed, // Replaces 'entries' with the original field name
            archivedAt: new Date().toISOString() 
          }, { merge: true });
        }

        // 4. Archive Pending jobs to 'admin_incomplete'
        if (pending) {
          const incompleteRef = db.collection("admin_incomplete").doc(doc.id);
          batch.set(incompleteRef, { 
            ...parentMeta,
            assignedRoute: pending, // Replaces 'entries' with the original field name
            archivedAt: new Date().toISOString() 
          }, { merge: true });
        }

        console.log(`[MOVE] Processed and removing worker schedule: ${doc.id}`);
        batch.delete(doc.ref);
        writeCount++;
      }
    }

    if (writeCount > 0) {
      await batch.commit();
      console.log(`[MAINTENANCE] Cleaned/Archived ${writeCount} total operations.`);
    }

    console.log("✅ [EOD-MAINTENANCE] Finished.");
  } catch (error) {
    console.error("❌ [EOD-MAINTENANCE Error]:", error);
  }
}, { 
  timezone: "America/Toronto" 
});

app.get("/", (req, res) => {
  res.send("Vector Property Maintenance API is Live.");
});

app.get("/health", (req, res) => {
  res.json({ 
    api: "Running", 
    scheduler: "Active",
    emailSystem: emailSystemStatus
  });
});

const isProd = process.env.NODE_ENV === "production";
const SERVER_URL = isProd 
  ? "https://vectorpropertymaintenance.onrender.com" 
  : `http://localhost:${PORT}`;

app.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log(`📡 Health check: ${SERVER_URL}/health`);
});