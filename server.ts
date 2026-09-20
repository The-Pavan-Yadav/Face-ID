import express from 'express';
import cors from 'cors';
import path from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { faceAuthStore } from './server/faceAuthStore';

dotenv.config();

// Initialize Firebase Admin
let isFirebaseAdminInitialized = false;

if (!getApps().length) {
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();

  if (rawKey) {
    if (rawKey.startsWith('AIzaSy')) {
      console.warn(
        "[Aura Identity] Note: FIREBASE_SERVICE_ACCOUNT_KEY contains a Firebase Web API Key ('AIzaSy...'), not a Service Account JSON. " +
        "Firebase Admin requires a Service Account private key JSON from: " +
        "Firebase Console -> Project Settings -> Service Accounts -> Generate new private key."
      );
    } else {
      let serviceAccount: any = null;
      try {
        serviceAccount = JSON.parse(rawKey);
      } catch {
        try {
          const decoded = Buffer.from(rawKey, 'base64').toString('utf-8');
          serviceAccount = JSON.parse(decoded);
        } catch {
          console.warn(
            "[Aura Identity] FIREBASE_SERVICE_ACCOUNT_KEY is present but could not be parsed as JSON or Base64-encoded JSON."
          );
        }
      }

      if (serviceAccount && typeof serviceAccount === 'object' && serviceAccount.private_key) {
        try {
          initializeApp({
            credential: cert(serviceAccount),
            projectId: serviceAccount.project_id || 'drift-efab5',
          });
          isFirebaseAdminInitialized = true;
          console.log("[Aura Identity] Firebase Admin initialized successfully.");
        } catch (initErr) {
          console.warn("[Aura Identity] Firebase Admin SDK initialization with credentials failed:", initErr);
        }
      } else if (serviceAccount) {
        console.warn(
          "[Aura Identity] Provided service account JSON is missing the required 'private_key' field."
        );
      }
    }
  } else {
    console.warn(
      "[Aura Identity] FIREBASE_SERVICE_ACCOUNT_KEY is not configured. Email/Password auth operates directly via Firebase Client SDK. Face login backend requires Service Account credentials."
    );
  }
} else {
  isFirebaseAdminInitialized = true;
}

function euclideanDistance(desc1: number[], desc2: number[]) {
  return Math.sqrt(desc1.reduce((sum, val, i) => sum + Math.pow(val - desc2[i], 2), 0));
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Secure cross-device Face ID profile lookup by email
  app.post('/api/auth/face-profile', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({
          success: false,
          error: 'Enter your account email to use Face ID.'
        });
      }

      const normalizedEmail = email.toLowerCase().trim();

      // 1. Check persistent faceAuthStore (works across all devices and server reboots)
      let profile = faceAuthStore.getProfileByEmail(normalizedEmail);

      // 2. If not in store but Firebase Admin is active, query Firestore authoritative documents
      if (!profile && isFirebaseAdminInitialized) {
        try {
          const db = getFirestore();
          // Look up user document by email
          const userQuery = await db.collection('users').where('email', '==', normalizedEmail).limit(1).get();
          if (!userQuery.empty) {
            const userDoc = userQuery.docs[0];
            const userData = userDoc.data();
            const uid = userDoc.id;

            // Check biometric subcollection document at users/{uid}/faceProfile/biometric
            const bioDoc = await db.collection('users').doc(uid).collection('faceProfile').doc('biometric').get();
            let embedding: number[] | null = null;

            if (bioDoc.exists) {
              const bioData = bioDoc.data();
              if (Array.isArray(bioData?.embedding) && bioData.embedding.length === 128) {
                embedding = bioData.embedding;
              }
            }

            // Fallback to user document root embedding
            if (!embedding && Array.isArray(userData?.faceDescriptor) && userData.faceDescriptor.length === 128) {
              embedding = userData.faceDescriptor;
            }

            if (embedding) {
              profile = {
                uid,
                name: userData.name || 'User',
                email: normalizedEmail,
                embedding,
                registered: true,
                version: 1,
                updatedAt: new Date().toISOString()
              };
              // Cache in store for subsequent rapid verification
              faceAuthStore.saveProfile(profile);
            }
          }
        } catch (adminErr) {
          console.warn('[FaceAuth] Admin Firestore query notice:', adminErr);
        }
      }

      if (!profile || !profile.embedding || profile.embedding.length !== 128) {
        return res.status(404).json({
          success: false,
          code: 'NO_FACE_ID_REGISTERED',
          error: 'No Face ID is registered for this account. Please sign in with your password and register Face ID.'
        });
      }

      // Return ONLY the requested user's biometric profile
      return res.json({
        success: true,
        profile: {
          uid: profile.uid,
          name: profile.name,
          email: profile.email,
          embedding: profile.embedding,
          registered: true
        }
      });
    } catch (err: any) {
      console.error('[FaceAuth] Lookup error:', err);
      return res.status(500).json({
        success: false,
        error: 'Unable to verify Face ID right now. Please try again.'
      });
    }
  });

  // Cross-device registration sync endpoint
  app.post('/api/auth/sync-profile', async (req, res) => {
    try {
      const { uid, name, email, embedding, sampleCount } = req.body;
      if (!uid || !email || !Array.isArray(embedding) || embedding.length !== 128) {
        return res.status(400).json({ success: false, error: 'Invalid biometric profile payload' });
      }

      faceAuthStore.saveProfile({
        uid,
        name: name || 'User',
        email,
        embedding,
        registered: true,
        sampleCount: sampleCount || 1,
        version: 1
      });

      console.log(`[FaceAuth] Synchronized biometric profile for account: ${email}`);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[FaceAuth] Sync error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Failed to sync biometric profile' });
    }
  });

  app.post('/api/auth/face-login', async (req, res) => {
    try {
      const { descriptor, email } = req.body;
      if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
        return res.status(400).json({ error: 'Invalid face descriptor' });
      }

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ error: 'Enter your account email to use Face ID.' });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const THRESHOLD = 0.45;

      // 1. Resolve from faceAuthStore
      let profile = faceAuthStore.getProfileByEmail(normalizedEmail);

      // 2. Fallback to Firestore if Firebase Admin is configured and profile not in memory
      if ((!profile || !profile.embedding) && isFirebaseAdminInitialized) {
        try {
          const db = getFirestore();
          const usersSnap = await db.collection('users').where('email', '==', normalizedEmail).limit(1).get();
          if (!usersSnap.empty) {
            const uDoc = usersSnap.docs[0];
            const uData = uDoc.data();
            const bioSnap = await db.doc(`users/${uDoc.id}/faceProfile/biometric`).get();
            const bioData = bioSnap.data();
            const emb = bioData?.embedding || uData.faceDescriptor;
            if (emb && Array.isArray(emb) && emb.length === 128) {
              profile = {
                uid: uDoc.id,
                name: uData.name || 'User',
                email: normalizedEmail,
                embedding: emb,
                registered: true,
                sampleCount: bioData?.sampleCount || 4,
                version: 1,
              };
              faceAuthStore.saveProfile(profile);
            }
          }
        } catch (dbErr) {
          console.warn("[FaceLogin] Firestore lookup notice:", dbErr);
        }
      }

      if (!profile || !profile.embedding || profile.embedding.length !== 128) {
        return res.status(404).json({
          error: 'No Face ID is registered for this account. Please sign in with your password and register Face ID.'
        });
      }

      const dist = euclideanDistance(descriptor, profile.embedding);

      if (dist < THRESHOLD) {
        let customToken: string | undefined;
        if (isFirebaseAdminInitialized) {
          try {
            customToken = await getAuth().createCustomToken(profile.uid);
          } catch {}
        }

        return res.json({
          success: true,
          uid: profile.uid,
          name: profile.name,
          email: profile.email,
          token: customToken,
        });
      } else {
        return res.status(401).json({ error: 'Face not recognized. Please try again.' });
      }
    } catch (error: any) {
      console.error("Face login error:", error);
      return res.status(500).json({ error: 'Unable to verify Face ID right now. Please try again.' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
