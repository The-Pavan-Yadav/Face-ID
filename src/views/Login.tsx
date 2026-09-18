import React, { useState } from 'react';
import { ScanFace } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { db } from '../lib/db';
import { User } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
  onNavigate: (view: 'register' | 'face-login') => void;
}

export function Login({ onLogin, onNavigate }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const user = await db.loginWithPassword(email, password);
      onLogin(user);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout title="Sign in to Aura Identity" subtitle="Enter your details to access your account">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input 
          label="Email address"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="space-y-1">
          <Input 
            label="Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="flex justify-end pt-1">
            <button type="button" className="text-xs text-slate-500 hover:text-slate-900 font-medium transition-colors">
              Forgot password?
            </button>
          </div>
        </div>

        {error && <div className="text-sm text-red-600 font-medium">{error}</div>}

        <Button type="submit" className="w-full" isLoading={isLoading}>
          Sign in
        </Button>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-widest">
            <span className="bg-white px-3 text-slate-400 font-medium">OR</span>
          </div>
        </div>

        <Button 
          type="button" 
          variant="outline" 
          className="w-full flex items-center justify-center gap-2" 
          onClick={() => onNavigate('face-login')}
        >
          <ScanFace className="w-4 h-4 text-slate-500" />
          Sign in with face
        </Button>

        <p className="mt-8 text-center text-sm text-slate-500">
          Don't have an account?{' '}
          <button 
            type="button" 
            onClick={() => onNavigate('register')}
            className="font-medium text-slate-900 hover:underline transition-colors"
          >
            Create account
          </button>
        </p>
      </form>
    </AuthLayout>
  );
}
