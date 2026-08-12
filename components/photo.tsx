// components/photo.tsx
'use client';

import Image from 'next/image';
import { createPngDataUri } from 'unlazy/thumbhash';

export function Photo({
  src,
  title,
  thumbhash,
  priority,
}: {
  src: string | null;
  title: string;
  thumbhash: string | null;
  priority: boolean;
}) {
  if (!src) {
    return (
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-muted shadow-md flex items-center justify-center">
        <span className="px-2 text-center text-xs text-muted-foreground">
          {title}
        </span>
      </div>
    );
  }

  return (
    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-muted shadow-md">
      <Image
        alt={title}
        src={src}
        {...(thumbhash
          ? { blurDataURL: createPngDataUri(thumbhash), placeholder: 'blur' as const }
          : {})}
        fill
        sizes="(min-width: 1280px) 14vw, (min-width: 1024px) 16vw, (min-width: 768px) 20vw, (min-width: 640px) 25vw, 33vw"
        priority={priority}
        className="object-cover"
      />
    </div>
  );
}
