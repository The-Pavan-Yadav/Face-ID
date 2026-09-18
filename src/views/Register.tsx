import React, { useState } from 'react';
import { User as UserIcon, Mail, Lock, Sparkles } from 'lucide-react';
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

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    try {
      setIsLoading(true);
      const uid = await db.createAuthAccount(formData.email.trim(), formData.password);
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
    <AuthLayout 
      title="Create account" 
      subtitle="Establish your secure AURA biometric identity"
    >
      <form onSubmit={handleDetailsSubmit} className="space-y-2.5">
        <Input 
          id="reg-name"
          label="Full name"
          required
          autoComplete="name"
          placeholder="Pavan Kumar"
          value={formData.name}
          onChange={(e) => setFormData(d => ({...d, name: e.target.value}))}
          startIcon={<UserIcon className="w-4 h-4" />}
        />

        <Input 
          id="reg-email"
          label="Email address"
          type="email"
          required
          autoComplete="email"
          placeholder="name@company.com"
          value={formData.email}
          onChange={(e) => setFormData(d => ({...d, email: e.target.value}))}
          startIcon={<Mail className="w-4 h-4" />}
        />

        <Input 
          id="reg-pass"
          label="Password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="••••••••••••"
          value={formData.password}
          onChange={(e) => setFormData(d => ({...d, password: e.target.value}))}
          startIcon={<Lock className="w-4 h-4" />}
        />

        <Input 
          id="reg-confirm"
          label="Confirm password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="••••••••••••"
          value={formData.confirm}
          onChange={(e) => setFormData(d => ({...d, confirm: e.target.value}))}
          startIcon={<Lock className="w-4 h-4" />}
        />

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-start gap-2 text-left leading-relaxed">
            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="pt-1.5">
          {needsSignIn ? (
            <Button 
              type="button" 
              variant="secondary" 
              className="w-full" 
              onClick={() => onNavigate('login')}
            >
              Return to Sign In
            </Button>
          ) : (
            <Button 
              type="submit" 
              className="w-full font-semibold" 
              isLoading={isLoading}
              loadingText="Creating account..."
            >
              Continue to Face ID Setup
            </Button>
          )}
        </div>

        <p className="pt-1.5 text-center text-xs text-slate-400">
          Already registered?{' '}
          <button 
            type="button" 
            onClick={() => onNavigate('login')}
            className="font-medium text-slate-200 hover:text-indigo-300 transition-colors focus:outline-none focus-visible:underline"
          >
            Sign in
          </button>
        </p>
      </form>
    </AuthLayout>
  );
}
