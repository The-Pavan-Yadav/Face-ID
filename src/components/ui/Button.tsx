import React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'glow';
  isLoading?: boolean;
  loadingText?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    className, 
    variant = 'primary', 
    isLoading, 
    loadingText,
    children, 
    disabled, 
    ...props 
  }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "relative inline-flex items-center justify-center font-medium rounded-xl text-sm transition-all duration-200 select-none",
          "h-11 px-5 py-2.5",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080a12]",
          "disabled:pointer-events-none disabled:opacity-50",
          {
            // Primary 2026 Gradient
            'bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 text-white shadow-[0_4px_20px_rgba(99,102,241,0.28)] hover:shadow-[0_6px_28px_rgba(99,102,241,0.45)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] border border-indigo-400/20':
              variant === 'primary',
            
            // Secondary Dark Glass
            'bg-white/[0.05] hover:bg-white/[0.09] text-slate-200 border border-white/[0.08] hover:border-white/[0.15] active:scale-[0.98]':
              variant === 'secondary',
            
            // Subtle Outline
            'border border-white/10 hover:border-indigo-500/40 bg-transparent hover:bg-indigo-950/20 text-slate-300 hover:text-white active:scale-[0.98]':
              variant === 'outline',
            
            // Ghost
            'hover:bg-white/[0.06] text-slate-400 hover:text-slate-100':
              variant === 'ghost',

            // Glow
            'bg-indigo-950/50 border border-indigo-500/40 text-indigo-200 shadow-[0_0_20px_rgba(99,102,241,0.2)] hover:shadow-[0_0_25px_rgba(99,102,241,0.35)] hover:border-indigo-400':
              variant === 'glow',
          },
          className
        )}
        {...props}
      >
        {isLoading ? (
          <div className="flex items-center gap-2">
            <svg 
              className="animate-spin -ml-0.5 h-4 w-4 text-current" 
              xmlns="http://www.w3.org/2000/svg" 
              fill="none" 
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path 
                className="opacity-75" 
                fill="currentColor" 
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" 
              />
            </svg>
            <span>{loadingText || "Authenticating..."}</span>
          </div>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
