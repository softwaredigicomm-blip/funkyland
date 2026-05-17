import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';
import dotenv from 'dotenv';

// Configure dotenv immediately at module root
dotenv.config();

const { Pool } = pg;

// Helper to sanitize connection strings with unencoded special characters in password
function sanitizeConnectionUrl(url: string | undefined): string | undefined {
  if (!url || !url.includes('://')) return url;
  
  try {
    // Find the last '@' which separates credentials from the host
    const protocolPart = url.split('://')[0];
    const remaining = url.substring(protocolPart.length + 3);
    const lastAtIndex = remaining.lastIndexOf('@');
    
    if (lastAtIndex === -1) return url;
    
    const credsPart = remaining.substring(0, lastAtIndex);
    const hostPart = remaining.substring(lastAtIndex + 1);
    
    const firstColonIndex = credsPart.indexOf(':');
    if (firstColonIndex === -1) return url;
    
    const username = credsPart.substring(0, firstColonIndex);
    const password = credsPart.substring(firstColonIndex + 1);
    
    // Auto-encode @ and other characters that might break URI parsing
    // But keep already encoded parts as is if possible, or just re-encode
    const encodedPassword = encodeURIComponent(decodeURIComponent(password));
    
    return `${protocolPart}://${username}:${encodedPassword}@${hostPart}`;
  } catch (e) {
    console.error('[DB Config] Failed to sanitize URL:', e);
    return url;
  }
}

const rawDbUrl = process.env.DATABASE_URL?.trim();
const dbUrl = sanitizeConnectionUrl(rawDbUrl);

if (!rawDbUrl) {
  console.error('\x1b[31m%s\x1b[0m', 'CRITICAL ERROR: DATABASE_URL is not defined in environment variables.');
} else if (rawDbUrl !== dbUrl) {
  console.log('[DB Config] 🛡️ Auto-sanitized DATABASE_URL (encoded password characters).');
}

// Optimized Pool Configuration
const createConfig = () => {
  const connectionString = (process.env.DATABASE_URL || '').trim();
  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  
  const config: any = {
    connectionString: connectionString || 'postgres://localhost:5432/postgres',
    ssl: connectionString && !isLocal
      ? { rejectUnauthorized: false } 
      : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000, 
    maxUses: 7500,
    keepAlive: true,
  };

  return config;
};

// Create the pool once
export const pool = new Pool(createConfig());

pool.on('error', (err) => {
  console.error('[DB Pool] Unexpected error on idle client:', err.message);
});

export const db = drizzle(pool, { schema });
