import React, { useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, type = 'text', id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const [isFocused, setIsFocused] = useState(false);

    return (
      <div className="w-full group">
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              'block text-xs font-semibold mb-2 transition-colors duration-200 tracking-wide uppercase',
              isFocused ? 'text-secondary-400' : 'text-primary-300/70',
              error && 'text-red-400'
            )}
          >
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={type}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
            className={cn(
              'flex h-11 w-full rounded-lg border px-4 py-2 text-sm',
              'bg-white/5 backdrop-blur-sm', 
              'border-white/10',
              'placeholder:text-gray-500',
              'transition-all duration-300 ease-out',
              'focus:outline-none focus:ring-4',
              'disabled:cursor-not-allowed disabled:opacity-50',
              error ? 'border-red-500/50 focus:ring-red-500/10' : 'focus:border-secondary-500/50 focus:ring-secondary-500/10 hover:border-white/20',
              className
            )}
            {...props}
          />
          {/* Animated border bottom for focus state */}
          <div 
            className={cn(
              "absolute bottom-0 left-0 h-[1px] bg-secondary-500 transition-all duration-300 ease-out",
              isFocused ? "w-full opacity-100" : "w-0 opacity-0",
              error && "bg-red-500"
            )} 
          />
        </div>
        
        <AnimatePresence mode="wait">
          {error && (
            <motion.p 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="mt-1.5 text-xs text-red-400 font-medium flex items-center gap-1"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
        
        {helperText && !error && (
          <p className="mt-1.5 text-xs text-gray-400">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };