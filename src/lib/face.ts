import * as faceapi from '@vladmandic/face-api';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

let modelsLoaded = false;

export async function loadFaceModels() {
  if (modelsLoaded) return;
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
  } catch (error) {
    console.error("Failed to load face-api models:", error);
    throw new Error("Could not initialize face recognition engine.");
  }
}

export async function getFaceData(video: HTMLVideoElement) {
  const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  
  if (!detection) return null;
  return {
    descriptor: detection.descriptor,
    landmarks: detection.landmarks
  };
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
  const positions = landmarks.positions;
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

  // Jaw points (0 to 16)
  const jawLeft = positions[0].x;
  const jawRight = positions[16].x;
  const minJawX = Math.min(jawLeft, jawRight);
  const maxJawX = Math.max(jawLeft, jawRight);
  const jawWidth = Math.max(maxJawX - minJawX, 1);

  // Nose bridge / tip
  const noseX = positions[30].x; // Mid nose bridge / tip
  const yawRatio = (noseX - minJawX) / jawWidth;

  // Eye centers
  const leftEyeY = (positions[36].y + positions[39].y) / 2;
  const rightEyeY = (positions[42].y + positions[45].y) / 2;
  const eyeMidY = (leftEyeY + rightEyeY) / 2;

  // Nose tip and chin
  const noseTipY = positions[33].y;
  const chinY = positions[8].y;

  const upperFace = Math.max(noseTipY - eyeMidY, 1);
  const lowerFace = Math.max(chinY - noseTipY, 1);
  const pitchRatio = upperFace / lowerFace;

  // Note: in a mirrored video feed, user turning to their left makes their nose shift towards higher X (right in video)
  // or towards lower X depending on hardware.
  // Standard user left turn in mirrored view: nose moves towards right edge of camera (ratio > 0.58).
  // Standard user right turn in mirrored view: nose moves towards left edge of camera (ratio < 0.42).
  const isTurnLeft = yawRatio > 0.58;
  const isTurnRight = yawRatio < 0.42;
  const isStraightYaw = yawRatio >= 0.44 && yawRatio <= 0.56;

  // Pitch: looking up compresses upper face (nose closer to eyes), pitchRatio drops (< 0.75).
  // Looking down expands upper face relative to chin, pitchRatio increases (> 1.25).
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

export function compareDescriptors(desc1: Float32Array, desc2: Float32Array, threshold: number = 0.45): boolean {
  const distance = faceapi.euclideanDistance(desc1, desc2);
  return distance < threshold;
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

  // Element-wise sum across all valid samples
  for (const sample of validSamples) {
    for (let i = 0; i < length; i++) {
      combined[i] += sample[i];
    }
  }

  // Element-wise average
  for (let i = 0; i < length; i++) {
    combined[i] /= validSamples.length;
  }

  // L2 Normalize to maintain 128-dimensional unit hypersphere properties
  let norm = 0;
  for (let i = 0; i < length; i++) {
    norm += combined[i] * combined[i];
  }
  norm = Math.sqrt(norm) || 1;

  const normalized = new Array<number>(length);
  for (let i = 0; i < length; i++) {
    normalized[i] = Number((combined[i] / norm).toFixed(6));
  }

  console.log("Face descriptor generated");
  return normalized;
}
