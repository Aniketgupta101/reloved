/// <reference types="vite/client" />
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import firebaseAppletConfig from '../../firebase-applet-config.json';

// Firebase Auth client SDK - Google Sign-In (DonorLogin.tsx). Firestore/Storage
// on the backend are accessed only via the Firebase Functions API, see @/lib/api.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseAppletConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseAppletConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseAppletConfig.appId,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
if (import.meta.env.VITE_ADMIN_LOCAL_QA === '1') {
  if (firebaseConfig.projectId !== 'demo-reloved-admin') throw new Error('Local Auth requires demo-reloved-admin');
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
