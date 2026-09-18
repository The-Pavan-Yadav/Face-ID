import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  Camera, 
  RefreshCw, 
  AlertCircle, 
  ArrowLeft, 
  ArrowRight, 
  ArrowUp, 
  ArrowDown, 
  Check, 
  Lock,
  Scan
} from 'lucide-react';
import { 
  detectEnrollmentFrame, 
  EnrollmentDetectionResult, 
  createFaceTemplate 
} from '../lib/face';

export interface FaceIDEnrollmentProps {
  onComplete: (template: number[], sampleCount: number) => Promise<void> | void;
  onSuccess?: () => void;
  onCancel: () => void;
  userName?: string;
}

type EnrollmentStep = 
  | 'positioning' 
  | 'step1_straight' 
  | 'step2_left' 
  | 'step3_right' 
  | 'step4_up' 
  | 'step5_down' 
  | 'saving'
  | 'completing';

const STEP_CONFIG = {
  step1_straight: {
    index: 1,
    title: 'Look straight ahead',
    subtitle: 'Keep your head level, centered, and steady.',
    icon: Scan,
    targetProgress: 20,
  },
  step2_left: {
    index: 2,
    title: 'Slowly turn your head to the left',
    subtitle: 'Rotate your head gently toward your left side.',
    icon: ArrowLeft,
    targetProgress: 40,
  },
  step3_right: {
    index: 3,
    title: 'Slowly turn your head to the right',
    subtitle: 'Rotate your head gently toward your right side.',
    icon: ArrowRight,
    targetProgress: 60,
  },
  step4_up: {
    index: 4,
    title: 'Look slightly up',
    subtitle: 'Tilt your chin slightly upwards toward the ceiling.',
    icon: ArrowUp,
    targetProgress: 80,
  },
  step5_down: {
    index: 5,
    title: 'Look slightly down',
    subtitle: 'Tilt your chin gently downward.',
    icon: ArrowDown,
    targetProgress: 100,
  },
};

const TOTAL_TICKS = 48;

