// components/photo.tsx
'use client';

import Image from 'next/image';
import { createPngDataUri } from 'unlazy/thumbhash';
import { CoverBadges } from './cover-badges';

export function Photo({
  src,
  title,
  thumbhash,
  priority,
  readStatus = null,
  myRating = null,
  owned = true,
}: {
  src: string | null;
  title: string;
  thumbhash: string | null;
  priority: boolean;
  readStatus?: string | null;
  myRating?: number | null;
  owned?: boolean;
}) {
  // Um livro lido sem capa também merece o selo, por isso as marcações
  // aparecem nos dois caminhos.
  if (!src) {
    return (
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-muted shadow-md flex items-center justify-center">
        <span className="px-2 text-center text-xs text-muted-foreground">
          {title}
        </span>
        <CoverBadges readStatus={readStatus} myRating={myRating} owned={owned} />
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
      <CoverBadges readStatus={readStatus} myRating={myRating} owned={owned} />
    </div>
  );
}
