import express from "express";
import { createServer as createViteServer } from "vite";
import db, { initDb } from "./src/db.ts";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // Initialize Database
  initDb();

  // --- API ROUTES ---

  // Auth: Login
  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    console.log(`Login attempt for: ${email}`);
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND password = ?").get(email, password);
    
    if (user) {
      console.log(`Login successful for: ${email}`);
      res.json({ success: true, user });
    } else {
      console.log(`Login failed for: ${email}`);
      res.status(401).json({ success: false, message: "Invalid credentials" });
    }
  });

  // Auth: Register
  app.post("/api/auth/register", (req, res) => {
    const { name, email, password, role, phone, age, gender, specialization } = req.body;
    
    try {
      const insertUser = db.prepare("INSERT INTO users (name, email, password, role, phone) VALUES (?, ?, ?, ?, ?)");
      const result = insertUser.run(name, email, password, role, phone);
      const userId = result.lastInsertRowid;

      if (role === 'patient') {
        db.prepare("INSERT INTO patients (user_id, age, gender) VALUES (?, ?, ?)").run(userId, age, gender);
      } else if (role === 'doctor') {
        db.prepare("INSERT INTO doctors (user_id, specialization) VALUES (?, ?)").run(userId, specialization);
      }

      res.json({ success: true, userId });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  });

  // Doctors: List all
  app.get("/api/doctors", (req, res) => {
    const doctors = db.prepare(`
      SELECT d.*, u.name, u.email, u.phone 
      FROM doctors d 
      JOIN users u ON d.user_id = u.id
    `).all();
    res.json(doctors);
  });

  // Appointments: Book
  app.post("/api/appointments", (req, res) => {
    const { patient_id, doctor_id, date, time } = req.body;
    
    // Check for double booking
    const existing = db.prepare("SELECT * FROM appointments WHERE doctor_id = ? AND date = ? AND time = ? AND status != 'cancelled'")
      .get(doctor_id, date, time);
    
    if (existing) {
      return res.status(400).json({ success: false, message: "This slot is already booked." });
    }

    try {
      const result = db.prepare("INSERT INTO appointments (patient_id, doctor_id, date, time) VALUES (?, ?, ?, ?)")
        .run(patient_id, doctor_id, date, time);
      res.json({ success: true, appointmentId: result.lastInsertRowid });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Appointments: Get for user
  app.get("/api/appointments/:userId", (req, res) => {
    const { userId } = req.params;
    const { role } = req.query;

    let query = "";
    if (role === 'patient') {
      query = `
        SELECT a.*, u.name as doctor_name, d.specialization, d.consultation_fee,
               (SELECT status FROM payments WHERE appointment_id = a.id LIMIT 1) as payment_status
        FROM appointments a
        JOIN doctors d ON a.doctor_id = d.id
        JOIN users u ON d.user_id = u.id
        WHERE a.patient_id = ?
        ORDER BY a.date DESC, a.time DESC
      `;
    } else if (role === 'doctor') {
      query = `
        SELECT a.*, u.name as patient_name,
               (SELECT status FROM payments WHERE appointment_id = a.id LIMIT 1) as payment_status
        FROM appointments a
        JOIN doctors d ON a.doctor_id = d.id
        JOIN users u ON a.patient_id = u.id
        WHERE d.user_id = ?
        ORDER BY a.date DESC, a.time DESC
      `;
    } else {
      query = `
        SELECT a.*, u_p.name as patient_name, u_d.name as doctor_name,
               (SELECT status FROM payments WHERE appointment_id = a.id LIMIT 1) as payment_status
        FROM appointments a
        JOIN users u_p ON a.patient_id = u_p.id
        JOIN doctors d ON a.doctor_id = d.id
        JOIN users u_d ON d.user_id = u_d.id
        ORDER BY a.date DESC, a.time DESC
      `;
    }

    const appointments = db.prepare(query).all(userId);
    res.json(appointments);
  });

  // Appointments: Update Status
  app.patch("/api/appointments/:id", (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    try {
      db.prepare("UPDATE appointments SET status = ?, notes = ? WHERE id = ?")
        .run(status, notes || null, id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin: Stats
  app.get("/api/admin/stats", (req, res) => {
    const totalPatients = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'patient'").get().count;
    const totalDoctors = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'doctor'").get().count;
    const totalAppointments = db.prepare("SELECT COUNT(*) as count FROM appointments").get().count;
    const revenue = db.prepare("SELECT SUM(amount) as total FROM payments WHERE status = 'completed'").get().total || 0;

    res.json({ totalPatients, totalDoctors, totalAppointments, revenue });
  });

  // Payments: Create
  app.post("/api/payments", (req, res) => {
    const { appointment_id, amount } = req.body;
    const transaction_id = "TXN" + Math.random().toString(36).substr(2, 9).toUpperCase();
    
    try {
      db.prepare("INSERT INTO payments (appointment_id, amount, status, transaction_id) VALUES (?, ?, 'completed', ?)")
        .run(appointment_id, amount, transaction_id);
      res.json({ success: true, transaction_id });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
