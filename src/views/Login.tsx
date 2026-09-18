import React, { useState } from 'react';
import { Mail, Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { BiometricHeroButton } from '../components/BiometricHeroButton';
import { ForgotPasswordModal } from '../components/ForgotPasswordModal';
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
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setError('');
    setIsLoading(true);

    try {
      const user = await db.loginWithPassword(email.trim(), password);
      onLogin(user);
    } catch (err: any) {
      console.warn("Login attempt error:", err.message);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setError('Invalid email or password. Please verify your credentials.');
      } else if (err.code === 'auth/user-not-found') {
        setError('No account found with this email. Please create an account.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Access temporarily disabled due to many failed attempts. Try again later or reset password.');
      } else {
        setError(err.message || 'Authentication failed. Please check your network.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFaceIdClick = () => {
    onNavigate('face-login');
  };

  return (
    <AuthLayout 
      title="Welcome back." 
      subtitle="Authenticate securely with AURA."
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* Email Address */}
        <Input 
          id="login-email"
          label="Email address"
          type="email"
          required
          autoComplete="email"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          startIcon={<Mail className="w-4 h-4" />}
        />

        {/* Password */}
        <div className="space-y-1">
          <Input 
            id="login-password"
            label="Password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            startIcon={<Lock className="w-4 h-4" />}
          />
          
          <div className="flex justify-end pt-0.5">
            <button 
              type="button" 
              onClick={() => setIsForgotModalOpen(true)}
              className="text-xs text-slate-400 hover:text-indigo-300 font-medium transition-colors duration-200 focus:outline-none focus-visible:underline"
            >
              Forgot password?
            </button>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-start gap-2 text-left leading-relaxed"
          >
            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5" />
            <span>{error}</span>
          </motion.div>
        )}

        {/* Primary Sign-in Button */}
        <div className="pt-0.5">
          <Button 
            type="submit" 
            className="w-full text-sm font-semibold tracking-wide" 
            isLoading={isLoading}
            loadingText="Authenticating..."
          >
            Sign in
          </Button>
        </div>

        {/* Technical Divider */}
        <div className="relative my-3.5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/[0.08]" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-[0.25em]">
            <span className="bg-[#0c0f1d] px-3 text-slate-400 font-mono">OR CONTINUE WITH</span>
          </div>
        </div>

        {/* HERO FEATURE: Biometric Face ID Button */}
        <div className="pt-0.5">
          <BiometricHeroButton 
            onClick={handleFaceIdClick}
            disabled={isLoading}
          />
        </div>

        {/* Registration Link */}
        <p className="pt-2 text-center text-xs text-slate-400">
          Don't have an account?{' '}
          <button 
            type="button" 
            onClick={() => onNavigate('register')}
            className="font-medium text-slate-200 hover:text-indigo-300 transition-colors focus:outline-none focus-visible:underline"
          >
            Create account
          </button>
        </p>
      </form>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
        defaultEmail={email}
      />
    </AuthLayout>
  );
}
