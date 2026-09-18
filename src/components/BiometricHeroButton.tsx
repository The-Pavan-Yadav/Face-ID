import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Scan, Sparkles } from 'lucide-react';

interface BiometricHeroButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function BiometricHeroButton({ onClick, disabled }: BiometricHeroButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative w-full overflow-hidden rounded-2xl p-[1px] text-left transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 disabled:opacity-50 disabled:pointer-events-none"
    >
      {/* 1. Subtle Animated Gradient Border */}
      <div 
        className={`absolute -inset-px rounded-2xl bg-gradient-to-r from-cyan-500/40 via-indigo-500/50 to-violet-500/40 transition-opacity duration-300 ${
          isHovered ? 'opacity-100 blur-[1px]' : 'opacity-60'
        }`}
      />

      {/* 2. Soft Ambient Radial Glow Behind Button on Hover */}
      <div 
        className={`absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-indigo-500/15 to-violet-500/10 transition-opacity duration-300 pointer-events-none ${
          isHovered ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* 3. Button Body Surface */}
      <div className="relative flex items-center justify-between w-full h-[62px] px-4 sm:px-5 rounded-[15px] bg-gradient-to-r from-[#0b0e1c] via-[#0e1328] to-[#0b0e1c] border border-white/[0.06] transition-transform duration-200 active:scale-[0.985]">
        
        {/* Left Side: Animated Face ID Biometric Icon + Labels */}
        <div className="flex items-center gap-3.5">
          {/* Biometric Icon Aperture */}
          <div className="relative w-10 h-10 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-center overflow-hidden shadow-[0_0_12px_rgba(99,102,241,0.2)]">
            {/* Animated Laser Scanning Line inside the icon */}
            <div className="absolute inset-x-1 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-scan-laser shadow-[0_0_8px_#22d3ee]" />

            {/* Futuristic Face ID Icon SVG */}
            <svg 
              viewBox="0 0 24 24" 
              fill="none" 
              className={`w-5 h-5 text-indigo-300 transition-transform duration-300 ${isHovered ? 'scale-110 text-cyan-300' : ''}`}
            >
              {/* Corner brackets */}
              <path d="M4 8V5C4 4.44772 4.44772 4 5 4H8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <path d="M16 4H19C19.5523 4 20 4.44772 20 5V8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <path d="M20 16V19C20 19.5523 19.5523 20 19 20H16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <path d="M8 20H5C4.44772 20 4 19.5523 4 19V16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              {/* Face silhouette dots / facial landmarks */}
              <circle cx="9" cy="9.5" r="1" fill="currentColor" />
              <circle cx="15" cy="9.5" r="1" fill="currentColor" />
              <path d="M12 11.5V13.5H11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M9.5 16C10.2 16.8 11 17 12 17C13 17 13.8 16.8 14.5 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>

          {/* Label & Description */}
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-wide text-slate-100 group-hover:text-white flex items-center gap-1.5 transition-colors">
              Sign in with Face
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            </span>
            <span className="text-[11px] font-mono tracking-wider text-slate-400 group-hover:text-indigo-300/90 transition-colors">
              Fast, passwordless biometric pass
            </span>
          </div>
        </div>

        {/* Right Side: Biometric Corner Reticle indicator */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-950/40 border border-cyan-500/30 text-[10px] font-mono text-cyan-300">
            <Scan className="w-3 h-3" />
            <span>AI SCAN</span>
          </div>

          <div className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 group-hover:text-cyan-300 group-hover:translate-x-0.5 transition-all">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 stroke-current stroke-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        </div>

        {/* Precision Corner Accent Marks */}
        <div className={`absolute top-1 left-1 w-2 h-2 border-t-2 border-l-2 border-cyan-400/60 rounded-tl-sm transition-all duration-300 ${isHovered ? 'w-3 h-3 border-cyan-300 shadow-[0_0_8px_#22d3ee]' : ''}`} />
        <div className={`absolute top-1 right-1 w-2 h-2 border-t-2 border-r-2 border-cyan-400/60 rounded-tr-sm transition-all duration-300 ${isHovered ? 'w-3 h-3 border-cyan-300 shadow-[0_0_8px_#22d3ee]' : ''}`} />
        <div className={`absolute bottom-1 left-1 w-2 h-2 border-b-2 border-l-2 border-cyan-400/60 rounded-bl-sm transition-all duration-300 ${isHovered ? 'w-3 h-3 border-cyan-300 shadow-[0_0_8px_#22d3ee]' : ''}`} />
        <div className={`absolute bottom-1 right-1 w-2 h-2 border-b-2 border-r-2 border-cyan-400/60 rounded-br-sm transition-all duration-300 ${isHovered ? 'w-3 h-3 border-cyan-300 shadow-[0_0_8px_#22d3ee]' : ''}`} />
      </div>
    </button>
  );
}
