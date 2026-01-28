'use client';

import React from 'react';
import Image from 'next/image';
import clsx from 'clsx';

interface MoanaLogoIconProps {
  className?: string;
  alt?: string;
}

export function MoanaLogoIcon({ className, alt = '' }: MoanaLogoIconProps) {
  return (
    <Image
      src="/branding/moana-logo.jpg"
      alt={alt}
      aria-hidden={alt.length === 0}
      width={16}
      height={16}
      className={clsx('h-4 w-4 rounded-full object-cover', className)}
    />
  );
}
