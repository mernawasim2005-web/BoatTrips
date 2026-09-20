import { collection, getDocs } 
from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { db } from "./firebase.js";

const tripContainer = document.getElementById("trip-container");

function normalizeImageSource(value, fallback = "white_island.jpeg") {
    if (!value) return fallback;

    if (typeof value === "string") {
        const cleaned = value.trim().replace(/\\/g, "/");
        if (!cleaned) return fallback;

        if (cleaned.startsWith("http://") || cleaned.startsWith("https://") || cleaned.startsWith("data:")) {
            return cleaned;
        }

        const withoutLeadingSlash = cleaned.replace(/^\/+/, "").replace(/^\.\//, "");

        if (!withoutLeadingSlash) return fallback;

        if (withoutLeadingSlash.startsWith("images/")) {
            return withoutLeadingSlash;
        }

        if (withoutLeadingSlash.includes("/")) {
            return withoutLeadingSlash;
        }

        return withoutLeadingSlash;
    }

    if (typeof value === "object") {
        const nested = value.url || value.src || value.image || value.path || value.link;
        return nested ? normalizeImageSource(nested, fallback) : fallback;
    }

    return fallback;
}

function getTripMainImage(trip) {
    const candidates = [];

    if (trip?.background) candidates.push(trip.background);

    if (Array.isArray(trip?.gallery)) {
        trip.gallery.forEach((item) => {
            if (typeof item === "string") candidates.push(item);
            else if (item) candidates.push(item.image || item.src || item.url || item.path);
        });
    }

    if (Array.isArray(trip?.boatOptions)) {
        trip.boatOptions.forEach((option) => {
            if (Array.isArray(option?.images)) candidates.push(...option.images);
            if (option?.image) candidates.push(option.image);
            if (Array.isArray(option?.image)) candidates.push(...option.image);
        });
    }

    const image = candidates.find((value) => Boolean(value));
    return normalizeImageSource(image, "white_island.jpeg");
}

try {
    const snapshot = await getDocs(collection(db, "trips"));

    if (snapshot.empty) {
        tripContainer.innerHTML = "<p>No trips available right now.</p>";
        return;
    }

    tripContainer.innerHTML = snapshot.docs.map((doc) => {
        const trip = doc.data();
        const tripImage = getTripMainImage(trip);

        return `
            <div class="trip-card">
                <img src="${tripImage}" alt="${trip.name}" class="trip-image"
                     onerror="this.onerror=null;this.src='white_island.jpeg';">
                <h2>${trip.name}</h2>
                <a href="trips-details.html?id=${doc.id}" class="view-btn">
                    View Details
                </a>
            </div>
        `;
    }).join("");
} catch (error) {
    console.error("Error loading trips:", error);
    tripContainer.innerHTML = "<p>Failed to load trips. Please try again later.</p>";
}