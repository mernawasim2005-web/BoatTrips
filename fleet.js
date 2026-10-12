import { collection, getDocs } 
    from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { db } from "./firebase.js";

const fleetContainer = document.getElementById("fleet-container");
const standaloneBoatsPage = fleetContainer?.dataset.standalone === "true";

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
    // If not starting with images/ and it's a relative filename without folder
    if (!str.includes("/") && !str.includes("\\")) {
        return str;
    }
    return str;
}

try {
    const snapshot = await getDocs(collection(db, "boats"));

    const activeBoats = [];
    snapshot.forEach((docSnap) => {
        const boat = docSnap.data();
        if (boat.status !== "out_of_service") {
            activeBoats.push({
                id: docSnap.id,
                ...boat
            });
        }
    });

    if (activeBoats.length === 0) {
        fleetContainer.innerHTML = `
            <div class="fleet-empty-state">
                <p>No boats are currently available to show. Please check back soon or contact technical support.</p>
            </div>
        `;
    } else {
        fleetContainer.innerHTML = activeBoats.map((boat, boatIndex) => {
            let images = [];
            if (Array.isArray(boat.images) && boat.images.length > 0) {
                images = boat.images.map(normalizeImage);
            } else if (boat.image) {
                images = [normalizeImage(boat.image)];
            } else {
                images = ["images/boat1.jpeg"];
            }

            const imagesHTML = images.map((img, i) => `
                <img src="${img}" alt="${escapeHtml(boat.name)}" loading="lazy" decoding="async"
                     class="fleet-slide ${i === 0 ? "active" : ""}" 
                     data-boat="${boatIndex}" data-index="${i}"
                     onerror="this.onerror=null;this.src='images/boat1.jpeg';">
            `).join("");

            const specs = [
                !standaloneBoatsPage && boat.capacity ? `👥 Up to ${boat.capacity} Guests` : "",
                boat.length ? `📏 ${escapeHtml(boat.length)}` : "",
                boat.engine ? `⚙️ ${escapeHtml(boat.engine)}` : "",
                boat.year ? `📅 ${escapeHtml(boat.year)}` : ""
            ].filter(Boolean);

            const specsHTML = specs.length
                ? `<div class="fleet-specs">${specs.map((spec) => `<span>${spec}</span>`).join("")}</div>`
                : "";

            const descriptionText = boat.description && boat.description.trim() 
                ? escapeHtml(boat.description) 
                : "A comfortable, fully equipped vessel ready for your next unforgettable Red Sea adventure.";

            return `
                <div class="fleet-card modern-fleet-card" data-boat-id="${boat.id}">
                    <div class="fleet-image">
                        ${imagesHTML}
                        ${images.length > 1 ? `
                            <button class="fleet-nav fleet-prev" data-boat="${boatIndex}" aria-label="Previous photo">&larr;</button>
                            <button class="fleet-nav fleet-next" data-boat="${boatIndex}" aria-label="Next photo">&rarr;</button>
                            <div class="fleet-slide-indicator">
                                <span class="active-slide-num">1</span> / ${images.length}
                            </div>
                        ` : ""}
                        <span class="fleet-status-badge">Available for Charter</span>
                    </div>

                    <div class="fleet-card-body">
                        <div class="fleet-card-header">
                            <h3 class="fleet-card-title">${escapeHtml(boat.name || "Red Sea Boat")}</h3>
                            <span class="fleet-capacity-pill">${boat.capacity ? `Up to ${boat.capacity} guests` : "Private"}</span>
                        </div>

                        <p class="fleet-card-desc">${descriptionText}</p>

                        ${specsHTML}

                        ${standaloneBoatsPage ? "" : `<div class="fleet-card-facilities-preview">
                            <span title="Sun Deck">☀️ Sun Deck</span>
                            <span title="Snorkeling Gear">🤿 Snorkeling Gear</span>
                            <span title="Shaded Lounge">🛋️ Lounge</span>
                        </div>`}

                        ${standaloneBoatsPage ? "" : `<div class="fleet-card-actions">
                            <a href="boat-details.html?id=${boat.id}" class="book-btn fleet-view-btn">
                                View Boat Details &rarr;
                            </a>
                        </div>`}
                    </div>
                </div>
            `;
        }).join("");

        // Slideshow logic
        document.querySelectorAll(".fleet-nav").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const boatIndex = btn.dataset.boat;
                const slides = document.querySelectorAll(`.fleet-slide[data-boat="${boatIndex}"]`);
                const card = btn.closest(".fleet-card");
                const indicator = card ? card.querySelector(".active-slide-num") : null;
                
                let activeIndex = [...slides].findIndex((s) => s.classList.contains("active"));
                if (activeIndex === -1) activeIndex = 0;

                slides[activeIndex].classList.remove("active");

                if (btn.classList.contains("fleet-next")) {
                    activeIndex = (activeIndex + 1) % slides.length;
                } else {
                    activeIndex = (activeIndex - 1 + slides.length) % slides.length;
                }

                slides[activeIndex].classList.add("active");
                if (indicator) {
                    indicator.textContent = activeIndex + 1;
                }
            });
        });
    }

    fleetContainer.classList.add("is-loaded");
    fleetContainer.setAttribute("aria-busy", "false");

} catch (error) {
    console.error("Error loading fleet:", error);
    fleetContainer.innerHTML = "<p class='fleet-error'>Failed to load our fleet. Please try again later.</p>";
    fleetContainer.classList.add("is-loaded");
    fleetContainer.setAttribute("aria-busy", "false");
}