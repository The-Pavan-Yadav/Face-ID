import fs from 'fs';
import path from 'path';

export interface EnrolledBiometricProfile {
  uid: string;
  name: string;
  email: string;
  embedding: number[];
  registered: boolean;
  sampleCount?: number;
  version: number;
  createdAt?: string;
  updatedAt?: string;
  lastReRegisteredAt?: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'face-profiles.json');

// In-memory cache keyed by normalized email
const memoryProfiles = new Map<string, EnrolledBiometricProfile>();

// Ensure data directory and load existing profiles from disk
function initStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
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
    console.warn('[FaceAuthStore] Init notice:', err);
  }
}

initStore();

function persistStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const profilesArray = Array.from(memoryProfiles.values());
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profilesArray, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[FaceAuthStore] Persist notice:', err);
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
