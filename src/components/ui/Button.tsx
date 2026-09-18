import React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
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
          "relative inline-flex items-center justify-center font-medium rounded-xl text-sm select-none transition-all duration-150",
          "h-11 px-5 py-2.5",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17191D]/30 focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
          {
            // Primary Solid Charcoal (Apple / Linear / Stripe high-end SaaS)
            'bg-[#17191D] hover:bg-[#25282E] text-white shadow-[0_2px_6px_rgba(23,25,29,0.12)] hover:shadow-[0_4px_12px_rgba(23,25,29,0.16)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]':
              variant === 'primary',
            
            // Secondary Clean Light
            'bg-white hover:bg-slate-50 text-[#111318] border border-[#E4E6EA] hover:border-[#D0D4DC] shadow-sm active:scale-[0.98]':
              variant === 'secondary',
            
            // Subtle Outline
            'border border-[#E4E6EA] hover:border-slate-400 bg-transparent hover:bg-slate-50 text-[#111318] active:scale-[0.98]':
              variant === 'outline',
            
            // Ghost
            'hover:bg-slate-100 text-[#626873] hover:text-[#111318]':
              variant === 'ghost',
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
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path 
                className="opacity-90" 
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
