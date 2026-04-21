// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBOX2snlCFbD7qRUvLArucTBbmga0ZXPr8",
  authDomain: "vectorpm-df058.firebaseapp.com",
  projectId: "vectorpm-df058",
  storageBucket: "vectorpm-df058.firebasestorage.app",
  messagingSenderId: "5805638118",
  appId: "1:5805638118:web:b26c630147411da9b19627",
  measurementId: "G-JRWC0L9P33"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);