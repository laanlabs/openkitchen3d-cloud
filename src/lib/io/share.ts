// Share links without a server: the whole project, compressed into the URL fragment.
// Fragments never reach the server, so a shared design stays between the people who have the link.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Project } from '../model/types';
import { checkProject, isWebProject } from './openplan';
import { withCatalogCurrency } from '../model/currency';

export function shareUrl(p: Project): string {
  const data = compressToEncodedURIComponent(JSON.stringify(p));
  return `${location.origin}/#/view/${data}`;
}

export function decodeShared(data: string): Project | null {
  try {
    const j = JSON.parse(decompressFromEncodedURIComponent(data) ?? 'null');
    return isWebProject(j) ? withCatalogCurrency(checkProject(j)) : null;
  } catch {
    return null;
  }
}
