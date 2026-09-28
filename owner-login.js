import { signInWithEmailAndPassword } 
    from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import { auth } from "./firebase.js";

// Only this account may use the owner login form.
const OWNER_LOGIN_EMAIL = "boattrips.admin@gmail.com";

const form = document.getElementById("login-form");
const errorMessage = document.getElementById("login-error");
const accessNote = document.getElementById("owner-login-note");

if (new URLSearchParams(window.location.search).get("denied") === "1" && accessNote) {
    accessNote.hidden = false;
}

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    errorMessage.textContent = "";

    if (email.toLowerCase() !== OWNER_LOGIN_EMAIL) {
        errorMessage.textContent = "Invalid email or password.";
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
        window.location.href = "admin.html";
    } catch (error) {
        console.error("Login error:", error);
        errorMessage.textContent = "Invalid email or password.";
    }
});