export function FaceIDEnrollment({ onComplete, onSuccess, onCancel, userName }: FaceIDEnrollmentProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<EnrollmentStep>('positioning');
  const [overallProgress, setOverallProgress] = useState(0);
  const [stepProgress, setStepProgress] = useState(0); // 0 - 100 for current movement hold
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isFaceCentered, setIsFaceCentered] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Stored descriptors collected across poses for robust enrollment
  const capturedDescriptorsRef = useRef<Float32Array[]>([]);
  const currentStepRef = useRef<EnrollmentStep>(currentStep);
  currentStepRef.current = currentStep;

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

  // Main enrollment detection loop
  useEffect(() => {
    if (!cameraReady || cameraError || saveError) return;

    let animId: number;
    let isMounted = true;
    let consecutiveHold = 0;
    const REQUIRED_HOLD_FRAMES = 10; // ~250ms of sustained posture

    async function processFrame() {
      if (!isMounted || !videoRef.current) return;

      try {
        const result: EnrollmentDetectionResult = await detectEnrollmentFrame(videoRef.current);

        if (!isMounted) return;

        if (result.status === 'no_face') {
          setIsFaceCentered(false);
          setFeedbackMessage('Position your face inside the frame');
          consecutiveHold = 0;
          setStepProgress(0);
        } else if (result.status === 'multiple_faces') {
          setIsFaceCentered(false);
          setFeedbackMessage('Only one face should be visible.');
          consecutiveHold = 0;
          setStepProgress(0);
        } else if (result.status === 'single_face') {
          const { box, pose, descriptor } = result;

          // Check if face is well-sized and centered
          const vWidth = videoRef.current.videoWidth || 640;
          const boxRatio = box.width / vWidth;
          
          if (boxRatio < 0.22) {
            setFeedbackMessage('Move slightly closer to the camera');
            setIsFaceCentered(false);
            consecutiveHold = 0;
            setStepProgress(0);
          } else {
            setIsFaceCentered(true);
            const step = currentStepRef.current;

            if (step === 'positioning') {
              setFeedbackMessage('Preparing secure face profile...');
              consecutiveHold++;
              const prog = Math.min((consecutiveHold / 6) * 100, 100);
              setStepProgress(prog);

              if (consecutiveHold >= 6) {
                // Initialize enrollment at step 1
                setCurrentStep('step1_straight');
                setOverallProgress(20);
                consecutiveHold = 0;
                setStepProgress(0);
                setFeedbackMessage(null);
              }
            } else if (step === 'step1_straight') {
              // Movement: straight ahead
              if (pose.isStraight) {
                consecutiveHold++;
                const holdPct = Math.min((consecutiveHold / REQUIRED_HOLD_FRAMES) * 100, 100);
                setStepProgress(holdPct);
                setFeedbackMessage('Hold still...');

                if (consecutiveHold >= REQUIRED_HOLD_FRAMES) {
                  capturedDescriptorsRef.current.push(descriptor);
                  console.log(`Face samples collected: ${capturedDescriptorsRef.current.length}`);
                  setCurrentStep('step2_left');
                  setOverallProgress(40);
                  consecutiveHold = 0;
                  setStepProgress(0);
                  setFeedbackMessage(null);
                }
              } else {
                consecutiveHold = Math.max(0, consecutiveHold - 1);
                setStepProgress((consecutiveHold / REQUIRED_HOLD_FRAMES) * 100);
                setFeedbackMessage('Look directly at the camera');
              }
            } else if (step === 'step2_left') {
              // Movement: turn left
              if (pose.isTurnLeft || pose.yawRatio > 0.57) {
                consecutiveHold++;
                const holdPct = Math.min((consecutiveHold / REQUIRED_HOLD_FRAMES) * 100, 100);
                setStepProgress(holdPct);
                setFeedbackMessage('Left turn detected, hold steady...');

                if (consecutiveHold >= REQUIRED_HOLD_FRAMES) {
                  capturedDescriptorsRef.current.push(descriptor);
                  console.log(`Face samples collected: ${capturedDescriptorsRef.current.length}`);
                  setCurrentStep('step3_right');
                  setOverallProgress(60);
                  consecutiveHold = 0;
                  setStepProgress(0);
                  setFeedbackMessage(null);
                }
              } else {
                consecutiveHold = Math.max(0, consecutiveHold - 1);
                setStepProgress((consecutiveHold / REQUIRED_HOLD_FRAMES) * 100);
                setFeedbackMessage('Slowly turn your head to the left');
              }
            } else if (step === 'step3_right') {
              // Movement: turn right
              if (pose.isTurnRight || pose.yawRatio < 0.43) {
                consecutiveHold++;
                const holdPct = Math.min((consecutiveHold / REQUIRED_HOLD_FRAMES) * 100, 100);
                setStepProgress(holdPct);
                setFeedbackMessage('Right turn detected, hold steady...');

                if (consecutiveHold >= REQUIRED_HOLD_FRAMES) {
                  capturedDescriptorsRef.current.push(descriptor);
                  console.log(`Face samples collected: ${capturedDescriptorsRef.current.length}`);
                  setCurrentStep('step4_up');
                  setOverallProgress(80);
                  consecutiveHold = 0;
                  setStepProgress(0);
                  setFeedbackMessage(null);
                }
              } else {
                consecutiveHold = Math.max(0, consecutiveHold - 1);
                setStepProgress((consecutiveHold / REQUIRED_HOLD_FRAMES) * 100);
                setFeedbackMessage('Slowly turn your head to the right');
              }
            } else if (step === 'step4_up') {
              // Movement: look up
              if (pose.isLookUp || pose.pitchRatio < 0.74) {
                consecutiveHold++;
                const holdPct = Math.min((consecutiveHold / REQUIRED_HOLD_FRAMES) * 100, 100);
                setStepProgress(holdPct);
                setFeedbackMessage('Upward tilt detected, hold steady...');

                if (consecutiveHold >= REQUIRED_HOLD_FRAMES) {
                  capturedDescriptorsRef.current.push(descriptor);
                  console.log(`Face samples collected: ${capturedDescriptorsRef.current.length}`);
                  setCurrentStep('step5_down');
                  setOverallProgress(95);
                  consecutiveHold = 0;
                  setStepProgress(0);
                  setFeedbackMessage(null);
                }
              } else {
                consecutiveHold = Math.max(0, consecutiveHold - 1);
                setStepProgress((consecutiveHold / REQUIRED_HOLD_FRAMES) * 100);
                setFeedbackMessage('Tilt your chin slightly up');
              }
            } else if (step === 'step5_down') {
              // Movement: look down
              if (pose.isLookDown || pose.pitchRatio > 1.25) {
                consecutiveHold++;
                const holdPct = Math.min((consecutiveHold / REQUIRED_HOLD_FRAMES) * 100, 100);
                setStepProgress(holdPct);
                setFeedbackMessage('Downward tilt detected...');

                if (consecutiveHold >= REQUIRED_HOLD_FRAMES) {
                  capturedDescriptorsRef.current.push(descriptor);
                  console.log(`Face samples collected: ${capturedDescriptorsRef.current.length}`);
                  consecutiveHold = 0;
                  setStepProgress(100);
                  executeBiometricSave();
                  return;
                }
              } else {
                consecutiveHold = Math.max(0, consecutiveHold - 1);
                setStepProgress((consecutiveHold / REQUIRED_HOLD_FRAMES) * 100);
                setFeedbackMessage('Tilt your chin slightly down');
              }
            }
          }
        }
      } catch (err) {
        console.error('Frame detection error:', err);
      }

      if (isMounted && currentStepRef.current !== 'saving' && currentStepRef.current !== 'completing') {
        animId = requestAnimationFrame(processFrame);
      }
    }

    animId = requestAnimationFrame(processFrame);

    return () => {
      isMounted = false;
      if (animId) cancelAnimationFrame(animId);
    };
  }, [cameraReady, cameraError, saveError]);

  // Execute biometric save: Combine samples -> template -> Firestore save
  const executeBiometricSave = async () => {
    const samples = capturedDescriptorsRef.current;
    
    if (!samples || samples.length === 0) {
      setSaveError("Couldn't securely save your Face ID. Please try again.");
      return;
    }

    try {
      setCurrentStep('saving');
      setIsSaving(true);
      setFeedbackMessage('Generating face template...');

      // Combine valid sample descriptors into a stable, normalized face template
      const template = createFaceTemplate(samples);
      const embedding = Array.from(template);

      if (!embedding.length || embedding.length !== 128) {
        throw new Error("Face embedding generation failed.");
      }

      // Attempt to securely save the face profile to Firebase Firestore
      await onComplete(embedding, samples.length);

      // Successfully saved to Firestore!
      setCurrentStep('completing');
      setOverallProgress(100);
      setStepProgress(100);
      setSaveError(null);
      setFeedbackMessage('Biometric enrollment complete');

      // Allow the user to see the success state ("Face ID setup complete") before continuing
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        }
      }, 1600);
    } catch (err: any) {
      // Log the technical error to console for development
      console.warn("Firebase Face ID save error:", err);
      
      // Do NOT show successful registration; display clear error
      setIsSaving(false);
      setSaveError("Couldn't securely save your Face ID. Please try again.");
    }
  };

  const resetEnrollment = () => {
    capturedDescriptorsRef.current = [];
    setSaveError(null);
    setIsSaving(false);
    setOverallProgress(0);
    setStepProgress(0);
    setFeedbackMessage(null);
    setCurrentStep('positioning');
  };

  // Dynamic progress computation
  const stepConfig = STEP_CONFIG[currentStep as keyof typeof STEP_CONFIG];
  const stepBaseProgress = stepConfig ? (stepConfig.index - 1) * 20 : 0;
  const currentStepContribution = stepConfig ? (stepProgress / 100) * 20 : 0;
  const displayProgress = currentStep === 'completing' 
    ? 100 
    : Math.max(overallProgress, stepBaseProgress + currentStepContribution);
  const activeTicksCount = Math.min(TOTAL_TICKS, Math.round((displayProgress / 100) * TOTAL_TICKS));

  const skipCurrentStep = () => {
    const stepOrder: EnrollmentStep[] = [
      'step1_straight',
      'step2_left',
      'step3_right',
      'step4_up',
      'step5_down',
    ];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex >= 0 && currentIndex < stepOrder.length - 1) {
      const nextStep = stepOrder[currentIndex + 1];
      setCurrentStep(nextStep);
      setOverallProgress((currentIndex + 2) * 20);
      setStepProgress(0);
      setFeedbackMessage(null);
    } else if (currentIndex === stepOrder.length - 1) {
      executeBiometricSave();
    }
  };

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
        {/* Firebase Saving Error State */}
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
              <h3 className="text-lg font-semibold text-slate-900">Enrollment Unsuccessful</h3>
              <p className="text-sm text-slate-600 leading-relaxed max-w-xs mx-auto">
                {saveError}
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={resetEnrollment}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Try Enrollment Again
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
                      Saving encrypted biometric template to Firebase
                    </p>
                  </motion.div>
                ) : currentStep === 'positioning' ? (
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
                  </motion.div>
                ) : (
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="space-y-1.5"
                  >
                    {/* Step pill indicator */}
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase bg-slate-900 text-white">
                        Step {STEP_CONFIG[currentStep as keyof typeof STEP_CONFIG]?.index || 1} of 5
                      </span>
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                      {STEP_CONFIG[currentStep as keyof typeof STEP_CONFIG]?.title}
                    </h2>
                    <p className="text-xs text-slate-500 font-medium max-w-xs mx-auto">
                      {STEP_CONFIG[currentStep as keyof typeof STEP_CONFIG]?.subtitle}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* The Central Circular Face ID Scanner with Apple-style Radial Ticks */}
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

                  {/* Face outline / Biometric Reticle Overlay */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    {/* Biometric Head Oval Guide */}
                    <div
                      className={`w-[155px] h-[200px] rounded-[70px] border-2 transition-all duration-300 ${
                        currentStep === 'completing'
                          ? 'border-emerald-500/80 scale-95'
                          : isFaceCentered
                          ? 'border-white/70 shadow-[0_0_15px_rgba(255,255,255,0.25)]'
                          : 'border-white/30'
                      }`}
                    />

                    {/* Corner biometric reticles */}
                    <div className="absolute inset-6 border border-white/10 rounded-full" />
                  </div>

                  {/* Vertical animated scanning line during active tracking */}
                  {isFaceCentered && currentStep !== 'completing' && (
                    <motion.div
                      initial={{ y: -140 }}
                      animate={{ y: 140 }}
                      transition={{
                        repeat: Infinity,
                        repeatType: 'reverse',
                        duration: 1.8,
                        ease: 'easeInOut',
                      }}
                      className="absolute inset-x-0 h-1 bg-gradient-to-b from-white/0 via-white/50 to-white/0 pointer-events-none"
                    />
                  )}

                  {/* Success State Overlay */}
                  <AnimatePresence>
                    {currentStep === 'completing' && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center text-white"
                      >
                        <motion.div
                          initial={{ scale: 0.5, rotate: -20, opacity: 0 }}
                          animate={{ scale: 1, rotate: 0, opacity: 1 }}
                          transition={{ type: 'spring', damping: 14, stiffness: 200 }}
                          className="w-16 h-16 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-lg"
                        >
                          <Check className="w-8 h-8 stroke-[3]" />
                        </motion.div>
                        <motion.p
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                          className="mt-3 text-xs font-semibold tracking-wider uppercase text-white/90"
                        >
                          Enrolled
                        </motion.p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Dynamic Status / Feedback Message */}
            <div className="h-10 flex items-center justify-center mt-2 px-4">
              <AnimatePresence mode="wait">
                {feedbackMessage ? (
                  <motion.div
                    key={feedbackMessage}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className={`text-xs font-medium px-3.5 py-1.5 rounded-full flex items-center gap-1.5 ${
                      feedbackMessage.includes('Only one')
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : feedbackMessage.includes('Hold still') || feedbackMessage.includes('detected')
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-700 shadow-sm'
                    }`}
                  >
                    {feedbackMessage.includes('Only one') && (
                      <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                    )}
                    {stepConfig?.icon && currentStep !== 'positioning' && currentStep !== 'completing' && !feedbackMessage.includes('Only one') && (
                      <stepConfig.icon className="w-3.5 h-3.5 text-current" />
                    )}
                    {feedbackMessage}
                  </motion.div>
                ) : (
                  <div className="text-xs text-slate-400 font-medium">
                    Follow on-screen motion prompts
                  </div>
                )}
              </AnimatePresence>
            </div>

            {/* 5-Step Segmented Progress Pills */}
            <div className="w-full max-w-xs flex items-center justify-center gap-2 mt-4">
              {[1, 2, 3, 4, 5].map(stepNum => {
                const isStepCompleted = (overallProgress / 20) >= stepNum;
                const isCurrent = 
                  currentStep !== 'completing' && 
                  currentStep !== 'positioning' && 
                  STEP_CONFIG[currentStep as keyof typeof STEP_CONFIG]?.index === stepNum;

                return (
                  <div
                    key={stepNum}
                    className="flex-1 h-1.5 rounded-full overflow-hidden bg-slate-200/80"
                  >
                    <div
                      className={`h-full transition-all duration-300 rounded-full ${
                        isStepCompleted
                          ? 'bg-slate-900 w-full'
                          : isCurrent
                          ? 'bg-slate-900'
                          : 'w-0'
                      }`}
                      style={{
                        width: isStepCompleted
                          ? '100%'
                          : isCurrent
                          ? `${Math.max(stepProgress, 15)}%`
                          : '0%',
                      }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Subtle Motion Skip Option */}
            {currentStep !== 'positioning' && currentStep !== 'completing' && currentStep !== 'saving' && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={skipCurrentStep}
                  className="text-[11px] font-medium text-slate-400 hover:text-slate-700 transition-colors"
                >
                  Having trouble? Skip this movement
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Privacy & Trust Footer */}
      <div className="w-full max-w-md mx-auto pt-4 pb-2 border-t border-slate-100 flex flex-col items-center text-center space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-600" />
          <span>Your face data is used only for authentication.</span>
        </div>
        <p className="text-[11px] text-slate-400 max-w-xs">
          Biometric features are computed into irreversible mathematical descriptors. No images or videos are ever uploaded or saved.
        </p>
      </div>
    </div>
  );
}
