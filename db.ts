import Database from 'better-sqlite3';

const db = new Database('clinic.db');

// Enable foreign keys
db.pragma('foreign_keys = ON');

export function initDb() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'doctor', 'patient')) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Doctors table
  db.exec(`
    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      specialization TEXT NOT NULL,
      bio TEXT,
      experience INTEGER,
      consultation_fee REAL DEFAULT 500.0,
      availability TEXT, -- JSON string of available slots
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Patients table
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      age INTEGER,
      gender TEXT,
      blood_group TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Appointments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      status TEXT CHECK(status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')) DEFAULT 'pending',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
    )
  `);

  // Payments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      status TEXT CHECK(status IN ('pending', 'completed', 'failed')) DEFAULT 'pending',
      transaction_id TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
    )
  `);

  // Seed Admin if not exists
  const admin = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@bookmycare.com');
  if (!admin) {
    console.log('Seeding initial data...');
    db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)').run(
      'System Admin',
      'admin@bookmycare.com',
      'admin123',
      'admin'
    );

    // Seed some doctors
    const doctors = [
      { name: 'Sarah Johnson', email: 'sarah@doc.com', spec: 'Cardiologist', fee: 800 },
      { name: 'Michael Chen', email: 'michael@doc.com', spec: 'Dermatologist', fee: 600 },
      { name: 'Emily Davis', email: 'emily@doc.com', spec: 'Pediatrician', fee: 500 },
    ];

    doctors.forEach(d => {
      const res = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)').run(
        d.name, d.email, 'doc123', 'doctor'
      );
      db.prepare('INSERT INTO doctors (user_id, specialization, consultation_fee) VALUES (?, ?, ?)').run(
        res.lastInsertRowid, d.spec, d.fee
      );
    });
  }

  console.log('Database initialized successfully.');
}

export default db;
