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
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`flex items-center justify-between gap-4 select-none ${className}`}
    >
      <div className="flex items-center gap-3">
        {/* Minimal Dark Geometric A Logo Mark */}
        <div className="w-8 h-8 rounded-lg bg-[#17191D] flex items-center justify-center text-white shadow-sm">
          <svg 
            viewBox="0 0 24 24" 
            fill="none" 
            className="w-4 h-4"
          >
            <path 
              d="M12 4L5 19H9.2L10.7 15.5H13.3L14.8 19H19L12 4Z" 
              fill="white" 
            />
            <path 
              d="M11.3 12.8L12 10.3L12.7 12.8H11.3Z" 
              fill="#17191D" 
            />
          </svg>
        </div>

        {/* Minimal Wordmark */}
        <div className="flex items-baseline gap-1.5">
          <span className="font-semibold text-sm tracking-[0.14em] text-[#111318] font-sans">
            AURA
          </span>
          <span className="font-normal text-[11px] tracking-[0.18em] text-[#626873] uppercase">
            IDENTITY
          </span>
        </div>
      </div>

      {/* Clean, Restrained Security Badge */}
      {showBadge && (
        <div className="hidden xs:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100/90 border border-[#E4E6EA] text-[11px] font-mono text-[#626873]">
          <ShieldCheck className="w-3 h-3 text-slate-700" />
          <span className="tracking-wide">FIPS-READY</span>
        </div>
      )}
    </motion.div>
  );
}
