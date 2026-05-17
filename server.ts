import express from 'express';
import path from 'path';
import dns from 'node:dns';
import { createServer as createViteServer } from 'vite';

// FORCE IPv4 globally to fix Supabase/Cloud connectivity issues (Node v17+)
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}
import { db, pool } from './src/db';
import * as schema from './src/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import multer from 'multer';
import * as XLSX from 'xlsx';
import dotenv from 'dotenv';
import { mockStore } from './server/mockStore';

dotenv.config();

const upload = multer({ storage: multer.memoryStorage() });

let isDbAvailable = false;
let dbCheckInProgress = false;
let lastDbError: string | null = null;

const app = express();
export { app };

// Robust connection check with faster timeout and better logging
async function checkDbConnection(retries = 3) {
  if (dbCheckInProgress) return;
  dbCheckInProgress = true;
  
  try {
    const dbUrl = process.env.DATABASE_URL?.trim();
    if (!dbUrl) {
      isDbAvailable = false;
      lastDbError = 'DATABASE_URL is missing in environment secrets.';
      console.warn('[DB Check] !!! DATABASE_URL is EMPTY or MISSING !!!');
      console.warn('[DB Check] 1. Go to Supabase -> Project Settings -> Database');
      console.warn('[DB Check] 2. Copy "Connection String" (make sure to choose URI)');
      console.warn('[DB Check] 3. Add it to Secrets in this app.');
      console.warn('[DB Check] Falling back to MOCK (In-Memory) mode.');
      dbCheckInProgress = false;
      return;
    }

    if (dbUrl.startsWith('http')) {
      console.warn('[DB Check] 🛑 INVALID DATABASE_URL: It looks like you provided the API URL (https://...) instead of the PostgreSQL Connection String (postgres://...).');
      console.warn('[DB Check] Please use the URI found in Supabase -> Settings -> Database -> Connection String.');
      isDbAvailable = false;
      dbCheckInProgress = false;
      return;
    }

    if (dbUrl.includes('supabase.co') && dbUrl.includes(':5432')) {
      console.warn('[DB Check] ⚠️ WARNING: You are using Supabase on port 5432.');
      console.warn('[DB Check] Direct connections to port 5432 often fail from Cloud environments.');
      console.warn('[DB Check] PLEASE USE THE POOLER (Port 6543) instead.');
    }
    
    if (dbUrl) {
      if (dbUrl.includes('@') && dbUrl.split('@').length > 2) {
        console.warn('[DB Check] 🛑 POTENTIAL PASSWORD ERROR: Your password seems to contain unencoded "@" characters.');
        console.warn('[DB Check] Please replace "@" with "%40" in your connection string password.');
        lastDbError = 'Password contains unencoded characters. Replace @ with %40.';
      }
      
      try {
        const url = new URL(dbUrl);
        console.log(`[DB Check] 🔍 Target Host: ${url.hostname}`);
        console.log(`[DB Check] 🔍 Target Port: ${url.port || '5432'}`);
      } catch (e) {
        console.warn('[DB Check] ⚠️ Invalid URL format in DATABASE_URL.');
      }
    }

    console.log(`[DB Check] 🟡 Connecting to DB... (${retries} retries left) at ${new Date().toISOString()}`);
    
    // Test the connection with a 10-second timeout
    const testConnection = async () => {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
        return true;
      } finally {
        client.release();
      }
    };

    try {
      await Promise.race([
        testConnection(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timed out (10s). Verify DATABASE_URL or white-list allowed IPs.')), 10000)
        )
      ]);
    } catch (raceErr) {
      // Re-throw to the outer catch
      throw raceErr;
    }

    isDbAvailable = true;
    lastDbError = null;
    console.log('[DB Check] ✅ SUCCESS! Database connected and ready.');

    // Auto-initialize tables
    try {
      console.log('[DB Check] Running schema maintenance...');
      const tables = [
        `CREATE TABLE IF NOT EXISTS business_profile (id SERIAL PRIMARY KEY, name TEXT NOT NULL DEFAULT 'FunkyLand', sub_name TEXT, unit_name TEXT, address TEXT, gst_no TEXT, mobile TEXT, email TEXT, logo TEXT, accounting_year_start TEXT DEFAULT '01-04', grace_period_minutes INTEGER DEFAULT 10, overtime_rate_per_minute NUMERIC DEFAULT '2', updated_at TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS staff (id TEXT PRIMARY KEY, password TEXT NOT NULL, full_name TEXT NOT NULL, role TEXT DEFAULT 'Cashier', phone TEXT, status TEXT DEFAULT 'active', joined_date TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS categories (id SERIAL PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, title TEXT NOT NULL, price NUMERIC NOT NULL, type TEXT DEFAULT 'Hourly', validation_days INTEGER DEFAULT 0, validation_time_min INTEGER DEFAULT 60, description TEXT, gst_slab INTEGER DEFAULT 18, created_at TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, parent_name TEXT NOT NULL, mobile_number TEXT NOT NULL, child_name TEXT, child_age INTEGER, plan_id TEXT REFERENCES plans(id), created_at TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS services (id SERIAL PRIMARY KEY, category_id INTEGER REFERENCES categories(id), name TEXT NOT NULL, price NUMERIC DEFAULT '0', gst_slab INTEGER DEFAULT 18)`,
        `CREATE TABLE IF NOT EXISTS catalogue (id SERIAL PRIMARY KEY, design_name TEXT NOT NULL, category_id INTEGER REFERENCES categories(id), image_url TEXT, estimate_price NUMERIC DEFAULT '0', description TEXT)`,
        `CREATE TABLE IF NOT EXISTS socks_types (id SERIAL PRIMARY KEY, name TEXT NOT NULL, price NUMERIC NOT NULL, gst_slab INTEGER DEFAULT 5)`,
        `CREATE TABLE IF NOT EXISTS billings (id SERIAL PRIMARY KEY, customer_id TEXT REFERENCES members(id), customer_name TEXT, handled_by TEXT REFERENCES staff(id), mobile_no TEXT, plan_id TEXT REFERENCES plans(id), duration_min INTEGER, person_count INTEGER DEFAULT 1, socks_counts JSONB DEFAULT '{}', items JSONB DEFAULT '[]', subtotal NUMERIC NOT NULL, total_gst NUMERIC NOT NULL, payable NUMERIC NOT NULL, payment_mode TEXT, created_at TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, category_id INTEGER REFERENCES categories(id), customer_id TEXT REFERENCES members(id), customer_name TEXT, phone_number TEXT, booking_charges NUMERIC DEFAULT '0', grand_total NUMERIC DEFAULT '0', gst_percent INTEGER DEFAULT 18, advance_amount NUMERIC DEFAULT '0', payment_mode TEXT, payment_status TEXT DEFAULT 'Pending', booking_date DATE, created_at TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS expenses (id SERIAL PRIMARY KEY, category_id INTEGER REFERENCES categories(id), amount NUMERIC NOT NULL, description TEXT, vendor_name TEXT, date TIMESTAMP WITH TIME ZONE DEFAULT NOW(), created_at TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS play_entries (id TEXT PRIMARY KEY, child_name TEXT NOT NULL, parent_name TEXT, mobile_number TEXT, start_time TIMESTAMP DEFAULT NOW(), end_time TIMESTAMP, plan_id TEXT REFERENCES plans(id), plan_name TEXT, amount NUMERIC DEFAULT '0', status TEXT DEFAULT 'active', member_id TEXT REFERENCES members(id), person_count INTEGER DEFAULT 1, socks_counts JSONB DEFAULT '{}', invoice_id TEXT, overtime_amount NUMERIC DEFAULT '0', staff_id TEXT REFERENCES staff(id), handled_by TEXT, created_at TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS event_services (event_id TEXT NOT NULL REFERENCES events(id), service_id INTEGER NOT NULL REFERENCES services(id), PRIMARY KEY(event_id, service_id))`,
        `CREATE TABLE IF NOT EXISTS walk_in_customers (id SERIAL PRIMARY KEY, billno TEXT, cid TEXT, mode TEXT, grandtotal NUMERIC, subtotal NUMERIC, paybleamount NUMERIC, discount NUMERIC, planamount NUMERIC, shokesprice NUMERIC, extraamount NUMERIC, noofperson INTEGER, insdate TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS walk_in_members (id SERIAL PRIMARY KEY, memberid TEXT, name TEXT, mno TEXT, status TEXT, shokesprice NUMERIC, validationdate TEXT)`
      ];
      for (const sqlQuery of tables) {
        await db.execute(sql.raw(sqlQuery));
      }

      // Column Migrations (Ensure columns exist in case tables were created earlier)
      console.log('[DB Check] Running column migrations...');
      const migrations = [
        `ALTER TABLE billings ADD COLUMN IF NOT EXISTS mobile_no TEXT`,
        `ALTER TABLE events ADD COLUMN IF NOT EXISTS phone_number TEXT`,
        `ALTER TABLE business_profile ADD COLUMN IF NOT EXISTS logo TEXT`
      ];
      for (const m of migrations) {
        try { await db.execute(sql.raw(m)); } catch (e) {}
      }
      
      console.log('[DB Check] Schema maintenance complete.');
    } catch (initErr) {
      console.warn('[DB Check] Schema init check (non-fatal error):', (initErr as Error).message);
      console.warn('[DB Check] If you are using a Supabase Pooler in "Transaction" mode, DDL (CREATE TABLE) might be restricted.');
      console.warn('[DB Check] Please run the SQL scripts found in /supabase_schema.sql manually in your Supabase SQL Editor.');
    }

    // Log stats for debugging
    try {
      const staffCount = await db.select({ count: sql`count(*)` }).from(schema.staff);
      console.log(`[DB Check] Database contains ${(staffCount[0] as any).count} staff members.`);
    } catch (statsErr) {
      console.error('[DB Check] ❌ Failed to fetch database stats:', (statsErr as Error).message);
    }

    
    // Seed default admin if table is empty
    try {
      const existingStaff = await db.select().from(schema.staff);
      if (existingStaff.length === 0) {
        console.log('[DB Check] Seeding default admin...');
        await db.insert(schema.staff).values({
          id: 'admin',
          password: '12345',
          full_name: 'Administrator',
          role: 'admin',
          phone: '9999999999',
          status: 'active'
        });
      }
    } catch (staffSeedErr) {
      console.error('[DB Check] Failed to seed staff:', (staffSeedErr as Error).message);
    }

    // Seed socks types if empty
    try {
      const existingSocks = await db.select().from(schema.socksTypes);
      if (existingSocks.length === 0) {
        console.log('[DB Check] Seeding default socks types...');
        await db.insert(schema.socksTypes).values([
          { name: 'Small Socks', price: '40', gstSlab: 5 },
          { name: 'Medium Socks', price: '50', gstSlab: 5 }
        ]);
      }

      // Seed default plans if missing
      console.log(`[DB Check] Checking plans seeding (mockStore has ${mockStore.plans.length} plans)`);
      for (const p of mockStore.plans) {
        try {
          const existing = await db.select().from(schema.plans).where(eq(schema.plans.id, p.id)).limit(1);
          if (existing.length === 0) {
            console.log(`[DB Check] Seeding missing plan: ${p.id} (${p.title})`);
            await db.insert(schema.plans).values({
              ...p,
              price: p.price.toString()
            });
          }
        } catch (planSeedErr) {
          console.error(`[DB Check] Failed to seed plan ${p.id}:`, (planSeedErr as Error).message);
        }
      }
      console.log('[DB Check] Plans seeding check complete.');
      lastDbError = null;
    } catch (seedErr) {
      console.error('[DB Check] Seeding skip/fail:', (seedErr as Error).message);
    }
  } catch (err) {
    const error = err as any;
    lastDbError = error.message;
    console.error(`[DB Check] ❌ FAILED: ${error.message}`);
    if (error.code) console.error(`[DB Check] Database Error Code: ${error.code}`);
    if (error.detail) console.error(`[DB Check] Database Error Details: ${error.detail}`);
    
    if (error.code === '28P01') {
      lastDbError = 'Invalid Database Password. Please check your DATABASE_URL secret.';
      console.error('[DB Check] 🛑 FATAL: INVALID PASSWORD in DATABASE_URL.');
      console.error('[DB Check] 1. Go to Supabase -> Project Settings -> Database.');
      console.error('[DB Check] 2. Reset your password if you forgot it.');
      console.error('[DB Check] 3. Update the DATABASE_URL in the app secrets.');
    }
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      const dbUrl = process.env.DATABASE_URL || '';
      let host = 'unknown';
      try { host = new URL(dbUrl).hostname; } catch(e) {}
      
      lastDbError = `Connection Refused to ${host}. Direct connections (5432) often fail on IPv4-only networks.`;
      console.error(`[DB Check] 🛑 CONNECTION REFUSED to ${host}`);
      console.error('[DB Check] --- ALTERNATIVE SYNCHRONIZATION METHODS ---');
      console.error('[DB Check] 1. USE THE SUPABASE POOLER:');
      console.error('   Go to Supabase Dashboard -> Database -> Connection String.');
      console.error('   Switch to "Transaction" mode and use port 6543.');
      console.error('[DB Check] 2. USE SESSION POOLER (PORT 5432) WITH ?sslmode=require');
      console.error('[DB Check] 3. ADD ?sslmode=no-verify to your connection string.');
      console.error('[DB Check] 4. ENSURE YOUR PASSWORD IS CORRECT (special characters must be URL-encoded).');
    }
    
    isDbAvailable = false;
    
    if (retries > 0) {
      const delay = 3000; 
      console.log(`[DB Check] Retrying in ${delay / 1000}s...`);
      setTimeout(() => {
        dbCheckInProgress = false;
        checkDbConnection(retries - 1);
      }, delay);
      return;
    } else {
      console.error('[DB Check] 🏁 ALL RETRIES EXHAUSTED. Operating in DISCONNECTED (MOCK) mode.');
    }
  } finally {
    dbCheckInProgress = false;
  }
}

