import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading = false, disabled, children, ...props }, ref) => {
    
    const baseStyles = 'inline-flex items-center justify-center rounded-lg font-bold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 relative overflow-hidden active:scale-[0.98] uppercase tracking-wider';

    const variants = {
      primary: 'bg-primary-900 text-white hover:bg-primary-800 shadow-lg shadow-primary-900/20 border border-white/5 hover:border-white/10',
      secondary: 'bg-gradient-to-r from-secondary-600 to-secondary-500 text-white hover:to-secondary-400 shadow-lg shadow-secondary-500/20 border border-white/10',
      danger: 'bg-red-600/90 text-white hover:bg-red-600 shadow-lg shadow-red-500/20 backdrop-blur-sm',
      ghost: 'bg-transparent hover:bg-white/5 text-primary-200 hover:text-white',
      glass: 'bg-white/10 backdrop-blur-md border border-white/10 text-white hover:bg-white/20 shadow-lg'
    };

    const sizes = {
      sm: 'h-8 px-4 text-xs',
      md: 'h-10 px-6 text-xs',
      lg: 'h-12 px-8 text-sm',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {/* Shine effect on hover */}
        <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent z-0" />
        
        <div className="relative z-10 flex items-center gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {children}
        </div>
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };