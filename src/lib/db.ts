import { auth, db as firestore, storage } from './firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc, getDocs, collection, query, where, serverTimestamp, runTransaction } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
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
  sampleBlobs?: Blob[];
}

export interface EnrolledProfile {
  uid: string;
  name: string;
  email: string;
  embedding: number[];
  sampleCount: number;
  samplePaths?: string[];
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMsg: string,
  errorCode = 'storage/timeout'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err: any = new Error(timeoutMsg);
      err.code = errorCode;
      err.name = 'TimeoutError';
      reject(err);
    }, ms);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
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
    // 4. VERIFY AUTH.CURRENTUSER IS NOT NULL BEFORE UPLOADING
    let currentUser = auth.currentUser;
    if (!currentUser) {
      // Allow brief tick if auth state is propagating
      await new Promise<void>((resolve) => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
          if (user) {
            currentUser = user;
          }
          unsubscribe();
          resolve();
        });
        setTimeout(() => {
          unsubscribe();
          resolve();
        }, 500);
      });
      currentUser = auth.currentUser || currentUser;
    }

    if (!currentUser || !currentUser.uid) {
      const authError: any = new Error('Authentication required: Current user is not signed in before uploading.');
      authError.code = 'auth/no-current-user';
      authError.name = 'AuthError';
      console.error('[AURA STORAGE ERROR]', {
        code: authError.code,
        message: authError.message,
        name: authError.name
      });
      throw authError;
    }

    // Explicitly enforce uid = auth.currentUser.uid
    const activeUid = currentUser.uid;

    // Convert to standard, serializable JavaScript Array<number>
    const embedding = Array.from(data.faceEmbedding || []);
    if (!embedding.length || embedding.length !== 128 || embedding.some(v => typeof v !== 'number' || isNaN(v))) {
      throw new Error('Face embedding generation failed.');
    }

    const sampleBlobs = data.sampleBlobs || [];
    const sampleCount = data.sampleCount || (sampleBlobs.length > 0 ? sampleBlobs.length : 4);
    const samplePaths: string[] = [];

    // [AURA ENROLL] Samples captured: X
    console.log(`[AURA ENROLL] Samples captured: ${sampleBlobs.length || sampleCount}`);

    // 1. Upload face samples to Firebase Storage: faceProfiles/{uid}/sample-N.jpg
    if (sampleBlobs.length > 0) {
      for (let i = 0; i < sampleBlobs.length; i++) {
        const sampleNum = i + 1;
        const blob = sampleBlobs[i];

        // 5. VERIFY IMAGE/BLOB CONVERSION
        if (!blob || !(blob instanceof Blob) || blob.size === 0) {
          const blobErr: any = new Error(`Sample ${sampleNum} is invalid or empty.`);
          blobErr.code = 'storage/invalid-blob';
          blobErr.name = 'InvalidBlobError';
          blobErr.sampleIndex = sampleNum;
          console.error('[AURA STORAGE ERROR]', {
            code: blobErr.code,
            message: blobErr.message,
            name: blobErr.name
          });
          throw blobErr;
        }

        // Before upload, log only: blob.type and blob.size
        console.log(blob.type);
        console.log(blob.size);

        console.log(`[AURA ENROLL] Starting sample ${sampleNum} upload`);

        // 4. VERIFY STORAGE PATH: faceProfiles/{uid}/sample-N.jpg
        const samplePath = `faceProfiles/${activeUid}/sample-${sampleNum}.jpg`;
        samplePaths.push(samplePath);

        // 2. CATCH EVERY UPLOAD ERROR with proper error handling and timeout
        try {
          const storageRef = ref(storage, samplePath);
          await withTimeout(
            uploadBytes(storageRef, blob, { contentType: 'image/jpeg' }),
            12000,
            `Sample ${sampleNum} upload timed out.`
          );
          console.log(`[AURA ENROLL] Sample ${sampleNum} upload complete`);
        } catch (error: any) {
          console.error('[AURA STORAGE ERROR]', {
            code: error?.code || 'storage/upload-failed',
            message: error?.message || `Failed to upload sample ${sampleNum}`,
            name: error?.name || 'StorageError'
          });
          const enhancedErr: any = new Error(`Sample ${sampleNum} upload failed: ${error?.message || 'Storage error'}`);
          enhancedErr.code = error?.code || 'storage/upload-failed';
          enhancedErr.name = error?.name || 'StorageError';
          enhancedErr.sampleIndex = sampleNum;
          throw enhancedErr;
        }
      }
    } else {
      for (let i = 1; i <= sampleCount; i++) {
        samplePaths.push(`faceProfiles/${activeUid}/sample-${i}.jpg`);
      }
    }

    const metadataDocRef = doc(firestore, 'users', activeUid, 'faceProfile', 'metadata');
    const biometricDocRef = doc(firestore, 'users', activeUid, 'faceProfile', 'biometric');
    const userDocRef = doc(firestore, 'users', activeUid);

    // 2. Store ONLY metadata in Firestore (no image binary or base64 data)
    const profileMetadata = {
      registered: true,
      sampleCount,
      samplePaths,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastReRegisteredAt: serverTimestamp(),
      version: 1
    };

    console.log('[AURA ENROLL] Starting Firestore metadata write');
    try {
      await withTimeout(
        Promise.all([
          setDoc(metadataDocRef, profileMetadata),
          setDoc(biometricDocRef, {
            ...profileMetadata,
            embedding,
          }),
          setDoc(userDocRef, {
            name: data.name,
            email: data.email.toLowerCase().trim(),
            registered: true,
            sampleCount,
            samplePaths,
            faceDescriptor: embedding,
            updatedAt: serverTimestamp(),
            lastReRegisteredAt: serverTimestamp(),
          }, { merge: true })
        ]),
        12000,
        'Firestore metadata write timed out.',
        'firestore/timeout'
      );
      console.log('[AURA ENROLL] Firestore metadata saved');
    } catch (error: any) {
      console.error('[AURA FIRESTORE ERROR]', {
        code: error?.code || 'firestore/write-failed',
        message: error?.message || 'Failed to write Firestore metadata',
        name: error?.name || 'FirestoreError'
      });
      throw error;
    }

    // 3. Synchronize with cross-device backend store
    try {
      await withTimeout(
        fetch('/api/auth/sync-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: activeUid,
            name: data.name,
            email: data.email.toLowerCase().trim(),
            embedding,
            sampleCount,
            samplePaths,
          }),
        }),
        5000,
        'Cross-device sync timed out',
        'sync/timeout'
      );
    } catch (syncErr: any) {
      console.warn('[AURA FACE] Cross-device sync notice:', syncErr?.message);
    }

    console.log('[AURA ENROLL] Enrollment complete');
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

  async reRegisterFaceId(uid: string, newEmbedding: number[], sampleCount: number = 4, sampleBlobs?: Blob[]): Promise<ReRegistrationStatus> {
    const activeUid = auth.currentUser?.uid || uid;
    if (!auth.currentUser) {
      throw new Error('Authentication required for biometric re-registration.');
    }

    // Biometric validation
    const embedding = Array.from(newEmbedding || []);
    if (!embedding.length || embedding.length !== 128 || embedding.some(v => typeof v !== 'number' || isNaN(v))) {
      throw new Error('Invalid face biometric embedding. 128 floating-point values required.');
    }

    const effectiveCount = sampleCount || (sampleBlobs ? sampleBlobs.length : 4);
    const samplePaths: string[] = [];

    // Replace old face samples in Firebase Storage
    if (sampleBlobs && sampleBlobs.length > 0) {
      for (let i = 0; i < sampleBlobs.length; i++) {
        const sampleNum = i + 1;
        const blob = sampleBlobs[i];
        if (!blob || !(blob instanceof Blob) || blob.size === 0) {
          const blobErr: any = new Error(`Re-registration sample ${sampleNum} is invalid or empty.`);
          blobErr.code = 'storage/invalid-blob';
          blobErr.name = 'InvalidBlobError';
          blobErr.sampleIndex = sampleNum;
          console.error('[AURA STORAGE ERROR]', {
            code: blobErr.code,
            message: blobErr.message,
            name: blobErr.name
          });
          throw blobErr;
        }

        const samplePath = `faceProfiles/${activeUid}/sample-${sampleNum}.jpg`;
        samplePaths.push(samplePath);
        try {
          const fileRef = ref(storage, samplePath);
          await withTimeout(
            uploadBytes(fileRef, blob, { contentType: 'image/jpeg' }),
            12000,
            `Upload timed out for re-registration sample ${sampleNum}.`
          );
        } catch (uploadErr: any) {
          console.error('[AURA STORAGE ERROR]', {
            code: uploadErr?.code || 'storage/upload-failed',
            message: uploadErr?.message || `Failed to upload re-registration sample ${sampleNum}`,
            name: uploadErr?.name || 'StorageError'
          });
          const enhancedErr: any = new Error(`Sample ${sampleNum} upload failed: ${uploadErr?.message || 'Storage error'}`);
          enhancedErr.code = uploadErr?.code || 'storage/upload-failed';
          enhancedErr.name = uploadErr?.name || 'StorageError';
          enhancedErr.sampleIndex = sampleNum;
          throw enhancedErr;
        }
      }
    } else {
      for (let i = 1; i <= effectiveCount; i++) {
        samplePaths.push(`faceProfiles/${activeUid}/sample-${i}.jpg`);
      }
    }

    const metadataDocRef = doc(firestore, 'users', activeUid, 'faceProfile', 'metadata');
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

        // Atomically replace existing samples & embedding, updating timestamps
        const updatedVersion = snap.exists() ? ((snap.data()?.version || 1) + 1) : 1;
        
        transaction.set(metadataDocRef, {
          registered: true,
          sampleCount: effectiveCount,
          samplePaths: samplePaths,
          lastReRegisteredAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          version: updatedVersion,
        }, { merge: true });

        transaction.set(biometricDocRef, {
          embedding,
          registered: true,
          sampleCount: effectiveCount,
          samplePaths: samplePaths,
          lastReRegisteredAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          version: updatedVersion,
        }, { merge: true });

        transaction.set(userDocRef, {
          faceDescriptor: embedding,
          registered: true,
          sampleCount: effectiveCount,
          samplePaths: samplePaths,
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

    // Synchronize with cross-device backend
    try {
      let userEmail = auth.currentUser.email || '';
      if (!userEmail) {
        const uSnap = await getDoc(userDocRef);
        userEmail = uSnap.data()?.email || '';
      }
      if (userEmail) {
        await fetch('/api/auth/sync-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: activeUid,
            name: auth.currentUser.displayName || 'User',
            email: userEmail.toLowerCase().trim(),
            embedding,
            sampleCount: effectiveCount,
            samplePaths,
          }),
        });
      }
    } catch (syncErr: any) {
      console.warn("[AURA FACE] Cross-device sync notice:", syncErr?.message);
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
        if (data.embedding && Array.isArray(data.embedding) && data.embedding.length === 128) {
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
    return null;
  },

  async getFaceProfileByEmail(email: string): Promise<EnrolledProfile> {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      const err: any = new Error('Enter your account email to use Face ID.');
      err.code = 'NO_EMAIL';
      throw err;
    }

    console.log(`[AURA FACE] Resolving remote biometric profile for ${normalizedEmail}`);

    try {
      const res = await fetch('/api/auth/face-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const data = await res.json();

      if (res.status === 404 || data.code === 'NO_FACE_ID_REGISTERED') {
        const notFoundErr: any = new Error(
          'No Face ID is registered for this account. Please sign in with your password and register Face ID.'
        );
        notFoundErr.code = 'NO_FACE_ID_REGISTERED';
        throw notFoundErr;
      }

      if (!res.ok || !data.success || !data.profile) {
        const genErr: any = new Error(data.error || 'Unable to verify Face ID right now. Please try again.');
        genErr.code = 'SERVER_ERROR';
        throw genErr;
      }

      const p = data.profile;
      if (!p.embedding || !Array.isArray(p.embedding) || p.embedding.length !== 128) {
        const noEmbErr: any = new Error(
          'No Face ID is registered for this account. Please sign in with your password and register Face ID.'
        );
        noEmbErr.code = 'NO_FACE_ID_REGISTERED';
        throw noEmbErr;
      }

      console.log('[AURA FACE] Remote biometric profile successfully resolved for account');
      return {
        uid: p.uid,
        name: p.name || 'User',
        email: p.email || normalizedEmail,
        embedding: Array.from(p.embedding),
        sampleCount: p.sampleCount || 1,
      };
    } catch (err: any) {
      if (err.code === 'NO_FACE_ID_REGISTERED' || err.code === 'NO_EMAIL') {
        throw err;
      }
      console.warn('[AURA FACE] Face profile lookup notice:', err?.message || err);
      const netErr: any = new Error('Unable to verify Face ID right now. Please try again.');
      netErr.code = 'NETWORK_ERROR';
      throw netErr;
    }
  },

  async getEnrolledProfiles(emailFilter?: string): Promise<EnrolledProfile[]> {
    const normalizedEmail = emailFilter?.trim().toLowerCase();
    if (!normalizedEmail) {
      // Per security mandate: DO NOT download all users' face embeddings to the client
      return [];
    }

    const singleProfile = await this.getFaceProfileByEmail(normalizedEmail);
    return [singleProfile];
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
