import { useMemo, useState } from 'react';
import { useReducedMotion } from '../motion/useReducedMotion';
import { blurhashDataUrl } from './blurhashCache';

export interface BlurHashImageProps {
  src?: string;
  blurhash?: string;
  width: number;
  height: number;
  alt: string;
  className?: string;
}

function ImageOffIcon() {
  return (
    <svg data-testid="image-off" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 3l18 18M21 15V5a2 2 0 0 0-2-2H9M3 9v10a2 2 0 0 0 2 2h12" />
    </svg>
  );
}

/** A fixed-size box showing the BlurHash until the image loads; an icon (no Toast) when it fails (R66). */
export function BlurHashImage({ src, blurhash, width, height, alt, className = '' }: BlurHashImageProps) {
  const reduced = useReducedMotion();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const placeholder = useMemo(() => (blurhash ? blurhashDataUrl(blurhash) : null), [blurhash]);
  const showImage = src !== undefined && !failed;
  return (
    <div
      className={`relative overflow-hidden rounded-continuous bg-surface-2 text-muted ${className}`}
      style={{ aspectRatio: `${width} / ${height}`, width: '100%', maxWidth: width }}
    >
      {placeholder ? (
        <img src={placeholder} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <svg data-testid="neutral-placeholder" viewBox="0 0 10 10" className="absolute inset-0 h-full w-full" aria-hidden="true" preserveAspectRatio="none">
          <rect width="10" height="10" fill="currentColor" opacity="0.15" />
        </svg>
      )}
      {showImage ? (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: loaded ? 1 : 0, transition: reduced ? 'none' : 'opacity 200ms linear' }}
        />
      ) : (
        <div role="img" aria-label={alt} className="absolute inset-0 flex items-center justify-center">
          <ImageOffIcon />
        </div>
      )}
    </div>
  );
}
