import type { IncomingMessage, ServerResponse } from 'http';
import { faceAuthStore } from '../../server/faceAuthStore';

function euclideanDistance(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

async function parseJsonBody(req: IncomingMessage): Promise<any> {
  if ((req as any).body) return (req as any).body;
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const { descriptor, email } = body || {};

    if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid face descriptor' }));
      return;
    }

    const THRESHOLD = 0.45;

    // If email is provided, match against that specific account
    if (email && typeof email === 'string') {
      const profile = faceAuthStore.getProfileByEmail(email);
      if (!profile || !profile.embedding) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: 'No Face ID is registered for this account. Please sign in with your password and register Face ID.'
        }));
        return;
      }

      const dist = euclideanDistance(descriptor, profile.embedding);
      if (dist < THRESHOLD) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: true,
          uid: profile.uid,
          name: profile.name,
          email: profile.email
        }));
        return;
      } else {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Face not recognized. Please try again.' }));
        return;
      }
    }

    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Enter your account email to use Face ID.' }));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Unable to verify Face ID right now. Please try again.' }));
  }
}
