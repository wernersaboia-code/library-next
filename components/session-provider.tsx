'use client';

import { SessionProvider as Provider } from 'next-auth/react';
import { type ReactNode } from 'react';

export default function SessionProvider({ children }: { children: ReactNode }) {
  return <Provider>{children}</Provider>;
}
