import React from 'react';

export function AmbientBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 bg-[#F7F8FA]">
      {/* 1. Base Very Soft Radial Gradient */}
      <div 
        className="absolute inset-0 bg-[radial-gradient(ellipse_100%_100%_at_50%_0%,#FFFFFF_0%,#F7F8FA_65%,#F0F2F5_100%)]" 
      />

      {/* 2. Barely-Visible Soft Cool Gray / Slate Ambient Diffusers (15-30s slow drift) */}
      <div 
        className="absolute -top-40 -left-20 w-[600px] h-[600px] rounded-full bg-slate-200/40 blur-[130px] animate-ambient-a pointer-events-none"
      />
      
      <div 
        className="absolute top-1/3 -right-24 w-[550px] h-[550px] rounded-full bg-slate-200/35 blur-[140px] animate-ambient-b pointer-events-none"
      />

      {/* 3. Extremely subtle centered light pool behind the authentication card */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-white/70 blur-[90px] pointer-events-none" />

      {/* 4. Ultra-fine micro-dot lattice for tactile optical texture (subtle, 0.02 opacity) */}
      <div 
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(#111318 1px, transparent 1px)`,
          backgroundSize: '28px 28px'
        }}
      />
    </div>
  );
}
