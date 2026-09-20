import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  RefreshCw, 
  AlertCircle, 
  Check, 
  Lock,
  Scan
} from 'lucide-react';
import { 
  detectEnrollmentFrame, 
  EnrollmentDetectionResult, 
  createFaceTemplate,
  captureVideoFrameBlob
} from '../lib/face';

export interface FaceIDEnrollmentProps {
  onComplete: (template: number[], sampleCount: number, sampleBlobs?: Blob[]) => Promise<void> | void;
  onSuccess?: () => void;
  onCancel: () => void;
  userName?: string;
}

type EnrollmentStep = 
  | 'positioning' 
  | 'capturing'
  | 'saving'
  | 'completing';

const TOTAL_TICKS = 48;
const REQUIRED_SAMPLES = 4;

export function FaceIDEnrollment({ onComplete, onSuccess, onCancel, userName }: FaceIDEnrollmentProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<EnrollmentStep>('positioning');
  const [sampleIndex, setSampleIndex] = useState(0); // 0 to 4
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>('Position your face inside the frame');
  const [isFaceCentered, setIsFaceCentered] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Stored descriptors and image Blobs collected across natural samples
  const capturedDescriptorsRef = useRef<Float32Array[]>([]);
  const capturedBlobsRef = useRef<Blob[]>([]);
  const currentStepRef = useRef<EnrollmentStep>(currentStep);
  currentStepRef.current = currentStep;
  const isCapturingSampleRef = useRef(false);
  const lastSampleTimeRef = useRef(0);

  // Setup camera stream
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraReady(false);

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 640 },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera access was denied. Please allow camera permissions in your browser to proceed with Face ID setup.');
      } else {
        setCameraError('Unable to connect to camera. Please make sure your camera is connected and not in use by another app.');
      }
    }
  }, []);

  useEffect(() => {
    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [startCamera]);

  // Execute biometric save: Combine samples -> template -> upload to Storage & Firestore
  const executeBiometricSave = useCallback(async () => {
    const samples = capturedDescriptorsRef.current;
    const blobs = capturedBlobsRef.current;
    
    if (!samples || samples.length === 0) {
      setSaveError("Please try again.");
      return;
    }

    try {
      setCurrentStep('saving');
      setIsSaving(true);
      setFeedbackMessage('Encrypting face profile & uploading samples...');

      // Combine valid sample descriptors into a stable, normalized face template
      const template = createFaceTemplate(samples);
      const embedding = Array.from(template);

      if (!embedding.length || embedding.length !== 128) {
        throw new Error("Face embedding generation failed.");
      }

      // Add a safety timeout on the overall save execution: 25 seconds
      const saveExecutionPromise = onComplete(embedding, samples.length, blobs);
      const overallTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          const timeoutErr: any = new Error("Upload timed out.");
          timeoutErr.code = 'storage/timeout';
          timeoutErr.name = 'TimeoutError';
          reject(timeoutErr);
        }, 25000);
      });

      await Promise.race([saveExecutionPromise, overallTimeoutPromise]);

      // Successfully saved to Firebase!
      setCurrentStep('completing');
      setSampleIndex(REQUIRED_SAMPLES);
      setSaveError(null);
      setFeedbackMessage('Biometric enrollment complete');

      // Allow user to see confirmation before continuing
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        }
      }, 1400);
    } catch (err: any) {
      console.error("[AURA STORAGE ERROR]", {
        code: err?.code || 'storage/unknown-error',
        message: err?.message || 'Biometric upload failed',
        name: err?.name || 'Error'
      });
      setIsSaving(false);
      let failedSampleInfo = "";
      if (err?.sampleIndex) {
        failedSampleInfo = `Sample ${err.sampleIndex} upload failed.`;
      } else if (err?.message && (err.message.includes('Sample') || err.message.includes('sample'))) {
        failedSampleInfo = err.message;
      }
      setSaveError(failedSampleInfo);
    }
  }, [onComplete, onSuccess]);

  // Main natural enrollment detection loop (No head movement required)
  useEffect(() => {
    if (!cameraReady || cameraError || saveError) return;

    let animId: number;
    let isMounted = true;
    let steadyCounter = 0;

    async function processFrame() {
      if (!isMounted || !videoRef.current) return;
      if (currentStepRef.current === 'saving' || currentStepRef.current === 'completing') return;

      try {
        const result: EnrollmentDetectionResult = await detectEnrollmentFrame(videoRef.current);

        if (!isMounted) return;

        if (result.status === 'no_face') {
          setIsFaceCentered(false);
          steadyCounter = 0;
          if (capturedDescriptorsRef.current.length === 0) {
            setFeedbackMessage('Position your face inside the frame');
          } else {
            setFeedbackMessage('Face not centered. Look at the camera.');
          }
        } else if (result.status === 'multiple_faces') {
          setIsFaceCentered(false);
          steadyCounter = 0;
          setFeedbackMessage('Only one face should be visible');
        } else if (result.status === 'single_face') {
          const { box, descriptor } = result;

          const vWidth = videoRef.current.videoWidth || 640;
          const boxRatio = box.width / vWidth;

          if (boxRatio < 0.22) {
            setIsFaceCentered(false);
            steadyCounter = 0;
            setFeedbackMessage('Move slightly closer to the camera');
          } else {
            setIsFaceCentered(true);
            steadyCounter++;

            // Wait for 4 steady frames before capturing first sample
            if (steadyCounter >= 4 && !isCapturingSampleRef.current) {
              const now = performance.now();
              const timeSinceLast = now - lastSampleTimeRef.current;
              const count = capturedDescriptorsRef.current.length;

              // Space captures ~350ms apart for natural variations
              if (count < REQUIRED_SAMPLES && (count === 0 || timeSinceLast >= 350)) {
                isCapturingSampleRef.current = true;
                lastSampleTimeRef.current = now;

                try {
                  // 1. Capture high-quality JPEG blob for Firebase Storage
                  const blob = await captureVideoFrameBlob(videoRef.current);
                  capturedBlobsRef.current.push(blob);
                  capturedDescriptorsRef.current.push(descriptor);

                  const nextCount = capturedDescriptorsRef.current.length;
                  setSampleIndex(nextCount);
                  setCurrentStep('capturing');

                  const messages = [
                    'Sample 1 of 4: Biometric aperture locked',
                    'Sample 2 of 4: Analyzing facial structure',
                    'Sample 3 of 4: Validating geometry',
                    'Sample 4 of 4: Finalizing Face ID profile'
                  ];
                  setFeedbackMessage(messages[nextCount - 1] || 'Capturing biometric samples...');

                  if (nextCount >= REQUIRED_SAMPLES) {
                    // All 4 samples captured naturally! Proceed to save
                    isMounted = false;
                    executeBiometricSave();
                    return;
                  }
                } catch (captureErr) {
                  console.warn('Sample capture notice:', captureErr);
                } finally {
                  isCapturingSampleRef.current = false;
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Enrollment detection error:', err);
      }

      if (isMounted) {
        animId = requestAnimationFrame(processFrame);
      }
    }

    animId = requestAnimationFrame(processFrame);

    return () => {
      isMounted = false;
      if (animId) cancelAnimationFrame(animId);
    };
  }, [cameraReady, cameraError, saveError, executeBiometricSave]);

  const resetEnrollment = () => {
    capturedDescriptorsRef.current = [];
    capturedBlobsRef.current = [];
    isCapturingSampleRef.current = false;
    lastSampleTimeRef.current = 0;
    setSaveError(null);
    setIsSaving(false);
    setSampleIndex(0);
    setFeedbackMessage('Position your face inside the frame');
    setCurrentStep('positioning');
    startCamera();
  };

  // Progress computation based on captured samples (0 -> 25% -> 50% -> 75% -> 100%)
  const progressPercent = currentStep === 'completing' 
    ? 100 
    : Math.min(100, Math.round((sampleIndex / REQUIRED_SAMPLES) * 100));
  const activeTicksCount = Math.min(TOTAL_TICKS, Math.round((progressPercent / 100) * TOTAL_TICKS));

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col justify-between py-6 px-4 sm:px-6 lg:px-8 font-sans text-slate-900 select-none">
      {/* Top Bar / Header */}
      <div className="w-full max-w-lg mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-slate-900 rounded-lg flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-xs tracking-tighter">A</span>
          </div>
          <span className="text-xs font-semibold tracking-wider text-slate-800 uppercase">
            Aura Identity
          </span>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors px-2.5 py-1 rounded-md hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>

      {/* Main Center Enrollment Content */}
      <div className="w-full max-w-md mx-auto my-auto flex flex-col items-center text-center">
        {/* Error State with clear Retry button */}
        {saveError ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full bg-white border border-slate-200 rounded-3xl p-8 shadow-sm text-center space-y-5"
          >
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center mx-auto text-amber-600">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-slate-900">Couldn't secure your Face ID.</h3>
              {saveError && (
                <p className="text-sm text-slate-600 leading-relaxed max-w-xs mx-auto">
                  {saveError}
                </p>
              )}
              <p className="text-xs text-slate-500 font-medium">Please try again.</p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={resetEnrollment}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Back to Sign In
              </button>
            </div>
          </motion.div>
        ) : cameraError ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full bg-white border border-slate-200 rounded-3xl p-8 shadow-sm text-center space-y-5"
          >
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center mx-auto text-amber-600">
              <Camera className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-slate-900">Camera Access Required</h3>
              <p className="text-sm text-slate-600 leading-relaxed max-w-xs mx-auto">
                {cameraError}
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={startCamera}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Camera
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Back to Sign In
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col items-center w-full">
            {/* Step & Instructions Header */}
            <div className="h-20 flex flex-col items-center justify-center mb-6">
              <AnimatePresence mode="wait">
                {currentStep === 'completing' ? (
                  <motion.div
                    key="complete-header"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="space-y-1.5"
                  >
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                      Face ID setup complete
                    </h2>
                    <p className="text-sm text-slate-500 font-medium">
                      Your AURA face profile has been securely registered.
                    </p>
                  </motion.div>
                ) : currentStep === 'saving' ? (
                  <motion.div
                    key="saving-header"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="space-y-1.5"
                  >
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200/60">
                      <Lock className="w-3 h-3 text-slate-500" />
                      Biometric Encryption
                    </span>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                      Securing Face Profile...
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">
                      Uploading samples to Firebase Storage & syncing metadata
                    </p>
                  </motion.div>
                ) : currentStep === 'capturing' ? (
                  <motion.div
                    key="capturing-header"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="space-y-1.5"
                  >
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase bg-slate-900 text-white">
                        Sample {sampleIndex} of {REQUIRED_SAMPLES}
                      </span>
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                      Hold still for natural capture
                    </h2>
                    <p className="text-xs text-slate-500 font-medium max-w-xs mx-auto">
                      Look naturally at the camera — no head movement required.
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="positioning-header"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="space-y-1.5"
                  >
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200/60">
                      <Scan className="w-3 h-3 text-slate-500" />
                      Biometric Setup
                    </span>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                      Position your face inside the frame
                    </h2>
                    <p className="text-xs text-slate-500 font-medium max-w-xs mx-auto">
                      Ensure good lighting and look straight ahead.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* The Central Circular Face ID Scanner with Radial Ticks */}
            <div className="relative flex items-center justify-center my-3">
              {/* Outer SVG Segmented Ticks Ring */}
              <div className="relative w-[300px] h-[300px] sm:w-[340px] sm:h-[340px] flex items-center justify-center">
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 340 340"
                >
                  {/* Radial Ticks */}
                  {Array.from({ length: TOTAL_TICKS }).map((_, i) => {
                    const angle = (i * 360) / TOTAL_TICKS - 90;
                    const rad = (angle * Math.PI) / 180;
                    const cx = 170;
                    const cy = 170;
                    const rOuter = 162;
                    const rInner = 148;
                    const x1 = cx + rInner * Math.cos(rad);
                    const y1 = cy + rInner * Math.sin(rad);
                    const x2 = cx + rOuter * Math.cos(rad);
                    const y2 = cy + rOuter * Math.sin(rad);
                    const isActive = i < activeTicksCount;

                    return (
                      <line
                        key={i}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={
                          currentStep === 'completing'
                            ? '#0F172A'
                            : isActive
                            ? '#0F172A'
                            : '#E2E8F0'
                        }
                        strokeWidth={isActive ? 3 : 2}
                        strokeLinecap="round"
                        style={{
                          transition: 'stroke 0.25s ease, stroke-width 0.25s ease',
                        }}
                      />
                    );
                  })}

                  {/* Inner continuous track */}
                  <circle
                    cx="170"
                    cy="170"
                    r="142"
                    fill="none"
                    stroke="#F1F5F9"
                    strokeWidth="1.5"
                  />
                </svg>

                {/* The Circular Camera Viewport */}
                <div className="relative w-[240px] h-[240px] sm:w-[270px] sm:h-[270px] rounded-full overflow-hidden bg-slate-900 shadow-[0_8px_32px_rgba(0,0,0,0.08)] border-4 border-white">
                  {/* Live Video Feed */}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    onPlay={() => setCameraReady(true)}
                    className={`w-full h-full object-cover transform -scale-x-100 transition-opacity duration-500 ${
                      cameraReady ? 'opacity-100' : 'opacity-0'
                    }`}
                  />

                  {/* Camera Initializing Overlay */}
                  {!cameraReady && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-900">
                      <RefreshCw className="w-8 h-8 animate-spin mb-2 text-slate-500" />
                      <span className="text-xs font-medium">Starting camera...</span>
                    </div>
                  )}

                  {/* Positioning Face Outline Guide */}
                  {cameraReady && currentStep !== 'completing' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div 
                        className={`w-40 h-52 sm:w-44 sm:h-56 rounded-[48px] border-2 border-dashed transition-all duration-300 ${
                          isFaceCentered 
                            ? 'border-emerald-400/90 scale-100' 
                            : 'border-white/40 scale-95'
                        }`} 
                      />
                    </div>
                  )}

                  {/* Success Overlay with Checkmark */}
                  {currentStep === 'completing' && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center"
                    >
                      <div className="w-20 h-20 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-lg border-2 border-white/20">
                        <Check className="w-10 h-10 stroke-[2.5]" />
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Status Feedback Pill */}
            <div className="mt-4 flex flex-col items-center gap-2">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-slate-200/80 shadow-xs text-xs font-medium text-slate-700">
                <span className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                  currentStep === 'completing' 
                    ? 'bg-emerald-500' 
                    : isFaceCentered 
                    ? 'bg-emerald-500' 
                    : 'bg-amber-400'
                }`} />
                <span>{feedbackMessage}</span>
              </div>

              {/* Sample Indicator Dots */}
              <div className="flex items-center gap-1.5 mt-1">
                {Array.from({ length: REQUIRED_SAMPLES }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      i < sampleIndex
                        ? 'bg-slate-900 scale-110'
                        : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer / Enclave Badge */}
      <div className="w-full max-w-lg mx-auto flex items-center justify-center pt-4">
        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
          <Lock className="w-3.5 h-3.5" />
          <span>Samples stored in Firebase Storage • Metadata in Firestore</span>
        </div>
      </div>
    </div>
  );
}
