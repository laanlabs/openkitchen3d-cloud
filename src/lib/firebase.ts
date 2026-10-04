// Firebase web app "openkitchen3d-cloud" (project openkitchen3d). Used for Hosting and Analytics only:
// projects stay local-first in IndexedDB (no database without a cost model).
import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported, logEvent, type Analytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: 'AIzaSyBfG0fQQL-mfLxleCQkQmtN4zfc7jyTYPA',
  authDomain: 'openkitchen3d.firebaseapp.com',
  projectId: 'openkitchen3d',
  storageBucket: 'openkitchen3d.firebasestorage.app',
  messagingSenderId: '415674084925',
  appId: '1:415674084925:web:b7a7e1cd961999a4970454',
  measurementId: 'G-T95YCKH0TG'
};

export const app = initializeApp(firebaseConfig);

let analytics: Analytics | null = null;
if (typeof window !== 'undefined' && !import.meta.env.DEV) {
  isSupported()
    .then((ok) => { if (ok) analytics = getAnalytics(app); })
    .catch(() => {});
}

export function track(event: string, params?: Record<string, unknown>) {
  try {
    if (analytics) logEvent(analytics, event, params);
  } catch {
    /* analytics is best-effort */
  }
}
