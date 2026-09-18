import React, { useState, useEffect } from 'react';
import { CheckCircle2, ScanFace, ArrowLeft, RefreshCw, Lock, AlertCircle, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AuthLayout } from '../components/AuthLayout';
import { CameraView } from '../components/CameraView';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { User } from '../types';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { db } from '../lib/db';
import { doc, getDoc } from 'firebase/firestore';
import { db as firestore } from '../lib/firebase';
import { calculateEuclideanDistance } from '../lib/face';

interface FaceLoginProps {
  onLogin: (user: User) => void;
  onNavigate: (view: 'login') => void;
}

export function FaceLogin({ onLogin, onNavigate }: FaceLoginProps) {
  const [accountEmail, setAccountEmail] = useState('');
  const [statusMessage, setStatusMessage] = useState('Initializing Face ID...');
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [verifiedUserName, setVerifiedUserName] = useState<string>('');
  const [livenessState, setLivenessState] = useState<'straight' | 'turn' | 'verifying'>('straight');

  useEffect(() => {
    // Initial camera stabilization
    const timer = setTimeout(() => {
      setStatusMessage('Looking for your face...');
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  const handleFaceDetected = async (data: { descriptor: Float32Array, landmarks: any }) => {
    if (livenessState === 'verifying' || isSuccess) return;

    if (livenessState === 'straight') {
      setStatusMessage('Face detected — Please turn head slightly left or right');
      setLivenessState('turn');
      return;
    } 
    
    if (livenessState === 'turn') {
      const jaw = data.landmarks.getJawOutline();
      const left = jaw[0]?.x;
      const right = jaw[16]?.x;
      const nose = data.landmarks.getNose()[3]?.x;
      
      if (left === undefined || right === undefined || nose === undefined) return;
      const width = right - left;
      if (width <= 0) return;
      
      const ratio = (nose - left) / width;
      
      // If ratio is off-center, liveness head turn verified
      if (ratio < 0.4 || ratio > 0.6) {
        setLivenessState('verifying');
        setStatusMessage('Verifying identity...');
        verifyBiometricFace(data.descriptor);
      }
    }
  };

  const verifyBiometricFace = async (descriptor: Float32Array) => {
    try {
      const liveEmbedding = Array.from(descriptor);
      if (!liveEmbedding.length || liveEmbedding.length !== 128) {
        throw new Error('Biometric face capture incomplete. Please reposition.');
      }

      const THRESHOLD = 0.45; // Biometric matching threshold

      // 1. First attempt backend token authentication if server is configured
      try {
        const response = await fetch('/api/auth/face-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ descriptor: liveEmbedding })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.token) {
            const userCred = await signInWithCustomToken(auth, result.token);
            
            let user: User | null = null;
            try {
              const docSnap = await getDoc(doc(firestore, 'users', userCred.user.uid));
              if (docSnap.exists()) {
                user = docSnap.data() as User;
              }
            } catch {
              // Permission fallback
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
                name: userCred.user.displayName || 'Pavan',
                email: userCred.user.email || '',
                faceDescriptor: liveEmbedding
              };
            }

            const displayName = user.name || 'Pavan';
            setVerifiedUserName(displayName);
            setStatusMessage('Identity confirmed');
            setIsSuccess(true);

            setTimeout(() => {
              onLogin(user!);
            }, 1800);
            return;
          }
        }
      } catch {
        // Backend service account offline or in dev fallback mode
      }

      // 2. Direct Biometric Verification against enrolled profiles
      const allUsersStr = localStorage.getItem('aura_users_index') || '[]';
      const allUserIds: string[] = JSON.parse(allUsersStr);
      let matchedUser: User | null = null;
      let minDistance = Infinity;

      for (const uid of allUserIds) {
        const profile = await db.getFaceProfile(uid);
        if (!profile || !profile.embedding || profile.embedding.length !== 128) {
          continue;
        }

        const distance = calculateEuclideanDistance(liveEmbedding, profile.embedding);

        if (distance < minDistance && distance < THRESHOLD) {
          minDistance = distance;
          
          const userStr = localStorage.getItem(`aura_user_${uid}`);
          if (userStr) {
            try {
              const u = JSON.parse(userStr);
              if (accountEmail && u.email && u.email.toLowerCase() !== accountEmail.trim().toLowerCase()) {
                continue;
              }
              matchedUser = {
                id: u.id || u.uid || uid,
                uid: u.uid || uid,
                name: u.name,
                email: u.email,
                faceDescriptor: profile.embedding,
                createdAt: u.createdAt || new Date().toISOString()
              };
            } catch {}
          }
        }
      }

      if (matchedUser) {
        const displayName = matchedUser.name || 'Pavan';
        setVerifiedUserName(displayName);
        setStatusMessage('Identity confirmed');
        setIsSuccess(true);

        setTimeout(() => {
          onLogin(matchedUser!);
        }, 1800);
        return;
      }

      throw new Error('Face not recognized. Biometric verification threshold was not satisfied.');
    } catch (err: any) {
      console.warn("Face login verification notice:", err.message);
      setError(err.message || 'Face not recognized. Please try again.');
      setStatusMessage('Verification failed');
    }
  };

  const handleRetry = () => {
    setError(null);
    setIsSuccess(false);
    setLivenessState('straight');
    setStatusMessage('Looking for your face...');
  };

  return (
    <AuthLayout 
      title={isSuccess ? "Identity Confirmed" : "Biometric Face ID"} 
      subtitle={isSuccess ? "Biometric authentication successful." : "Center your face in the aperture to authenticate."}
    >
      <div className="space-y-4">
        <AnimatePresence mode="wait">
          {error ? (
            /* Failure State */
            <motion.div 
              key="error-state"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="text-center py-5 space-y-4"
            >
              <div className="relative w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400 shadow-[0_0_25px_rgba(244,63,94,0.25)]">
                <AlertCircle className="w-7 h-7" />
              </div>
              
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-slate-100">
                  Face not recognized
                </h3>
                <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                  Please ensure good lighting and face the camera directly, or authenticate with your account password.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button 
                  type="button"
                  variant="primary" 
                  onClick={handleRetry}
                  className="flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Try Again</span>
                </Button>
                <Button 
                  type="button"
                  variant="secondary" 
                  onClick={() => onNavigate('login')}
                  className="flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  <span>Use Password</span>
                </Button>
              </div>
            </motion.div>
          ) : isSuccess ? (
            /* Success State */
            <motion.div 
              key="success-state"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="text-center py-8 space-y-5"
            >
              <div className="relative w-18 h-18 rounded-full bg-gradient-to-tr from-cyan-500/20 via-emerald-500/20 to-indigo-500/20 border border-cyan-400/50 flex items-center justify-center mx-auto shadow-[0_0_35px_rgba(34,211,238,0.4)]">
                <CheckCircle2 className="w-9 h-9 text-cyan-300 animate-in zoom-in-50 duration-300" />
                <div className="absolute inset-0 rounded-full border border-cyan-400 animate-ping opacity-30" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
                  <span>Welcome back{verifiedUserName ? `, ${verifiedUserName}.` : '.'}</span>
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                </h3>
                <p className="text-xs font-mono text-cyan-300/80 tracking-wide uppercase">
                  Biometric Token Minted • Session Authorizing
                </p>
              </div>

              <div className="w-48 h-1 mx-auto bg-slate-800 rounded-full overflow-hidden">
                <div className="w-full h-full bg-gradient-to-r from-cyan-400 to-indigo-500 animate-pulse" />
              </div>
            </motion.div>
          ) : (
            /* Active Scanner State */
            <motion.div 
              key="active-scanner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3.5"
            >
              {/* Account Email (Optional selector) */}
              <div className="max-w-[280px] mx-auto w-full">
                <Input
                  id="face-email-hint"
                  label="Account Email (Optional filter)"
                  placeholder="name@company.com"
                  type="email"
                  value={accountEmail}
                  onChange={(e) => setAccountEmail(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              {/* 2026 Biometric Camera Scanner View */}
              <CameraView 
                onFaceDetected={handleFaceDetected} 
                statusMessage={statusMessage}
                isScanning={livenessState !== 'verifying'}
              />

              {/* Return to Password Link */}
              <div className="flex justify-center pt-1">
                <button 
                  type="button" 
                  onClick={() => onNavigate('login')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors focus:outline-none"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Return to password sign in</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AuthLayout>
  );
}
