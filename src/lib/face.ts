import * as faceapi from '@vladmandic/face-api';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

// Singleton shared initialization promise (Requirement 9)
let faceModelPromise: Promise<void> | null = null;
let modelsLoaded = false;
const modelReadyListeners: Array<() => void> = [];

export function isFaceModelLoaded(): boolean {
  return modelsLoaded;
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

export function loadFaceModels(): Promise<void> {
  if (modelsLoaded) {
    return Promise.resolve();
  }

  if (!faceModelPromise) {
    const modelStart = performance.now();
    faceModelPromise = (async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        modelsLoaded = true;
        const elapsed = (performance.now() - modelStart).toFixed(1);
        console.log(`[AURA] Model ready: ${elapsed} ms`);
        
        // Notify all subscribers
        modelReadyListeners.forEach(fn => {
          try { fn(); } catch (err) { console.error(err); }
        });
        modelReadyListeners.length = 0;
      } catch (error) {
        faceModelPromise = null;
        console.error("Failed to load face-api models:", error);
        throw new Error("Could not initialize face recognition engine.");
      }
    })();
  }

  return faceModelPromise;
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

  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.55 });
  const detections = await faceapi.detectAllFaces(video, options);

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
  const faceDetectedTime = (performance.now() - frameStart).toFixed(1);
  console.log(`[AURA] Face detected: ${faceDetectedTime} ms`);

  // Compute landmarks and 128-dimensional embedding
  const embedStart = performance.now();
  const faceWithDescriptor = await faceapi
    .detectSingleFace(video, options)
    .withFaceLandmarks()
    .withFaceDescriptor();

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
