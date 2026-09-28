import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    updateProfile,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import { doc, getDoc, setDoc, updateDoc, serverTimestamp, increment, collection, getDocs, query, where }
    from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";

// The owner account can reach the admin dashboard after signing in here.
const OWNER_EMAIL = "boattrips.admin@gmail.com";

function isOwnerUser(user) {
    return Boolean(user) && (user.email || "").toLowerCase() === OWNER_EMAIL;
}

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

function renderSignedIn(user, profile, isAdmin) {
    const isOwner = isOwnerUser(user);
    const name = (profile && profile.displayName) || user.displayName || "Guest";
    const firstName = name.split(" ")[0] || "Guest";

    document.getElementById("account-greeting").textContent = isOwner ? "Owner signed in" : `Welcome, ${firstName}`;
    document.getElementById("account-avatar").textContent = isOwner ? "O" : firstName.charAt(0).toUpperCase();
    document.getElementById("account-email").textContent = user.email || "";
    document.getElementById("account-member-since").textContent = formatDate(profile && profile.createdAt);
    document.getElementById("account-login-count").textContent = profile && profile.loginCount ? profile.loginCount : 1;
    document.getElementById("account-last-login").textContent = formatDateTime(profile && profile.lastLoginAt);
    document.getElementById("account-uid").textContent = user.uid;

    document.getElementById("account-admin-note").hidden = !isAdmin;
    document.getElementById("account-meta").hidden = isOwner;
    document.getElementById("account-trips").hidden = isOwner;

    showPanel("account");

    if (isOwner) return;
    loadCustomerTrips(user);
}

const BOOKING_STATUS_LABELS = {
    pending: "Pending",
    confirmed: "Confirmed",
    cancelled: "Cancelled",
    canceled: "Cancelled",
    completed: "Completed"
};

function escapeText(value) {
    return String(value === undefined || value === null ? "" : value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    }[character]));
}

function bookingDateValue(booking) {
    const raw = booking.tripDate || booking.scheduleText;
    if (!raw) return null;
    const date = new Date(String(raw).slice(0, 10));
    return Number.isNaN(date.getTime()) ? null : date;
}

function bookingTimeText(booking) {
    if (booking.startTime && booking.endTime) return `${booking.startTime} - ${booking.endTime}`;
    if (booking.startTime) return booking.startTime;
    return "Time to be confirmed";
}

async function loadCustomerTrips(user) {
    const listEl = document.getElementById("account-trips-list");
    if (!listEl) return;

    listEl.textContent = "Loading your trips...";

    const bookings = [];

    try {
        const byUid = await getDocs(query(collection(db, "bookings"), where("customerUid", "==", user.uid)));
        byUid.forEach((bookingDoc) => {
            bookings.push({ id: bookingDoc.id, ...bookingDoc.data() });
        });
    } catch (error) {
        console.error("Error loading customer trips:", error);
        listEl.textContent = "We could not load your trips right now. Please try again later or contact us.";
        return;
    }

    if (!bookings.length) {
        listEl.innerHTML = `<p class="account-trips-empty">No bookings yet. <a href="trips.html">Find your trip</a> and it will show up here.</p>`;
        return;
    }

    const now = new Date();
    const sorted = [...bookings].sort((a, b) => {
        const aDate = bookingDateValue(a);
        const bDate = bookingDateValue(b);
        const aTime = aDate ? aDate.getTime() : 0;
        const bTime = bDate ? bDate.getTime() : 0;
        const aFuture = aTime >= now.getTime() ? 1 : 0;
        const bFuture = bTime >= now.getTime() ? 1 : 0;
        if (aFuture !== bFuture) return bFuture - aFuture;
        return bFuture ? aTime - bTime : bTime - aTime;
    });

    const upcoming = sorted.filter((booking) => {
        const date = bookingDateValue(booking);
        return date && date.getTime() >= now.getTime();
    });
    const past = sorted.filter((booking) => !upcoming.includes(booking));

    listEl.innerHTML = [
        upcoming.length ? renderTripGroup("Upcoming trips", upcoming) : "",
        past.length ? renderTripGroup("Past trips", past) : ""
    ].join("");

    function renderTripGroup(heading, groupBookings) {
        return `
            <h4 class="account-trips-group">${heading}</h4>
            ${groupBookings.map((booking) => {
                const status = String(booking.status || "pending").toLowerCase();
                const statusLabel = BOOKING_STATUS_LABELS[status] || "Pending";
                const peopleCount = Number(booking.peopleCount) || 1;
                const total = Number(booking.totalPrice) || 0;
                const date = bookingDateValue(booking);
                const dateLabel = date ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "Date to be confirmed";
                const addons = Array.isArray(booking.addons) && booking.addons.length
                    ? booking.addons.map((addon) => escapeText(addon.name)).join(", ")
                    : "";

                return `
                    <div class="account-trip-card">
                        <div class="account-trip-head">
                            <strong>${escapeText(booking.tripName || "Boat trip")}</strong>
                            <span class="account-trip-status is-${escapeText(status)}">${escapeText(statusLabel)}</span>
                        </div>
                        <div class="account-trip-meta">
                            <span>${escapeText(dateLabel)} &middot; ${escapeText(bookingTimeText(booking))}</span>
                            <span>${escapeText(booking.boatName || "Boat to be confirmed")}</span>
                            <span>${peopleCount} guest${peopleCount === 1 ? "" : "s"}</span>
                            <span>${total.toLocaleString()} EGP</span>
                        </div>
                        ${addons ? `<div class="account-trip-addons">Add-ons: ${addons}</div>` : ""}
                        <a class="account-trip-link" href="trips-details.html?id=${encodeURIComponent(booking.tripId || "")}">View trip</a>
                    </div>
                `;
            }).join("")}
        `;
    }
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
    if (isOwnerUser(user)) return;

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

    const isAdmin = isOwnerUser(user) || await isAdminAccount(user.uid);
    const profile = isOwnerUser(user) ? null : await loadProfile(user.uid);

    renderSignedIn(user, profile, isAdmin);
});

rememberButtonLabels();
showPanel("signin");
