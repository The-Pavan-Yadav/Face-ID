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
                "text-xs font-medium tracking-tight transition-colors duration-150 select-none",
                isFocused ? "text-[#111318]" : "text-[#626873]",
                error && "text-rose-600"
              )}
            >
              {label}
            </label>
            {hint && (
              <span className="text-[11px] text-[#8E95A2]">{hint}</span>
            )}
          </div>
        )}

        <div 
          className={cn(
            "relative flex items-center w-full rounded-xl transition-all duration-150 border bg-white",
            isFocused 
              ? "border-[#17191D] ring-1 ring-[#17191D]/10 shadow-sm" 
              : "border-[#E4E6EA] hover:border-[#D0D4DC]",
            error && "border-rose-500 ring-1 ring-rose-500/20"
          )}
        >
          {startIcon && (
            <div 
              className={cn(
                "pl-3.5 pr-1 flex items-center pointer-events-none transition-colors duration-150",
                isFocused ? "text-[#111318]" : "text-[#8E95A2]"
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
              "flex h-11 w-full bg-transparent px-3.5 py-2 text-sm text-[#111318] placeholder:text-[#8E95A2]",
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
              className="absolute right-3 p-1 rounded-md text-[#8E95A2] hover:text-[#111318] focus:outline-none transition-colors"
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
          <p className="text-xs text-rose-600 flex items-center gap-1 mt-1 font-medium">
            <span>•</span> {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
