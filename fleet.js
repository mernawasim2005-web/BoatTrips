import { collection, getDocs } 
    from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { db } from "./firebase.js";

const fleetContainer = document.getElementById("fleet-container");

try {
    const snapshot = await getDocs(collection(db, "boats"));

    const activeBoats = [];
    snapshot.forEach((docSnap) => {
        const boat = docSnap.data();
        if (boat.status !== "out_of_service") {
            activeBoats.push(boat);
        }
    });

    if (activeBoats.length === 0) {
        fleetContainer.innerHTML = "<p>No boats to show right now.</p>";
    } else {
        fleetContainer.innerHTML = activeBoats.map((boat, boatIndex) => {
            const images = boat.images && boat.images.length > 0 
                ? boat.images 
                : (boat.image ? [boat.image] : []);

            const imagesHTML = images.map((img, i) => `
                <img src="${img}" alt="${boat.name}" loading="lazy" decoding="async"
                     class="fleet-slide ${i === 0 ? "active" : ""}" 
                     data-boat="${boatIndex}" data-index="${i}">
            `).join("");

            return `
                <div class="fleet-card">
                    <div class="fleet-image">
                        ${images.length > 0 ? imagesHTML : `<svg class="fleet-placeholder" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="3"></circle><path d="M12 22V8"></path><path d="M5 12H2a10 10 0 0 0 20 0h-3"></path></svg>`}
                        ${images.length > 1 ? `
                            <button class="fleet-nav fleet-prev" data-boat="${boatIndex}">‹</button>
                            <button class="fleet-nav fleet-next" data-boat="${boatIndex}">›</button>
                        ` : ""}
                    </div>
                    <h3>${boat.name}</h3>
                    <p>${boat.description || "A great boat for your next adventure."}</p>
                    <p class="fleet-capacity">Up to ${boat.capacity} people</p>
                </div>
            `;
        }).join("");

        // Slideshow logic
        document.querySelectorAll(".fleet-nav").forEach((btn) => {
            btn.addEventListener("click", () => {
                const boatIndex = btn.dataset.boat;
                const slides = document.querySelectorAll(`.fleet-slide[data-boat="${boatIndex}"]`);
                let activeIndex = [...slides].findIndex((s) => s.classList.contains("active"));

                slides[activeIndex].classList.remove("active");

                if (btn.classList.contains("fleet-next")) {
                    activeIndex = (activeIndex + 1) % slides.length;
                } else {
                    activeIndex = (activeIndex - 1 + slides.length) % slides.length;
                }

                slides[activeIndex].classList.add("active");
            });
        });
    }

    fleetContainer.classList.add("is-loaded");
    fleetContainer.setAttribute("aria-busy", "false");

} catch (error) {
    console.error("Error loading fleet:", error);
    fleetContainer.innerHTML = "<p>Failed to load our fleet. Please try again later.</p>";
    fleetContainer.classList.add("is-loaded");
    fleetContainer.setAttribute("aria-busy", "false");
}