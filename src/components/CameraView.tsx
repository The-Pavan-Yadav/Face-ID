import React, { useEffect, useRef, useState } from 'react';
import { Camera, AlertTriangle, ShieldCheck } from 'lucide-react';
import { detectQualityFaceAndEmbedding, loadFaceModels } from '../lib/face';

interface CameraViewProps {
  onFaceDetected: (data: { descriptor: Float32Array, landmarks: any, faceDetectedTime?: number }) => void;
  statusMessage: string;
  isScanning?: boolean;
  isSuccess?: boolean;
}

export function CameraView({ 
  onFaceDetected, 
  statusMessage, 
  isScanning = true,
  isSuccess = false 
}: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasFace, setHasFace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isProcessingRef = useRef(false);
  const cameraStartTimeRef = useRef(performance.now());

  // 1. Initialize camera immediately on mount (Requirement 2)
  useEffect(() => {
    let active = true;
    cameraStartTimeRef.current = performance.now();

    async function setupCamera() {
      try {
        // Concurrently ensure model is preloaded/loading without blocking camera access
        loadFaceModels().catch(() => {});

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: "user",
            width: { ideal: 640 }, 
            height: { ideal: 480 } 
          },
          audio: false
        });

        if (!active) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
        }
      } catch (err) {
        console.error("[AURA] Camera access error:", err);
        setError("Camera access unavailable. Please grant camera permissions to authenticate with Face ID.");
      }
    }

    setupCamera();

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // 2. Stop camera tracks immediately when success is achieved (Requirement 10)
  useEffect(() => {
    if (isSuccess && streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, [isSuccess]);

  const handleVideoCanPlay = () => {
    if (!isReady) {
      setIsReady(true);
      const cameraElapsed = (performance.now() - cameraStartTimeRef.current).toFixed(1);
      console.log(`[AURA] Camera ready: ${cameraElapsed} ms`);
    }
  };

  // 3. Controlled recognition loop: 100-200ms intervals, no frame overlap (Requirement 3)
  useEffect(() => {
    if (!isReady || error || isSuccess || !isScanning) return;

    let animationFrameId: number;
    let lastProcessTime = 0;
    const PROCESS_INTERVAL_MS = 140; // 140ms (~7 fps), perfectly within 100-200ms range

    async function loop(currentTime: number) {
      if (isSuccess || !videoRef.current) return;

      if (!isProcessingRef.current && (currentTime - lastProcessTime >= PROCESS_INTERVAL_MS)) {
        if (videoRef.current.readyState >= 2) {
          isProcessingRef.current = true;
          lastProcessTime = currentTime;

          try {
            const result = await detectQualityFaceAndEmbedding(videoRef.current);

            if (result.status === 'high_quality' && result.descriptor) {
              setHasFace(true);
              onFaceDetected({ 
                descriptor: result.descriptor, 
                landmarks: result.landmarks,
                faceDetectedTime: performance.now()
              });
            } else {
              setHasFace(false);
            }
          } catch (err) {
            console.warn("[AURA] Frame analysis notice:", err);
          } finally {
            isProcessingRef.current = false;
          }
        }
      }

      if (!isSuccess) {
        animationFrameId = requestAnimationFrame(loop);
      }
    }

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isReady, error, isSuccess, isScanning, onFaceDetected]);

  return (
    <div className="flex flex-col items-center space-y-4 w-full">
      {/* Clean, Minimalist Biometric Viewfinder */}
      <div className="relative w-full max-w-[280px] aspect-[4/5] mx-auto rounded-[22px] p-[1px] bg-white border border-[#E4E6EA] shadow-sm overflow-hidden">
        
        {/* Interior Container */}
        <div className="relative w-full h-full rounded-[21px] bg-slate-900 overflow-hidden">
          
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-white text-[#111318] space-y-3">
              <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <p className="text-xs text-[#626873] leading-relaxed max-w-[220px]">
                {error}
              </p>
            </div>
          ) : (
            <>
              {/* Live Video Feed */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onCanPlay={handleVideoCanPlay}
                className="w-full h-full object-cover transform -scale-x-100"
              />

              {/* Minimal Graphite Scanning Sweep (Zero neon) */}
              {isScanning && isReady && !isSuccess && (
                <div className="absolute inset-x-4 h-[1.5px] bg-slate-300/70 animate-subtle-scan pointer-events-none z-20" />
              )}

              {/* Apple-style Face ID Minimal Geometry Frame */}
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none p-6">
                <div 
                  className={`relative w-[180px] h-[225px] rounded-[32px] border transition-all duration-200 flex items-center justify-center ${
                    hasFace || isSuccess
                      ? 'border-white/90 scale-[1.02]' 
                      : 'border-white/40'
                  }`}
                >
                  {/* Subtle Corner Brackets (Thin white/graphite lines) */}
                  <div className="absolute -top-0.5 -left-0.5 w-3.5 h-3.5 border-t-2 border-l-2 border-white rounded-tl-sm" />
                  <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 border-t-2 border-r-2 border-white rounded-tr-sm" />
                  <div className="absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 border-b-2 border-l-2 border-white rounded-bl-sm" />
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-b-2 border-r-2 border-white rounded-br-sm" />

                  {/* Face Centered Marker */}
                  {(hasFace || isSuccess) && (
                    <span className="absolute -bottom-5 text-[10px] font-mono tracking-wider text-white uppercase px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs border border-white/20">
                      {isSuccess ? 'Verified' : 'Face Detected'}
                    </span>
                  )}
                </div>
              </div>

              {/* Live Camera Badge */}
              <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-xs border border-white/10 text-[10px] font-mono text-white/90">
                <span className={`w-1.5 h-1.5 rounded-full ${isSuccess ? 'bg-emerald-400' : isReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span>{isSuccess ? 'AUTHENTICATED' : isReady ? 'CAMERA LIVE' : 'INITIALIZING'}</span>
              </div>

              {/* Minimal Hardware Enclave Badge */}
              <div className="absolute bottom-2.5 right-2.5 z-20 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-xs border border-white/10 text-[9px] font-mono text-white/80">
                <ShieldCheck className="w-3 h-3 text-slate-300" />
                <span>AURA BIOMETRIC</span>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Live Status Message & Progress */}
      <div className="text-center w-full max-w-[320px] px-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-[#E4E6EA] text-xs font-medium text-[#111318]">
          <span className={`w-1.5 h-1.5 rounded-full ${isSuccess ? 'bg-emerald-600' : 'bg-[#17191D] animate-pulse'}`} />
          <span>{statusMessage}</span>
        </div>
      </div>
    </div>
  );
}
