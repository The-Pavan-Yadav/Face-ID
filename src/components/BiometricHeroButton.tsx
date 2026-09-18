import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

interface BiometricHeroButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isModelReady?: boolean;
}

export function BiometricHeroButton({ onClick, disabled, isModelReady = false }: BiometricHeroButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative w-full rounded-2xl bg-white border border-[#E4E6EA] hover:border-[#CBD5E1] hover:bg-slate-50/70 p-3 sm:p-3.5 text-left transition-all duration-200 shadow-sm hover:shadow active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#17191D]/20 disabled:opacity-50 disabled:pointer-events-none"
    >
      <div className="flex items-center justify-between gap-3 w-full">
        {/* Left Side: Face ID Icon & Typography */}
        <div className="flex items-center gap-3">
          {/* Apple-style Face ID Biometric Icon */}
          <div className="relative w-11 h-11 rounded-xl bg-slate-100/90 border border-[#E4E6EA] flex items-center justify-center overflow-hidden shrink-0 transition-colors duration-200 group-hover:bg-slate-200/60">
            {/* Subtle graphite scanning sweep line (No glow, no neon) */}
            <div 
              className={`absolute inset-x-1.5 h-[1.5px] bg-slate-400/80 transition-opacity duration-200 pointer-events-none ${
                isHovered ? 'animate-subtle-scan opacity-80' : 'opacity-0'
              }`} 
            />

            {/* Face ID Geometry SVG */}
            <svg 
              viewBox="0 0 24 24" 
              fill="none" 
              className={`w-5 h-5 text-[#17191D] transition-transform duration-200 ${isHovered ? 'scale-105 text-[#111318]' : ''}`}
            >
              {/* Corner brackets */}
              <path d="M4 8V5C4 4.44772 4.44772 4 5 4H8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <path d="M16 4H19C19.5523 4 20 4.44772 20 5V8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <path d="M20 16V19C20 19.5523 19.5523 20 19 20H16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <path d="M8 20H5C4.44772 20 4 19.5523 4 19V16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              {/* Face landmarks */}
              <circle cx="9" cy="9.5" r="1" fill="currentColor" />
              <circle cx="15" cy="9.5" r="1" fill="currentColor" />
              <path d="M12 11.5V13.5H11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M9.5 16C10.2 16.8 11 17 12 17C13 17 13.8 16.8 14.5 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>

          {/* Typography & Background Model Status (Requirement 1) */}
          <div className="flex flex-col text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight text-[#111318] group-hover:text-black transition-colors">
                Sign in with Face
              </span>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono tracking-tight transition-colors duration-200 ${
                isModelReady 
                  ? 'text-emerald-700 bg-emerald-50 border border-emerald-200/60' 
                  : 'text-amber-700 bg-amber-50 border border-amber-200/60'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isModelReady ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
                <span>{isModelReady ? 'Face ID ready' : 'Preparing Face ID...'}</span>
              </span>
            </div>
            <span className="text-xs text-[#626873] leading-snug">
              Fast, passwordless biometric authentication
            </span>
          </div>
        </div>

        {/* Right Side: Subtle Arrow that moves 2-3px on hover */}
        <div className="pr-1 text-[#8E95A2] group-hover:text-[#111318] group-hover:translate-x-1 transition-all duration-200 shrink-0">
          <ChevronRight className="w-4 h-4 stroke-[2]" />
        </div>
      </div>
    </button>
  );
}
