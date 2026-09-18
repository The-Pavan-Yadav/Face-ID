# AURA Face ID — System Architecture & Knowledge Base (brain.md)

## 1. System Overview
**AURA Face ID** is a biometric identity verification and authentication platform built with modern TypeScript, React, Express, and Firebase. It integrates on-device neural face detection, 128-dimensional facial embedding extraction, and multi-factor biometric matching with cloud persistence.

### Core Tenets
1. **Privacy-Preserving Biometrics**: The system **never** stores raw camera images, video frames, or Base64 snapshots as credentials. Only mathematical face embedding vectors (128-dimensional descriptors) are generated and persisted.
2. **Strict Auth & Biometric Separation**: Firebase Authentication manages user identity and account security; biometric descriptors serve as the physical verification factor.
3. **Zero Leaks**: Biometric vector numbers are never output to public console logs or application telemetry.

---

## 2. Biometric & Machine Learning Pipeline

### 2.1 Model Stack (`@vladmandic/face-api`)
- **Detector**: `TinyFaceDetector` (input resolution 224x224, score threshold 0.5) for high-performance, real-time client-side face bounding.
- **Landmark Extractor**: `FaceLandmark68Net` mapping 68 facial fiducial coordinates.
- **Feature Extractor**: `FaceRecognitionNet` generating a 128-dimensional floating point representation.

### 2.2 Guided Enrollment Workflow
The enrollment system (`src/components/FaceIDEnrollment.tsx`) guides the user through five directional biometric capture steps:
1. **Center**: Baseline frontal face alignment.
2. **Turn Left**: Yaw angle verification ($\approx -18^\circ$ to $-25^\circ$).
3. **Turn Right**: Yaw angle verification ($\approx +18^\circ$ to $+25^\circ$).
4. **Tilt Up**: Pitch angle verification ($\approx +12^\circ$ to $+20^\circ$).
5. **Tilt Down**: Pitch angle verification ($\approx -12^\circ$ to $-20^\circ$).

### 2.3 Template Synthesis & Normalization
Upon collecting valid samples across all poses:
1. **Mean Vector**: $\mathbf{m} = \frac{1}{N} \sum_{i=1}^N \mathbf{s}_i$ where $\mathbf{s}_i \in \mathbb{R}^{128}$.
2. **L2 Unit Hypersphere Normalization**:
   $$\mathbf{e} = \frac{\mathbf{m}}{\|\mathbf{m}\|_2} = \frac{\mathbf{m}}{\sqrt{\sum_{k=1}^{128} m_k^2}}$$
3. **Serialization**: Converted to a regular JavaScript `Array<number>` of length 128, verified against `NaN` or non-numeric values.

### 2.4 Verification Metric & Thresholding
During verification (`FaceLogin.tsx` / `server.ts`):
- **Metric**: Euclidean distance $d(\mathbf{u}, \mathbf{v}) = \sqrt{\sum_{k=1}^{128} (u_k - v_k)^2}$
- **Operational Threshold**: $\tau = 0.45$
  - If $d(\mathbf{u}, \mathbf{v}) < 0.45 \implies$ **MATCH (Verified)**
  - If $d(\mathbf{u}, \mathbf{v}) \ge 0.45 \implies$ **REJECT (Non-match)**

---

## 3. Database Schema & Firestore Hierarchy

Firestore stores user profiles and biometric templates partitioned per authenticated Firebase UID (`auth.currentUser.uid`):

```
users/{userId} (Document)
  ├── name: string
  ├── email: string
  ├── registered: boolean
  ├── sampleCount: number
  ├── faceDescriptor: number[128]
  ├── createdAt: timestamp
  └── updatedAt: timestamp
        │
        └── faceProfile (Subcollection)
              └── biometric (Document)
                    ├── embedding: number[128]
                    ├── registered: true
                    ├── sampleCount: number
                    ├── version: 1
                    ├── createdAt: timestamp
                    └── updatedAt: timestamp
```

### Firestore Security Rules (`firestore.rules`)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /faceProfile/{profileId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }

      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

---

## 4. Application Architecture & File Tree

```
├── .env.example                     # Environment variable declarations
├── firestore.rules                  # Firestore security rules
├── metadata.json                    # Application metadata & capabilities
├── package.json                     # Dependencies & build scripts
├── server.ts                        # Express API & Vite middleware entrypoint
└── src/
    ├── main.tsx                     # React client mounting point
    ├── App.tsx                      # Top-level view router & session manager
    ├── types.ts                     # TypeScript definitions (User, FaceState)
    ├── lib/
    │   ├── firebase.ts              # Firebase client SDK initialization
    │   ├── db.ts                    # Persistence layer (Firestore + local cache fallback)
    │   ├── face.ts                  # Face-api loader, embedding extraction & distance math
    │   └── utils.ts                 # Styling & utility helpers
    ├── components/
    │   ├── AuthLayout.tsx           # Common auth view wrapper & branding
    │   ├── CameraView.tsx           # Webcam stream with real-time landmark canvas
    │   ├── FaceIDEnrollment.tsx     # 5-step guided face enrollment state machine
    │   └── ui/                      # Base buttons, inputs, badges, cards
    └── views/
        ├── Login.tsx                # Password-based login view
        ├── Register.tsx             # Account creation & enrollment launcher
        ├── FaceLogin.tsx            # Live camera biometric login view
        └── Dashboard.tsx            # Authenticated user landing portal
```

---

## 5. Security & Fallback Architecture
- **Dual-tier persistence**: Writes first to `users/{uid}/faceProfile/biometric` in Cloud Firestore, coupled with resilient encrypted local session indexing (`localStorage`) to guarantee uninterrupted workflow in sandbox environments where cloud rules are propagating.
- **Server Token Minting**: When backend service credentials (`FIREBASE_SERVICE_ACCOUNT` / `GOOGLE_APPLICATION_CREDENTIALS`) are configured, the Express server verifies embeddings and issues Firebase Custom Auth Tokens via `admin.auth().createCustomToken()`.
- **Hybrid Verification**: If the backend is initializing or in standalone mode, client-side biometric matching executes securely against the authenticated user's enrolled profile.

---

## 6. Development & Build Commands
- `npm run dev`: Starts Express server with `tsx` and hot Vite middleware.
- `npm run build`: Builds the client SPA bundle via Vite and bundles `server.ts` into CommonJS `dist/server.cjs` via `esbuild`.
- `npm run start`: Runs `node dist/server.cjs` in production.
- `npm run lint`: Executes TypeScript type checking (`tsc --noEmit`).
