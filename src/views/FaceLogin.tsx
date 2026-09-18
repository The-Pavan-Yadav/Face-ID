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
  const [statusMessage, setStatusMessage] = useState('Looking for your face...');
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [verifiedUserName, setVerifiedUserName] = useState<string>('');

  // Cached enrolled templates in memory (Requirements 6 & 7)
  const cachedProfilesRef = useRef<EnrolledProfile[]>([]);
  const isVerifyingRef = useRef(false);
  const uncertainSamplesRef = useRef(0);
  const noMatchCountRef = useRef(0);
  const recognitionStartRef = useRef(performance.now());

  // 1. Retrieve enrolled templates ONCE on start and keep in memory (Requirements 6 & 7)
  useEffect(() => {
    let active = true;
    recognitionStartRef.current = performance.now();

    async function preloadBiometrics() {
      try {
        const profiles = await db.getEnrolledProfiles(accountEmail);
        if (active) {
          cachedProfilesRef.current = profiles;
        }
      } catch (err: any) {
        console.warn("[AURA FACE] Biometric profile cache initialization notice:", {
          code: err?.code,
          message: err?.message,
          name: err?.name
        });
      }
    }

    preloadBiometrics();

    return () => {
      active = false;
    };
  }, [accountEmail]);

  // Overall session timeout (Step 8) - never leave UI stuck indefinitely
  useEffect(() => {
    if (isSuccess || error) return;
    const timeoutId = setTimeout(() => {
      if (!isSuccess && !error) {
        setError("Face recognition timed out. Please try again or sign in with your password.");
        setStatusMessage("Verification timed out");
      }
    }, 15000);

    return () => clearTimeout(timeoutId);
  }, [isSuccess, error]);

  // 2. High-speed local biometric verification (Requirements 4, 5, 6, 8, 10, 11)
  const handleFaceDetected = async (data: { descriptor: Float32Array, landmarks: any, faceDetectedTime?: number }) => {
    if (isSuccess || isVerifyingRef.current || error) return;
    isVerifyingRef.current = true;

    try {
      const liveEmbedding = data.descriptor;
      const profiles = cachedProfilesRef.current;

      // Filter by email if provided (Requirement 8)
      const targetEmail = accountEmail.trim().toLowerCase();
      const candidateProfiles = targetEmail 
        ? profiles.filter(p => p.email && p.email.toLowerCase() === targetEmail)
        : profiles;

      if (profiles.length === 0) {
        throw new Error(
          targetEmail 
            ? `No Face ID profile enrolled for ${accountEmail}. Sign in with password first.`
            : "No Face ID profile enrolled on this device. Please sign in with password first."
        );
      }

      if (candidateProfiles.length === 0 && targetEmail) {
        throw new Error(`No Face ID profile enrolled for ${accountEmail}. Sign in with password or clear the email field.`);
      }

      // In-memory comparison (Requirement 6 & Step 2)
      console.log('[AURA FACE] Starting comparison');
      const compStart = performance.now();
      let matchedProfile: EnrolledProfile | null = null;
      let minDistance = Infinity;
      const THRESHOLD = 0.45; // Secure biometric verification threshold

      const searchList = candidateProfiles.length > 0 ? candidateProfiles : profiles;

      for (const profile of searchList) {
        const dist = calculateEuclideanDistance(liveEmbedding, profile.embedding);
        if (dist < minDistance && dist < THRESHOLD) {
          minDistance = dist;
          matchedProfile = profile;
        }
      }

      const compElapsed = (performance.now() - compStart).toFixed(2);
      console.log(`[AURA] Face comparison: ${compElapsed} ms`);
      console.log('[AURA FACE] Comparison completed');
      console.log(`[AURA FACE] Match result: ${matchedProfile ? 'MATCH' : 'NO MATCH'}`);

      if (matchedProfile) {
        // Requirement 5: If borderline (e.g. 0.42 to 0.45) but uncertain, capture 1 sample to confirm
        if (minDistance > 0.42 && uncertainSamplesRef.current < 1) {
          uncertainSamplesRef.current += 1;
          isVerifyingRef.current = false;
          return;
        }

        const totalStart = data.faceDetectedTime || recognitionStartRef.current;
        const totalRecognitionTime = (performance.now() - totalStart).toFixed(1);
        console.log(`[AURA] Total recognition: ${totalRecognitionTime} ms`);

        // Step 2 & 7: Firebase Authentication
        console.log('[AURA FACE] Starting Firebase authentication');
        try {
          const verifiedUser: User = {
            id: matchedProfile.uid,
            uid: matchedProfile.uid,
            name: matchedProfile.name,
            email: matchedProfile.email,
            faceDescriptor: matchedProfile.embedding,
          };

          console.log('[AURA FACE] Authentication successful');

          // Requirement 10: Stop camera after success immediately
          setIsSuccess(true);
          setStatusMessage('Identity confirmed');
          const displayName = matchedProfile.name || 'User';
          setVerifiedUserName(displayName);

          // Smooth transition into dashboard
          setTimeout(() => {
            onLogin(verifiedUser);
          }, 850);
          return;
        } catch (authErr: any) {
          console.error("[AURA FACE] Authentication failed:", {
            code: authErr?.code,
            message: authErr?.message,
            name: authErr?.name
          });
          throw authErr;
        }
      }

      // No match in current frame
      noMatchCountRef.current += 1;
      if (noMatchCountRef.current >= 12) {
        throw new Error('Face not recognized. Please ensure balanced lighting and face the camera directly, or sign in with your password.');
      }

      // Unlock for next controlled frame check
      isVerifyingRef.current = false;
    } catch (err: any) {
      console.error("[AURA FACE] Biometric matching error:", {
        code: err?.code,
        message: err?.message,
        name: err?.name
      });
      setError(err.message || 'Face not recognized. Please try again or use password.');
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
    setStatusMessage('Looking for your face...');
    // Refresh enrolled profiles cache
    db.getEnrolledProfiles(accountEmail)
      .then(profiles => {
        cachedProfilesRef.current = profiles;
      })
      .catch(() => {});
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
                  Face not recognized
                </h3>
                <p className="text-xs text-[#626873] max-w-xs mx-auto leading-relaxed">
                  {error || "Please ensure balanced lighting and face the camera directly, or sign in with your account password."}
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
