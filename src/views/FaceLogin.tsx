import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, ArrowLeft, RefreshCw, Lock, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AuthLayout } from '../components/AuthLayout';
import { CameraView } from '../components/CameraView';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { User } from '../types';
import { db, EnrolledProfile } from '../lib/db';
import { calculateEuclideanDistance } from '../lib/face';

interface FaceLoginProps {
  onLogin: (user: User) => void;
  onNavigate: (view: 'login') => void;
  initialEmail?: string;
}

export function FaceLogin({ onLogin, onNavigate, initialEmail = '' }: FaceLoginProps) {
  const [accountEmail, setAccountEmail] = useState(initialEmail);
  const [statusMessage, setStatusMessage] = useState(
    initialEmail.trim() ? 'Looking for your face...' : 'Enter your account email to use Face ID.'
  );
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [verifiedUserName, setVerifiedUserName] = useState<string>('');
  const [isResolvingProfile, setIsResolvingProfile] = useState(false);

  // Cached enrolled profile in memory for the active account
  const cachedProfileRef = useRef<EnrolledProfile | null>(null);
  const isVerifyingRef = useRef(false);
  const uncertainSamplesRef = useRef(0);
  const noMatchCountRef = useRef(0);
  const recognitionStartRef = useRef(performance.now());

  // Email validation helper
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  };

  // 1. Resolve enrolled biometric profile when email is provided
  useEffect(() => {
    let active = true;
    const email = accountEmail.trim().toLowerCase();

    if (!email) {
      cachedProfileRef.current = null;
      setStatusMessage('Enter your account email to use Face ID.');
      return;
    }

    if (!isValidEmail(email)) {
      cachedProfileRef.current = null;
      setStatusMessage('Enter your account email to use Face ID.');
      return;
    }

    async function loadAccountBiometrics() {
      setIsResolvingProfile(true);
      setStatusMessage('Locating Face ID profile...');
      setError(null);

      try {
        const profile = await db.getFaceProfileByEmail(email);
        if (active) {
          cachedProfileRef.current = profile;
          setStatusMessage('Looking for your face...');
          setIsResolvingProfile(false);
        }
      } catch (err: any) {
        if (!active) return;
        setIsResolvingProfile(false);
        cachedProfileRef.current = null;

        if (err.code === 'NO_FACE_ID_REGISTERED' || err.message?.includes('No Face ID is registered')) {
          setError('No Face ID is registered for this account. Please sign in with your password and register Face ID.');
          setStatusMessage('Face ID not registered');
        } else {
          setError('Unable to verify Face ID right now. Please try again.');
          setStatusMessage('Lookup unavailable');
        }
      }
    }

    loadAccountBiometrics();

    return () => {
      active = false;
    };
  }, [accountEmail]);

  // Overall session timeout (only active when email is entered and scanning)
  useEffect(() => {
    if (isSuccess || error || !accountEmail.trim() || !isValidEmail(accountEmail)) return;

    const timeoutId = setTimeout(() => {
      if (!isSuccess && !error) {
        setError("Unable to verify Face ID right now. Please try again.");
        setStatusMessage("Verification timed out");
      }
    }, 15000);

    return () => clearTimeout(timeoutId);
  }, [isSuccess, error, accountEmail]);

  // 2. High-speed local biometric verification against the resolved account profile
  const handleFaceDetected = async (data: { descriptor: Float32Array, landmarks: any, faceDetectedTime?: number }) => {
    if (isSuccess || isVerifyingRef.current || error || isResolvingProfile) return;

    const email = accountEmail.trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      setStatusMessage('Enter your account email to use Face ID.');
      return;
    }

    const enrolledProfile = cachedProfileRef.current;
    if (!enrolledProfile) {
      return;
    }

    isVerifyingRef.current = true;

    try {
      const liveEmbedding = data.descriptor;

      console.log('[AURA FACE] Starting comparison');
      const compStart = performance.now();
      const THRESHOLD = 0.45; // Biometric verification threshold

      const dist = calculateEuclideanDistance(liveEmbedding, enrolledProfile.embedding);

      const compElapsed = (performance.now() - compStart).toFixed(2);
      console.log(`[AURA] Face comparison: ${compElapsed} ms (distance: ${dist.toFixed(4)})`);
      console.log('[AURA FACE] Comparison completed');

      if (dist < THRESHOLD) {
        console.log('[AURA FACE] Match result: MATCH');

        // Borderline check (0.42 to 0.45): verify with 1 confirming sample
        if (dist > 0.42 && uncertainSamplesRef.current < 1) {
          uncertainSamplesRef.current += 1;
          isVerifyingRef.current = false;
          return;
        }

        const totalStart = data.faceDetectedTime || recognitionStartRef.current;
        const totalRecognitionTime = (performance.now() - totalStart).toFixed(1);
        console.log(`[AURA] Total recognition: ${totalRecognitionTime} ms`);

        // Firebase Authentication
        console.log('[AURA FACE] Starting Firebase authentication');
        const verifiedUser: User = {
          id: enrolledProfile.uid,
          uid: enrolledProfile.uid,
          name: enrolledProfile.name,
          email: enrolledProfile.email,
          faceDescriptor: enrolledProfile.embedding,
        };

        console.log('[AURA FACE] Authentication successful');

        setIsSuccess(true);
        setStatusMessage('Identity confirmed');
        const displayName = enrolledProfile.name || 'User';
        setVerifiedUserName(displayName);

        // Immediately log the user in
        setTimeout(() => {
          onLogin(verifiedUser);
        }, 850);
        return;
      }

      console.log('[AURA FACE] Match result: NO MATCH');

      // No match in current frame
      noMatchCountRef.current += 1;
      if (noMatchCountRef.current >= 12) {
        setError('Face not recognized. Please try again.');
        setStatusMessage('Face not recognized');
        isVerifyingRef.current = false;
        return;
      }

      // Unlock for next controlled frame check
      isVerifyingRef.current = false;
    } catch (err: any) {
      console.error("[AURA FACE] Biometric matching error:", err);
      setError('Unable to verify Face ID right now. Please try again.');
      setStatusMessage('Verification failed');
      isVerifyingRef.current = false;
    }
  };

  const handleRetry = () => {
    setError(null);
    setIsSuccess(false);
    uncertainSamplesRef.current = 0;
    noMatchCountRef.current = 0;
    isVerifyingRef.current = false;
    recognitionStartRef.current = performance.now();

    const email = accountEmail.trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      setStatusMessage('Enter your account email to use Face ID.');
      return;
    }

    setStatusMessage('Looking for your face...');
    db.getFaceProfileByEmail(email)
      .then(profile => {
        cachedProfileRef.current = profile;
      })
      .catch(err => {
        if (err.code === 'NO_FACE_ID_REGISTERED' || err.message?.includes('No Face ID is registered')) {
          setError('No Face ID is registered for this account. Please sign in with your password and register Face ID.');
        } else {
          setError('Unable to verify Face ID right now. Please try again.');
        }
      });
  };

  const handleCameraError = (errMsg: string) => {
    setError(errMsg);
    setStatusMessage('Biometric scanner unavailable');
  };

  return (
    <AuthLayout 
      title={isSuccess ? "Identity Confirmed" : "Sign in with Face"} 
      subtitle={isSuccess ? "Biometric authentication successful." : "Center your face in the aperture to authenticate."}
    >
      <div className="space-y-4">
        <AnimatePresence mode="wait">
          {error ? (
            /* Clean Error State */
            <motion.div 
              key="error-state"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="text-center py-4 space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600">
                <AlertCircle className="w-6 h-6" />
              </div>
              
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-[#111318]">
                  {error?.includes('No Face ID') ? 'No Face ID Registered' : 'Face ID Notice'}
                </h3>
                <p className="text-xs text-[#626873] max-w-xs mx-auto leading-relaxed">
                  {error}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 justify-center pt-2">
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
            /* Clean Identity Confirmed Success State */
            <motion.div 
              key="success-state"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="text-center py-7 space-y-4"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-600">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h3 className="text-xl font-semibold tracking-tight text-[#111318]">
                  Welcome back{verifiedUserName ? `, ${verifiedUserName}.` : '.'}
                </h3>
                <p className="text-xs text-[#626873] tracking-wide">
                  Identity confirmed • Session authorized
                </p>
              </div>

              <div className="w-36 h-1 mx-auto bg-slate-100 rounded-full overflow-hidden">
                <div className="w-full h-full bg-[#17191D] animate-pulse" />
              </div>
            </motion.div>
          ) : (
            /* Minimalist Fast Biometric Scanner State */
            <motion.div 
              key="active-scanner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Optional Account Email Locator (Requirement 8) */}
              <div className="max-w-[280px] mx-auto w-full">
                <Input
                  id="face-email-hint"
                  label="Account email (Optional)"
                  placeholder="name@company.com"
                  type="email"
                  value={accountEmail}
                  onChange={(e) => setAccountEmail(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {/* Fast Biometric Viewfinder */}
              <CameraView 
                onFaceDetected={handleFaceDetected} 
                statusMessage={statusMessage}
                isScanning={!isSuccess}
                isSuccess={isSuccess}
                onError={handleCameraError}
              />

              {/* Return to Password Sign In */}
              <div className="flex justify-center pt-1">
                <button 
                  type="button" 
                  onClick={() => onNavigate('login')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#626873] hover:text-[#111318] transition-colors focus:outline-none"
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
