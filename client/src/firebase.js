// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyDd9qGHxScGSlyfOOYcyeNPW8p2OebtuzU",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "e4square-5ed72.firebaseapp.com",
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL || "https://e4square-5ed72-default-rtdb.firebaseio.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "e4square-5ed72",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "e4square-5ed72.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "539074674710",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:539074674710:web:1dae89772de2111f6bf537"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { auth };
