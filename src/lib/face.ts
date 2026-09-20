import * as faceapi from '@vladmandic/face-api';

const CDN_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

// Determine production-safe model path
function getLocalModelUrl(): string {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return `${window.location.origin}/models`;
  }
  return '/models';
}

// Singleton shared initialization promise (Step 4)
let faceModelPromise: Promise<void> | null = null;
let modelsLoaded = false;
let modelLoadError: Error | null = null;
const modelReadyListeners: Array<() => void> = [];

export function isFaceModelLoaded(): boolean {
  return modelsLoaded;
}

export function getFaceModelError(): Error | null {
  return modelLoadError;
}

export function addModelReadyListener(listener: () => void): () => void {
  if (modelsLoaded) {
    listener();
    return () => {};
  }
  modelReadyListeners.push(listener);
  return () => {
    const idx = modelReadyListeners.indexOf(listener);
    if (idx !== -1) modelReadyListeners.splice(idx, 1);
  };
}

async function loadModelsFromUri(baseUri: string): Promise<void> {
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(baseUri),
    faceapi.nets.faceLandmark68Net.loadFromUri(baseUri),
    faceapi.nets.faceRecognitionNet.loadFromUri(baseUri),
  ]);
}

/**
 * Singleton model initialization (loadModelsOnce)
 * Tries local static assets first, with resilient fallback to CDN.
 */
export function loadModelsOnce(): Promise<void> {
  if (modelsLoaded) {
    return Promise.resolve();
  }

  if (!faceModelPromise) {
    const modelStart = performance.now();
    faceModelPromise = (async () => {
      try {
        // Enforce a 12-second timeout so the UI is never permanently blocked
        const loadWithTimeout = async () => {
          try {
            // 1. Try local production-safe assets (/models)
            const localUrl = getLocalModelUrl();
            await loadModelsFromUri(localUrl);
          } catch (localErr: any) {
            console.warn("[AURA FACE] Local model load notice, attempting CDN fallback:", {
              code: localErr?.code,
              message: localErr?.message,
              name: localErr?.name
            });
            // 2. Resilient fallback to CDN
            await loadModelsFromUri(CDN_MODEL_URL);
          }
        };

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            const err = new Error("Face recognition models took too long to load.");
            err.name = "TimeoutError";
            reject(err);
          }, 12000);
        });

        await Promise.race([loadWithTimeout(), timeoutPromise]);

        modelsLoaded = true;
        modelLoadError = null;
        const elapsed = (performance.now() - modelStart).toFixed(1);
        console.log(`[AURA FACE] Models ready: ${elapsed} ms`);

        // Notify all subscribers
        modelReadyListeners.forEach(fn => {
          try { fn(); } catch (err) { console.error(err); }
        });
        modelReadyListeners.length = 0;
      } catch (error: any) {
        faceModelPromise = null;
        modelsLoaded = false;
        modelLoadError = error;
        console.error("[AURA FACE] Failed to load face-api models:", {
          code: error?.code,
          message: error?.message,
          name: error?.name
        });
        throw new Error("Face recognition is temporarily unavailable.");
      }
    })();
  }

  return faceModelPromise;
}

export function loadFaceModels(): Promise<void> {
  return loadModelsOnce();
}

export interface QualityFaceDetection {
  status: 'no_face' | 'multiple_faces' | 'poor_quality' | 'high_quality';
  message: string;
  descriptor?: Float32Array;
  landmarks?: any;
  box?: { x: number; y: number; width: number; height: number };
}

/**
 * Fast face detection pipeline (Requirements 4 & 5):
 * 1. Quickly check if exactly one face is present using TinyFaceDetector.
 * 2. Validate centering, size, and image quality.
 * 3. Only generate expensive embedding when a clear, usable face is verified.
 */
