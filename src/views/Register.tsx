import React, { useState } from 'react';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { db } from '../lib/db';
import { FaceIDEnrollment } from '../components/FaceIDEnrollment';

interface RegisterProps {
  onSuccess: () => void;
  onNavigate: (view: 'login') => void;
}

export function Register({ onSuccess, onNavigate }: RegisterProps) {
  const [step, setStep] = useState<'details' | 'face'>('details');
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [createdUid, setCreatedUid] = useState<string | null>(null);

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNeedsSignIn(false);

    if (formData.password !== formData.confirm) {
      setError('Passwords do not match');
      return;
    }

    try {
      setIsLoading(true);
      const uid = await db.createAuthAccount(formData.email, formData.password);
      setCreatedUid(uid);
      setStep('face');
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Please sign in instead.');
        setNeedsSignIn(true);
      } else {
        setError(err.message || 'Registration failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFaceEnrolled = async (template: number[], sampleCount: number) => {
    if (!createdUid) {
      throw new Error('Authenticated UID is required for biometric registration.');
    }

    await db.saveFaceProfile(createdUid, {
      name: formData.name,
      email: formData.email,
      faceEmbedding: template,
      sampleCount: sampleCount,
    });
  };

  if (step === 'face') {
    return (
      <FaceIDEnrollment
        userName={formData.name}
        onComplete={handleFaceEnrolled}
        onSuccess={onSuccess}
        onCancel={() => onNavigate('login')}
      />
    );
  }

  return (
    <AuthLayout title="Create an account" subtitle="Sign up to Aura Identity">
      <form onSubmit={handleDetailsSubmit} className="space-y-4">
        <Input 
          label="Full name"
          required
          value={formData.name}
          onChange={(e) => setFormData(d => ({...d, name: e.target.value}))}
        />
        <Input 
          label="Email address"
          type="email"
          required
          value={formData.email}
          onChange={(e) => setFormData(d => ({...d, email: e.target.value}))}
        />
        <Input 
          label="Password"
          type="password"
          required
          value={formData.password}
          onChange={(e) => setFormData(d => ({...d, password: e.target.value}))}
        />
        <Input 
          label="Confirm password"
          type="password"
          required
          value={formData.confirm}
          onChange={(e) => setFormData(d => ({...d, confirm: e.target.value}))}
        />

        {error && <div className="text-sm text-red-600 font-medium">{error}</div>}

        {needsSignIn ? (
          <Button type="button" variant="secondary" className="w-full mt-2" onClick={() => onNavigate('login')}>
            Go to Sign In
          </Button>
        ) : (
          <Button type="submit" className="w-full mt-2" isLoading={isLoading}>
            Continue to Face ID Setup
          </Button>
        )}

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <button 
            type="button" 
            onClick={() => onNavigate('login')}
            className="font-medium text-slate-900 hover:underline"
          >
            Sign in
          </button>
        </p>
      </form>
    </AuthLayout>
  );
}
