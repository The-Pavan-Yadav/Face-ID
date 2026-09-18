import React from 'react';

export function AmbientBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 bg-[#080a12]">
      {/* 1. Deep Midnight Base Radial Gradient */}
      <div 
        className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.18),rgba(8,10,18,0.95)_70%,#080a12_100%)]" 
      />

      {/* 2. Soft Ambient Color Orbs */}
      <div 
        className="absolute -top-32 -left-20 w-[500px] h-[500px] rounded-full bg-gradient-to-br from-indigo-600/25 via-violet-600/20 to-transparent blur-[120px] animate-orb-1"
      />
      <div 
        className="absolute top-1/3 -right-28 w-[540px] h-[540px] rounded-full bg-gradient-to-bl from-cyan-500/12 via-indigo-600/18 to-purple-900/20 blur-[130px] animate-orb-2"
      />
      <div 
        className="absolute -bottom-40 left-1/4 w-[460px] h-[460px] rounded-full bg-gradient-to-t from-violet-900/20 via-indigo-950/15 to-transparent blur-[110px]"
      />

      {/* 3. Subtle Central Radial Aura behind the Auth card */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-radial from-indigo-500/10 via-violet-600/5 to-transparent blur-[80px]" />

      {/* 4. Fine Technical Lattice / Micro-Grid Matrix */}
      <div 
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.45) 1px, transparent 1px)`,
          backgroundSize: '32px 32px'
        }}
      />

      {/* 5. Subtle Floating Micro-Particles */}
      <div className="absolute inset-0">
        <span 
          className="absolute top-[18%] left-[15%] w-1 h-1 rounded-full bg-cyan-400/40 shadow-[0_0_8px_rgba(34,211,238,0.6)]"
          style={{ animation: 'particleFloat 12s ease-in-out infinite 1s' }}
        />
        <span 
          className="absolute top-[32%] right-[18%] w-1.5 h-1.5 rounded-full bg-violet-400/35 shadow-[0_0_8px_rgba(139,92,246,0.6)]"
          style={{ animation: 'particleFloat 15s ease-in-out infinite 3s' }}
        />
        <span 
          className="absolute bottom-[24%] left-[22%] w-1 h-1 rounded-full bg-indigo-400/35 shadow-[0_0_6px_rgba(99,102,241,0.5)]"
          style={{ animation: 'particleFloat 14s ease-in-out infinite 2s' }}
        />
        <span 
          className="absolute top-[68%] right-[25%] w-1 h-1 rounded-full bg-cyan-300/30 shadow-[0_0_8px_rgba(34,211,238,0.5)]"
          style={{ animation: 'particleFloat 18s ease-in-out infinite 5s' }}
        />
      </div>

      {/* 6. Subtle Vignette Border */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(8,10,18,0.4)_75%,rgba(8,10,18,0.9)_100%)] pointer-events-none" />
    </div>
  );
}