export async function detectQualityFaceAndEmbedding(video: HTMLVideoElement): Promise<QualityFaceDetection> {
  const frameStart = performance.now();
  await loadFaceModels();

  const isReady = isFaceModelLoaded();
  console.log(`[AURA FACE] Face model status: ${isReady ? 'READY' : 'NOT READY'}`);

  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.55 });
  let detections: any[];
  try {
    detections = await faceapi.detectAllFaces(video, options);
  } catch (detErr: any) {
    console.error("[AURA FACE] Face detector error:", {
      code: detErr?.code,
      message: detErr?.message,
      name: detErr?.name
    });
    throw detErr;
  }

  if (!detections || detections.length === 0) {
    return { status: 'no_face', message: 'Looking for your face...' };
  }

  if (detections.length > 1) {
    return { status: 'multiple_faces', message: 'Multiple faces detected' };
  }

  const primary = detections[0];
  const box = primary.box;
  const videoW = video.videoWidth || 640;
  const videoH = video.videoHeight || 480;

  // Face size check: ensure face occupies sufficient area
  if (box.width < 70 || box.height < 70) {
    return { status: 'poor_quality', message: 'Move slightly closer' };
  }

  // Centering check: center of face within reasonable viewing bounds
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const normX = centerX / videoW;
  const normY = centerY / videoH;

  if (normX < 0.20 || normX > 0.80 || normY < 0.15 || normY > 0.85) {
    return { status: 'poor_quality', message: 'Center your face' };
  }

  if (primary.score < 0.60) {
    return { status: 'poor_quality', message: 'Ensure good lighting' };
  }

  // Exactly one well-centered, high-quality face detected!
  console.log('[AURA FACE] Face detected');
  const faceDetectedTime = (performance.now() - frameStart).toFixed(1);
  console.log(`[AURA] Face detected: ${faceDetectedTime} ms`);

  // Compute landmarks and 128-dimensional embedding
  console.log('[AURA FACE] Starting embedding generation');
  const embedStart = performance.now();

  let faceWithDescriptor: any;
  try {
    faceWithDescriptor = await faceapi
      .detectSingleFace(video, options)
      .withFaceLandmarks()
      .withFaceDescriptor();
  } catch (embedErr: any) {
    console.error("[AURA FACE] Embedding generation failed:", {
      code: embedErr?.code,
      message: embedErr?.message,
      name: embedErr?.name
    });
    throw embedErr;
  }

  if (!faceWithDescriptor || !faceWithDescriptor.descriptor) {
    return { status: 'poor_quality', message: 'Repositioning...' };
  }

  const embedTime = (performance.now() - embedStart).toFixed(1);
  console.log(`[AURA] Embedding generated: ${embedTime} ms`);

  return {
    status: 'high_quality',
    message: 'Face detected',
    descriptor: faceWithDescriptor.descriptor,
    landmarks: faceWithDescriptor.landmarks,
    box: {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height
    }
  };
}

export async function getFaceData(video: HTMLVideoElement) {
  const result = await detectQualityFaceAndEmbedding(video);
  if (result.status === 'high_quality' && result.descriptor) {
    return {
      descriptor: result.descriptor,
      landmarks: result.landmarks
    };
  }
  return null;
}

export interface FacePoseAnalysis {
  yawRatio: number;
  pitchRatio: number;
  isStraight: boolean;
  isTurnLeft: boolean;
  isTurnRight: boolean;
  isLookUp: boolean;
  isLookDown: boolean;
}

export function analyzeFacePose(landmarks: any): FacePoseAnalysis {
  const positions = landmarks?.positions;
  if (!positions || positions.length < 68) {
    return {
      yawRatio: 0.5,
      pitchRatio: 1.0,
      isStraight: true,
      isTurnLeft: false,
      isTurnRight: false,
      isLookUp: false,
      isLookDown: false,
    };
  }

  const jawLeft = positions[0].x;
  const jawRight = positions[16].x;
  const minJawX = Math.min(jawLeft, jawRight);
  const maxJawX = Math.max(jawLeft, jawRight);
  const jawWidth = Math.max(maxJawX - minJawX, 1);

  const noseX = positions[30].x;
  const yawRatio = (noseX - minJawX) / jawWidth;

  const leftEyeY = (positions[36].y + positions[39].y) / 2;
  const rightEyeY = (positions[42].y + positions[45].y) / 2;
  const eyeMidY = (leftEyeY + rightEyeY) / 2;

  const noseTipY = positions[33].y;
  const chinY = positions[8].y;

  const upperFace = Math.max(noseTipY - eyeMidY, 1);
  const lowerFace = Math.max(chinY - noseTipY, 1);
  const pitchRatio = upperFace / lowerFace;

  const isTurnLeft = yawRatio > 0.58;
  const isTurnRight = yawRatio < 0.42;
  const isStraightYaw = yawRatio >= 0.44 && yawRatio <= 0.56;

  const isLookUp = pitchRatio < 0.72;
  const isLookDown = pitchRatio > 1.28;
  const isStraightPitch = pitchRatio >= 0.78 && pitchRatio <= 1.22;

  const isStraight = isStraightYaw && isStraightPitch;

  return {
    yawRatio,
    pitchRatio,
    isStraight,
    isTurnLeft,
    isTurnRight,
    isLookUp,
    isLookDown,
  };
}

