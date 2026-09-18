import React, { useEffect, useRef, useState } from 'react';
import { Camera, AlertTriangle, ShieldCheck } from 'lucide-react';
import { getFaceData, loadFaceModels } from '../lib/face';

interface CameraViewProps {
  onFaceDetected: (data: { descriptor: Float32Array, landmarks: any }) => void;
  statusMessage: string;
  isScanning?: boolean;
}

export function CameraView({ onFaceDetected, statusMessage, isScanning = true }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasFace, setHasFace] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function setupCamera() {
      try {
        await loadFaceModels();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: 640 }, 
            height: { ideal: 640 }, 
            facingMode: 'user' 
          },
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
        console.error(err);
        setError("Camera access unavailable. Please grant camera permissions to authenticate with Face ID.");
      }
    }

    setupCamera();

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!isReady || error) return;
    let frameId: number;
    let consecutiveDetections = 0;

    async function detectFrame() {
      if (!videoRef.current) return;
      const data = await getFaceData(videoRef.current);
      
      if (data) {
        setHasFace(true);
        consecutiveDetections++;
        if (consecutiveDetections > 4) { // Biometric stability buffer
          onFaceDetected(data);
          consecutiveDetections = 0; 
        }
      } else {
        setHasFace(false);
        consecutiveDetections = 0;
      }
      
      frameId = requestAnimationFrame(detectFrame);
    }

    detectFrame();

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [isReady, error, onFaceDetected]);

  return (
    <div className="flex flex-col items-center space-y-5 w-full">
      {/* 2026 Biometric Scanner Aperture */}
      <div className="relative w-full max-w-[290px] aspect-[4/5] mx-auto rounded-[26px] p-[1.5px] bg-gradient-to-b from-cyan-400/40 via-indigo-500/30 to-violet-500/40 shadow-[0_0_35px_rgba(99,102,241,0.25)] overflow-hidden">
        
        {/* Scanner Interior Container */}
        <div className="relative w-full h-full rounded-[25px] bg-[#070912] overflow-hidden">
          
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#0d1020]/95 text-slate-300 space-y-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-[220px]">
                {error}
              </p>
            </div>
          ) : (
            <>
              {/* Video Stream */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onPlay={() => setIsReady(true)}
                className="w-full h-full object-cover transform -scale-x-100 contrast-[1.05] brightness-95"
              />

              {/* Scanning Laser Beam traversing vertically */}
              {isScanning && isReady && (
                <div className="absolute inset-x-2 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#22d3ee,0_0_4px_#38bdf8] animate-scan-laser pointer-events-none z-20" />
              )}

              {/* Subtle Scanning Mesh Overlay */}
              <div 
                className="absolute inset-0 opacity-[0.05] pointer-events-none"
                style={{
                  backgroundImage: `radial-gradient(rgba(34, 211, 238, 0.6) 1px, transparent 1px)`,
                  backgroundSize: '16px 16px'
                }}
              />

              {/* Futuristic Biometric Face Reticle Target */}
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none p-6">
                <div 
                  className={`relative w-[190px] h-[240px] rounded-[38px] border-2 transition-all duration-300 flex items-center justify-center ${
                    hasFace 
                      ? 'border-cyan-400/80 shadow-[0_0_20px_rgba(34,211,238,0.35)]' 
                      : 'border-white/20'
                  }`}
                >
                  {/* Four Precision Reticle Brackets */}
                  <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-cyan-400 shadow-[0_0_6px_#22d3ee]" />
                  <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-cyan-400 shadow-[0_0_6px_#22d3ee]" />
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-cyan-400 shadow-[0_0_6px_#22d3ee]" />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-cyan-400 shadow-[0_0_6px_#22d3ee]" />

                  {/* Center Crosshair Dot */}
                  <div className="w-1 h-1 rounded-full bg-cyan-400/60" />

                  {/* Corner Landmarks Indicator */}
                  {hasFace && (
                    <span className="absolute -bottom-6 text-[10px] font-mono tracking-widest text-cyan-300 uppercase px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30">
                      Face Locked • 68-Pts
                    </span>
                  )}
                </div>
              </div>

              {/* Live HUD Status in Top Left */}
              <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono text-cyan-300">
                <span className={`w-1.5 h-1.5 rounded-full ${isReady ? 'bg-cyan-400 animate-pulse' : 'bg-amber-400'}`} />
                <span>{isReady ? 'CAMERA LIVE' : 'INITIALIZING'}</span>
              </div>

              {/* Biometric Enclave Signature in Bottom Right */}
              <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-mono text-slate-400">
                <ShieldCheck className="w-3 h-3 text-indigo-400" />
                <span>AURA-128D</span>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Live Status Message & Progress Indicator */}
      <div className="text-center w-full max-w-[320px] px-2">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-950/40 border border-indigo-500/20 text-xs font-medium text-indigo-200 backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span>{statusMessage}</span>
        </div>
      </div>
    </div>
  );
}
