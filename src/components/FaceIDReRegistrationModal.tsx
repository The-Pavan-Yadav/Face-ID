import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Camera,
  Info
} from 'lucide-react';
import { Button } from './ui/Button';
import { db, ReRegistrationStatus } from '../lib/db';
import { detectQualityFaceAndEmbedding, loadFaceModels } from '../lib/face';

interface FaceIDReRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  initialEligibility: ReRegistrationStatus;
  onSuccess: (updatedEligibility: ReRegistrationStatus, newEmbedding: number[]) => void;
}

export function FaceIDReRegistrationModal({
  isOpen,
  onClose,
  uid,
  initialEligibility,
  onSuccess,
}: FaceIDReRegistrationModalProps) {
  const [eligibility, setEligibility] = useState<ReRegistrationStatus>(initialEligibility);
  const [statusStep, setStatusStep] = useState<'checking' | 'blocked' | 'capturing' | 'processing' | 'success' | 'error'>('checking');
  const [statusMessage, setStatusMessage] = useState<string>('Verifying 30-day security policy...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasDetectedFace, setHasDetectedFace] = useState(false);
  const [candidateEmbedding, setCandidateEmbedding] = useState<Float32Array | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isAnalyzingRef = useRef(false);
  const isComponentActiveRef = useRef(true);

  // Stop camera tracks helper
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // 1. On open, verify 30-day restriction directly from Firestore
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setStatusStep('checking');
      setHasDetectedFace(false);
      setCandidateEmbedding(null);
      setErrorMessage(null);
      return;
    }

    isComponentActiveRef.current = true;

    async function verifyAndStart() {
      setStatusStep('checking');
      setStatusMessage('Verifying 30-day security policy...');

      try {
        const liveStatus = await db.checkReRegistrationEligibility(uid);
        if (!isComponentActiveRef.current) return;

        setEligibility(liveStatus);

        // RULE: If fewer than 30 days have passed: DO NOT open the camera or start enrollment.
        if (!liveStatus.canReRegister) {
          setStatusStep('blocked');
          return;
        }

        // 30 days or more have passed: Allow Face ID re-registration and open camera
        setStatusStep('capturing');
        setStatusMessage('Starting biometric sensor...');
        await startCamera();
      } catch (err) {
        console.warn("[AURA] Eligibility check notice:", err);
        if (!isComponentActiveRef.current) return;
        setStatusStep('blocked');
      }
    }

    verifyAndStart();

    return () => {
      isComponentActiveRef.current = false;
      stopCamera();
    };
  }, [isOpen, uid]);

  // 2. Camera setup for capturing new face
  const startCamera = async () => {
    try {
      loadFaceModels().catch(() => {});

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      if (!isComponentActiveRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setStatusMessage('Looking for your face...');
    } catch (err) {
      console.warn("[AURA] Camera access error:", err);
      setErrorMessage('Camera access was denied or is unavailable. Please grant camera permissions.');
      setStatusStep('error');
    }
  };

  // 3. Face detection loop during capturing step
  useEffect(() => {
    if (statusStep !== 'capturing') return;

    let animId: number;
    let lastTime = 0;
    const INTERVAL = 160;

    async function loop(time: number) {
      if (statusStep !== 'capturing' || !videoRef.current) return;

      if (!isAnalyzingRef.current && time - lastTime >= INTERVAL) {
        if (videoRef.current.readyState >= 2) {
          isAnalyzingRef.current = true;
          lastTime = time;

          try {
            const result = await detectQualityFaceAndEmbedding(videoRef.current);
            if (result.status === 'high_quality' && result.descriptor) {
              setHasDetectedFace(true);
              setCandidateEmbedding(result.descriptor);
              setStatusMessage('Face detected • Hold steady to register');
            } else if (result.status === 'poor_quality') {
              setHasDetectedFace(false);
              setStatusMessage('Face detected • Center in frame and ensure clear lighting');
            } else {
              setHasDetectedFace(false);
              setStatusMessage('Center your face in the viewfinder...');
            }
          } catch {
            // Keep steady for next frame
          } finally {
            isAnalyzingRef.current = false;
          }
        }
      }

      animId = requestAnimationFrame(loop);
    }

    animId = requestAnimationFrame(loop);

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [statusStep]);

  // 4. Submit new face embedding to Firestore transaction
  const handleCommitReRegistration = async () => {
    if (!candidateEmbedding || statusStep === 'processing') return;

    setStatusStep('processing');
    setStatusMessage('Generating & validating biometric embedding...');

    try {
      // Validate 128-D biometric descriptor
      const rawArray = Array.from(candidateEmbedding);
      if (rawArray.length !== 128 || rawArray.some((v) => typeof v !== 'number' || isNaN(v))) {
        throw new Error('Biometric validation failed: Invalid facial embedding.');
      }

      setStatusMessage('Updating Face ID in secure enclave...');

      // Replace existing embedding and update lastReRegisteredAt with serverTimestamp()
      const updatedStatus = await db.reRegisterFaceId(uid, rawArray);

      // Stop camera tracks immediately on success
      stopCamera();

      // Show success state
      setStatusStep('success');
      setStatusMessage('Your new Face ID is now active.');
      setEligibility(updatedStatus);

      // Notify parent after user sees confirmation
      setTimeout(() => {
        onSuccess(updatedStatus, rawArray);
        onClose();
      }, 1600);
    } catch (err: any) {
      console.warn("[AURA] Re-registration error:", err.message);

      if (err.message === 'FACE_ID_COOLDOWN_ACTIVE' || err.daysRemaining) {
        stopCamera();
        const days = err.daysRemaining || 30;
        setEligibility((prev) => ({
          ...prev,
          canReRegister: false,
          daysRemaining: days,
        }));
        setStatusStep('blocked');
      } else {
        setErrorMessage('Face ID could not be updated at this time. Please check your connection and try again.');
        setStatusStep('error');
      }
    }
  };

  const handleRetry = async () => {
    setErrorMessage(null);
    setStatusStep('capturing');
    setStatusMessage('Looking for your face...');
    setHasDetectedFace(false);
    setCandidateEmbedding(null);
    await startCamera();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111318]/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md rounded-2xl bg-white border border-[#E4E6EA] shadow-2xl p-6 sm:p-7 text-left overflow-hidden"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="absolute top-4 right-4 p-1.5 rounded-full text-[#8E95A2] hover:text-[#111318] hover:bg-slate-100 transition-colors focus:outline-none"
          aria-label="Close modal"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2.5 pb-4 border-b border-[#E4E6EA]">
          <div className="w-8 h-8 rounded-xl bg-slate-100 border border-[#E4E6EA] flex items-center justify-center text-[#111318]">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[#111318] tracking-tight">
              Re-register Face ID
            </h2>
            <p className="text-xs text-[#626873]">
              30-day security policy enforcement
            </p>
          </div>
        </div>

        {/* Dynamic Step Content */}
        <div className="py-4">
          <AnimatePresence mode="wait">
            {statusStep === 'checking' && (
              <motion.div
                key="step-checking"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-10 text-center space-y-3"
              >
                <div className="w-10 h-10 rounded-full border-2 border-[#17191D] border-t-transparent animate-spin mx-auto" />
                <p className="text-xs font-medium text-[#626873]">{statusMessage}</p>
              </motion.div>
            )}

            {statusStep === 'blocked' && (
              <motion.div
                key="step-blocked"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="py-4 space-y-5"
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600">
                  <Info className="w-6 h-6" />
                </div>

                <div className="text-center space-y-1.5">
                  <h3 className="text-base font-semibold text-[#111318]">
                    Face ID is already up to date
                  </h3>
                  <p className="text-xs text-[#626873] leading-relaxed max-w-xs mx-auto">
                    You can register a new Face ID again in{' '}
                    <span className="font-semibold text-[#111318]">
                      {eligibility.daysRemaining} {eligibility.daysRemaining === 1 ? 'day' : 'days'}
                    </span>.
                  </p>
                  <p className="text-xs font-medium text-[#111318] pt-1">
                    Available on {eligibility.formattedNextAvailable}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-[#E4E6EA] text-xs text-[#626873] space-y-1">
                  <div className="flex justify-between">
                    <span>Last updated:</span>
                    <span className="font-mono text-[#111318]">{eligibility.formattedLastUpdated}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Next re-registration:</span>
                    <span className="font-mono text-[#111318]">{eligibility.formattedNextAvailable}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      stopCamera();
                      onClose();
                    }}
                  >
                    Close
                  </Button>
                </div>
              </motion.div>
            )}

            {(statusStep === 'capturing' || statusStep === 'processing') && (
              <motion.div
                key="step-capturing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* Viewfinder Frame */}
                <div className="relative w-full max-w-[260px] aspect-[4/5] mx-auto rounded-[20px] p-[1px] bg-white border border-[#E4E6EA] shadow-sm overflow-hidden">
                  <div className="relative w-full h-full rounded-[19px] bg-slate-900 overflow-hidden">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover transform -scale-x-100"
                    />

                    {/* Scanning Line */}
                    <div className="absolute inset-x-4 h-[1.5px] bg-slate-300/70 animate-subtle-scan pointer-events-none z-20" />

                    {/* Apple-style Framing Geometry */}
                    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none p-5">
                      <div
                        className={`relative w-[170px] h-[215px] rounded-[30px] border transition-all duration-200 flex items-center justify-center ${
                          hasDetectedFace ? 'border-white scale-[1.02]' : 'border-white/40'
                        }`}
                      >
                        {/* Brackets */}
                        <div className="absolute -top-0.5 -left-0.5 w-3 h-3 border-t-2 border-l-2 border-white rounded-tl-sm" />
                        <div className="absolute -top-0.5 -right-0.5 w-3 h-3 border-t-2 border-r-2 border-white rounded-tr-sm" />
                        <div className="absolute -bottom-0.5 -left-0.5 w-3 h-3 border-b-2 border-l-2 border-white rounded-bl-sm" />
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 border-b-2 border-r-2 border-white rounded-br-sm" />

                        {hasDetectedFace && (
                          <span className="absolute -bottom-5 text-[9px] font-mono tracking-wider text-white uppercase px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs border border-white/20">
                            Face Aligned
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Sensor Badge */}
                    <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-xs border border-white/10 text-[9px] font-mono text-white/90">
                      <span className={`w-1.5 h-1.5 rounded-full ${hasDetectedFace ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                      <span>{hasDetectedFace ? 'ALIGNED' : 'SCANNING'}</span>
                    </div>
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-[#E4E6EA] text-xs font-medium text-[#111318]">
                    <span className={`w-1.5 h-1.5 rounded-full ${hasDetectedFace ? 'bg-emerald-600' : 'bg-[#17191D] animate-pulse'}`} />
                    <span>{statusMessage}</span>
                  </div>
                </div>

                {/* Controls */}
                <div className="pt-2 flex gap-2.5">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      stopCamera();
                      onClose();
                    }}
                    disabled={statusStep === 'processing'}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    className="flex-1"
                    onClick={handleCommitReRegistration}
                    disabled={!hasDetectedFace || statusStep === 'processing'}
                    isLoading={statusStep === 'processing'}
                    loadingText="Enrolling..."
                  >
                    Capture & Update
                  </Button>
                </div>
              </motion.div>
            )}

            {statusStep === 'success' && (
              <motion.div
                key="step-success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="py-8 text-center space-y-4"
              >
                <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-600">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-[#111318]">
                    Face ID updated successfully
                  </h3>
                  <p className="text-xs text-[#626873]">
                    Your new Face ID is now active.
                  </p>
                </div>

                <div className="w-32 h-1 mx-auto bg-slate-100 rounded-full overflow-hidden">
                  <div className="w-full h-full bg-[#17191D] animate-pulse" />
                </div>
              </motion.div>
            )}

            {statusStep === 'error' && (
              <motion.div
                key="step-error"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="py-6 text-center space-y-4"
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600">
                  <AlertCircle className="w-6 h-6" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-[#111318]">
                    Update Not Completed
                  </h3>
                  <p className="text-xs text-[#626873] leading-relaxed max-w-xs mx-auto">
                    {errorMessage || 'An error occurred during Face ID re-registration.'}
                  </p>
                </div>

                <div className="pt-2 flex gap-2 justify-center">
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleRetry}
                    className="flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Try Again</span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      stopCamera();
                      onClose();
                    }}
                  >
                    Close
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