export type EnrollmentDetectionResult = 
  | { status: 'no_face'; count: 0 }
  | { status: 'multiple_faces'; count: number }
  | { 
      status: 'single_face'; 
      count: 1; 
      descriptor: Float32Array; 
      landmarks: any; 
      box: { x: number; y: number; width: number; height: number };
      pose: FacePoseAnalysis;
    };

export async function detectEnrollmentFrame(video: HTMLVideoElement): Promise<EnrollmentDetectionResult> {
  await loadFaceModels();
  
  const detections = await faceapi
    .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (!detections || detections.length === 0) {
    return { status: 'no_face', count: 0 };
  }

  if (detections.length > 1) {
    return { status: 'multiple_faces', count: detections.length };
  }

  const primary = detections[0];
  const pose = analyzeFacePose(primary.landmarks);

  return {
    status: 'single_face',
    count: 1,
    descriptor: primary.descriptor,
    landmarks: primary.landmarks,
    box: {
      x: primary.detection.box.x,
      y: primary.detection.box.y,
      width: primary.detection.box.width,
      height: primary.detection.box.height,
    },
    pose,
  };
}

export function calculateEuclideanDistance(desc1: number[] | Float32Array, desc2: number[] | Float32Array): number {
  if (!desc1 || !desc2 || desc1.length !== desc2.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function compareDescriptors(desc1: number[] | Float32Array, desc2: number[] | Float32Array, threshold: number = 0.45): boolean {
  const distance = calculateEuclideanDistance(desc1, desc2);
  return distance < threshold;
}

export async function extractFaceEmbedding(video: HTMLVideoElement): Promise<number[] | null> {
  await loadFaceModels();
  const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection || !detection.descriptor) return null;
  const embedding = Array.from(detection.descriptor);
  if (!embedding.length || embedding.length !== 128 || embedding.some(v => typeof v !== 'number' || isNaN(v))) {
    return null;
  }
  return embedding;
}

export function createFaceTemplate(samples: Float32Array[]): number[] {
  if (!samples || samples.length === 0) {
    throw new Error('No face samples provided for biometric template generation.');
  }

  const validSamples = samples.filter(s => s && s.length === 128 && !s.some(v => isNaN(v)));
  if (validSamples.length === 0) {
    throw new Error('No valid face samples available to create template.');
  }

  const length = 128;
  const combined = new Float64Array(length);

  for (const sample of validSamples) {
    for (let i = 0; i < length; i++) {
      combined[i] += sample[i];
    }
  }

  for (let i = 0; i < length; i++) {
    combined[i] /= validSamples.length;
  }

  let norm = 0;
  for (let i = 0; i < length; i++) {
    norm += combined[i] * combined[i];
  }
  norm = Math.sqrt(norm) || 1;

  const normalized = new Array<number>(length);
  for (let i = 0; i < length; i++) {
    normalized[i] = Number((combined[i] / norm).toFixed(6));
  }

  return normalized;
}

/**
 * Captures the current video frame as a high-quality JPEG Blob for storage upload
 */
export function captureVideoFrameBlob(video: HTMLVideoElement, quality: number = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      const vWidth = video.videoWidth || 640;
      const vHeight = video.videoHeight || 480;
      const size = Math.min(vWidth, vHeight);
      
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      
      // Center-crop video frame
      const sx = (vWidth - size) / 2;
      const sy = (vHeight - size) / 2;
      ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
      
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to encode video frame as JPEG blob'));
        }
      }, 'image/jpeg', quality);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Captures current video frame as a JPEG Base64 data URL for fast server API verification
 */
export function captureVideoFrameBase64(video: HTMLVideoElement, quality: number = 0.85): string {
  try {
    const canvas = document.createElement('canvas');
    const vWidth = video.videoWidth || 640;
    const vHeight = video.videoHeight || 480;
    const size = Math.min(vWidth, vHeight);
    
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    const sx = (vWidth - size) / 2;
    const sy = (vHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
    
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return '';
  }
}

