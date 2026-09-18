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
  cardWidthClass = "max-w-[430px]"
}: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between py-4 sm:py-7 px-4 sm:px-6 font-sans text-[#111318] selection:bg-slate-200 selection:text-[#111318]">
      {/* 1. Calm, Subconscious Living Background */}
      <AmbientBackground />

      {/* 2. Top Header Navigation / Brand Bar */}
      <header className="relative z-10 w-full max-w-4xl mx-auto flex items-center justify-between pb-3">
        <AuraLogo />
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-[#626873] bg-white border border-[#E4E6EA] px-3 py-1 rounded-full shadow-xs">
          <Lock className="w-3 h-3 text-[#17191D]" />
          <span>ZERO-KNOWLEDGE AUTH</span>
        </div>
      </header>

      {/* 3. Centered Main Authentication Card (Apple / Linear Settings Style) */}
      <main className="relative z-10 w-full flex flex-col items-center justify-center my-auto py-2 sm:py-4">
        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className={`w-full ${cardWidthClass} mx-auto`}
        >
          <div className="relative w-full rounded-[22px] bg-white border border-[#E5E7EB] shadow-[0_6px_28px_-4px_rgba(17,19,24,0.06),0_2px_8px_-1px_rgba(17,19,24,0.03)] px-6 py-7 sm:px-8 sm:py-8 overflow-hidden text-left">
            
            {/* Header Title & Subtitle */}
            <div className="mb-6">
              <motion.h1 
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="text-2xl sm:text-[26px] font-semibold tracking-tight text-[#111318]"
              >
                {title}
              </motion.h1>

              {subtitle && (
                <motion.p 
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-1 text-xs sm:text-sm text-[#626873] font-normal leading-relaxed"
                >
                  {subtitle}
                </motion.p>
              )}
            </div>

            {/* Card Body Content */}
            <div>
              {children}
            </div>
          </div>
        </motion.div>
      </main>

      {/* 4. Bottom Security & Compliance Footer */}
      <footer className="relative z-10 w-full max-w-4xl mx-auto pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-[#626873]">
        <div className="flex items-center gap-1.5 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-[#17191D]" />
          <span>Protected by AURA Identity Enclave</span>
        </div>
        <div className="flex items-center gap-3 text-[#8E95A2] font-mono">
          <span>256-Bit Encrypted</span>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline">ISO/IEC 30107-3 Liveness</span>
        </div>
      </footer>
    </div>
  );
}
