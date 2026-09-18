import React, { useEffect, useRef, useState } from 'react';
import { getFaceData, loadFaceModels } from '../lib/face';

interface CameraViewProps {
  onFaceDetected: (data: { descriptor: Float32Array, landmarks: any }) => void;
  statusMessage: string;
}

export function CameraView({ onFaceDetected, statusMessage }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function setupCamera() {
      try {
        await loadFaceModels();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 480, height: 640, facingMode: 'user' },
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
        setError("Camera access denied or unavailable.");
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
        consecutiveDetections++;
        if (consecutiveDetections > 5) { // Simple stability check
          onFaceDetected(data);
          // Don't return, keep detecting so parent can track liveness continuously
          consecutiveDetections = 0; 
        }
      } else {
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
    <div className="flex flex-col items-center space-y-6">
      <div className="relative w-full max-w-[280px] mx-auto overflow-hidden rounded-xl border border-slate-200 bg-slate-50 aspect-[3/4]">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-500 bg-slate-50">
            {error}
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onPlay={() => setIsReady(true)}
              className="w-full h-full object-cover transform -scale-x-100 grayscale-[0.2] contrast-100"
            />
            {/* Subtle Overlay Guide */}
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="w-[180px] h-[240px] border-[1px] border-white/50 rounded-lg"></div>
            </div>
          </>
        )}
      </div>
      
      <div className="text-center h-6">
        <span className="text-sm font-medium text-slate-600">
          {statusMessage}
        </span>
      </div>
    </div>
  );
}
