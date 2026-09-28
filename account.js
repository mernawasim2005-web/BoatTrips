import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    updateProfile,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import { doc, getDoc, setDoc, updateDoc, serverTimestamp, increment }
    from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";

const tabs = document.getElementById("account-tabs");
const signinForm = document.getElementById("signin-form");
const signupForm = document.getElementById("signup-form");
const accountPanel = document.getElementById("account-panel");
const statusEl = document.getElementById("account-status");
const resetPasswordBtn = document.getElementById("reset-password-btn");
const signoutBtn = document.getElementById("account-signout-btn");

const AUTH_ERRORS = {
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/user-not-found": "Incorrect email or password.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/email-already-in-use": "An account already exists with this email. Try signing in.",
    "auth/weak-password": "Your password needs to be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please try again in a few minutes.",
    "auth/user-disabled": "This account has been disabled. Please contact us.",
    "auth/network-request-failed": "Network problem. Please check your connection."
};

function setStatus(message, type = "error") {
    statusEl.textContent = message;
    statusEl.classList.toggle("is-success", type === "success");
}

function clearStatus() {
    statusEl.textContent = "";
}

function setFormBusy(form, isBusy) {
    const button = form.querySelector("button[type='submit']");
    if (button) {
        button.disabled = isBusy;
        button.textContent = isBusy ? "Please wait..." : button.dataset.label;
    }
    form.querySelectorAll("input").forEach((input) => {
        input.disabled = isBusy;
    });
}

function rememberButtonLabels() {
    [signinForm, signupForm].forEach((form) => {
        const button = form.querySelector("button[type='submit']");
        if (button) button.dataset.label = button.textContent;
    });
}

function showPanel(name) {
    signinForm.hidden = name !== "signin";
    signupForm.hidden = name !== "signup";
    accountPanel.hidden = name !== "account";
    tabs.hidden = name === "account";
}

function formatDate(value) {
    if (!value) return "-";
    const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value) {
    if (!value) return "-";
    const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return `${date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}, ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

async function isAdminAccount(uid) {
    try {
        const adminSnap = await getDoc(doc(db, "admins", uid));
        return adminSnap.exists() && adminSnap.data().isAdmin === true;
    } catch (error) {
        console.warn("Admin flag could not be read:", error);
        return false;
    }
}

function renderSignedIn(user, profile) {
    const name = (profile && profile.displayName) || user.displayName || "Guest";
    const firstName = name.split(" ")[0] || "Guest";

    document.getElementById("account-greeting").textContent = `Welcome, ${firstName}`;
    document.getElementById("account-avatar").textContent = firstName.charAt(0).toUpperCase();
    document.getElementById("account-email").textContent = user.email || "";
    document.getElementById("account-member-since").textContent = formatDate(profile && profile.createdAt);
    document.getElementById("account-login-count").textContent = profile && profile.loginCount ? profile.loginCount : 1;
    document.getElementById("account-last-login").textContent = formatDateTime(profile && profile.lastLoginAt);
    document.getElementById("account-uid").textContent = user.uid;

    showPanel("account");
}

async function loadProfile(uid) {
    try {
        const profileSnap = await getDoc(doc(db, "customers", uid));
        return profileSnap.exists() ? profileSnap.data() : null;
    } catch (error) {
        console.warn("Customer profile could not be read:", error);
        return null;
    }
}

async function recordCustomerLogin(user) {
    try {
        const profileRef = doc(db, "customers", user.uid);
        const profileSnap = await getDoc(profileRef);

        if (!profileSnap.exists()) {
            await setDoc(profileRef, {
                displayName: user.displayName || "",
                email: user.email || "",
                phone: "",
                source: "website",
                createdAt: serverTimestamp(),
                lastLoginAt: serverTimestamp(),
                loginCount: 1
            });
            return;
        }

        await updateDoc(profileRef, {
            lastLoginAt: serverTimestamp(),
            loginCount: increment(1)
        });
    } catch (error) {
        console.warn("Login activity could not be saved:", error);
    }
}

tabs.addEventListener("click", (e) => {
    const tab = e.target.closest(".account-tab");
    if (!tab) return;

    tabs.querySelectorAll(".account-tab").forEach((button) => {
        button.classList.toggle("is-active", button === tab);
    });

    showPanel(tab.dataset.tab);
    clearStatus();
});

signinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearStatus();
    setFormBusy(signinForm, true);

    try {
        const credential = await signInWithEmailAndPassword(
            auth,
            document.getElementById("signin-email").value.trim(),
            document.getElementById("signin-password").value
        );

        await recordCustomerLogin(credential.user);
        setStatus("Signed in successfully.", "success");
        signinForm.reset();
    } catch (error) {
        console.error("Sign in error:", error);
        setStatus(AUTH_ERRORS[error.code] || "We could not sign you in. Please try again.");
    } finally {
        setFormBusy(signinForm, false);
    }
});

signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearStatus();

    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const phone = document.getElementById("signup-phone").value.trim();
    const password = document.getElementById("signup-password").value;
    const confirmPassword = document.getElementById("signup-confirm").value;

    if (password !== confirmPassword) {
        setStatus("The two passwords do not match.");
        return;
    }

    setFormBusy(signupForm, true);

    try {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName: name });

        await setDoc(doc(db, "customers", credential.user.uid), {
            displayName: name,
            email,
            phone,
            source: "website",
            createdAt: serverTimestamp(),
            lastLoginAt: null,
            loginCount: 0
        });

        setStatus("Your account is ready.", "success");
        signupForm.reset();
    } catch (error) {
        console.error("Sign up error:", error);

        if (error.code === "auth/email-already-in-use") {
            setStatus(AUTH_ERRORS[error.code]);
            tabs.querySelector('[data-tab="signin"]').click();
            return;
        }

        setStatus(AUTH_ERRORS[error.code] || "We could not create your account. Please try again.");
    } finally {
        setFormBusy(signupForm, false);
    }
});

resetPasswordBtn.addEventListener("click", async () => {
    const email = document.getElementById("signin-email").value.trim();
    clearStatus();

    if (!email) {
        setStatus("Enter your email address first, then tap Forgot password.");
        return;
    }

    resetPasswordBtn.disabled = true;

    try {
        await sendPasswordResetEmail(auth, email);
        setStatus("Password reset link sent to your email.", "success");
    } catch (error) {
        console.error("Password reset error:", error);
        setStatus(AUTH_ERRORS[error.code] || "We could not send the reset email. Please try again.");
    } finally {
        resetPasswordBtn.disabled = false;
    }
});

signoutBtn.addEventListener("click", async () => {
    clearStatus();

    try {
        await signOut(auth);
        signupForm.reset();
        signinForm.reset();
        tabs.querySelector('[data-tab="signin"]').click();
        setStatus("You are signed out.", "success");
    } catch (error) {
        console.error("Sign out error:", error);
        setStatus("We could not sign you out. Please try again.");
    }
});

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        showPanel("signin");
        return;
    }

    const [profile, isAdmin] = await Promise.all([loadProfile(user.uid), isAdminAccount(user.uid)]);

    document.getElementById("account-admin-note").hidden = !isAdmin;
    renderSignedIn(user, profile);
});

rememberButtonLabels();
showPanel("signin");
