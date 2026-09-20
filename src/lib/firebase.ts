import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

// IMPORTANT: Replace this with your actual Firebase config object
// You can find this in your Firebase Console under Project Settings > General > Your apps
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCHOu2nDFjboj5xgPjQiRLbgsIWdXPMHSw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "drift-efab5.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "drift-efab5",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "drift-efab5.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "173001019618",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:173001019618:web:4aa9edafe2280f804e8ebb",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-NXSLBLTQKZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
