import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  startIcon?: React.ReactNode;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', label, error, startIcon, hint, id, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const isPassword = type === 'password';
    const effectiveType = isPassword ? (showPassword ? 'text' : 'password') : type;

    return (
      <div className="space-y-1.5 w-full text-left">
        {label && (
          <div className="flex items-center justify-between">
            <label 
              htmlFor={inputId}
              className={cn(
                "text-xs font-medium tracking-wide transition-colors duration-200 select-none",
                isFocused ? "text-indigo-300" : "text-slate-300",
                error && "text-rose-400"
              )}
            >
              {label}
            </label>
            {hint && (
              <span className="text-[11px] text-slate-500">{hint}</span>
            )}
          </div>
        )}

        <div 
          className={cn(
            "relative flex items-center w-full rounded-xl transition-all duration-200 border",
            "bg-[#0d1020]/50 backdrop-blur-md",
            isFocused 
              ? "border-indigo-500/70 shadow-[0_0_16px_rgba(99,102,241,0.22)] bg-[#0d1020]/80" 
              : "border-white/[0.08] hover:border-white/[0.14]",
            error && "border-rose-500/80 shadow-[0_0_12px_rgba(244,63,94,0.2)]"
          )}
        >
          {startIcon && (
            <div 
              className={cn(
                "pl-3.5 pr-1 flex items-center pointer-events-none transition-colors duration-200",
                isFocused ? "text-indigo-400" : "text-slate-400"
              )}
            >
              {startIcon}
            </div>
          )}

          <input
            id={inputId}
            type={effectiveType}
            ref={ref}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
            className={cn(
              "flex h-11 w-full bg-transparent px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500",
              "focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 font-normal",
              startIcon && "pl-2",
              isPassword && "pr-10",
              className
            )}
            {...props}
          />

          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 p-1 rounded-md text-slate-400 hover:text-slate-200 focus:outline-none focus:text-indigo-300 transition-colors"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {error && (
          <p className="text-xs text-rose-400 flex items-center gap-1 mt-1 font-medium">
            <span>•</span> {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
