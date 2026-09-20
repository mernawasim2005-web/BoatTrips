import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";


// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAusRP1hB59S-m3aRbOfaWg-T-B8wR4xF0",
  authDomain: "boat-trips-system.firebaseapp.com",
  projectId: "boat-trips-system",
  storageBucket: "boat-trips-system.firebasestorage.app",
  messagingSenderId: "336863107594",
  appId: "1:336863107594:web:9877cef32c135a33139df3",
  measurementId: "G-6FYCRQTJL1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };