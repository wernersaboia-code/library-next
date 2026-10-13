import type { MetadataProvider } from '../types';
import { openLibraryProvider } from './openlibrary';
import { googleBooksProvider } from './googlebooks';
import { wikiDataProvider } from './wikidata';

/** Fontes consultadas em paralelo, em ordem de confiança. */
export function enabledProviders(): MetadataProvider[] {
  return [openLibraryProvider, googleBooksProvider, wikiDataProvider];
}
