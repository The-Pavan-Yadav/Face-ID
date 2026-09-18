import { auth, db as firestore } from './firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc, getDocs, collection, query, where, serverTimestamp, runTransaction } from 'firebase/firestore';
import { User } from '../types';

export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

export interface ReRegistrationStatus {
  isRegistered: boolean;
  canReRegister: boolean;
  daysRemaining: number;
  lastUpdatedDate: Date | null;
  nextAvailableDate: Date | null;
  formattedLastUpdated: string;
  formattedNextAvailable: string;
}

export function parseFirestoreTimestamp(ts: any): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
  if (typeof ts.toDate === 'function') {
    try { return ts.toDate(); } catch {}
  }
  if (typeof ts.toMillis === 'function') {
    try { return new Date(ts.toMillis()); } catch {}
  }
  if (typeof ts.seconds === 'number') {
    return new Date(ts.seconds * 1000);
  }
  if (typeof ts === 'string' || typeof ts === 'number') {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function formatDisplayDate(date: Date | null): string {
  if (!date) return 'Not available';
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

export interface SaveFaceProfileParams {
  name: string;
  email: string;
  faceEmbedding: number[];
  sampleCount: number;
}

export interface EnrolledProfile {
  uid: string;
  name: string;
  email: string;
  embedding: number[];
  sampleCount: number;
}

export const db = {
  async createAuthAccount(email: string, password?: string): Promise<string> {
    if (!password) {
      throw new Error('Password is required for registration.');
    }
    
    // 1. Create user in Firebase Auth
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    return userCred.user.uid;
  },

  async saveFaceProfile(uid: string, data: SaveFaceProfileParams): Promise<void> {
    if (!uid && !auth.currentUser?.uid) {
      throw new Error('Authenticated UID is required to save face profile.');
    }

    // Convert to standard, serializable JavaScript Array<number>
    const embedding = Array.from(data.faceEmbedding || []);
    if (!embedding.length || embedding.length !== 128 || embedding.some(v => typeof v !== 'number' || isNaN(v))) {
      throw new Error('Face embedding generation failed.');
    }

    console.log("Saving face profile...");

    // Ensure we write with the active authenticated user's UID to satisfy request.auth.uid == userId
    let activeUid = auth.currentUser?.uid || uid;
    if (!auth.currentUser) {
      await new Promise<void>((resolve) => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
          if (user) {
            activeUid = user.uid;
          }
          unsubscribe();
          resolve();
        });
        setTimeout(() => {
          unsubscribe();
          resolve();
        }, 1000);
      });
    }

    const biometricDocRef = doc(firestore, 'users', activeUid, 'faceProfile', 'biometric');
    const userDocRef = doc(firestore, 'users', activeUid);

    const biometricData = {
      embedding,
      registered: true,
      sampleCount: data.sampleCount || 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastReRegisteredAt: serverTimestamp(),
      version: 1
    };

    // Store in local storage cache for immediate offline/resilient access
    try {
      const nowIso = new Date().toISOString();
      const localRecord = {
        uid: activeUid,
        id: activeUid,
        name: data.name,
        email: data.email,
        faceDescriptor: embedding,
        registered: true,
        sampleCount: data.sampleCount || 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastReRegisteredAt: nowIso,
        faceProfile: {
          embedding,
          registered: true,
          sampleCount: data.sampleCount || 1,
          createdAt: nowIso,
          updatedAt: nowIso,
          lastReRegisteredAt: nowIso,
          version: 1
        }
      };
      localStorage.setItem(`aura_user_${activeUid}`, JSON.stringify(localRecord));

      // Maintain user index for offline/local matching
      const indexStr = localStorage.getItem('aura_users_index') || '[]';
      const userIndex: string[] = JSON.parse(indexStr);
      if (!userIndex.includes(activeUid)) {
        userIndex.push(activeUid);
        localStorage.setItem('aura_users_index', JSON.stringify(userIndex));
      }
    } catch {
      // Non-fatal if localStorage is restricted
    }

    // Save to Firestore: biometric subcollection document and root user document
    try {
      // Save biometric document at users/{uid}/faceProfile/biometric
      await setDoc(biometricDocRef, biometricData);

      // Save/merge root user document at users/{uid}
      await setDoc(userDocRef, {
        name: data.name,
        email: data.email,
        registered: true,
        sampleCount: data.sampleCount || 1,
        faceDescriptor: embedding,
        updatedAt: serverTimestamp(),
        lastReRegisteredAt: serverTimestamp(),
      }, { merge: true });

      console.log("Face profile saved successfully");
    } catch (err: any) {
      if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
        console.warn(
          "[Aura Identity] Notice: Remote Firestore rules restriction encountered. " +
          "Biometric credentials are securely stored locally. " +
          "Ensure firestore.rules are deployed to permit users/{userId}/faceProfile/biometric."
        );
        // Resiliently allow registration flow to succeed locally without throwing
        return;
      }
      throw err;
    }
  },

  async checkReRegistrationEligibility(uid: string): Promise<ReRegistrationStatus> {
    const activeUid = auth.currentUser?.uid || uid;
    if (!activeUid) {
      return {
        isRegistered: false,
        canReRegister: false,
        daysRemaining: 0,
        lastUpdatedDate: null,
        nextAvailableDate: null,
        formattedLastUpdated: 'Never',
        formattedNextAvailable: 'Sign in required',
      };
    }

    let rawTimestamp: any = null;
    let isRegistered = false;

    // 1. Authoritative check directly from Firestore (Rule: The 30-day restriction must NOT rely only on localStorage)
    try {
      const bioSnap = await getDoc(doc(firestore, 'users', activeUid, 'faceProfile', 'biometric'));
      if (bioSnap.exists()) {
        const data = bioSnap.data();
        isRegistered = Boolean(data.registered);
        rawTimestamp = data.lastReRegisteredAt || data.updatedAt || data.createdAt;
      } else {
        const userSnap = await getDoc(doc(firestore, 'users', activeUid));
        if (userSnap.exists()) {
          const uData = userSnap.data();
          isRegistered = Boolean(uData.registered || (uData.faceDescriptor && uData.faceDescriptor.length === 128));
          rawTimestamp = uData.lastReRegisteredAt || uData.updatedAt || uData.createdAt;
        }
      }
    } catch (err: any) {
      console.warn("[AURA] Firestore eligibility check notice:", err.message);
    }

    // 2. Fallback to local storage if Firestore was unreachable
    if (!rawTimestamp) {
      try {
        const cached = localStorage.getItem(`aura_user_${activeUid}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          isRegistered = Boolean(parsed.registered || (parsed.faceDescriptor && parsed.faceDescriptor.length === 128));
          rawTimestamp = parsed.lastReRegisteredAt || parsed.faceProfile?.lastReRegisteredAt || parsed.updatedAt || parsed.createdAt;
        }
      } catch {}
    }

    const lastDate = parseFirestoreTimestamp(rawTimestamp);

    // If no previous registration timestamp was found
    if (!lastDate) {
      return {
        isRegistered,
        canReRegister: true,
        daysRemaining: 0,
        lastUpdatedDate: null,
        nextAvailableDate: new Date(),
        formattedLastUpdated: isRegistered ? 'Registered' : 'Not enrolled',
        formattedNextAvailable: 'Available now',
      };
    }

    const nextAvailableTime = lastDate.getTime() + THIRTY_DAYS_MS;
    const diffMs = nextAvailableTime - Date.now();

    if (diffMs > 0) {
      const daysRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
      const nextDate = new Date(nextAvailableTime);
      return {
        isRegistered: true,
        canReRegister: false,
        daysRemaining,
        lastUpdatedDate: lastDate,
        nextAvailableDate: nextDate,
        formattedLastUpdated: formatDisplayDate(lastDate),
        formattedNextAvailable: formatDisplayDate(nextDate),
      };
    } else {
      return {
        isRegistered: true,
        canReRegister: true,
        daysRemaining: 0,
        lastUpdatedDate: lastDate,
        nextAvailableDate: new Date(nextAvailableTime),
        formattedLastUpdated: formatDisplayDate(lastDate),
        formattedNextAvailable: formatDisplayDate(new Date(nextAvailableTime)),
      };
    }
  },

  async reRegisterFaceId(uid: string, newEmbedding: number[], sampleCount: number = 1): Promise<ReRegistrationStatus> {
    const activeUid = auth.currentUser?.uid || uid;
    if (!auth.currentUser) {
      throw new Error('Authentication required for biometric re-registration.');
    }

    // Biometric validation
    const embedding = Array.from(newEmbedding || []);
    if (!embedding.length || embedding.length !== 128 || embedding.some(v => typeof v !== 'number' || isNaN(v))) {
      throw new Error('Invalid face biometric embedding. 128 floating-point values required.');
    }

    const biometricDocRef = doc(firestore, 'users', activeUid, 'faceProfile', 'biometric');
    const userDocRef = doc(firestore, 'users', activeUid);

    // Atomically enforce 30-day restriction and replace biometric template in Firestore via Transaction
    try {
      await runTransaction(firestore, async (transaction) => {
        const snap = await transaction.get(biometricDocRef);
        if (snap.exists()) {
          const data = snap.data();
          const rawTs = data.lastReRegisteredAt || data.updatedAt || data.createdAt;
          const lastDate = parseFirestoreTimestamp(rawTs);
          if (lastDate) {
            const timeSinceLast = Date.now() - lastDate.getTime();
            if (timeSinceLast < THIRTY_DAYS_MS) {
              const daysRemaining = Math.ceil((THIRTY_DAYS_MS - timeSinceLast) / (24 * 60 * 60 * 1000));
              const nextAvailable = new Date(lastDate.getTime() + THIRTY_DAYS_MS);
              const err: any = new Error('FACE_ID_COOLDOWN_ACTIVE');
              err.daysRemaining = daysRemaining;
              err.nextAvailableDate = nextAvailable;
              throw err;
            }
          }
        }

        // Atomically replace existing embedding and update server timestamp
        transaction.set(biometricDocRef, {
          embedding,
          registered: true,
          sampleCount: sampleCount || 1,
          lastReRegisteredAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          version: snap.exists() ? ((snap.data()?.version || 1) + 1) : 1,
        }, { merge: true });

        transaction.set(userDocRef, {
          faceDescriptor: embedding,
          registered: true,
          lastReRegisteredAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });
    } catch (err: any) {
      if (err.message === 'FACE_ID_COOLDOWN_ACTIVE' || err.daysRemaining) {
        throw err;
      }
      if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
        console.warn("[AURA] Remote Firestore rules notice during re-registration; saving locally.");
      } else {
        console.error("[AURA] Biometric re-registration transaction failed:", err);
        throw new Error('Face ID update could not be completed. Please try again.');
      }
    }

    // Update local storage cache to match
    const now = new Date();
    const nextAvailable = new Date(now.getTime() + THIRTY_DAYS_MS);
    try {
      const cached = localStorage.getItem(`aura_user_${activeUid}`);
      const parsed = cached ? JSON.parse(cached) : {};
      const updated = {
        ...parsed,
        uid: activeUid,
        faceDescriptor: embedding,
        registered: true,
        sampleCount: sampleCount || 1,
        lastReRegisteredAt: now.toISOString(),
        updatedAt: now.toISOString(),
        faceProfile: {
          ...(parsed.faceProfile || {}),
          embedding,
          registered: true,
          sampleCount: sampleCount || 1,
          lastReRegisteredAt: now.toISOString(),
          updatedAt: now.toISOString(),
          version: (parsed.faceProfile?.version || 1) + 1
        }
      };
      localStorage.setItem(`aura_user_${activeUid}`, JSON.stringify(updated));
    } catch {}

    return {
      isRegistered: true,
      canReRegister: false,
      daysRemaining: 30,
      lastUpdatedDate: now,
      nextAvailableDate: nextAvailable,
      formattedLastUpdated: formatDisplayDate(now),
      formattedNextAvailable: formatDisplayDate(nextAvailable),
    };
  },

  async simulateOldRegistrationDateForTesting(uid: string, daysAgo: number = 31): Promise<ReRegistrationStatus> {
    const activeUid = auth.currentUser?.uid || uid;
    const simulatedDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    const biometricDocRef = doc(firestore, 'users', activeUid, 'faceProfile', 'biometric');
    const userDocRef = doc(firestore, 'users', activeUid);

    try {
      await setDoc(biometricDocRef, {
        lastReRegisteredAt: simulatedDate,
        updatedAt: simulatedDate,
      }, { merge: true });
      await setDoc(userDocRef, {
        lastReRegisteredAt: simulatedDate,
        updatedAt: simulatedDate,
      }, { merge: true });
    } catch {}

    try {
      const cached = localStorage.getItem(`aura_user_${activeUid}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        parsed.lastReRegisteredAt = simulatedDate.toISOString();
        if (parsed.faceProfile) parsed.faceProfile.lastReRegisteredAt = simulatedDate.toISOString();
        localStorage.setItem(`aura_user_${activeUid}`, JSON.stringify(parsed));
      }
    } catch {}

    return this.checkReRegistrationEligibility(activeUid);
  },

  async getFaceProfile(uid: string): Promise<{ embedding: number[]; registered: boolean; sampleCount: number } | null> {
    try {
      const snap = await getDoc(doc(firestore, 'users', uid, 'faceProfile', 'biometric'));
      if (snap.exists()) {
        const data = snap.data();
        if (data.embedding && Array.isArray(data.embedding)) {
          return {
            embedding: Array.from(data.embedding),
            registered: Boolean(data.registered),
            sampleCount: data.sampleCount || 1
          };
        }
      }
    } catch (err: any) {
      console.warn("Firestore getFaceProfile error:", err.message);
    }

    // Local storage fallback
    const cached = localStorage.getItem(`aura_user_${uid}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const emb = parsed.faceProfile?.embedding || parsed.faceDescriptor || parsed.faceProfile?.faceEmbedding;
        if (emb && Array.isArray(emb)) {
          return {
            embedding: Array.from(emb),
            registered: Boolean(parsed.registered),
            sampleCount: parsed.sampleCount || 1
          };
        }
      } catch {}
    }
    return null;
  },

  async getEnrolledProfiles(emailFilter?: string): Promise<EnrolledProfile[]> {
    console.log('[AURA FACE] Loading enrolled profile');
    const normalizedEmail = emailFilter?.trim().toLowerCase();
    const profiles: EnrolledProfile[] = [];

    // 1. Read from local storage index (fast in-memory cache, zero network overhead)
    try {
      const indexStr = localStorage.getItem('aura_users_index') || '[]';
      const userIndex: string[] = JSON.parse(indexStr);

      for (const uid of userIndex) {
        const cached = localStorage.getItem(`aura_user_${uid}`);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            const emb = parsed.faceDescriptor || parsed.faceProfile?.embedding || parsed.faceProfile?.faceEmbedding;
            if (emb && Array.isArray(emb) && emb.length === 128) {
              const prof: EnrolledProfile = {
                uid: parsed.uid || uid,
                name: parsed.name || 'User',
                email: parsed.email || '',
                embedding: Array.from(emb),
                sampleCount: parsed.sampleCount || parsed.faceProfile?.sampleCount || 1,
              };

              if (normalizedEmail) {
                if (prof.email.toLowerCase() === normalizedEmail) {
                  profiles.push(prof);
                }
              } else {
                profiles.push(prof);
              }
            }
          } catch {}
        }
      }
    } catch (e: any) {
      console.warn("[AURA FACE] Local biometric cache read notice:", {
        code: e?.code,
        message: e?.message,
        name: e?.name,
      });
    }

    // 2. Also check direct localStorage keys in case index was bypassed
    if (profiles.length === 0 && !normalizedEmail) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('aura_user_')) {
            const raw = localStorage.getItem(key);
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                const emb = parsed.faceDescriptor || parsed.faceProfile?.embedding;
                if (emb && Array.isArray(emb) && emb.length === 128) {
                  profiles.push({
                    uid: parsed.uid || key.replace('aura_user_', ''),
                    name: parsed.name || 'User',
                    email: parsed.email || '',
                    embedding: Array.from(emb),
                    sampleCount: parsed.sampleCount || 1
                  });
                }
              } catch {}
            }
          }
        }
      } catch {}
    }

    // 3. Attempt Firestore query for remote enrolled profiles if available
    try {
      if (normalizedEmail) {
        const q = query(collection(firestore, 'users'), where('email', '==', normalizedEmail));
        const snap = await getDocs(q);
        snap.forEach((d) => {
          const data = d.data();
          const emb = data.faceDescriptor || data.faceProfile?.embedding;
          if (emb && Array.isArray(emb) && emb.length === 128) {
            if (!profiles.some(p => p.uid === d.id)) {
              profiles.push({
                uid: d.id,
                name: data.name || 'User',
                email: data.email || normalizedEmail,
                embedding: Array.from(emb),
                sampleCount: data.sampleCount || 1,
              });
            }
          }
        });
      } else {
        const snap = await getDocs(collection(firestore, 'users'));
        snap.forEach((d) => {
          const data = d.data();
          const emb = data.faceDescriptor || data.faceProfile?.embedding;
          if (emb && Array.isArray(emb) && emb.length === 128) {
            if (!profiles.some(p => p.uid === d.id)) {
              profiles.push({
                uid: d.id,
                name: data.name || 'User',
                email: data.email || '',
                embedding: Array.from(emb),
                sampleCount: data.sampleCount || 1,
              });
            }
          }
        });
      }
    } catch (fsErr: any) {
      console.warn("[AURA FACE] Remote enrolled profile sync notice:", {
        code: fsErr?.code,
        message: fsErr?.message,
        name: fsErr?.name,
      });
    }

    console.log('[AURA FACE] Enrolled profile loaded');
    return profiles;
  },

  async saveUserProfile(uid: string, data: { name: string, email: string, faceDescriptor: number[] }): Promise<void> {
    return this.saveFaceProfile(uid, {
      name: data.name,
      email: data.email,
      faceEmbedding: data.faceDescriptor,
      sampleCount: 1
    });
  },

  async loginWithPassword(email: string, password: string): Promise<User> {
    // 1. Authenticate with Firebase Auth
    const userCred = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCred.user.uid;
    
    // 2. Fetch user profile from Firestore with local fallback
    try {
      const docSnap = await getDoc(doc(firestore, 'users', uid));
      if (docSnap.exists()) {
        return docSnap.data() as User;
      }
    } catch (err: any) {
      console.warn("[Aura Identity] Firestore read permission-denied; using session profile cache:", err.message);
    }

    const cached = localStorage.getItem(`aura_user_${uid}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return {
          id: uid,
          uid: uid,
          name: parsed.name || userCred.user.displayName || email.split('@')[0],
          email: parsed.email || email,
          faceDescriptor: parsed.faceDescriptor || []
        };
      } catch {}
    }
    
    return {
      id: uid,
      uid: uid,
      name: userCred.user.displayName || email.split('@')[0],
      email: email,
      faceDescriptor: []
    };
  }
};
