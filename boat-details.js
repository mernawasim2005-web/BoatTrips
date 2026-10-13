import { doc, getDoc, collection, getDocs } 
    from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { db } from "./firebase.js";

const root = document.getElementById("boat-detail-root");

const params = new URLSearchParams(window.location.search);
const boatId = params.get("id");

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[c]);
}

function normalizeImage(path) {
    if (!path) return "images/boat1.jpeg";
    const str = String(path).trim();
    if (str.startsWith("http://") || str.startsWith("https://") || str.startsWith("data:")) {
        return str;
    }
    return str;
}

const DEFAULT_FACILITIES = [
    { icon: "☀️", name: "Sun Deck & Loungers", desc: "Spacious sundeck with cushions and loungers for tanning" },
    { icon: "🛋️", name: "Shaded Lounge Area", desc: "Covered seating area protected from the midday sun" },
    { icon: "🤿", name: "Snorkeling Gear Included", desc: "Masks, snorkels, fins, and life jackets for all guests" },
    { icon: "🎵", name: "Bluetooth Sound System", desc: "High-quality marine sound system with smartphone connectivity" },
    { icon: "🚿", name: "Fresh Water Shower", desc: "Rinse off easily after swimming in the Red Sea" },
    { icon: "🚻", name: "Private Marine Restroom", desc: "Clean and fully functional onboard toilet and wash basin" },
    { icon: "🧊", name: "Ice Box & Refreshments", desc: "Cold storage for drinks, water, and lunch catering" },
    { icon: "👨‍✈️", name: "Professional Captain & Crew", desc: "Certified Red Sea captain and helpful marine deckhand" },
    { icon: "🦺", name: "Full Safety & Navigation", desc: "GPS navigation, VHF radio, life vests, and first aid kit" }
];

async function loadBoatDetails() {
    if (!boatId) {
        renderNotFound("No boat selected. Please choose a boat from our fleet.");
        return;
    }

    try {
        const boatDocSnap = await getDoc(doc(db, "boats", boatId));

        if (!boatDocSnap.exists()) {
            renderNotFound("The requested boat could not be found or may have been updated.");
            return;
        }

        const boat = boatDocSnap.data();

        // Also fetch trips to find associated trips or showcase available trips for this boat
        let allTrips = [];
        try {
            const tripsSnap = await getDocs(collection(db, "trips"));
            tripsSnap.forEach((tripDoc) => {
                allTrips.push({ id: tripDoc.id, ...tripDoc.data() });
            });
        } catch (tripErr) {
            console.warn("Could not load trips:", tripErr);
        }

        renderBoat(boatDocSnap.id, boat, allTrips);

    } catch (err) {
        console.error("Error loading boat details:", err);
        renderNotFound("Unable to load boat details right now. Please try again later.");
    }
}

function renderNotFound(message) {
    root.innerHTML = `
        <div class="boat-detail-error">
            <span class="boat-error-icon" aria-hidden="true">⛵</span>
            <h2>Boat Not Found</h2>
            <p>${escapeHtml(message)}</p>
            <a href="/" class="book-btn">Back to Our Fleet</a>
        </div>
    `;
}

