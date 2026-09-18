import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck } from 'lucide-react';

interface AuraLogoProps {
  className?: string;
  showBadge?: boolean;
}

export function AuraLogo({ className = '', showBadge = true }: AuraLogoProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={`flex items-center justify-between gap-4 select-none ${className}`}
    >
      <div className="flex items-center gap-3.5">
        {/* Minimal rounded-square A icon with subtle animated gradient border */}
        <div className="relative group">
          <div className="absolute -inset-[1px] rounded-xl bg-gradient-to-tr from-indigo-500/60 via-violet-500/40 to-cyan-400/50 opacity-80 group-hover:opacity-100 blur-[1px] transition-opacity duration-500" />
          
          <div className="relative w-9 h-9 rounded-xl bg-[#0b0e1b] flex items-center justify-center border border-white/10 shadow-[0_2px_12px_rgba(99,102,241,0.25)]">
            <svg 
              viewBox="0 0 24 24" 
              fill="none" 
              className="w-5 h-5 drop-shadow-[0_1px_4px_rgba(99,102,241,0.5)]"
            >
              <path 
                d="M12 3.5L4.5 19.5H8.8L10.3 15.5H13.7L15.2 19.5H19.5L12 3.5Z" 
                fill="url(#aura-logo-grad)" 
              />
              <path 
                d="M11.1 13.2L12 10.4L12.9 13.2H11.1Z" 
                fill="#0b0e1b" 
              />
              <defs>
                <linearGradient id="aura-logo-grad" x1="4.5" y1="3.5" x2="19.5" y2="19.5" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#F8FAFC" />
                  <stop offset="0.5" stopColor="#A5B4FC" />
                  <stop offset="1" stopColor="#38BDF8" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* Brand Text */}
        <motion.div 
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col text-left"
        >
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm tracking-[0.22em] text-slate-100 font-mono">
              AURA
            </span>
            <span className="font-light text-xs tracking-[0.26em] text-indigo-300/80 uppercase">
              IDENTITY
            </span>
          </div>
          <span className="text-[10px] tracking-wider text-slate-400/80 font-mono">
            BIOMETRIC ENCLAVE
          </span>
        </motion.div>
      </div>

      {/* Security Status Beacon */}
      {showBadge && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="hidden xs:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-950/40 border border-indigo-500/20 text-[11px] font-mono text-indigo-300/90 backdrop-blur-sm"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
          </span>
          <span className="tracking-wide">FIPS-READY</span>
        </motion.div>
      )}
    </motion.div>
  );
}
