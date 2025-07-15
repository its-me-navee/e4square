// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDd9qGHxScGSlyfOOYcyeNPW8p2OebtuzU",
  authDomain: "e4square-5ed72.firebaseapp.com",
  projectId: "e4square-5ed72",
  storageBucket: "e4square-5ed72.appspot.com",
  messagingSenderId: "539074674710",
  appId: "1:539074674710:web:1dae89772de2111f6bf537"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { auth };
