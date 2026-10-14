import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { withUser } from './with-user';
import { savedSearches } from './schema';

export function fetchSavedSearches(userId: string) {
  return withUser(userId, (tx) => tx.select({
    id: savedSearches.id, name: savedSearches.name, query: savedSearches.query,
  }).from(savedSearches).where(eq(savedSearches.userId, userId)).orderBy(asc(savedSearches.name)));
}
