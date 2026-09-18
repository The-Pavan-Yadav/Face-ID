import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { CameraView } from '../components/CameraView';
import { Button } from '../components/ui/Button';
import { User } from '../types';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { db } from '../lib/db';
import { doc, getDoc } from 'firebase/firestore';
import { db as firestore } from '../lib/firebase';

interface FaceLoginProps {
  onLogin: (user: User) => void;
  onNavigate: (view: 'login') => void;
}

export function FaceLogin({ onLogin, onNavigate }: FaceLoginProps) {
  const [statusMessage, setStatusMessage] = useState('Please look straight ahead');
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [livenessState, setLivenessState] = useState<'straight' | 'turn' | 'verifying'>('straight');

  const handleFaceDetected = async (data: { descriptor: Float32Array, landmarks: any }) => {
    if (livenessState === 'verifying') return; // Prevent multiple calls

    if (livenessState === 'straight') {
      setStatusMessage("Please turn your head slightly left or right");
      setLivenessState('turn');
      return;
    } 
    
    if (livenessState === 'turn') {
      const jaw = data.landmarks.getJawOutline();
      const left = jaw[0].x;
      const right = jaw[16].x;
      const nose = data.landmarks.getNose()[3].x;
      
      if (left === undefined || right === undefined || nose === undefined) return;
      const width = right - left;
      if (width <= 0) return;
      
      const ratio = (nose - left) / width;
      
      // If ratio is off-center, they turned their head
      if (ratio < 0.4 || ratio > 0.6) {
        setLivenessState('verifying');
        setStatusMessage('Verifying identity...');
        verifyWithBackend(data.descriptor);
      }
    }
  };

  const verifyWithBackend = async (descriptor: Float32Array) => {
    try {
      const response = await fetch('/api/auth/face-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descriptor: Array.from(descriptor) })
      });

      if (response.ok) {
        const result = await response.json();
        // 1. Sign in with the Custom Token
        const userCred = await signInWithCustomToken(auth, result.token);
        
        // 2. Fetch the user profile
        let user: User | null = null;
        try {
          const docSnap = await getDoc(doc(firestore, 'users', userCred.user.uid));
          if (docSnap.exists()) {
            user = docSnap.data() as User;
          }
        } catch {
          // Firestore read permissions restricted
        }

        if (!user) {
          const cached = localStorage.getItem(`aura_user_${userCred.user.uid}`);
          if (cached) {
            try {
              user = JSON.parse(cached) as User;
            } catch {}
          }
        }

        if (!user) {
          user = {
            id: userCred.user.uid,
            uid: userCred.user.uid,
            name: userCred.user.displayName || 'User',
            email: userCred.user.email || '',
            faceDescriptor: Array.from(descriptor)
          };
        }

        setStatusMessage('Identity verified');
        setIsSuccess(true);
        setTimeout(() => {
          onLogin(user!);
        }, 1500);
        return;
      }

      // If backend responded with 503 or error: check registered biometric face profiles in local storage cache
      const allUsersStr = localStorage.getItem('aura_users_index') || '[]';
      const allUserIds: string[] = JSON.parse(allUsersStr);
      let matchedUser: User | null = null;
      let minDistance = Infinity;
      const THRESHOLD = 0.52;

      for (const uid of allUserIds) {
        const userStr = localStorage.getItem(`aura_user_${uid}`);
        if (userStr) {
          try {
            const u = JSON.parse(userStr);
            const embedding = u.faceProfile?.faceEmbedding || u.faceDescriptor;
            if (embedding && Array.isArray(embedding)) {
              const dist = Math.sqrt(Array.from(descriptor).reduce((sum, val, i) => sum + Math.pow(val - embedding[i], 2), 0));
              if (dist < minDistance && dist < THRESHOLD) {
                minDistance = dist;
                matchedUser = {
                  id: u.id || u.uid || uid,
                  uid: u.uid || uid,
                  name: u.name,
                  email: u.email,
                  faceDescriptor: embedding
                };
              }
            }
          } catch {}
        }
      }

      if (matchedUser) {
        setStatusMessage('Identity verified');
        setIsSuccess(true);
        setTimeout(() => {
          onLogin(matchedUser!);
        }, 1500);
        return;
      }

      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || 'Face not recognized');
    } catch (err: any) {
      console.warn("Face login warning:", err.message);
      setError(err.message || 'Verification failed');
      setStatusMessage('Verification failed');
    }
  };

  return (
    <AuthLayout title="Verify your identity" subtitle="Follow the instructions to continue.">
      <div className="space-y-8">
        {error ? (
          <div className="text-center space-y-4 py-8">
            <div className="w-12 h-12 rounded-full border border-red-200 bg-red-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-slate-700 text-sm max-w-sm mx-auto leading-relaxed">{error}</p>
            <div className="flex space-x-3 justify-center pt-4">
               <Button variant="outline" onClick={() => {
                 setError(null);
                 setLivenessState('straight');
                 setStatusMessage('Please look straight ahead');
               }}>Retry</Button>
               <Button variant="secondary" onClick={() => onNavigate('login')}>Use Password</Button>
            </div>
          </div>
        ) : isSuccess ? (
          <div className="text-center space-y-4 py-16 animate-in fade-in duration-500">
            <CheckCircle2 className="w-12 h-12 text-slate-900 mx-auto" />
            <p className="text-slate-900 font-medium">Identity verified</p>
          </div>
        ) : (
          <>
            <CameraView 
              onFaceDetected={handleFaceDetected} 
              statusMessage={statusMessage}
            />
            <div className="flex justify-center pt-4">
              <button 
                type="button" 
                onClick={() => onNavigate('login')}
                className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
              >
                Sign in with password instead
              </button>
            </div>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
