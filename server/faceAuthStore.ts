import fs from 'fs';
import path from 'path';

export interface EnrolledBiometricProfile {
  uid: string;
  name: string;
  email: string;
  embedding: number[];
  samplePaths?: string[];
  registered: boolean;
  sampleCount?: number;
  version: number;
  createdAt?: string;
  updatedAt?: string;
  lastReRegisteredAt?: string;
}

// Check writable directory (use /tmp on Vercel/serverless environments)
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);
const DATA_DIR = IS_SERVERLESS ? '/tmp' : path.join(process.cwd(), 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'face-profiles.json');

// In-memory cache keyed by normalized email
const memoryProfiles = new Map<string, EnrolledBiometricProfile>();

// Ensure data directory and load existing profiles from disk
function initStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      } catch {}
    }
    if (fs.existsSync(PROFILES_FILE)) {
      const raw = fs.readFileSync(PROFILES_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const p of data) {
          if (p && p.email && Array.isArray(p.embedding) && p.embedding.length === 128) {
            memoryProfiles.set(p.email.toLowerCase().trim(), p);
          }
        }
      }
    }
  } catch (err) {
    // Non-fatal store initialization
  }
}

initStore();

function persistStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      } catch {}
    }
    const profilesArray = Array.from(memoryProfiles.values());
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profilesArray, null, 2), 'utf-8');
  } catch (err) {
    // Non-fatal write failure (e.g. read-only lambda)
  }
}

export const faceAuthStore = {
  getProfileByEmail(email: string): EnrolledBiometricProfile | null {
    if (!email) return null;
    const normalized = email.toLowerCase().trim();
    return memoryProfiles.get(normalized) || null;
  },

  getProfileByUid(uid: string): EnrolledBiometricProfile | null {
    if (!uid) return null;
    for (const p of memoryProfiles.values()) {
      if (p.uid === uid) return p;
    }
    return null;
  },

  saveProfile(profile: EnrolledBiometricProfile): void {
    if (!profile || !profile.email || !Array.isArray(profile.embedding) || profile.embedding.length !== 128) {
      throw new Error('Invalid profile data or 128-dimensional embedding required');
    }
    const normalized = profile.email.toLowerCase().trim();
    const existing = memoryProfiles.get(normalized);
    const updated: EnrolledBiometricProfile = {
      ...existing,
      ...profile,
      email: normalized,
      registered: true,
      version: 1,
      updatedAt: new Date().toISOString(),
      lastReRegisteredAt: new Date().toISOString()
    };
    memoryProfiles.set(normalized, updated);
    persistStore();
  }
};
