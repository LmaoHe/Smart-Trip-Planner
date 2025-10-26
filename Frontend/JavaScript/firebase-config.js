// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDlfiGh4csz_JuogzVG5A6lN-Wu2RaYPMo",
    authDomain: "smart-trip-planner-1c0a9.firebaseapp.com",
    projectId: "smart-trip-planner-1c0a9",
    storageBucket: "smart-trip-planner-1c0a9.firebasestorage.app",
    messagingSenderId: "704390410235",
    appId: "1:704390410235:web:4b0b008f7b981b8a86a55e",
    measurementId: "G-VHEBGVY291"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const appId = firebaseConfig.appId;