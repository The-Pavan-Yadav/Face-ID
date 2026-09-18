import type { IncomingMessage, ServerResponse } from 'http';
import { faceAuthStore } from '../../server/faceAuthStore';

// Helper to parse JSON body in Vercel Serverless Function
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
    const { email } = body || {};

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: false,
        error: 'Enter your account email to use Face ID.'
      }));
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const profile = faceAuthStore.getProfileByEmail(normalizedEmail);

    if (!profile || !profile.embedding || profile.embedding.length !== 128) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: false,
        code: 'NO_FACE_ID_REGISTERED',
        error: 'No Face ID is registered for this account. Please sign in with your password and register Face ID.'
      }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      profile: {
        uid: profile.uid,
        name: profile.name,
        email: profile.email,
        embedding: profile.embedding,
        registered: true
      }
    }));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: 'Unable to verify Face ID right now. Please try again.'
    }));
  }
}