function renderBoat(id, boat, trips) {
    document.title = `${boat.name || "Boat"} | AQUAVIDA Red Sea Fleet`;

    // Process images
    let images = [];
    if (Array.isArray(boat.images) && boat.images.length > 0) {
        images = boat.images.map(normalizeImage);
    } else if (boat.image) {
        images = [normalizeImage(boat.image)];
    } else {
        images = ["images/boat1.jpeg"];
    }

    // Process facilities
    let facilities = DEFAULT_FACILITIES;
    if (Array.isArray(boat.facilities) && boat.facilities.length > 0) {
        facilities = boat.facilities.map((fac) => {
            if (typeof fac === "string") {
                return { icon: "✨", name: fac, desc: "Onboard facility for guest comfort" };
            }
            return {
                icon: fac.icon || "✨",
                name: fac.name || "Facility",
                desc: fac.desc || "Onboard facility"
            };
        });
    } else if (typeof boat.facilities === "string" && boat.facilities.trim()) {
        facilities = boat.facilities.split(",").map((s) => ({
            icon: "✨",
            name: s.trim(),
            desc: "Onboard facility for guest comfort"
        })).filter((item) => item.name);
    }

    // Find associated trips (trips that list this boat, or all active trips)
    const normalizedBoatName = String(boat.name || "").toLowerCase().trim();
    let relevantTrips = trips.filter((t) => {
        if (!t) return false;
        if (Array.isArray(t.boatOptions)) {
            return t.boatOptions.some((bo) => 
                String(bo.boatId || bo.id || "").toLowerCase() === id.toLowerCase() ||
                String(bo.boatName || "").toLowerCase().includes(normalizedBoatName)
            );
        }
        return false;
    });

    // If no explicit link in boatOptions, recommend the top active trips
    if (relevantTrips.length === 0 && trips.length > 0) {
        relevantTrips = trips.slice(0, 3);
    }

    const capacityText = boat.capacity ? `${boat.capacity} Guests` : "Private Charter";
    const statusLabel = {
        active: "Available for Charter",
        maintenance: "Scheduled Maintenance",
        out_of_service: "Out of Service"
    }[boat.status] || "Active & Sea Ready";

    const statusClass = boat.status === "maintenance" ? "badge-maintenance" : 
                        (boat.status === "out_of_service" ? "badge-inactive" : "badge-active");

    const whatsappMessage = encodeURIComponent(`Hello AQUAVIDA! I would like to inquire about booking the boat "${boat.name || 'Private Boat'}" for a trip in the Red Sea.`);

    root.innerHTML = `
        <div class="boat-detail-container">
            <!-- Breadcrumb Navigation -->
            <nav class="boat-breadcrumb" aria-label="Breadcrumb">
                <a href="/">Our Fleet</a>
                <span class="breadcrumb-separator">/</span>
                <span class="breadcrumb-current">${escapeHtml(boat.name || "Boat Details")}</span>
            </nav>

            <!-- Hero Section: Gallery + Summary Card -->
            <section class="boat-hero-grid">
                <!-- Gallery Left -->
                <div class="boat-gallery-block">
                    <div class="boat-main-image-wrap">
                        <img id="boat-main-image" src="${images[0]}" alt="${escapeHtml(boat.name)}" class="boat-main-image" fetchpriority="high">
                        <span class="boat-status-tag ${statusClass}">${escapeHtml(statusLabel)}</span>
                        ${images.length > 1 ? `
                            <button id="boat-gallery-prev" class="gallery-nav-btn prev" aria-label="Previous image">&larr;</button>
                            <button id="boat-gallery-next" class="gallery-nav-btn next" aria-label="Next image">&rarr;</button>
                        ` : ""}
                    </div>

                    ${images.length > 1 ? `
                        <div class="boat-thumbs-row" id="boat-thumbs-row" role="tablist" aria-label="Boat photos">
                            ${images.map((img, idx) => `
                                <button type="button" class="boat-thumb-item ${idx === 0 ? "active" : ""}" data-index="${idx}" aria-label="Photo ${idx + 1}">
                                    <img src="${img}" alt="${escapeHtml(boat.name)} thumbnail ${idx + 1}" loading="lazy">
                                </button>
                            `).join("")}
                        </div>
                    ` : ""}
                </div>

                <!-- Summary Right -->
                <div class="boat-summary-card">
                    <span class="boat-summary-eyebrow">AQUAVIDA LUXURY FLEET</span>
                    <h1 class="boat-title">${escapeHtml(boat.name || "Luxury Red Sea Boat")}</h1>

                    <div class="boat-badge-row">
                        <span class="boat-pill-badge capacity-pill">👥 Up to ${capacityText}</span>
                        ${boat.length ? `<span class="boat-pill-badge">📏 ${escapeHtml(boat.length)}</span>` : ""}
                        ${boat.year ? `<span class="boat-pill-badge">📅 Built ${escapeHtml(boat.year)}</span>` : ""}
                    </div>

                    <p class="boat-short-desc">
                        ${escapeHtml(boat.description || "Experience supreme comfort and safety with our professionally maintained vessel, perfect for private Red Sea charters, snorkeling expeditions, and family island trips.")}
                    </p>

                    <!-- Key Spec Highlights -->
                    <div class="boat-highlights-grid">
                        <div class="highlight-item">
                            <span class="highlight-label">Passenger Capacity</span>
                            <span class="highlight-val">${escapeHtml(capacityText)}</span>
                        </div>
                        <div class="highlight-item">
                            <span class="highlight-label">Boat Length</span>
                            <span class="highlight-val">${escapeHtml(boat.length || "12 - 16 Meters")}</span>
                        </div>
                        <div class="highlight-item">
                            <span class="highlight-label">Engine / Power</span>
                            <span class="highlight-val">${escapeHtml(boat.engine || "High-Powered Marine Engine")}</span>
                        </div>
                        <div class="highlight-item">
                            <span class="highlight-label">Port of Departure</span>
                            <span class="highlight-val">Hurghada &amp; Red Sea, Egypt</span>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="boat-action-buttons">
                        <a href="https://wa.me/201223595411?text=${whatsappMessage}" target="_blank" rel="noopener" class="book-btn boat-inquire-btn">
                            💬 Inquire &amp; Book via WhatsApp
                        </a>
                    </div>
                </div>
            </section>

            <!-- Detailed Specifications Section -->
            <section class="boat-specs-section">
                <div class="section-header-compact">
                    <h2>Technical Specifications</h2>
                    <p>Built and maintained to international maritime safety standards.</p>
                </div>

                <div class="boat-spec-cards-grid">
                    <div class="spec-card">
                        <div class="spec-icon">👥</div>
                        <div class="spec-text">
                            <h3>Max Capacity</h3>
                            <p>${escapeHtml(capacityText)}</p>
                        </div>
                    </div>

                    <div class="spec-card">
                        <div class="spec-icon">📏</div>
                        <div class="spec-text">
                            <h3>Length</h3>
                            <p>${escapeHtml(boat.length || "Standard Cruiser Length")}</p>
                        </div>
                    </div>

                    <div class="spec-card">
                        <div class="spec-icon">⚙️</div>
                        <div class="spec-text">
                            <h3>Engine</h3>
                            <p>${escapeHtml(boat.engine || "Twin Marine Inboard/Outboard")}</p>
                        </div>
                    </div>

                    <div class="spec-card">
                        <div class="spec-icon">⚓</div>
                        <div class="spec-text">
                            <h3>Year Built</h3>
                            <p>${escapeHtml(boat.year || "Modern Fleet Edition")}</p>
                        </div>
                    </div>

                    <div class="spec-card">
                        <div class="spec-icon">📍</div>
                        <div class="spec-text">
                            <h3>Departure Base</h3>
                            <p>Hurghada Marina / Red Sea</p>
                        </div>
                    </div>

                    <div class="spec-card">
                        <div class="spec-icon">🛡️</div>
                        <div class="spec-text">
                            <h3>Safety Level</h3>
                            <p>Fully Certified &amp; Insured</p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Facilities & Amenities Section -->
            <section class="boat-facilities-section">
                <div class="section-header-compact">
                    <h2>Onboard Facilities &amp; Amenities</h2>
                    <p>Designed for comfort, relaxation, and memorable marine adventures.</p>
                </div>

                <div class="facilities-grid">
                    ${facilities.map((fac) => `
                        <div class="facility-card">
                            <span class="facility-icon" aria-hidden="true">${fac.icon || "✨"}</span>
                            <div class="facility-info">
                                <h3>${escapeHtml(fac.name)}</h3>
                                <p>${escapeHtml(fac.desc)}</p>
                            </div>
                        </div>
                    `).join("")}
                </div>
            </section>

            <!-- About The Experience Section -->
            <section class="boat-experience-section">
                <div class="experience-card">
                    <div class="experience-content">
                        <h2>The AQUAVIDA Charter Experience</h2>
                        <p>
                            Whether you are planning a private family trip to <strong>Orange Bay</strong>, a snorkeling excursion around <strong>Giftun Island</strong>, or a private sunset dolphin watch, our vessel provides the perfect combination of speed, stability, and open-air relaxation.
                        </p>
                        <ul class="experience-points">
                            <li>✓ Professional certified captain and friendly crew at your service throughout the day</li>
                            <li>✓ Sanitized snorkeling masks, snorkels, fins, and life jackets for adults and children</li>
                            <li>✓ Shaded dining salon and expansive sun deck for breathtaking sea views</li>
                            <li>✓ Flexible itineraries tailored to your family or group preferences</li>
                        </ul>
                    </div>
                </div>
            </section>

            <!-- Final Inquiry Banner -->
            <section class="boat-charter-banner">
                <div class="banner-inner">
                    <h2>Ready for a Private Red Sea Cruise?</h2>
                    <p>Contact our technical support and reservation team directly for private bookings and custom charters.</p>
                    <a href="https://wa.me/201223595411?text=${whatsappMessage}" target="_blank" rel="noopener" class="book-btn banner-btn">
                        Chat on WhatsApp (0122 359 5411)
                    </a>
                </div>
            </section>
        </div>
    `;

    // Interactive gallery logic
    let activeIndex = 0;
    const mainImg = document.getElementById("boat-main-image");
    const thumbButtons = document.querySelectorAll(".boat-thumb-item");
    const prevBtn = document.getElementById("boat-gallery-prev");
    const nextBtn = document.getElementById("boat-gallery-next");

    function updateActiveSlide(newIdx) {
        if (newIdx < 0) newIdx = images.length - 1;
        if (newIdx >= images.length) newIdx = 0;
        activeIndex = newIdx;

        if (mainImg) {
            mainImg.src = images[activeIndex];
        }

        thumbButtons.forEach((btn, idx) => {
            btn.classList.toggle("active", idx === activeIndex);
        });
    }

    thumbButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.index, 10);
            updateActiveSlide(idx);
        });
    });

    if (prevBtn) {
        prevBtn.addEventListener("click", () => updateActiveSlide(activeIndex - 1));
    }
    if (nextBtn) {
        nextBtn.addEventListener("click", () => updateActiveSlide(activeIndex + 1));
    }
}

loadBoatDetails();
