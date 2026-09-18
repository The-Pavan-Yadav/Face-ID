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
    <div className="min-h-screen bg-[#080a12] text-slate-100 font-sans relative flex flex-col justify-between">
      <AmbientBackground />

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.08] bg-[#080a12]/60 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <AuraLogo />
          <Button 
            variant="ghost" 
            className="text-xs sm:text-sm flex items-center gap-2 hover:bg-white/5" 
            onClick={onSignOut}
          >
            <LogOut className="w-4 h-4 text-slate-400" />
            <span>Sign out</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 w-full my-auto">
        <div className="space-y-6">
          {/* Welcome Heading */}
          <div className="space-y-2 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>SESSION ACTIVE • SEC-2026</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Welcome back, {user.name}.
            </h1>
            <p className="text-sm text-slate-400">
              Authenticated securely via AURA Zero-Knowledge Identity Enclave.
            </p>
          </div>

          {/* Account Credentials Card */}
          <div className="rounded-2xl p-[1px] bg-gradient-to-b from-white/15 via-white/[0.05] to-transparent shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
            <div className="rounded-[15px] bg-[#0d1020]/90 backdrop-blur-xl p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono">
                  <Key className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Credential Details</span>
                </div>
                <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-500/20 px-2.5 py-0.5 rounded-full">
                  UID: {user.uid?.slice(0, 8)}...
                </span>
              </div>

              <dl className="divide-y divide-white/[0.06] text-sm">
                <div className="py-3.5 flex items-center justify-between">
                  <dt className="text-slate-400 flex items-center gap-2">
                    <UserIcon className="w-4 h-4 text-slate-500" />
                    <span>Display name</span>
                  </dt>
                  <dd className="text-slate-100 font-medium">{user.name}</dd>
                </div>

                <div className="py-3.5 flex items-center justify-between">
                  <dt className="text-slate-400 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-500" />
                    <span>Email address</span>
                  </dt>
                  <dd className="text-slate-100 font-mono text-xs">{user.email}</dd>
                </div>

                <div className="py-3.5 flex items-center justify-between">
                  <dt className="text-slate-400 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-slate-500" />
                    <span>Biometric Face ID</span>
                  </dt>
                  <dd className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isEnrolled ? 'bg-cyan-400 animate-pulse' : 'bg-slate-500'}`} />
                    <span className={isEnrolled ? 'text-cyan-300 font-mono text-xs' : 'text-slate-400 text-xs'}>
                      {isEnrolled ? '128-D Enclave Enrolled' : 'Not enrolled'}
                    </span>
                  </dd>
                </div>

                <div className="py-3.5 flex items-center justify-between">
                  <dt className="text-slate-400 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-500" />
                    <span>Account created</span>
                  </dt>
                  <dd className="text-slate-400 font-mono text-xs">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Active'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] py-4 text-center text-xs text-slate-500 font-mono">
        AURA Neural Biometric Security Core • 2026 Edition
      </footer>
    </div>
  );
}
