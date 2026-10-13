// components/photo.tsx
'use client';

import Image from 'next/image';
import { useState } from 'react';
import { createPngDataUri } from 'unlazy/thumbhash';
import { CoverBadges } from './cover-badges';
import { OfflineBadge } from './offline-badge';

const GRADIENTES = [
  'linear-gradient(to bottom right, #9f1239, #4c0519)',
  'linear-gradient(to bottom right, #b45309, #78350f)',
  'linear-gradient(to bottom right, #047857, #064e3b)',
  'linear-gradient(to bottom right, #0369a1, #0c4a6e)',
  'linear-gradient(to bottom right, #6d28d9, #4c1d95)',
  'linear-gradient(to bottom right, #4338ca, #312e81)',
  'linear-gradient(to bottom right, #0f766e, #134e4a)',
  'linear-gradient(to bottom right, #a21caf, #701a75)',
  'linear-gradient(to bottom right, #0e7490, #164e63)',
  'linear-gradient(to bottom right, #c2410c, #7c2d12)',
];

function gradienteDaCapa(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return GRADIENTES[Math.abs(hash) % GRADIENTES.length];
}

function Ornamento() {
  return (
    <div className="absolute inset-x-4 flex items-center gap-2">
      <span className="h-px flex-1 bg-white/30" />
      <span className="h-1.5 w-1.5 rotate-45 border border-white/40" />
      <span className="h-px flex-1 bg-white/30" />
    </div>
  );
}

function CapaGerada({ title, seed }: { title: string; seed: string }) {
  return (
    <div className="absolute inset-0" style={{ background: gradienteDaCapa(seed) }}>
      <div className="absolute inset-3 rounded-sm border border-white/20" />
      <div className="absolute inset-x-4 top-1/4">
        <Ornamento />
      </div>
      <div className="absolute inset-x-3 bottom-1/3 top-1/3 flex items-center justify-center">
        <span className="line-clamp-4 text-center font-serif text-sm font-medium leading-snug tracking-wide text-white/90">
          {title}
        </span>
      </div>
      <div className="absolute inset-x-4 bottom-1/4">
        <Ornamento />
      </div>
    </div>
  );
}

export function Photo({
  bookId,
  src,
  title,
  thumbhash,
  priority,
  readStatus = null,
  myRating = null,
  owned = true,
  nextUp = false,
  favorite = false,
}: {
  bookId?: number;
  src: string | null;
  title: string;
  thumbhash: string | null;
  priority: boolean;
  readStatus?: string | null;
  myRating?: number | null;
  owned?: boolean;
  nextUp?: boolean;
  favorite?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const badges = (
    <CoverBadges
      readStatus={readStatus}
      myRating={myRating}
      owned={owned}
      nextUp={nextUp}
      favorite={favorite}
    />
  );

  if (!src || failedSrc === src) {
    return (
      <div className="capa-livro relative aspect-[2/3] w-full overflow-hidden rounded-sm bg-muted">
        <CapaGerada title={title} seed={String(bookId ?? title)} />
        <div className="capa-lombada pointer-events-none absolute inset-0 z-[1] rounded-sm" />
        {badges}
        {bookId !== undefined && <OfflineBadge bookId={bookId} />}
      </div>
    );
  }

  return (
    <div className="capa-livro relative aspect-[2/3] w-full overflow-hidden rounded-sm bg-muted">
      <Image
        alt={title}
        src={src}
        onError={() => setFailedSrc(src)}
        {...(thumbhash
          ? { blurDataURL: createPngDataUri(thumbhash), placeholder: 'blur' as const }
          : {})}
        fill
        sizes="(min-width: 1280px) 14vw, (min-width: 1024px) 16vw, (min-width: 768px) 20vw, (min-width: 640px) 25vw, 33vw"
        priority={priority}
        className="z-0 object-cover"
      />
      <div className="capa-lombada pointer-events-none absolute inset-0 z-[1] rounded-sm" />
      {badges}
      {bookId !== undefined && <OfflineBadge bookId={bookId} />}
    </div>
  );
}
