import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  fullScreen?: boolean;
  className?: string;
}

export function Loading({ size = 'md', text, fullScreen = false, className }: LoadingProps) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  const content = (
    <div className={cn('flex flex-col items-center justify-center gap-3 animate-fade-in', className)}>
      <Loader2 className={cn('animate-spin text-primary-600', sizes[size])} />
      {text && <p className="text-sm text-gray-600 animate-pulse-soft">{text}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 animate-backdrop-enter">
        {content}
      </div>
    );
  }

  return content;
}

export function LoadingSpinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return <Loader2 className={cn('animate-spin text-primary-600', sizes[size], className)} />;
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden animate-skeleton-pulse hw-accelerate">
      {/* Header skeleton */}
      <div className="bg-gradient-to-r from-gray-300 to-gray-400 px-6 py-4 relative overflow-hidden">
        <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
        <div className="h-6 bg-gray-200 rounded w-3/4 mb-2 relative"></div>
        <div className="h-4 bg-gray-200/80 rounded w-1/2 relative"></div>
      </div>

      {/* Content skeleton */}
      <div className="p-6 space-y-3">
        {/* Price */}
        <div className="h-6 bg-gray-200 rounded w-1/3 pb-3 border-b border-gray-200 relative overflow-hidden">
          <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent"></div>
        </div>

        {/* Specs Grid */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="h-4 bg-gray-200 rounded relative overflow-hidden">
            <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" style={{ animationDelay: '100ms' }}></div>
          </div>
          <div className="h-4 bg-gray-200 rounded relative overflow-hidden">
            <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" style={{ animationDelay: '200ms' }}></div>
          </div>
          <div className="h-4 bg-gray-200 rounded relative overflow-hidden">
            <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" style={{ animationDelay: '300ms' }}></div>
          </div>
          <div className="h-4 bg-gray-200 rounded relative overflow-hidden">
            <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" style={{ animationDelay: '400ms' }}></div>
          </div>
        </div>

        {/* Details */}
        <div className="pt-3 border-t border-gray-200 space-y-2">
          <div className="h-4 bg-gray-200 rounded relative overflow-hidden">
            <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" style={{ animationDelay: '500ms' }}></div>
          </div>
          <div className="h-4 bg-gray-200 rounded relative overflow-hidden">
            <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" style={{ animationDelay: '600ms' }}></div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t border-gray-200">
          <div className="h-8 bg-gray-200 rounded flex-1 relative overflow-hidden">
            <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" style={{ animationDelay: '700ms' }}></div>
          </div>
          <div className="h-8 bg-gray-200 rounded flex-1 relative overflow-hidden">
            <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" style={{ animationDelay: '800ms' }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
          <SkeletonCard />
        </div>
      ))}
    </div>
  );
}
