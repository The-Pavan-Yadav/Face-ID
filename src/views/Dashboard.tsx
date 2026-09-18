import React from 'react';
import { User } from '../types';
import { Button } from '../components/ui/Button';
import { AuraLogo } from '../components/AuraLogo';
import { AmbientBackground } from '../components/AmbientBackground';
import { ShieldCheck, LogOut, CheckCircle2, User as UserIcon, Mail, Calendar, Key } from 'lucide-react';

interface DashboardProps {
  user: User;
  onSignOut: () => void;
}

export function Dashboard({ user, onSignOut }: DashboardProps) {
  const isEnrolled = !!(user.faceDescriptor && user.faceDescriptor.length === 128);

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#111318] font-sans relative flex flex-col justify-between">
      <AmbientBackground />

      {/* Header */}
      <header className="relative z-10 border-b border-[#E4E6EA] bg-white/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <AuraLogo />
          <Button 
            variant="ghost" 
            className="text-xs sm:text-sm flex items-center gap-2 text-[#626873] hover:text-[#111318]" 
            onClick={onSignOut}
          >
            <LogOut className="w-4 h-4 text-[#626873]" />
            <span>Sign out</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 w-full my-auto">
        <div className="space-y-6">
          {/* Welcome Heading */}
          <div className="space-y-2 text-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-mono">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>SESSION ACTIVE • SEC-2026</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#111318]">
              Welcome back, {user.name}.
            </h1>
            <p className="text-sm text-[#626873]">
              Authenticated securely via AURA Zero-Knowledge Identity Enclave.
            </p>
          </div>

          {/* Account Credentials Card */}
          <div className="rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_4px_24px_-4px_rgba(17,19,24,0.06)] p-6 sm:p-7 space-y-6 text-left">
            <div className="flex items-center justify-between border-b border-[#E4E6EA] pb-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#111318] uppercase tracking-wider font-mono">
                <Key className="w-3.5 h-3.5 text-[#17191D]" />
                <span>Identity Credentials</span>
              </div>
              <span className="text-[11px] font-mono text-[#626873] bg-slate-100 border border-[#E4E6EA] px-2.5 py-0.5 rounded-full">
                UID: {user.uid?.slice(0, 8)}...
              </span>
            </div>

            <dl className="divide-y divide-[#E4E6EA] text-sm">
              <div className="py-3.5 flex items-center justify-between">
                <dt className="text-[#626873] flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-[#8E95A2]" />
                  <span>Display name</span>
                </dt>
                <dd className="text-[#111318] font-medium">{user.name}</dd>
              </div>

              <div className="py-3.5 flex items-center justify-between">
                <dt className="text-[#626873] flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#8E95A2]" />
                  <span>Email address</span>
                </dt>
                <dd className="text-[#111318] font-mono text-xs">{user.email}</dd>
              </div>

              <div className="py-3.5 flex items-center justify-between">
                <dt className="text-[#626873] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#8E95A2]" />
                  <span>Biometric Face ID</span>
                </dt>
                <dd className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isEnrolled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <span className={isEnrolled ? 'text-emerald-700 font-mono text-xs font-medium' : 'text-[#626873] text-xs'}>
                    {isEnrolled ? '128-D Enclave Enrolled' : 'Not enrolled'}
                  </span>
                </dd>
              </div>

              <div className="py-3.5 flex items-center justify-between">
                <dt className="text-[#626873] flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#8E95A2]" />
                  <span>Account created</span>
                </dt>
                <dd className="text-[#626873] font-mono text-xs">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Active'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[#E4E6EA] py-4 text-center text-xs text-[#8E95A2] font-mono bg-white/50">
        AURA Neural Biometric Security Core • 2026 Edition
      </footer>
    </div>
  );
}