async function setupServer() {
  const PORT = 3000;

  // Start DB check in background so server begins listening immediately
  console.log('[Server] Initializing database connection in background...');
  checkDbConnection();
  
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // --- Middleware for API JSON Safety ---
  app.use((req, res, next) => {
    // If request is for an API route
    if (req.path.startsWith('/api/')) {
      const originalSend = res.send.bind(res);
      const originalJson = res.json.bind(res);

      // Intercept .send()
      res.send = (body) => {
        if (typeof body === 'string' && body.trim().startsWith('<!doctype')) {
          console.warn(`[API Safety] Intercepted HTML response for ${req.path}. Converting to JSON 404/500.`);
          // If it looks like HTML, it's likely a fallback to index.html or a 404 page
          return res.status(404).json({ 
            error: 'API Route Not Found', 
            path: req.path,
            message: 'Expected JSON but received HTML. This happens when the requested API route is not defined on the server.'
          });
        }
        return originalSend(body);
      };

      // Intercept .json() just in case, though usually not needed if it's already structured
      res.json = (body) => {
        return originalJson(body);
      };
    }
    next();
  });

  app.get('/api/db-status', (req, res) => {
    const rawUrl = process.env.DATABASE_URL || '';
    let host = 'unknown';
    try { 
      if (rawUrl && rawUrl.includes('@')) {
        host = new URL(rawUrl).hostname; 
      }
    } catch(e) {}

    res.json({ 
      connected: isDbAvailable, 
      mode: isDbAvailable ? 'database' : 'mock',
      checking: dbCheckInProgress,
      planCount: mockStore.plans.length,
      host: host !== 'unknown' ? host : null,
      error: isDbAvailable ? null : (lastDbError || (process.env.DATABASE_URL ? 'Connection failed. Check your DATABASE_URL format and SSL settings.' : 'DATABASE_URL is missing in environment variables.'))
    });
  });

  app.post('/api/db-status/retry', (req, res) => {
    if (!dbCheckInProgress) {
      console.log('[API] Manual database connection retry requested...');
      checkDbConnection(1); // 1 retry only for manual request
      return res.json({ message: 'Connection check started' });
    }
    res.json({ message: 'Check already in progress' });
  });

  // --- API Routes ---

  // 1. Business Profile
  app.get('/api/business-profile', async (req, res) => {
    try {
      if (isDbAvailable) {
        const profile = await db.select().from(schema.businessProfile).limit(1);
        return res.json(profile[0] || mockStore.businessProfile);
      }
      res.json(mockStore.businessProfile);
    } catch (err) {
      console.error('Error fetching business-profile:', err);
      res.json(mockStore.businessProfile);
    }
  });

  app.post('/api/business-profile', async (req, res) => {
    try {
      if (isDbAvailable) {
        const existing = await db.select().from(schema.businessProfile).limit(1);
        
        // Pick only valid schema fields from req.body to prevent Drizzle errors
        const cleanedData: any = {};
        const validFields = [
          'name', 'subName', 'unitName', 'address', 'gstNo', 
          'mobile', 'email', 'logo', 'accountingYearStart', 
          'gracePeriodMinutes', 'overtimeRatePerMinute'
        ];
        
        validFields.forEach(field => {
          if (req.body[field] !== undefined) {
            cleanedData[field] = req.body[field];
          }
        });

        if (existing.length > 0) {
          console.log('[API] Updating business profile...');
          const updated = await db.update(schema.businessProfile)
            .set({ ...cleanedData, updatedAt: new Date() })
            .where(eq(schema.businessProfile.id, existing[0].id))
            .returning();
          return res.json(updated[0]);
        } else {
          console.log('[API] Creating business profile...');
          const created = await db.insert(schema.businessProfile).values(cleanedData).returning();
          return res.json(created[0]);
        }
      }
      mockStore.businessProfile = { ...mockStore.businessProfile, ...req.body };
      res.json(mockStore.businessProfile);
    } catch (err) {
      console.error('[API] Business profile update failed:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 2. Staff
  app.get('/api/staff', async (req, res) => {
    try {
      if (isDbAvailable) {
        const allStaff = await db.query.staff.findMany();
        return res.json(allStaff);
      }
      res.json(mockStore.staff);
    } catch (err) {
      console.error('Error fetching staff:', err);
      res.json(mockStore.staff);
    }
  });

  app.post('/api/staff', async (req, res) => {
    try {
      if (isDbAvailable) {
        const staff = await db.insert(schema.staff).values(req.body).returning();
        return res.json(staff[0]);
      }
      const newStaff = { ...req.body, id: req.body.id || `STF-${Date.now()}`, joinedDate: new Date().toISOString() };
      mockStore.staff.push(newStaff);
      res.json(newStaff);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.put('/api/staff/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        const updated = await db.update(schema.staff)
          .set(req.body)
          .where(eq(schema.staff.id, req.params.id))
          .returning();
        return res.json(updated[0]);
      }
      const idx = mockStore.staff.findIndex(s => s.id === req.params.id);
      if (idx !== -1) {
        mockStore.staff[idx] = { ...mockStore.staff[idx], ...req.body };
        return res.json(mockStore.staff[idx]);
      }
      res.status(404).json({ error: 'Staff not found' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/staff/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        await db.delete(schema.staff).where(eq(schema.staff.id, req.params.id));
        return res.json({ success: true });
      }
      mockStore.staff = mockStore.staff.filter(s => s.id !== req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 3. Categories
  app.get('/api/categories', async (req, res) => {
    try {
      if (isDbAvailable) {
        const cats = await db.select().from(schema.categories);
        return res.json(cats);
      }
      res.json(mockStore.categories);
    } catch (err) {
      console.error('Error fetching categories:', err);
      res.json(mockStore.categories);
    }
  });

  app.post('/api/categories', async (req, res) => {
    try {
      if (isDbAvailable) {
        const cat = await db.insert(schema.categories).values(req.body).returning();
        return res.json(cat[0]);
      }
      const newCat = { ...req.body, id: Date.now() };
      mockStore.categories.push(newCat);
      res.json(newCat);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.put('/api/categories/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        const idVal = parseInt(req.params.id);
        const updated = await db.update(schema.categories)
          .set(req.body)
          .where(eq(schema.categories.id, idVal))
          .returning();
        return res.json(updated[0]);
      }
      const idx = mockStore.categories.findIndex(c => c.id === parseInt(req.params.id));
      if (idx !== -1) {
        mockStore.categories[idx] = { ...mockStore.categories[idx], ...req.body };
        return res.json(mockStore.categories[idx]);
      }
      res.status(404).json({ error: 'Category not found' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/categories/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        await db.delete(schema.categories).where(eq(schema.categories.id, parseInt(req.params.id)));
        return res.json({ success: true });
      }
      mockStore.categories = mockStore.categories.filter(c => c.id !== parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 4. Plans
  app.get('/api/plans', async (req, res) => {
    try {
      if (isDbAvailable) {
        const plans = await db.select().from(schema.plans);
        return res.json(plans);
      }
      res.json(mockStore.plans);
    } catch (err) {
      console.error('Error fetching plans:', err);
      res.json(mockStore.plans);
    }
  });

  app.post('/api/plans', async (req, res) => {
    try {
      if (isDbAvailable) {
        const plan = await db.insert(schema.plans).values(req.body).returning();
        return res.json(plan[0]);
      }
      const newPlan = { ...req.body, id: req.body.id || `PLN-${Date.now()}` };
      mockStore.plans.push(newPlan);
      res.json(newPlan);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.put('/api/plans/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        const updated = await db.update(schema.plans)
          .set(req.body)
          .where(eq(schema.plans.id, req.params.id))
          .returning();
        return res.json(updated[0]);
      }
      const idx = mockStore.plans.findIndex(p => p.id === req.params.id);
      if (idx !== -1) {
        mockStore.plans[idx] = { ...mockStore.plans[idx], ...req.body };
        return res.json(mockStore.plans[idx]);
      }
      res.status(404).json({ error: 'Plan not found' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/plans/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        await db.delete(schema.plans).where(eq(schema.plans.id, req.params.id));
        return res.json({ success: true });
      }
      mockStore.plans = mockStore.plans.filter(p => p.id !== req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 5. Members
  app.get('/api/members', async (req, res) => {
    try {
      if (isDbAvailable) {
        const members = await db.select().from(schema.members);
        return res.json(members);
      }
      res.json(mockStore.members);
    } catch (err) {
      console.error('Error fetching members:', err);
      res.json(mockStore.members);
    }
  });

  app.post('/api/members', async (req, res) => {
    try {
      if (isDbAvailable) {
        const member = await db.insert(schema.members).values(req.body).returning();
        return res.json(member[0]);
      }
      const newMember = { ...req.body, id: `MEM-${Date.now()}`, createdAt: new Date() };
      mockStore.members.push(newMember);
      res.json(newMember);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.put('/api/members/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        const updated = await db.update(schema.members)
          .set(req.body)
          .where(eq(schema.members.id, req.params.id))
          .returning();
        return res.json(updated[0]);
      }
      const idx = mockStore.members.findIndex(m => m.id === req.params.id);
      if (idx !== -1) {
        mockStore.members[idx] = { ...mockStore.members[idx], ...req.body };
        return res.json(mockStore.members[idx]);
      }
      res.status(404).json({ error: 'Member not found' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/members/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        await db.delete(schema.members).where(eq(schema.members.id, req.params.id));
        return res.json({ success: true });
      }
      mockStore.members = mockStore.members.filter(m => m.id !== req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 6. Services
  app.get('/api/services', async (req, res) => {
    try {
      if (isDbAvailable) {
        const servs = await db.select().from(schema.services);
        return res.json(servs);
      }
      res.json(mockStore.services);
    } catch (err) {
      console.error('Error fetching services:', err);
      res.json(mockStore.services);
    }
  });

  app.post('/api/services', async (req, res) => {
    try {
      if (isDbAvailable) {
        const serv = await db.insert(schema.services).values(req.body).returning();
        return res.json(serv[0]);
      }
      const newServ = { ...req.body, id: Date.now() };
      mockStore.services.push(newServ);
      res.json(newServ);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.put('/api/services/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        const updated = await db.update(schema.services)
          .set(req.body)
          .where(eq(schema.services.id, parseInt(req.params.id)))
          .returning();
        return res.json(updated[0]);
      }
      const idx = mockStore.services.findIndex(s => s.id === parseInt(req.params.id));
      if (idx !== -1) {
        mockStore.services[idx] = { ...mockStore.services[idx], ...req.body };
        return res.json(mockStore.services[idx]);
      }
      res.status(404).json({ error: 'Service not found' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/services/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        await db.delete(schema.services).where(eq(schema.services.id, parseInt(req.params.id)));
        return res.json({ success: true });
      }
      mockStore.services = mockStore.services.filter(s => s.id !== parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 7. Catalogue
  app.get('/api/catalogue', async (req, res) => {
    try {
      if (isDbAvailable) {
        const items = await db.select().from(schema.catalogue);
        return res.json(items);
      }
      res.json(mockStore.catalogue);
    } catch (err) {
      console.error('Error fetching catalogue:', err);
      res.json(mockStore.catalogue);
    }
  });

  app.post('/api/catalogue', async (req, res) => {
    try {
      if (isDbAvailable) {
        const itemData = {
          designName: req.body.name,
          categoryId: req.body.categoryId,
          imageUrl: req.body.imageUrl,
          estimatePrice: req.body.price?.toString(),
          description: req.body.description
        };
        const item = await db.insert(schema.catalogue).values(itemData).returning();
        return res.json(item[0]);
      }
      const newItem = { ...req.body, id: Date.now() };
      mockStore.catalogue.push(newItem);
      res.json(newItem);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.put('/api/catalogue/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        const itemData: any = {};
        if (req.body.name !== undefined) itemData.designName = req.body.name;
        if (req.body.categoryId !== undefined) itemData.categoryId = req.body.categoryId;
        if (req.body.imageUrl !== undefined) itemData.imageUrl = req.body.imageUrl;
        if (req.body.price !== undefined) itemData.estimatePrice = req.body.price?.toString();
        if (req.body.description !== undefined) itemData.description = req.body.description;

        const updated = await db.update(schema.catalogue)
          .set(itemData)
          .where(eq(schema.catalogue.id, parseInt(req.params.id)))
          .returning();
        return res.json(updated[0]);
      }
      const idx = mockStore.catalogue.findIndex(i => i.id === parseInt(req.params.id));
      if (idx !== -1) {
        mockStore.catalogue[idx] = { ...mockStore.catalogue[idx], ...req.body };
        return res.json(mockStore.catalogue[idx]);
      }
      res.status(404).json({ error: 'Catalogue item not found' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });


  app.delete('/api/catalogue/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        await db.delete(schema.catalogue).where(eq(schema.catalogue.id, parseInt(req.params.id)));
        return res.json({ success: true });
      }
      mockStore.catalogue = mockStore.catalogue.filter(i => i.id !== parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 10. Play Entries
  app.get('/api/entries', async (req, res) => {
    try {
      if (isDbAvailable) {
        const entries = await db.select().from(schema.playEntries);
        return res.json(entries);
      }
      res.json(mockStore.entries || []);
    } catch (err) {
      res.json([]);
    }
  });

  app.post('/api/entries', async (req, res) => {
    try {
      if (isDbAvailable) {
        const entry = await db.insert(schema.playEntries).values(req.body).returning();
        return res.json(entry[0]);
      }
      const newEntry = { ...req.body, id: req.body.id || `ENT-${Date.now()}` };
      if (!mockStore.entries) mockStore.entries = [];
      mockStore.entries.push(newEntry);
      res.json(newEntry);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.put('/api/entries/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        const updated = await db.update(schema.playEntries)
          .set(req.body)
          .where(eq(schema.playEntries.id, req.params.id))
          .returning();
        return res.json(updated[0]);
      }
      if (!mockStore.entries) mockStore.entries = [];
      const idx = mockStore.entries.findIndex(e => e.id === req.params.id);
      if (idx !== -1) {
        mockStore.entries[idx] = { ...mockStore.entries[idx], ...req.body };
        return res.json(mockStore.entries[idx]);
      }
      res.status(404).json({ error: 'Entry not found' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/entries/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        await db.delete(schema.playEntries).where(eq(schema.playEntries.id, req.params.id));
        return res.json({ success: true });
      }
      if (!mockStore.entries) mockStore.entries = [];
      mockStore.entries = mockStore.entries.filter(e => e.id !== req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 8. Billings
  app.get('/api/billings', async (req, res) => {
    try {
      if (isDbAvailable) {
        const bills = await db.select().from(schema.billings);
        return res.json(bills);
      }
      res.json(mockStore.billings);
    } catch (err) {
      console.error('Error fetching billings:', err);
      res.json(mockStore.billings);
    }
  });

  app.post('/api/billings', async (req, res) => {
    try {
      if (isDbAvailable) {
        const bill = await db.insert(schema.billings).values(req.body).returning();
        return res.json(bill[0]);
      }
      const newBill = { ...req.body, id: `BIL-${Date.now()}`, createdAt: new Date() };
      mockStore.billings.push(newBill);
      res.json(newBill);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.put('/api/billings/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        const idVal = parseInt(req.params.id);
        if (isNaN(idVal)) return res.status(400).json({ error: 'Invalid ID' });
        const updated = await db.update(schema.billings)
          .set(req.body)
          .where(eq(schema.billings.id, idVal))
          .returning();
        return res.json(updated[0]);
      }
      const idx = mockStore.billings.findIndex(b => b.id === req.params.id);
      if (idx !== -1) {
        mockStore.billings[idx] = { ...mockStore.billings[idx], ...req.body };
        return res.json(mockStore.billings[idx]);
      }
      res.status(404).json({ error: 'Bill not found' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/billings/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        const idVal = parseInt(req.params.id);
        if (isNaN(idVal)) return res.status(400).json({ error: 'Invalid ID' });
        await db.delete(schema.billings).where(eq(schema.billings.id, idVal));
        return res.json({ success: true });
      }
      mockStore.billings = mockStore.billings.filter(b => b.id !== req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 9. Events
  app.get('/api/events', async (req, res) => {
    try {
      if (isDbAvailable) {
        const results = await db.select({
          id: schema.events.id,
          category: schema.categories.name,
          categoryId: schema.events.categoryId,
          customerId: schema.events.customerId,
          customerName: schema.events.customerName,
          mobileNumber: schema.events.mobileNumber,
          bookingCharges: schema.events.bookingCharges,
          grandTotal: schema.events.grandTotal,
          gstPercent: schema.events.gstPercent,
          advanceAmount: schema.events.advanceAmount,
          payMode: schema.events.paymentMode,
          paymentStatus: schema.events.paymentStatus,
          bookingDate: schema.events.bookingDate,
          createdAt: schema.events.createdAt,
        })
        .from(schema.events)
        .leftJoin(schema.categories, eq(schema.events.categoryId, schema.categories.id));
        
        return res.json(results);
      }
      res.json(mockStore.events);
    } catch (err) {
      console.error("Error fetching events:", err);
      res.json(mockStore.events);
    }
  });

  app.post('/api/events', async (req, res) => {
    try {
      if (isDbAvailable) {
        const { services: selectedServices, ...eventData } = req.body;
        const event = await db.insert(schema.events).values({
          ...eventData,
          bookingDate: eventData.bookingDate || eventData.date // Handle both frontend and SQL naming
        }).returning();
        
        if (selectedServices && selectedServices.length > 0) {
          const mappings = selectedServices.map((sId: number) => ({
            eventId: event[0].id,
            serviceId: sId,
          }));
          await db.insert(schema.eventServices).values(mappings);
        }
        return res.json(event[0]);
      }
      const newEvent = { ...req.body, id: `EVT-${Date.now()}`, createdAt: new Date() };
      mockStore.events.push(newEvent);
      res.json(newEvent);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.put('/api/events/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        const updated = await db.update(schema.events)
          .set(req.body)
          .where(eq(schema.events.id, req.params.id))
          .returning();
        return res.json(updated[0]);
      }
      const idx = mockStore.events.findIndex(e => e.id === req.params.id);
      if (idx !== -1) {
        mockStore.events[idx] = { ...mockStore.events[idx], ...req.body };
        return res.json(mockStore.events[idx]);
      }
      res.status(404).json({ error: 'Event not found' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/events/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        await db.delete(schema.events).where(eq(schema.events.id, req.params.id));
        return res.json({ success: true });
      }
      mockStore.events = mockStore.events.filter(e => e.id !== req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 11. Expenses
  app.get('/api/expenses', async (req, res) => {
    try {
      if (isDbAvailable) {
        const results = await db.select({
          id: schema.expenses.id,
          category: schema.categories.name,
          categoryId: schema.expenses.categoryId,
          amount: schema.expenses.amount,
          description: schema.expenses.description,
          vendorName: schema.expenses.vendorName,
          date: schema.expenses.date,
          createdAt: schema.expenses.createdAt,
        })
        .from(schema.expenses)
        .leftJoin(schema.categories, eq(schema.expenses.categoryId, schema.categories.id));
        
        return res.json(results);
      }
      res.json(mockStore.expenses);
    } catch (err) {
      console.error('Error fetching expenses:', err);
      res.json(mockStore.expenses);
    }
  });

  // 12. Walk-in Data
  app.get('/api/walk-in-v1', async (req, res) => {
    try {
      if (isDbAvailable) {
        const data = await db.select().from(schema.walkInCustomers);
        return res.json(data);
      }
      res.json(mockStore.walkInCustomers);
    } catch (err) {
      res.json([]);
    }
  });

  app.get('/api/walk-in-v2', async (req, res) => {
    try {
      if (isDbAvailable) {
        const data = await db.select().from(schema.walkInMembers);
        return res.json(data);
      }
      res.json(mockStore.walkInMembers);
    } catch (err) {
      res.json([]);
    }
  });

  app.post('/api/expenses', async (req, res) => {
    try {
      if (isDbAvailable) {
        const expenseData = {
          categoryId: req.body.categoryId || req.body.category,
          amount: req.body.amount?.toString(),
          description: req.body.description,
          vendorName: req.body.vendorName,
          date: req.body.date ? new Date(req.body.date) : new Date()
        };
        const expense = await db.insert(schema.expenses).values(expenseData).returning();
        return res.json(expense[0]);
      }
      const newExpense = { ...req.body, id: Date.now(), createdAt: new Date() };
      mockStore.expenses.push(newExpense);
      res.json(newExpense);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });


  app.post('/api/import-json/:type', async (req, res) => {
    const { type } = req.params;
    const data = req.body;

    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'Data must be an array of objects' });
    }

    if (data.length === 0) {
      return res.json({ success: true, count: 0 });
    }

    try {
      if (isDbAvailable) {
        if (type === 'members') {
          // Robust mapping: only take fields that exist in schema
          const cleanData = data.map(item => {
            return {
              id: String(item.id || item.cid || `MEM-${Math.random().toString(36).substr(2, 9).toUpperCase()}`),
              parentName: String(item.parentName || item.parent || ''),
              mobileNumber: String(item.mobileNumber || item.phoneNumber || item.phone || item.mno || ''),
              childName: item.childName ? String(item.childName) : null,
              childAge: item.childAge ? parseInt(String(item.childAge)) : null,
              planId: item.planId ? String(item.planId) : null,
            };
          });
          const results = await db.insert(schema.members).values(cleanData).returning();
          return res.json({ success: true, count: results.length });
        } else if (type === 'accounting') {
          const cleanData = data.map(item => ({
            categoryId: item.categoryId ? parseInt(String(item.categoryId)) : null,
            amount: String(item.amount || 0),
            description: item.description ? String(item.description) : null,
            createdAt: item.date ? new Date(item.date) : new Date(),
          }));
          const results = await db.insert(schema.expenses).values(cleanData).returning();
          return res.json({ success: true, count: results.length });
        } else if (type === 'walk_in') {
          // Explicit field mapping for Walk-in V1
          const cleanData = data.map(item => ({
            cid: item.cid ? String(item.cid) : null,
            billno: item.billno ? String(item.billno) : null,
            mode: item.mode ? String(item.mode) : null,
            discount: String(item.discount || 0),
            paybleamount: String(item.paybleamount || 0),
            noofperson: parseInt(String(item.noofperson || 1)),
            subtotal: String(item.subtotal || 0),
            noofpare: parseInt(String(item.noofpare || 0)),
            totalshokescost: String(item.totalshokescost || 0),
            grandtotal: String(item.grandtotal || 0),
            planamount: String(item.planamount || 0),
            insdate: item.insdate ? new Date(item.insdate) : new Date(),
          }));
          const results = await db.insert(schema.walkInCustomers).values(cleanData).returning();
          return res.json({ success: true, count: results.length });
        } else if (type === 'walk_in_v2') {
          const cleanData = data.map(item => ({
            memberid: item.memberid ? String(item.memberid) : null,
            gender: item.gender ? String(item.gender) : null,
            mno: item.mno ? String(item.mno) : null,
            age: item.age ? String(item.age) : null,
            date: item.date ? String(item.date) : null,
            status: item.status ? String(item.status) : null,
            name: item.name ? String(item.name) : null,
            planid: item.planid ? String(item.planid) : null,
            validationdate: item.validationdate ? String(item.validationdate) : null,
            shokesprice: String(item.shokesprice || 0),
          }));
          const results = await db.insert(schema.walkInMembers).values(cleanData).returning();
          return res.json({ success: true, count: results.length });
        }
      } else {
        if (type === 'members') {
          mockStore.members.push(...data);
          return res.json({ success: true, count: data.length });
        } else if (type === 'accounting') {
          mockStore.expenses.push(...data.map(d => ({ ...d, id: Date.now() + Math.random() })));
          return res.json({ success: true, count: data.length });
        } else if (type === 'walk_in') {
          mockStore.walkInCustomers.push(...data);
          return res.json({ success: true, count: data.length });
        } else if (type === 'walk_in_v2') {
          mockStore.walkInMembers.push(...data);
          return res.json({ success: true, count: data.length });
        }
      }
      res.status(400).json({ error: 'Invalid import type' });
    } catch (err) {
      console.error('Import Error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.put('/api/expenses/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        const idVal = parseInt(req.params.id);
        const expenseData: any = {};
        if (req.body.category !== undefined || req.body.categoryId !== undefined) {
          expenseData.categoryId = req.body.categoryId || req.body.category;
        }
        if (req.body.amount !== undefined) expenseData.amount = req.body.amount?.toString();
        if (req.body.description !== undefined) expenseData.description = req.body.description;
        if (req.body.vendorName !== undefined) expenseData.vendorName = req.body.vendorName;
        if (req.body.date !== undefined) expenseData.date = new Date(req.body.date);

        const updated = await db.update(schema.expenses)
          .set(expenseData)
          .where(eq(schema.expenses.id, idVal))
          .returning();
        return res.json(updated[0]);
      }
      const idx = mockStore.expenses.findIndex(e => e.id === parseInt(req.params.id));
      if (idx !== -1) {
        mockStore.expenses[idx] = { ...mockStore.expenses[idx], ...req.body };
        return res.json(mockStore.expenses[idx]);
      }
      res.status(404).json({ error: 'Expense not found' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });


  app.delete('/api/expenses/:id', async (req, res) => {
    try {
      if (isDbAvailable) {
        await db.delete(schema.expenses).where(eq(schema.expenses.id, parseInt(req.params.id)));
        return res.json({ success: true });
      }
      mockStore.expenses = mockStore.expenses.filter(e => e.id !== parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 11. Data Import (File)
  app.post('/api/import/:type', upload.single('file'), async (req, res) => {
    const { type } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

      if (isDbAvailable) {
        if (type === 'members') {
          const results = await db.insert(schema.members).values(data as any).returning();
          return res.json({ success: true, count: results.length });
        } else if (type === 'accounting') {
          const results = await db.insert(schema.expenses).values(data as any).returning();
          return res.json({ success: true, count: results.length });
        } else if (type === 'walk_in') {
          const results = await db.insert(schema.walkInCustomers).values(data as any).returning();
          return res.json({ success: true, count: results.length });
        } else if (type === 'walk_in_v2') {
          const results = await db.insert(schema.walkInMembers).values(data as any).returning();
          return res.json({ success: true, count: results.length });
        }
      } else {
        // Mock store import
        if (type === 'members') {
          mockStore.members.push(...(data as any[]));
          return res.json({ success: true, count: data.length });
        } else if (type === 'accounting') {
          mockStore.expenses.push(...(data as any[]));
          return res.json({ success: true, count: data.length });
        } else if (type === 'walk_in') {
          mockStore.walkInCustomers.push(...(data as any[]));
          return res.json({ success: true, count: data.length });
        } else if (type === 'walk_in_v2') {
          mockStore.walkInMembers.push(...(data as any[]));
          return res.json({ success: true, count: data.length });
        }
      }
      res.status(400).json({ error: 'Invalid import type' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/system-settings/:key', async (req, res) => {
    try {
      if (isDbAvailable) {
        const setting = await db.select().from(schema.systemSettings)
          .where(eq(schema.systemSettings.key, req.params.key))
          .limit(1);
        return res.json(setting[0]?.value || null);
      }
      res.json(null);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/system-settings/:key', async (req, res) => {
    try {
      if (isDbAvailable) {
        const existing = await db.select().from(schema.systemSettings)
          .where(eq(schema.systemSettings.key, req.params.key))
          .limit(1);
        if (existing.length > 0) {
          const updated = await db.update(schema.systemSettings)
            .set({ value: req.body, updatedAt: new Date() })
            .where(eq(schema.systemSettings.key, req.params.key))
            .returning();
          return res.json(updated[0].value);
        } else {
          const created = await db.insert(schema.systemSettings)
            .values({ key: req.params.key, value: req.body })
            .returning();
          return res.json(created[0].value);
        }
      }
      res.json(req.body);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/init-db', async (req, res) => {
    try {
      if (!isDbAvailable) throw new Error('Database connection not available');

      // Simple table creation script
      const tables = [
        `CREATE TABLE IF NOT EXISTS business_profile (id SERIAL PRIMARY KEY, name TEXT NOT NULL DEFAULT 'FunkyLand', sub_name TEXT, unit_name TEXT, address TEXT, gst_no TEXT, mobile TEXT, email TEXT, logo TEXT, accounting_year_start TEXT DEFAULT '01-04', grace_period_minutes INTEGER DEFAULT 10, overtime_rate_per_minute NUMERIC DEFAULT '2', updated_at TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS staff (id TEXT PRIMARY KEY, password TEXT NOT NULL, full_name TEXT NOT NULL, role TEXT DEFAULT 'Cashier', phone TEXT, status TEXT DEFAULT 'active', joined_date TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS categories (id SERIAL PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, title TEXT NOT NULL, price NUMERIC NOT NULL, type TEXT DEFAULT 'Hourly', validation_days INTEGER DEFAULT 0, validation_time_min INTEGER DEFAULT 60, description TEXT, gst_slab INTEGER DEFAULT 18, created_at TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, parent_name TEXT NOT NULL, mobile_number TEXT NOT NULL, child_name TEXT, child_age INTEGER, plan_id TEXT REFERENCES plans(id), created_at TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS services (id SERIAL PRIMARY KEY, category_id INTEGER REFERENCES categories(id), name TEXT NOT NULL, price NUMERIC DEFAULT '0', gst_slab INTEGER DEFAULT 18)`,
        `CREATE TABLE IF NOT EXISTS catalogue (id SERIAL PRIMARY KEY, design_name TEXT NOT NULL, category_id INTEGER REFERENCES categories(id), image_url TEXT, estimate_price NUMERIC DEFAULT '0', description TEXT)`,
        `CREATE TABLE IF NOT EXISTS socks_types (id SERIAL PRIMARY KEY, name TEXT NOT NULL, price NUMERIC NOT NULL, gst_slab INTEGER DEFAULT 5)`,
        `CREATE TABLE IF NOT EXISTS billings (id SERIAL PRIMARY KEY, customer_id TEXT REFERENCES members(id), customer_name TEXT, handled_by TEXT REFERENCES staff(id), mobile_no TEXT, plan_id TEXT REFERENCES plans(id), duration_min INTEGER, person_count INTEGER DEFAULT 1, socks_counts JSONB DEFAULT '{}', items JSONB DEFAULT '[]', subtotal NUMERIC NOT NULL, total_gst NUMERIC NOT NULL, payable NUMERIC NOT NULL, payment_mode TEXT, created_at TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, category_id INTEGER REFERENCES categories(id), customer_id TEXT REFERENCES members(id), customer_name TEXT, phone_number TEXT, booking_charges NUMERIC DEFAULT '0', grand_total NUMERIC DEFAULT '0', gst_percent INTEGER DEFAULT 18, advance_amount NUMERIC DEFAULT '0', payment_mode TEXT, payment_status TEXT DEFAULT 'Pending', booking_date DATE, created_at TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS expenses (id SERIAL PRIMARY KEY, category_id INTEGER REFERENCES categories(id), amount NUMERIC NOT NULL, description TEXT, vendor_name TEXT, date TIMESTAMP WITH TIME ZONE DEFAULT NOW(), created_at TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS play_entries (id TEXT PRIMARY KEY, child_name TEXT NOT NULL, parent_name TEXT, mobile_number TEXT, start_time TIMESTAMP DEFAULT NOW(), end_time TIMESTAMP, plan_id TEXT REFERENCES plans(id), plan_name TEXT, amount NUMERIC DEFAULT '0', status TEXT DEFAULT 'active', member_id TEXT REFERENCES members(id), person_count INTEGER DEFAULT 1, socks_counts JSONB DEFAULT '{}', invoice_id TEXT, overtime_amount NUMERIC DEFAULT '0', staff_id TEXT REFERENCES staff(id), handled_by TEXT, created_at TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS event_services (event_id TEXT NOT NULL REFERENCES events(id), service_id INTEGER NOT NULL REFERENCES services(id), PRIMARY KEY(event_id, service_id))`,
        `CREATE TABLE IF NOT EXISTS walk_in_customers (id SERIAL PRIMARY KEY, billno TEXT, cid TEXT, mode TEXT, grandtotal NUMERIC, subtotal NUMERIC, paybleamount NUMERIC, discount NUMERIC, planamount NUMERIC, shokesprice NUMERIC, extraamount NUMERIC, noofperson INTEGER, insdate TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS walk_in_members (id SERIAL PRIMARY KEY, memberid TEXT, name TEXT, mno TEXT, status TEXT, shokesprice NUMERIC, validationdate TEXT)`
      ];

      for (const sqlQuery of tables) {
        await db.execute(sql.raw(sqlQuery));
      }

      res.json({ success: true, message: 'Database tables initialized successfully' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/sql-query', async (req, res) => {
    try {
      const { query } = req.body;
      if (!query) return res.status(400).json({ error: 'Query is required' });
      if (isDbAvailable) {
        const result = await db.execute(sql.raw(query));
        return res.json(result);
      }
      res.status(400).json({ error: 'Database is not available for raw queries in mock mode' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/socks-types', async (req, res) => {
    try {
      if (isDbAvailable) {
        const types = await db.select().from(schema.socksTypes);
        return res.json(types);
      }
      res.json(mockStore.socksTypes);
    } catch (err) {
      console.error('Error fetching socks-types:', err);
      res.json(mockStore.socksTypes || []);
    }
  });

  app.post('/api/socks-types', async (req, res) => {
    try {
      if (isDbAvailable) {
        const type = await db.insert(schema.socksTypes).values(req.body).returning();
        return res.json(type[0]);
      }
      const newType = { ...req.body, id: Date.now() };
      mockStore.socksTypes.push(newType);
      res.json(newType);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.put('/api/socks-types/:id', async (req, res) => {
    try {
      const idVal = parseInt(req.params.id);
      if (isDbAvailable) {
        const updated = await db.update(schema.socksTypes)
          .set(req.body)
          .where(eq(schema.socksTypes.id, idVal))
          .returning();
        return res.json(updated[0]);
      }
      const idx = mockStore.socksTypes.findIndex(s => s.id === idVal);
      if (idx !== -1) {
        mockStore.socksTypes[idx] = { ...mockStore.socksTypes[idx], ...req.body };
        return res.json(mockStore.socksTypes[idx]);
      }
      res.status(404).json({ error: 'Socks type not found' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/socks-types/:id', async (req, res) => {
    try {
      const idVal = parseInt(req.params.id);
      if (isNaN(idVal)) {
        return res.status(400).json({ error: 'Invalid socks type ID' });
      }

      if (isDbAvailable) {
        console.log(`[API] Deleting socks type ID: ${idVal}`);
        const result = await db.delete(schema.socksTypes).where(eq(schema.socksTypes.id, idVal)).returning();
        if (result.length === 0) {
          console.warn(`[API] Socks type with ID ${idVal} not found in DB`);
          return res.status(404).json({ error: 'Socks type not found' });
        }
        return res.json({ success: true });
      }
      
      const initialLength = mockStore.socksTypes.length;
      mockStore.socksTypes = mockStore.socksTypes.filter(s => s.id !== idVal);
      if (mockStore.socksTypes.length === initialLength) {
        return res.status(404).json({ error: 'Socks type not found in mock store' });
      }
      res.json({ success: true });
    } catch (err) {
      console.error('[API] Socks deletion failed:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  if (process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (process.env.VERCEL !== '1') {
    // Production but NOT Vercel (e.g. Docker, VPS)
    // On Vercel, we let Vercel serve static files from /dist directly
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Only listen if not running as a Vercel serverless function
  if (process.env.VERCEL !== '1') {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  }
}

setupServer();

export default app;
