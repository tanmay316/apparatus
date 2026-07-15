import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyD4PfAeIz76YYjNWEWix8xk_COM6mGrVcs",
  authDomain: "apparatus-46b1b.firebaseapp.com",
  projectId: "apparatus-46b1b",
  storageBucket: "apparatus-46b1b.firebasestorage.app",
  messagingSenderId: "716398124057",
  appId: "1:716398124057:web:8e8c4c8d31ea073067de88",
  measurementId: "G-YJB1454STJ",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Admin email — hardcoded for now
export const ADMIN_EMAIL = 'tanmay.sharma4334@gmail.com';
