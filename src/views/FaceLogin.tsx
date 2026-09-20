import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, ArrowLeft, RefreshCw, Lock, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AuthLayout } from '../components/AuthLayout';
import { CameraView } from '../components/CameraView';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { User } from '../types';
import { captureVideoFrameBase64 } from '../lib/face';

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
  const [isVerifying, setIsVerifying] = useState(false);

  const isVerifyingRef = useRef(false);
  const recognitionStartRef = useRef(performance.now());

  // Email validation helper
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  };

  // Sync status message with email input state
  useEffect(() => {
    const email = accountEmail.trim();
    if (!email) {
      setStatusMessage('Enter your account email to use Face ID.');
    } else if (!isValidEmail(email)) {
      setStatusMessage('Enter your account email to use Face ID.');
    } else if (!error && !isSuccess && !isVerifying) {
      setStatusMessage('Looking for your face...');
    }
  }, [accountEmail, error, isSuccess, isVerifying]);

  // Handle single frame detection and server-side verification
  const handleFaceDetected = async (data: { 
    descriptor: Float32Array; 
    landmarks: any; 
    videoElement?: HTMLVideoElement;
    faceDetectedTime?: number;
  }) => {
    if (isSuccess || isVerifyingRef.current || error) return;

    const email = accountEmail.trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      setStatusMessage('Enter your account email to use Face ID.');
      return;
    }

    isVerifyingRef.current = true;
    setIsVerifying(true);
    setStatusMessage('Verifying Face ID...');

    try {
      console.log('[AURA FACE] Face detected. Capturing frame and verifying server-side...');
      const compStart = performance.now();

      // Capture ONE current frame as base64 JPEG
      let currentFrameImage = '';
      if (data.videoElement) {
        try {
          currentFrameImage = captureVideoFrameBase64(data.videoElement);
        } catch (captureErr) {
          console.warn('[AURA FACE] Video frame capture notice:', captureErr);
        }
      }

      // Send to the secure server-side recognition process
      const res = await fetch('/api/auth/face-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          descriptor: Array.from(data.descriptor),
          image: currentFrameImage || undefined,
        }),
      });

      const result = await res.json();
      const compElapsed = (performance.now() - compStart).toFixed(2);
      console.log(`[AURA FACE] Server verification: ${compElapsed} ms, status: ${res.status}`);

      if (res.ok && result.success) {
        console.log('[AURA FACE] Match confirmed! Logging in immediately.');
        setIsSuccess(true);
        setStatusMessage('Identity confirmed');
        const displayName = result.name || 'User';
        setVerifiedUserName(displayName);

        const verifiedUser: User = {
          id: result.uid,
          uid: result.uid,
          name: result.name || 'User',
          email: result.email || email,
          faceDescriptor: Array.from(data.descriptor),
        };

        // Complete login immediately
        setTimeout(() => {
          onLogin(verifiedUser);
        }, 800);
        return;
      }

      // Recognition failed - do NOT stay stuck at "Face Detected"
      console.warn('[AURA FACE] Verification rejected by server:', result.error);
      const errorMessage = result.error || 'Face not recognized. Please try again.';
      setError(errorMessage);
      setStatusMessage(res.status === 404 ? 'Face ID not registered' : 'Face not recognized');
      isVerifyingRef.current = false;
      setIsVerifying(false);
    } catch (err: any) {
      console.error('[AURA FACE] Network/server verification error:', err);
      setError('Unable to verify Face ID right now. Please try again.');
      setStatusMessage('Verification failed');
      isVerifyingRef.current = false;
      setIsVerifying(false);
    }
  };

  const handleRetry = () => {
    setError(null);
    setIsSuccess(false);
    setIsVerifying(false);
    isVerifyingRef.current = false;
    recognitionStartRef.current = performance.now();

    const email = accountEmail.trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      setStatusMessage('Enter your account email to use Face ID.');
    } else {
      setStatusMessage('Looking for your face...');
    }
  };

  const handleCameraError = (errMsg: string) => {
    setError(errMsg);
    setStatusMessage('Biometric scanner unavailable');
    isVerifyingRef.current = false;
    setIsVerifying(false);
  };

  return (
    <AuthLayout 
      title={isSuccess ? "Identity Confirmed" : "Sign in with Face"} 
      subtitle={isSuccess ? "Biometric authentication successful." : "Center your face in the aperture to authenticate."}
    >
      <div className="space-y-4">
        <AnimatePresence mode="wait">
          {error ? (
            /* Clean Error State with prominent Retry button */
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
                  {error.includes('No Face ID') ? 'No Face ID Registered' : 'Face Not Recognized'}
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
              {/* Account Email (Required for Face ID resolution) */}
              <div className="max-w-[280px] mx-auto w-full">
                <Input
                  id="face-email-hint"
                  label="Account email (Optional)"
                  placeholder="name@company.com"
                  type="email"
                  value={accountEmail}
                  onChange={(e) => {
                    setAccountEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  className="h-9 text-xs"
                />
              </div>

              {/* Fast Biometric Viewfinder */}
              <CameraView 
                onFaceDetected={handleFaceDetected} 
                statusMessage={statusMessage}
                isScanning={!isSuccess && !error && !isVerifying}
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
