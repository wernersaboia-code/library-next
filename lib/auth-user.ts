import 'server-only';
import { db } from '@/lib/db/drizzle';
import { appUsers } from '@/lib/db/schema';
import { createClient } from '@/lib/supabase/server';
import { AuthError } from './auth-error';

export { AuthError } from './auth-error';

export async function ensureAppUser(id: string, email: string): Promise<void> {
  await db.insert(appUsers).values({ id, email })
    .onConflictDoNothing({ target: appUsers.id });
}

export async function getCurrentUser(): Promise<{ id: string; email: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) throw new AuthError();
  return { id: data.user.id, email: data.user.email };
}

export async function getCurrentUserId(): Promise<string> {
  return (await getCurrentUser()).id;
}
