import type { IncomingMessage, ServerResponse } from 'http';
import { faceAuthStore } from '../../server/faceAuthStore';

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
    const { uid, name, email, embedding, sampleCount } = body || {};

    if (!uid || !email || !Array.isArray(embedding) || embedding.length !== 128) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Invalid biometric profile payload' }));
      return;
    }

    faceAuthStore.saveProfile({
      uid,
      name: name || 'User',
      email,
      embedding,
      registered: true,
      sampleCount: sampleCount || 1,
      version: 1
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true }));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err.message || 'Failed to sync biometric profile' }));
  }
}
