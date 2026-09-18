import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

// IMPORTANT: Replace this with your actual Firebase config object
// You can find this in your Firebase Console under Project Settings > General > Your apps
const firebaseConfig = {
  apiKey: "AIzaSyCHOu2nDFjboj5xgPjQiRLbgsIWdXPMHSw",
  authDomain: "drift-efab5.firebaseapp.com",
  projectId: "drift-efab5",
  storageBucket: "drift-efab5.firebasestorage.app",
  messagingSenderId: "173001019618",
  appId: "1:173001019618:web:4aa9edafe2280f804e8ebb",
  measurementId: "G-NXSLBLTQKZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
