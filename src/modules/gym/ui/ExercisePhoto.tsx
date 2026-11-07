import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import type { ImageRecord } from '../../../core/backup/base64';
import { db } from '../../../core/db/db';
import { BlurHashImage } from '../../../ui/image/BlurHashImage';
import { GYM_TABLES } from '../data/backup';
import type { Exercise } from '../types';

type Photo = Exercise['photos'][number];

/** Object URL of a stored image; revoked when the image changes or the component unmounts. */
function useStoredImageUrl(imageId: string | undefined): string | undefined {
  const record = useLiveQuery(async () => (imageId === undefined ? undefined : await db.table<ImageRecord>(GYM_TABLES.images).get(imageId)), [imageId]);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (record === undefined) {
      setUrl(undefined);
      return undefined;
    }
    const next = URL.createObjectURL(new Blob([record.bytes], { type: record.mime }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [record]);
  return url;
}

export interface ExercisePhotoProps {
  /** Undefined shows the placeholder image (R14.1, R14.7). */
  photo: Photo | undefined;
  alt: string;
  /** Display size in px for thumbnails; detail screens leave it out to use the photo size. */
  size?: number;
  className?: string;
}

/** A library or custom exercise photo with its BlurHash; the placeholder when there is none or it fails. */
export function ExercisePhoto({ photo, alt, size, className }: ExercisePhotoProps) {
  const stored = useStoredImageUrl(photo?.imageId);
  const src = photo?.src ?? stored;
  const width = size ?? photo?.width ?? 300;
  const height = size ?? photo?.height ?? 300;
  const props = {
    width,
    height,
    alt,
    ...(className !== undefined ? { className } : {}),
    ...(src !== undefined ? { src } : {}),
    ...(photo?.blurhash ? { blurhash: photo.blurhash } : {}),
  };
  return <BlurHashImage {...props} />;
}
