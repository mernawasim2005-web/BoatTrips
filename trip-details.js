import { doc, getDoc, getDocs, addDoc, collection } 
    from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { db } from "./firebase.js";

const params = new URLSearchParams(window.location.search);
const tripId = params.get("id");

const tripInfo = document.querySelector(".trip-info");
const tripDetailsSection = document.querySelector(".trip-details");

function normalizeImageSource(value, fallback = "white_island.jpeg") {
    if (!value) return fallback;

    if (typeof value === "string") {
        const cleaned = value.trim().replace(/\\/g, "/");
        if (!cleaned) return fallback;

        if (cleaned.startsWith("http://") || cleaned.startsWith("https://") || cleaned.startsWith("data:")) {
            return cleaned;
        }

        const localPathParts = cleaned.match(/^[A-Za-z]:\/(?:.*\/)?([^/]+)$/);
        if (localPathParts) return localPathParts[1];

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

function normalizeBoatImageList(opt) {
    const candidates = [];

    if (Array.isArray(opt?.images)) {
        candidates.push(...opt.images);
    }

    if (Array.isArray(opt?.image)) {
        candidates.push(...opt.image);
    }

    if (opt?.image && typeof opt.image !== "string" && !Array.isArray(opt.image)) {
        candidates.push(opt.image);
    }

    if (opt?.image && typeof opt.image === "string") {
        candidates.push(opt.image);
    }

    if (opt?.images && typeof opt.images === "string") {
        candidates.push(opt.images);
    }

    const normalized = candidates
        .map((img) => normalizeImageSource(img, "images/white_island.jpeg"))
        .filter((img, index, arr) => img && arr.indexOf(img) === index);

    return normalized.length > 0 ? normalized : ["images/white_island.jpeg"];
}

let selectedBoat = null;
let selectedScheduleSlot = null;

function getBoatId(boat) {
    return boat?.boatId || boat?.id || boat?.boatID || boat?.boatName;
}

function normalizeBoatName(name) {
    return String(name || "").trim().toLowerCase();
}

if (!tripId) {
    tripInfo.innerHTML = "<p>No trip specified.</p>";
} else {
    try {
        const tripSnap = await getDoc(doc(db, "trips", tripId));

        if (tripSnap.exists()) {
            const trip = tripSnap.data();
            const addons = trip.addons || [];
            const schedule = trip.schedule || [];
            const configuredBoatOptions = trip.boatOptions || [];
            let boatOptions = configuredBoatOptions;

            try {
                const boatsSnapshot = await getDocs(collection(db, "boats"));
                const configuredById = new Map(configuredBoatOptions.map((boat) => [String(getBoatId(boat)), boat]));
                const configuredByName = new Map(configuredBoatOptions.map((boat) => [normalizeBoatName(boat.boatName), boat]));

                boatOptions = boatsSnapshot.docs.map((boatDoc) => {
                    const boat = boatDoc.data();
                    const configured = configuredById.get(boatDoc.id) || configuredByName.get(normalizeBoatName(boat.name));
                    return configured
                        ? {
                            ...configured,
                            boatId: boatDoc.id,
                            boatName: boat.name,
                            images: boat.images || (boat.image ? [boat.image] : configured.images),
                            capacity: boat.capacity || configured.capacity
                        }
                        : {
                            boatId: boatDoc.id,
                            boatName: boat.name,
                            images: boat.images || (boat.image ? [boat.image] : []),
                            capacity: boat.capacity,
                            price: null
                        };
                });

                configuredBoatOptions.forEach((boat) => {
                    if (!boatOptions.some((option) => String(getBoatId(option)) === String(getBoatId(boat)))) {
                        boatOptions.push(boat);
                    }
                });
            } catch (error) {
                console.warn("Could not load the full boat fleet; showing trip boats.", error);
            }
            const getSlotKey = (slot, boatId) => `${tripId}|${boatId}|${slot.date}|${slot.startTime}|${slot.endTime}`;

            async function getBookedSlotKeys(boatId) {
                const bookedKeys = new Set();

                let snapshot;
                try {
                    snapshot = await getDocs(collection(db, "bookings"));
                } catch (error) {
                    console.warn("Bookings are not readable for public visitors; showing scheduled times.", error);
                    return bookedKeys;
                }

                snapshot.forEach((bookingDoc) => {
                    const booking = bookingDoc.data();
                    if (booking.status === "cancelled" || booking.tripId !== tripId) return;

                    if (booking.slotKey) {
                        bookedKeys.add(booking.slotKey);
                        return;
                    }

                    // Supports bookings that were created before slotKey was added.
                    schedule.forEach((slot) => {
                        const sameBoat = booking.boatId
                            ? booking.boatId === boatId
                            : booking.boatName === selectedBoat?.boatName;
                        const sameDate = booking.tripDate === slot.date
                            || booking.scheduleText === slot.date
                            || booking.scheduleText === `${slot.date} (${slot.startTime} - ${slot.endTime})`;
                        if (sameBoat && sameDate) bookedKeys.add(getSlotKey(slot, boatId));
                    });
                });

                return bookedKeys;
            }
            const galleryImages = Array.isArray(trip.gallery)
                ? trip.gallery
                    .map((item) => {
                        if (typeof item === "string") {
                            return { image: item, caption: "" };
                        }
                        return {
                            image: item?.image || item?.src || "",
                            caption: item?.caption || ""
                        };
                    })
                    .filter((item) => item && item.image)
                : [];

            if (trip.background) {
                const backgroundImage = normalizeImageSource(trip.background, "images/white_island.jpeg");
                tripDetailsSection.style.backgroundImage = `url('${backgroundImage}')`;
                tripDetailsSection.style.backgroundSize = "cover";
                tripDetailsSection.style.backgroundPosition = "center";
                tripDetailsSection.style.backgroundAttachment = "fixed";
                tripDetailsSection.classList.add("has-custom-bg");
            }

            // Build add-ons with their optional images.
            const addonsHTML = addons.map((addon, index) => `
                <label class="addon-item">
                    <input type="checkbox" class="addon-checkbox"
                           data-price="${addon.price}"
                           data-type="${addon.type}"
                           id="addon-${index}">
                    ${addon.image ? `<img src="${addon.image}" alt="${addon.name}" class="addon-image">` : ""}
                    <span class="addon-details">
                        <span class="addon-name">${addon.name}</span>
                        <span class="addon-price">+${addon.price} EGP ${addon.type === "per_person" ? "/ person" : "/ boat"}</span>
                        ${addon.type === "per_person" ? `<label class="addon-people-label">People adding this: <input type="number" class="addon-people-count" min="1" value="1" disabled></label>` : ""}
                    </span>
                </label>
            `).join("");

            const galleryHTML = galleryImages.length > 0 ? `
                <div class="trip-gallery-section">
                    <h2>Trip Photo Gallery</h2>
                    <div class="trip-gallery-list">
                        ${galleryImages.map((item, index) => {
                            const src = normalizeImageSource(item.image);
                            const isEven = index % 2 === 0;
                            return `
                                <div class="trip-gallery-row ${isEven ? "image-right" : "image-left"}">
                                    <div class="trip-gallery-image-wrap">
                                        <img src="${src}" alt="${trip.name} gallery photo" onerror="this.onerror=null;this.src='images/white_island.jpeg';">
                                    </div>
                                                    <div class="trip-gallery-content">
                                    ${item.caption ? `<p>${item.caption}</p>` : ""}
                                </div>
                                </div>
                            `;
                        }).join("")}
                    </div>
                </div>
            ` : "";

                        // Build boat selection cards
            const boatCardsHTML = boatOptions.map((opt, index) => {
                const normalizedImages = normalizeBoatImageList(opt);
                const slidesHTML = normalizedImages.map((img, i) => `
                    <img src="${img}" alt="${opt.boatName}" class="boat-slide ${i === 0 ? "active" : ""}" data-boatopt="${index}" data-slide="${i}" onerror="this.onerror=null;this.src='images/white_island.jpeg';">
                `).join("");
                const thumbnailsHTML = normalizedImages.length > 1 ? `
                    <div class="boat-thumbnails">
                        ${normalizedImages.map((img, i) => `
                            <button type="button" class="boat-thumbnail ${i === 0 ? "active" : ""}" data-boatopt="${index}" data-slide="${i}" aria-label="View image ${i + 1} of ${opt.boatName}">
                                <img src="${img}" alt="" onerror="this.onerror=null;this.src='images/white_island.jpeg';">
                            </button>
                        `).join("")}
                    </div>
                ` : "";

                return `
                    <div class="boat-option-card" data-index="${index}">
                        <div class="boat-option-image">
                            ${slidesHTML}
                            ${normalizedImages.length > 1 ? `
                                <button type="button" class="boat-slide-nav boat-slide-prev" data-boatopt="${index}">‹</button>
                                <button type="button" class="boat-slide-nav boat-slide-next" data-boatopt="${index}">›</button>
                            ` : ""}
                        </div>
                        ${thumbnailsHTML}
                        <h4>${opt.boatName}</h4>
                        <p>${opt.price == null ? "Price on request" : `${opt.price} EGP / person`}</p>
                        <p class="boat-option-capacity">Up to ${opt.capacity} people</p>
                    </div>
                `;
            }).join("");

            tripInfo.innerHTML = `
                <h1>${trip.name}</h1>

                <div class="trip-data">
                    <p><strong>Location:</strong> ${trip.location}</p>
                    <p><strong>Duration:</strong> ${trip.duration}</p>
                </div>

                ${galleryHTML}

                <div class="trip-booking-layout">
                    ${boatOptions.length > 0 ? `
                        <div class="boat-options-section">
                            <h3 class="choose-boat-title">CHOOSE YOUR BOAT</h3>
                            <div class="boat-carousel">
                                <button type="button" class="boat-carousel-nav boat-carousel-prev" aria-label="Previous boat">‹</button>
                                <div class="boat-options-grid">
                                    ${boatCardsHTML}
                                </div>
                                <button type="button" class="boat-carousel-nav boat-carousel-next" aria-label="Next boat">›</button>
                            </div>
                        </div>
                    ` : `<p class="no-slots">No boats available for this trip yet. Please contact us.</p>`}

                    <div id="booking-form">
                    <div class="selected-boat-box">
                        <strong>Selected boat:</strong>
                        <span id="selected-boat-name">Not selected</span>
                    </div>

                    <label>
                        Your Name:
                        <input type="text" id="customer-name" placeholder="Enter your full name" required>
                    </label>

                    <div id="schedule-select-container">
                        <div class="customer-calendar customer-calendar-placeholder">
                            <strong>Choose Trip Date</strong>
                            <p>Select a boat first to view its scheduled dates and times.</p>
                        </div>
                    </div>

                    <label>
                        Number of people:
                        <input type="number" id="people-count" value="1" min="1">
                    </label>

                    ${addons.length > 0 ? `
                        <div class="addons-section">
                            <h4>Optional Add-ons:</h4>
                            ${addonsHTML}
                        </div>
                    ` : ""}

                    <p id="total-price">Total: 0 EGP</p>

                        <button class="book-btn" id="book-btn">Book Now</button>
                    </div>
                </div>
            `;


                        // Boat card image slideshow navigation
            document.querySelectorAll(".boat-slide-nav").forEach((btn) => {
                btn.addEventListener("click", (e) => {
                    e.stopPropagation(); // prevent selecting the boat when clicking arrows
                    const boatOptIndex = btn.dataset.boatopt;
                    const slides = document.querySelectorAll(`.boat-slide[data-boatopt="${boatOptIndex}"]`);
                    let activeIndex = [...slides].findIndex((s) => s.classList.contains("active"));

                    slides[activeIndex].classList.remove("active");

                    if (btn.classList.contains("boat-slide-next")) {
                        activeIndex = (activeIndex + 1) % slides.length;
                    } else {
                        activeIndex = (activeIndex - 1 + slides.length) % slides.length;
                    }

                    slides[activeIndex].classList.add("active");
                    document.querySelectorAll(`.boat-thumbnail[data-boatopt="${boatOptIndex}"]`).forEach((thumbnail) => {
                        thumbnail.classList.toggle("active", Number(thumbnail.dataset.slide) === activeIndex);
                    });
                });
            });

            document.querySelectorAll(".boat-thumbnail").forEach((thumbnail) => {
                thumbnail.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const boatOptIndex = thumbnail.dataset.boatopt;
                    const slideIndex = Number(thumbnail.dataset.slide);
                    document.querySelectorAll(`.boat-slide[data-boatopt="${boatOptIndex}"]`).forEach((slide) => {
                        slide.classList.toggle("active", Number(slide.dataset.slide) === slideIndex);
                    });
                    document.querySelectorAll(`.boat-thumbnail[data-boatopt="${boatOptIndex}"]`).forEach((item) => {
                        item.classList.toggle("active", item === thumbnail);
                    });
                });
            });

            // Show one large boat card at a time to keep the booking page compact.
            const boatCards = [...document.querySelectorAll(".boat-option-card")];
            let visibleBoatIndex = 0;

            function showBoatCard(index) {
                if (!boatCards.length) return;

                visibleBoatIndex = (index + boatCards.length) % boatCards.length;
                boatCards.forEach((card, cardIndex) => {
                    const isActive = cardIndex === visibleBoatIndex;
                    card.classList.toggle("carousel-active", isActive);
                    card.style.display = isActive ? "block" : "none";
                });
            }

            if (boatCards.length > 0) {
                showBoatCard(0);
                const prevButton = document.querySelector(".boat-carousel-prev");
                const nextButton = document.querySelector(".boat-carousel-next");

                if (prevButton) {
                    prevButton.addEventListener("click", () => showBoatCard(visibleBoatIndex - 1));
                }

                if (nextButton) {
                    nextButton.addEventListener("click", () => showBoatCard(visibleBoatIndex + 1));
                }
            }

            // Boat selection logic
            document.querySelectorAll(".boat-option-card").forEach((card) => {
                card.addEventListener("click", async () => {
                    document.querySelectorAll(".boat-option-card").forEach((c) => c.classList.remove("selected"));
                    card.classList.add("selected");

                    const index = parseInt(card.dataset.index);
                    selectedBoat = boatOptions[index];
                    selectedScheduleSlot = null;

                    if (selectedBoat.price == null) {
                        document.getElementById("total-price").textContent = "Price on request";
                    }

                    document.getElementById("selected-boat-name").textContent = selectedBoat.boatName;
                    document.getElementById("people-count").max = selectedBoat.capacity;
                    document.getElementById("people-count").value = 1;

                    await renderBookingCalendar();

                    updateTotal();
                });
            });

            async function renderBookingCalendar() {
                const scheduleContainer = document.getElementById("schedule-select-container");
                const selectedBoatId = getBoatId(selectedBoat);
                const matchingSlots = schedule.filter((slot) =>
                    String(slot.boatId || slot.boatID || slot.id || "") === String(selectedBoatId)
                    || normalizeBoatName(slot.boatName || slot.boat) === normalizeBoatName(selectedBoat.boatName)
                );
                const dateOnlyBooking = matchingSlots.length === 0;

                scheduleContainer.innerHTML = `
                    <div class="customer-calendar">
                        <h4>Choose Trip Date</h4>
                        ${dateOnlyBooking ? `<p class="calendar-note">Choose a date and we will confirm the trip time with you.</p>` : ""}
                        <div class="calendar-month-header">
                            <button type="button" id="previous-month" class="calendar-month-button" aria-label="Previous month">‹</button>
                            <strong id="calendar-month-label"></strong>
                            <button type="button" id="next-month" class="calendar-month-button" aria-label="Next month">›</button>
                        </div>
                        <div class="calendar-weekdays" aria-hidden="true">
                            <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
                        </div>
                        <div id="trip-date-slots" class="trip-date-slots"></div>
                        <div id="trip-time-slots" class="trip-time-slots" aria-live="polite">
                            <p class="calendar-note">Choose a date to view available times.</p>
                        </div>
                        <select id="schedule-select" hidden></select>
                    </div>
                `;

                const dateSlots = document.getElementById("trip-date-slots");
                const timeSlots = document.getElementById("trip-time-slots");
                const scheduleSelect = document.getElementById("schedule-select");
                const bookedSlotKeys = dateOnlyBooking
                    ? new Set()
                    : await getBookedSlotKeys(selectedBoatId);
                const availableDates = [...new Set(matchingSlots.map((slot) => slot.date))].sort();
                let displayedMonth = availableDates.length > 0
                    ? new Date(`${availableDates[0]}T00:00:00`)
                    : new Date();

                function dateKey(date) {
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, "0");
                    const day = String(date.getDate()).padStart(2, "0");
                    return `${year}-${month}-${day}`;
                }

                function slotsForDate(date) {
                    return matchingSlots.filter((slot) => slot.date === date);
                }

                function hasAvailableSlot(date) {
                    if (dateOnlyBooking) {
                        return date >= dateKey(new Date());
                    }

                    return slotsForDate(date).some((slot) => !bookedSlotKeys.has(getSlotKey(slot, selectedBoatId)));
                }

                function renderTimes(selectedDate) {
                    if (dateOnlyBooking) {
                        selectedScheduleSlot = {
                            date: selectedDate,
                            startTime: "To be confirmed",
                            endTime: "To be confirmed",
                            captainName: "Not assigned"
                        };
                        scheduleSelect.innerHTML = `<option value="selected" selected></option>`;
                        timeSlots.innerHTML = `<p class="calendar-note selected-time-note">Date selected. The trip time will be confirmed with you.</p>`;
                        return;
                    }

                    const daySlots = slotsForDate(selectedDate);
                    const availableSlots = daySlots.filter((slot) => !bookedSlotKeys.has(getSlotKey(slot, selectedBoatId)));
                    selectedScheduleSlot = null;
                    scheduleSelect.innerHTML = "";

                    if (availableSlots.length === 0) {
                        timeSlots.innerHTML = `<p class="calendar-note">No available times for this date.</p>`;
                        return;
                    }

                    timeSlots.innerHTML = `
                        <strong>Available times</strong>
                        <div class="trip-time-options">
                            ${availableSlots.map((slot, index) => `
                                <button type="button" class="trip-time-option" data-slot-index="${index}">
                                    ${slot.startTime || "Time to be confirmed"}${slot.endTime ? ` - ${slot.endTime}` : ""}
                                </button>
                            `).join("")}
                        </div>
                    `;

                    timeSlots.querySelectorAll(".trip-time-option").forEach((button, index) => {
                        button.addEventListener("click", () => {
                            selectedScheduleSlot = availableSlots[index];
                            timeSlots.querySelectorAll(".trip-time-option").forEach((item) => item.classList.remove("selected"));
                            button.classList.add("selected");
                            scheduleSelect.innerHTML = `<option value="selected" selected></option>`;
                        });
                    });
                }

                function renderMonth() {
                    const year = displayedMonth.getFullYear();
                    const month = displayedMonth.getMonth();
                    const firstDay = new Date(year, month, 1).getDay();
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const monthLabel = displayedMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

                    document.getElementById("calendar-month-label").textContent = monthLabel;
                    dateSlots.innerHTML = `${Array.from({ length: firstDay }, () => `<span class="calendar-day empty" aria-hidden="true"></span>`).join("")}${Array.from({ length: daysInMonth }, (_, index) => {
                        const date = new Date(year, month, index + 1);
                        const key = dateKey(date);
                        const daySlots = slotsForDate(key);
                        const isAvailable = hasAvailableSlot(key);
                        const hasSchedule = daySlots.length > 0;
                        return `<button type="button" class="trip-date-slot ${hasSchedule ? "has-schedule" : ""} ${hasSchedule && !isAvailable ? "fully-booked" : ""}" data-date="${key}" ${!isAvailable ? "disabled" : ""}>${index + 1}${hasSchedule ? `<span>${isAvailable ? "Available" : "Booked"}</span>` : ""}</button>`;
                    }).join("")}`;

                    dateSlots.querySelectorAll(".trip-date-slot:not(:disabled)").forEach((button) => {
                        button.addEventListener("click", () => {
                            selectedScheduleSlot = null;
                            timeSlots.innerHTML = `<p class="calendar-note">Choose an available time below.</p>`;
                            scheduleSelect.innerHTML = "";
                            dateSlots.querySelectorAll(".trip-date-slot").forEach((item) => item.classList.remove("selected"));
                            button.classList.add("selected");
                            renderTimes(button.dataset.date);
                        });
                    });
                }

                document.getElementById("previous-month").addEventListener("click", () => {
                    displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
                    renderMonth();
                });

                document.getElementById("next-month").addEventListener("click", () => {
                    displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
                    renderMonth();
                });

                renderMonth();
            }

            // Calculate total price whenever people count or addons change
            function updateTotal() {
                if (!selectedBoat) return;

                if (selectedBoat.price == null) {
                    document.getElementById("total-price").textContent = "Price on request";
                    return;
                }

                const peopleCount = parseInt(document.getElementById("people-count").value) || 1;
                document.querySelectorAll(".addon-people-count").forEach((input) => {
                    input.max = peopleCount;
                    if (parseInt(input.value) > peopleCount) input.value = peopleCount;
                });
                let total = selectedBoat.price * peopleCount;

                document.querySelectorAll(".addon-checkbox:checked").forEach((checkbox) => {
                    const price = parseFloat(checkbox.dataset.price);
                    const type = checkbox.dataset.type;

                    if (type === "per_person") {
                        const addonPeople = parseInt(checkbox.closest(".addon-item").querySelector(".addon-people-count")?.value) || 1;
                        total += price * addonPeople;
                    } else if (type === "per_boat") {
                        total += price;
                    }
                });

                document.getElementById("total-price").textContent = `Total: ${total} EGP`;
            }

            document.getElementById("booking-form").addEventListener("input", (e) => {
                if (e.target.id === "people-count" || e.target.classList.contains("addon-people-count")) updateTotal();
            });
            document.getElementById("booking-form").addEventListener("change", (e) => {
                if (e.target.classList.contains("addon-checkbox")) {
                    const addonPeopleInput = e.target.closest(".addon-item").querySelector(".addon-people-count");
                    if (addonPeopleInput) addonPeopleInput.disabled = !e.target.checked;
                    updateTotal();
                }
            });

            // Handle Book Now button click
            document.getElementById("book-btn").addEventListener("click", async () => {
                if (!selectedBoat) {
                    alert("Please select a boat first.");
                    return;
                }

                if (selectedBoat.price == null) {
                    alert("Please add a price for this boat in the trip settings before booking.");
                    return;
                }

                const customerName = document.getElementById("customer-name").value.trim();

                if (!customerName) {
                    alert("Please enter your name before booking.");
                    return;
                }

                const peopleCount = parseInt(document.getElementById("people-count").value) || 1;
                let total = selectedBoat.price * peopleCount;

                let selectedAddons = [];
                document.querySelectorAll(".addon-checkbox:checked").forEach((checkbox) => {
                    const price = parseFloat(checkbox.dataset.price);
                    const type = checkbox.dataset.type;
                    const addonItem = checkbox.closest(".addon-item");
                    const addonName = addonItem.querySelector(".addon-name").textContent.trim();
                    const addonPeople = type === "per_person"
                        ? Math.min(peopleCount, Math.max(1, parseInt(addonItem.querySelector(".addon-people-count")?.value) || 1))
                        : null;

                    if (type === "per_person") {
                        total += price * addonPeople;
                    } else if (type === "per_boat") {
                        total += price;
                    }

                    selectedAddons.push({
                        name: addonName,
                        price,
                        type,
                        peopleCount: addonPeople,
                        total: type === "per_person" ? price * addonPeople : price
                    });
                });

                let scheduleText = "Not specified";
                let captainName = "Not assigned";
                if (!selectedScheduleSlot) {
                    alert("Please choose an available date and time.");
                    return;
                }

                const selectedSlot = selectedScheduleSlot;
                const selectedBoatId = getBoatId(selectedBoat);
                const slotKey = getSlotKey(selectedSlot, selectedBoatId);
                const bookedSlotKeys = await getBookedSlotKeys(selectedBoatId);

                if (bookedSlotKeys.has(slotKey)) {
                    alert("This time is already booked. Please choose another available time.");
                    await renderBookingCalendar();
                    return;
                }

                scheduleText = selectedSlot.date;
                captainName = selectedSlot.captainName || "Not assigned";

                try {
                    await addDoc(collection(db, "bookings"), {
                        customerName: customerName,
                        tripId: tripId,
                        tripName: trip.name,
                        boatId: selectedBoatId,
                        boatName: selectedBoat.boatName,
                        captainName: captainName,
                        slotKey: slotKey,
                        tripDate: selectedSlot.date,
                        startTime: selectedSlot.startTime,
                        endTime: selectedSlot.endTime,
                        peopleCount: peopleCount,
                        addons: selectedAddons,
                        scheduleText: scheduleText,
                        totalPrice: total,
                        cost: 0,
                        status: "pending",
                        bookingSource: "AQUAVIDA",
                        createdAt: new Date().toISOString()
                    });
                } catch (error) {
                    console.error("Error saving booking:", error);
                    alert("Could not save your booking. Please try again.");
                    return;
                }

                const whatsappNumber = "201271311016";

                let message = `Hello, I would like to book the following trip:\n\n`;
                message += `Name: ${customerName}\n`;
                message += `Trip: ${trip.name}\n`;
                message += `Boat: ${selectedBoat.boatName}\n`;
                message += `Date: ${scheduleText}\n`;
                message += `Number of people: ${peopleCount}\n`;

                if (selectedAddons.length > 0) {
                    message += `Add-ons: ${selectedAddons.map((addon) => `${addon.name}${addon.peopleCount ? ` (${addon.peopleCount} people)` : ""}`).join(", ")}\n`;
                }

                message += `Total Price: ${total} EGP\n\n`;
                message += `Please confirm my booking.`;

                const encodedMessage = encodeURIComponent(message);
                const whatsappURL = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;

                window.open(whatsappURL, "_blank");
            });

        } else {
            tripInfo.innerHTML = "<p>Trip not found.</p>";
        }
    } catch (error) {
        console.error("Error loading trip:", error);
        tripInfo.innerHTML = "<p>Failed to load trip details.</p>";
    }
}


