import React from 'react';
import { motion } from 'motion/react';
import { AmbientBackground } from './AmbientBackground';
import { AuraLogo } from './AuraLogo';
import { ShieldCheck, Lock } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  cardWidthClass?: string;
}

export function AuthLayout({ 
  children, 
  title, 
  subtitle,
  cardWidthClass = "max-w-[440px]"
}: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between py-3 sm:py-6 px-4 sm:px-6 font-sans text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* 1. Animated Ambient Living Background */}
      <AmbientBackground />

      {/* 2. Top Header Navigation / Brand Bar */}
      <header className="relative z-10 w-full max-w-5xl mx-auto flex items-center justify-between pb-2 sm:pb-3">
        <AuraLogo />
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-slate-400 bg-white/[0.03] border border-white/[0.06] px-3 py-1 rounded-full backdrop-blur-sm">
          <Lock className="w-3 h-3 text-indigo-400" />
          <span>ZERO-KNOWLEDGE AUTH</span>
        </div>
      </header>

      {/* 3. Centered Main Authentication Experience */}
      <main className="relative z-10 w-full flex flex-col items-center justify-center my-auto py-2 sm:py-3">
        <motion.div 
          initial={{ opacity: 0, y: 16, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className={`w-full ${cardWidthClass} mx-auto`}
        >
          {/* Main Floating Authentication Card with Subtle Edge Light */}
          <div className="relative rounded-[24px] sm:rounded-[28px] p-[1px] bg-gradient-to-b from-white/15 via-white/[0.05] to-white/[0.02] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_45px_rgba(99,102,241,0.08)] transition-all duration-300">
            
            {/* Top Micro Horizon Light */}
            <div className="absolute top-0 inset-x-12 h-[1px] bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent pointer-events-none" />

            {/* Inner Dark Surface with High Optical Clarity */}
            <div className="relative w-full rounded-[23px] sm:rounded-[27px] bg-[#0c0f1d]/90 backdrop-blur-2xl px-5 py-6 sm:px-8 sm:py-7 overflow-hidden">
              
              {/* Card Corner Subtle Technical Notch */}
              <div className="absolute top-3 right-4 flex items-center gap-1 opacity-20 pointer-events-none font-mono text-[9px] text-slate-400">
                <span>SEC-2026</span>
              </div>

              {/* Header Title & Subtitle with Staggered Entrance */}
              <div className="text-left mb-5">
                <motion.h1 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
                  className="text-2xl sm:text-[26px] font-bold tracking-tight text-slate-100"
                >
                  {title}
                </motion.h1>

                {subtitle && (
                  <motion.p 
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
                    className="mt-1 text-xs sm:text-sm text-slate-400 font-normal leading-relaxed"
                  >
                    {subtitle}
                  </motion.p>
                )}
              </div>

              {/* Card Body */}
              <div className="relative">
                {children}
              </div>
            </div>
          </div>
        </motion.div>
      </main>

      {/* 4. Bottom Security & Privacy Badge */}
      <footer className="relative z-10 w-full max-w-5xl mx-auto pt-3 sm:pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500 font-mono">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-400/80" />
          <span>Protected by AURA Neural Biometric Enclave</span>
        </div>
        <div className="flex items-center gap-4 text-slate-500">
          <span>256-Bit Hardware Encrypted</span>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline">ISO/IEC 30107-3 Liveness</span>
        </div>
      </footer>
    </div>
  );
}
