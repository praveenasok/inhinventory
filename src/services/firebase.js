import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

const firebaseConfig = {
  projectId: "inhsuite",
  appId: "1:354912080861:web:05d3903253cdfdd78c1c34",
  storageBucket: "inhsuite.firebasestorage.app",
  apiKey: "AIzaSyB-38dsS5XPZA3lvtW7bqRzaWURTlSnWIk",
  authDomain: "inhsuite.firebaseapp.com",
  messagingSenderId: "354912080861",
  measurementId: "G-T0MTY8584L"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Use emulator if in development
if (import.meta.env.DEV) {
  try {
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  } catch (e) {
    console.error("Emulator connection failed", e);
  }
}

export { app, db, auth };
