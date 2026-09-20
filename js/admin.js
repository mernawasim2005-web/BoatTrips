import { onAuthStateChanged, signOut } 
    from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import { collection, getDocs, deleteDoc, doc, addDoc, updateDoc } 
    from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";

const adminContent = document.getElementById("admin-content");
const logoutBtn = document.getElementById("logout-btn");

let editingTripId = null;
let currentSchedule = [];
let editingBoatId = null;
let currentSection = "overview";
let editingExpenseId = null;
let editingBookingId = null;
let scheduleOccupancy = {};
let currentTripCapacity = null;
let currentAddons = [];
let currentBoatImages = [];
let currentBoatOptions = [];
let currentTripGallery = [];
let adminCalendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let adminCalendarBoatId = "";
let adminCalendarBookings = [];



function formatScheduleText(slot) {
    return slot.date;
}

function isCancelledBooking(booking) {
    const status = String(booking.status || "").trim().toLowerCase();
    return status === "cancelled" || status === "canceled";
}

function extractMonthFromScheduleText(scheduleText) {
    if (!scheduleText) return null;
    const match = scheduleText.match(/^(\d{4})-(\d{2})-\d{2}/);
    return match ? `${match[1]}-${match[2]}` : null;
}

async function getActiveBookings() {
    const snapshot = await getDocs(collection(db, "bookings"));
    const bookings = [];
    snapshot.forEach((docSnap) => bookings.push(docSnap.data()));
    // Only active bookings should contribute to an upcoming trip's guest count.
    // Normalizing also covers older records saved as "Cancelled" or "canceled".
    return bookings.filter((booking) => !isCancelledBooking(booking));
}



onAuthStateChanged(auth, (user) => {
    if (user) {
        setupNav();
        showSection("overview");
    } else {
        window.location.href = "owner-login.html";
    }
});

logoutBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
        await signOut(auth);
        window.location.href = "owner-login.html";
    } catch (error) {
        console.error("Logout error:", error);
    }
});

function setupNav() {
    document.querySelectorAll(".admin-nav-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".admin-nav-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            showSection(btn.dataset.section);
        });
    });
}

function showSection(section) {
    currentSection = section;

    if (section === "overview") renderOverview();
    if (section === "bookings") renderBookingsSection();
    if (section === "trips") renderTripsSection();
    if (section === "boats") renderBoatsSection();
    if (section === "revenue") renderRevenueSection();
    if (section === "expenses") renderExpensesSection();
}


function renderExpensesSection() {
    adminContent.innerHTML = `
        <h2>Monthly Expenses & Net Profit</h2>

        <div class="month-selector">
            <label>Month: <input type="month" id="expense-month-filter"></label>
        </div>

        <div id="net-profit-summary" class="revenue-breakdown-section"></div>

        <button id="add-expense-btn" class="book-btn">+ Add Expense</button>

        <div id="expense-form-container"></div>

        <div id="admin-expenses-list">Loading expenses...</div>

        <div id="expenses-summary" class="revenue-breakdown-section"></div>
    `;

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    document.getElementById("expense-month-filter").value = currentMonth;

    document.getElementById("expense-month-filter").addEventListener("change", () => {
        loadExpensesList();
        loadNetProfit();
    });

    document.getElementById("add-expense-btn").addEventListener("click", () => {
        editingExpenseId = null;
        showExpenseForm();
    });

    loadExpensesList();
    loadNetProfit();
}


async function checkScheduleConflicts(excludeTripId = null) {
    try {
        const tripsSnap = await getDocs(collection(db, "trips"));
        let allSlots = [];

        tripsSnap.forEach((docSnap) => {
            const trip = docSnap.data();
            const schedule = trip.schedule || [];
            schedule.forEach((slot) => {
                allSlots.push({
                    tripId: docSnap.id,
                    tripName: trip.name,
                    date: slot.date,
                    boatName: slot.boatName,
                    captainName: slot.captainName
                });
            });
        });

        // Include the currently-edited (unsaved) schedule if applicable
        if (excludeTripId !== null) {
            allSlots = allSlots.filter((s) => s.tripId !== excludeTripId);
        }
        currentSchedule.forEach((slot) => {
            allSlots.push({
                tripId: excludeTripId || "new",
                tripName: "(this trip)",
                date: slot.date,
                boatName: slot.boatName,
                captainName: slot.captainName
            });
        });

        const conflicts = [];

        for (let i = 0; i < allSlots.length; i++) {
            for (let j = i + 1; j < allSlots.length; j++) {
                const a = allSlots[i];
                const b = allSlots[j];

                if (a.date !== b.date) continue;

                if (a.boatName && a.boatName !== "Not assigned" && a.boatName === b.boatName) {
                    conflicts.push(`🛥️ Boat "${a.boatName}" is scheduled more than once on ${a.date}`);
                }
                if (a.captainName && a.captainName !== "Not assigned" && a.captainName === b.captainName) {
                    conflicts.push(`👨‍✈️ Captain "${a.captainName}" is scheduled more than once on ${a.date}`);
                }
            }
        }

        return conflicts;
    } catch (error) {
        console.error("Error checking conflicts:", error);
        return [];
    }
}








/* ---------------- OVERVIEW ---------------- */

async function renderOverview() {
    adminContent.innerHTML = `
        <h2>Overview</h2>
        <div id="overview-grid" class="overview-grid">Loading...</div>
    `;

        const upcoming = await getUpcomingSchedule(5);
        const upcomingHTML = upcoming.length > 0 ? upcoming.map((slot) => `
            <div class="revenue-breakdown-row">
                <span><strong>${slot.tripName}</strong> — ${slot.date}</span>
                <span>🛥️ ${slot.boatName} | 👨‍✈️ ${slot.captainName}</span>
                <span>👥 ${slot.booked}/${slot.capacity} booked</span>
            </div>
        `).join("") : "<p>No upcoming trips scheduled.</p>";

        adminContent.insertAdjacentHTML("beforeend", `
            <div class="revenue-breakdown-section" style="margin-top:20px;">
                <h4>Upcoming Trips</h4>
                ${upcomingHTML}
            </div>
        `);




    try {
        const [tripsSnap, boatsSnap, bookingsSnap] = await Promise.all([
            getDocs(collection(db, "trips")),
            getDocs(collection(db, "boats")),
            getDocs(collection(db, "bookings"))
        ]);

        let allTimeRevenue = 0;
        let activeBookingsCount = 0;
        let todayBookingsCount = 0;
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        bookingsSnap.forEach((docSnap) => {
    const booking = docSnap.data();
    if (booking.status === "cancelled") return;

    activeBookingsCount++;
    allTimeRevenue += booking.totalPrice || 0;
    if (new Date(booking.createdAt) >= startOfToday) {
        todayBookingsCount++;
    }
});

        let activeBoatsCount = 0;
        boatsSnap.forEach((docSnap) => {
            if (docSnap.data().status === "active") activeBoatsCount++;
        });

        document.getElementById("overview-grid").innerHTML = `
            <div class="overview-card">
                <span class="overview-number">${tripsSnap.size}</span>
                <span class="overview-label">Total Trips</span>
            </div>
            <div class="overview-card">
                <span class="overview-number">${boatsSnap.size}</span>
                <span class="overview-label">Total Boats (${activeBoatsCount} active)</span>
            </div>
            <div class="overview-card">
                <span class="overview-number">${activeBookingsCount}</span>
                <span class="overview-label">Total Bookings</span>
            </div>
            <div class="overview-card">
                <span class="overview-number">${todayBookingsCount}</span>
                <span class="overview-label">Bookings Today</span>
            </div>
            <div class="overview-card">
                <span class="overview-number">${allTimeRevenue.toLocaleString()} EGP</span>
                <span class="overview-label">All-Time Revenue</span>
            </div>
        `;

    } catch (error) {
        console.error("Error loading overview:", error);
        document.getElementById("overview-grid").innerHTML = "<p>Failed to load overview.</p>";
    }
}




async function getUpcomingSchedule(limitCount = 5) {
    try {
        const tripsSnap = await getDocs(collection(db, "trips"));
        const bookings = await getActiveBookings();

        let allSlots = [];
        tripsSnap.forEach((docSnap) => {
            const trip = docSnap.data();
            const schedule = trip.schedule || [];
            schedule.forEach((slot) => {
                const slotDateTime = new Date(`${slot.date}T00:00:00`);
                if (slotDateTime >= new Date()) {
                    const text = formatScheduleText(slot);
                    const booked = bookings
                        .filter((b) => b.tripId === docSnap.id && (b.scheduleText === text || b.tripDate === slot.date))
                        .reduce((sum, b) => sum + (b.peopleCount || 0), 0);

                    // The overview is a list of booked upcoming trips, not every
                    // configured schedule slot. A deleted (or cancelled) booking
                    // therefore removes its slot from this list.
                    if (booked === 0) return;

                    allSlots.push({
                        tripName: trip.name,
                        date: slot.date,
                        boatName: slot.boatName || "Not assigned",
                        captainName: slot.captainName || "Not assigned",
                        capacity: trip.capacity || 0,
                        booked,
                        sortKey: slotDateTime
                    });
                }
            });
        });

        allSlots.sort((a, b) => a.sortKey - b.sortKey);
        return allSlots.slice(0, limitCount);

    } catch (error) {
        console.error("Error loading upcoming schedule:", error);
        return [];
    }
}







/* ---------------- SECTION WRAPPERS ---------------- */

function renderBookingsSection() {
    adminContent.innerHTML = `
        <h2>Bookings</h2>

        <div class="bookings-filter-bar">
            <input type="text" id="booking-search" placeholder="Search by customer name...">
            <input type="date" id="booking-date-filter">
            <button id="clear-filters-btn">Clear Filters</button>
        </div>

        <section class="admin-booking-calendar">
            <div class="calendar-heading">
                <h3>Booking Calendar</h3>
                <label>Boat
                    <select id="admin-calendar-boat">
                        <option value="">Loading boats...</option>
                    </select>
                </label>
            </div>
            <div class="admin-calendar-month-controls">
                <button type="button" id="admin-calendar-previous" aria-label="Previous month">‹</button>
                <strong id="admin-calendar-month-label"></strong>
                <button type="button" id="admin-calendar-next" aria-label="Next month">›</button>
            </div>
            <div class="admin-calendar-weekdays" aria-hidden="true">
                <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
            </div>
            <div id="admin-calendar-events">Loading calendar...</div>
        </section>

        <div id="admin-bookings-list">Loading bookings...</div>
    `;

    document.getElementById("booking-search").addEventListener("input", () => loadBookingsList());
    document.getElementById("booking-date-filter").addEventListener("change", () => loadBookingsList());
    document.getElementById("clear-filters-btn").addEventListener("click", () => {
        document.getElementById("booking-search").value = "";
        document.getElementById("booking-date-filter").value = "";
        loadBookingsList();
    });

    document.getElementById("admin-calendar-boat").addEventListener("change", (event) => {
        adminCalendarBoatId = event.target.value;
        renderAdminBoatCalendar();
    });
    document.getElementById("admin-calendar-previous").addEventListener("click", () => {
        adminCalendarMonth = new Date(adminCalendarMonth.getFullYear(), adminCalendarMonth.getMonth() - 1, 1);
        renderAdminBoatCalendar();
    });
    document.getElementById("admin-calendar-next").addEventListener("click", () => {
        adminCalendarMonth = new Date(adminCalendarMonth.getFullYear(), adminCalendarMonth.getMonth() + 1, 1);
        renderAdminBoatCalendar();
    });

    loadBookingsList();
    loadBookingCalendar();
}

async function loadBookingCalendar() {
    const calendarContainer = document.getElementById("admin-calendar-events");
    const boatSelect = document.getElementById("admin-calendar-boat");
    if (!calendarContainer || !boatSelect) return;

    try {
        const [boatsSnapshot, bookingsSnapshot] = await Promise.all([
            getDocs(collection(db, "boats")),
            getDocs(collection(db, "bookings"))
        ]);
        const boats = [];
        boatsSnapshot.forEach((boatDoc) => {
            const boat = boatDoc.data();
            if (boat.status !== "out_of_service") boats.push({ id: boatDoc.id, ...boat });
        });

        adminCalendarBookings = [];
        bookingsSnapshot.forEach((bookingDoc) => {
            const booking = bookingDoc.data();
            if (!isCancelledBooking(booking)) adminCalendarBookings.push(booking);
        });

        if (boats.length === 0) {
            boatSelect.innerHTML = `<option value="">No boats available</option>`;
            calendarContainer.innerHTML = `<p class="no-slots">No boats available.</p>`;
            return;
        }

        if (!boats.some((boat) => boat.id === adminCalendarBoatId)) {
            adminCalendarBoatId = boats[0].id;
        }

        boatSelect.innerHTML = boats.map((boat) => `
            <option value="${boat.id}" ${boat.id === adminCalendarBoatId ? "selected" : ""}>${boat.name}</option>
        `).join("");
        renderAdminBoatCalendar();
    } catch (error) {
        console.error("Error loading booking calendar:", error);
        calendarContainer.innerHTML = `<p class="no-slots">Could not load the booking calendar.</p>`;
    }
}

function renderAdminBoatCalendar() {
    const calendarContainer = document.getElementById("admin-calendar-events");
    const monthLabel = document.getElementById("admin-calendar-month-label");
    if (!calendarContainer || !monthLabel || !adminCalendarBoatId) return;

    const selectedMonth = adminCalendarMonth.getMonth();
    const selectedYear = adminCalendarMonth.getFullYear();
    const firstDay = new Date(selectedYear, selectedMonth, 1).getDay();
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const selectedBoatName = document.querySelector("#admin-calendar-boat option:checked")?.textContent.trim();
    const selectedBoatBookings = adminCalendarBookings.filter((booking) =>
        String(booking.boatId || "") === String(adminCalendarBoatId)
        || (!booking.boatId && booking.boatName === selectedBoatName)
    );
    const bookingsByDate = selectedBoatBookings.reduce((grouped, booking) => {
        const date = booking.tripDate || (booking.scheduleText || "").slice(0, 10);
        if (date) (grouped[date] ||= []).push(booking);
        return grouped;
    }, {});

    monthLabel.textContent = adminCalendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const emptyDays = Array.from({ length: firstDay }, () => `<span class="admin-calendar-day empty" aria-hidden="true"></span>`).join("");
    const monthDays = Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const date = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const bookings = bookingsByDate[date] || [];
        const bookingSummary = bookings.map((booking) => `
            <span class="admin-calendar-booking">${booking.customerName || "Customer"} <small>${booking.peopleCount || 0} guests</small></span>
        `).join("");

        return `
            <div class="admin-calendar-day ${bookings.length > 0 ? "has-bookings" : ""}">
                <strong>${day}</strong>
                ${bookings.length > 0 ? `<span class="admin-calendar-booking-count">${bookings.length} booking${bookings.length === 1 ? "" : "s"}</span>` : ""}
                ${bookingSummary}
            </div>
        `;
    }).join("");

    calendarContainer.innerHTML = `${emptyDays}${monthDays}`;
}

function renderTripsSection() {
    adminContent.innerHTML = `
        <h2>Manage Trips</h2>
        <button id="add-trip-btn" class="book-btn">+ Add New Trip</button>
        <div id="trip-form-container"></div>
        <div id="admin-trips-list">Loading trips...</div>
    `;

    document.getElementById("add-trip-btn").addEventListener("click", () => {
        editingTripId = null;
        currentSchedule = [];
        showTripForm();
    });

    loadTripsList();
}

function renderBoatsSection() {
    adminContent.innerHTML = `
        <h2>Manage Boats</h2>
        <button id="add-boat-btn" class="book-btn">+ Add New Boat</button>
        <div id="boat-form-container"></div>
        <div id="admin-boats-list">Loading boats...</div>
    `;

    document.getElementById("add-boat-btn").addEventListener("click", () => {
        editingBoatId = null;
        showBoatForm();
    });

    loadBoatsList();
}

function renderRevenueSection() {
    adminContent.innerHTML = `
        <h2>Revenue</h2>
        <div id="admin-revenue" class="revenue-container">Loading revenue...</div>
    `;
    loadRevenue();
}


/* ---------------- TRIPS ---------------- */

async function loadBookingsList() {
    const listContainer = document.getElementById("admin-bookings-list");

    try {
        const snapshot = await getDocs(collection(db, "bookings"));

        if (snapshot.empty) {
            listContainer.innerHTML = "<p>No bookings yet.</p>";
            return;
        }

        // Sort by newest first
        let bookings = [];
        snapshot.forEach((docSnap) => {
            bookings.push({ id: docSnap.id, ...docSnap.data() });
        });
        // Cancelled bookings no longer occupy a boat time and are hidden from the active list.
        bookings = bookings.filter((booking) => booking.status !== "cancelled");
        bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Apply search filter (by customer name)
        const searchInput = document.getElementById("booking-search");
        const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";
        if (searchTerm) {
            bookings = bookings.filter((booking) => 
                (booking.customerName || "").toLowerCase().includes(searchTerm)
            );
        }

        // Apply date filter (matches the trip's scheduled date, not the booking creation date)
        const dateInput = document.getElementById("booking-date-filter");
        const dateFilter = dateInput ? dateInput.value : "";
        if (dateFilter) {
            bookings = bookings.filter((booking) => 
                (booking.scheduleText || "").includes(dateFilter)
            );
        }

        if (bookings.length === 0) {
            listContainer.innerHTML = "<p>No bookings match your search.</p>";
            return;
        }

        let html = "";
        bookings.forEach((booking) => {
            const date = new Date(booking.createdAt).toLocaleString();
            const status = booking.status || "pending";

          


const cost = booking.cost || 0;
const profit = (booking.totalPrice || 0) - cost;

html += `
    <div class="admin-booking-row">
        <div class="booking-row-header">
            <p><strong>${booking.tripName}</strong></p>
            <span class="status-badge status-${status}">${status}</span>
        </div>
        <p>👤 ${booking.customerName || "N/A"}</p>
        <p>🛥️ ${booking.boatName || "Not assigned"}</p>
        <p>👨‍✈️ ${booking.captainName || "Not assigned"}</p>
        <p>📅 ${booking.scheduleText}</p>
        <p>👥 ${booking.peopleCount} people</p>
        ${booking.addons && booking.addons.length > 0 ? `<p>➕ ${booking.addons.join(", ")}</p>` : ""}
        <p>💰 Revenue: ${booking.totalPrice} EGP</p>
        <p class="booking-date">Booked on: ${date}</p>

        <label class="status-select-label">
            Status:
            <select class="status-select" data-id="${booking.id}">
                <option value="pending" ${status === "pending" ? "selected" : ""}>Pending</option>
                <option value="confirmed" ${status === "confirmed" ? "selected" : ""}>Confirmed</option>
                <option value="cancelled" ${status === "cancelled" ? "selected" : ""}>Cancelled</option>
            </select>
        </label>

        <div class="cost-edit-row">
            <label>
                Cost (EGP):
                <input type="number" class="cost-input" data-id="${booking.id}" value="${cost}">
            </label>
            <button type="button" class="save-cost-btn" data-id="${booking.id}">Save</button>
            <span class="profit-display">Profit: ${profit.toLocaleString()} EGP</span>
        </div>

        <button type="button" class="edit-booking-btn" data-id="${booking.id}">Edit Boat / Captain</button>
        <button type="button" class="delete-booking-btn" data-id="${booking.id}">Delete Permanently</button>
        <div class="booking-edit-form-container" data-id="${booking.id}"></div>
    </div>
`;
        });

        listContainer.innerHTML = html;

                document.querySelectorAll(".status-select").forEach((select) => {
            select.addEventListener("change", () => updateBookingStatus(select.dataset.id, select.value));
        });

                document.querySelectorAll(".save-cost-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const input = document.querySelector(`.cost-input[data-id="${btn.dataset.id}"]`);
                const newCost = parseFloat(input.value) || 0;
                updateBookingCost(btn.dataset.id, newCost);
            });
        });

        document.querySelectorAll(".edit-booking-btn").forEach((btn) => {
            btn.addEventListener("click", () => showBookingEditForm(btn.dataset.id, bookings));
        });

        document.querySelectorAll(".delete-booking-btn").forEach((btn) => {
            btn.addEventListener("click", () => deleteBooking(btn.dataset.id));
        });

    } catch (error) {
        console.error("Error loading bookings:", error);
        listContainer.innerHTML = "<p>Failed to load bookings.</p>";
    }
}

async function updateBookingStatus(bookingId, newStatus) {
    try {
        await updateDoc(doc(db, "bookings", bookingId), { status: newStatus });
        loadBookingsList();
        loadBookingCalendar();
    } catch (error) {
        console.error("Error updating booking status:", error);
        alert("Failed to update status. Please try again.");
    }
}

async function deleteBooking(bookingId) {
    const confirmed = confirm("Delete this booking permanently? This action cannot be undone.");
    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, "bookings", bookingId));
        loadBookingsList();
        loadBookingCalendar();
    } catch (error) {
        console.error("Error deleting booking:", error);
        alert("Could not delete this booking. Please try again.");
    }
}

async function updateBookingCost(bookingId, newCost) {
    try {
        await updateDoc(doc(db, "bookings", bookingId), { cost: newCost });
        loadBookingsList();
    } catch (error) {
        console.error("Error updating booking cost:", error);
        alert("Failed to update cost. Please try again.");
    }
}



async function showBookingEditForm(bookingId, bookings) {
    const container = document.querySelector(`.booking-edit-form-container[data-id="${bookingId}"]`);
    const booking = bookings.find((b) => b.id === bookingId);

    if (!booking) return;

    // If form is already open, close it (toggle)
    if (container.innerHTML !== "") {
        container.innerHTML = "";
        return;
    }

    let boatOptions = `<option value="">Not assigned</option>`;
    try {
        const boatsSnapshot = await getDocs(collection(db, "boats"));
        boatsSnapshot.forEach((docSnap) => {
            const boat = docSnap.data();
            const selected = boat.name === booking.boatName ? "selected" : "";
            boatOptions += `<option value="${boat.name}" ${selected}>${boat.name}</option>`;
        });
    } catch (error) {
        console.error("Error loading boats:", error);
    }

    container.innerHTML = `
        <form class="admin-form booking-edit-form">
            <label>Boat:
                <select class="edit-boat-select">
                    ${boatOptions}
                </select>
            </label>
            <label>Captain:
                <input type="text" class="edit-captain-input" value="${booking.captainName === "Not assigned" ? "" : (booking.captainName || "")}" placeholder="Captain name">
            </label>
            <div>
                <button type="submit" class="book-btn">Save Changes</button>
                <button type="button" class="cancel-booking-edit-btn">Cancel</button>
            </div>
        </form>
    `;

    container.querySelector(".booking-edit-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const newBoatName = container.querySelector(".edit-boat-select").value || "Not assigned";
        const newCaptainName = container.querySelector(".edit-captain-input").value.trim() || "Not assigned";
        updateBookingBoatCaptain(bookingId, newBoatName, newCaptainName);
    });

    container.querySelector(".cancel-booking-edit-btn").addEventListener("click", () => {
        container.innerHTML = "";
    });
}

async function updateBookingBoatCaptain(bookingId, boatName, captainName) {
    try {
        await updateDoc(doc(db, "bookings", bookingId), { boatName, captainName });
        loadBookingsList();
    } catch (error) {
        console.error("Error updating booking boat/captain:", error);
        alert("Failed to update. Please try again.");
    }
}






async function loadTripsList() {
    const listContainer = document.getElementById("admin-trips-list");

    try {
        const snapshot = await getDocs(collection(db, "trips"));

        if (snapshot.empty) {
            listContainer.innerHTML = "<p>No trips yet. Add one above.</p>";
            return;
        }

        let html = "";
        snapshot.forEach((docSnap) => {
            const trip = docSnap.data();

            html += `
                <div class="admin-trip-row">
                    <span><strong>${trip.name}</strong></span>
                    <div>
                        <button class="edit-trip-btn" data-id="${docSnap.id}">Edit</button>
                        <button class="delete-trip-btn" data-id="${docSnap.id}">Delete</button>
                    </div>
                </div>
            `;
        });

        listContainer.innerHTML = html;

        document.querySelectorAll(".edit-trip-btn").forEach((btn) => {
            btn.addEventListener("click", () => editTrip(btn.dataset.id));
        });

        document.querySelectorAll(".delete-trip-btn").forEach((btn) => {
            btn.addEventListener("click", () => deleteTrip(btn.dataset.id));
        });

    } catch (error) {
        console.error("Error loading trips:", error);
        listContainer.innerHTML = "<p>Failed to load trips.</p>";
    }
}

async function showTripForm(trip = null) {
    const formContainer = document.getElementById("trip-form-container");

       currentSchedule = trip?.schedule ? [...trip.schedule] : [];
    currentAddons = trip?.addons ? [...trip.addons] : [];
    currentBoatOptions = trip?.boatOptions ? [...trip.boatOptions] : [];
    currentTripGallery = Array.isArray(trip?.gallery)
        ? trip.gallery.map((item) => {
            if (typeof item === "string") return { image: item, caption: "" };
            return {
                image: item?.image || item?.src || "",
                caption: item?.caption || ""
            };
        })
        : [];

    currentTripCapacity = currentBoatOptions.length > 0 
    ? Math.max(...currentBoatOptions.map((opt) => opt.capacity || 0)) 
    : null;


    scheduleOccupancy = {};

    if (editingTripId && currentSchedule.length > 0) {
        try {
            const bookings = await getActiveBookings();
            currentSchedule.forEach((slot, index) => {
                const text = formatScheduleText(slot);
                scheduleOccupancy[index] = bookings
                    .filter((b) => b.tripId === editingTripId && b.scheduleText === text)
                    .reduce((sum, b) => sum + (b.peopleCount || 0), 0);
            });
        } catch (error) {
            console.error("Error computing occupancy:", error);
        }
    };

        formContainer.innerHTML = `
        <form id="trip-form" class="admin-form">
            <label>Name: <input type="text" id="trip-name" value="${trip?.name || ""}" required></label>
            <label>Location: <input type="text" id="trip-location" value="${trip?.location || ""}" required></label>
            <label>Duration: <input type="text" id="trip-duration" value="${trip?.duration || ""}" required></label>
            <label>Description: <textarea id="trip-description">${trip?.description || ""}</textarea></label>
            <label>Background Image Path: <input type="text" id="trip-background" value="${trip?.background || ""}" placeholder="images/white-island-bg.jpeg"></label>






            <div class="schedule-section">
                <h4>Available Boats & Pricing</h4>
                <div id="boat-options-list"></div>

                <div class="schedule-add-row">
                    <select id="new-boatoption-select">
                        <option value="">Select Boat</option>
                    </select>
                    <input type="number" id="new-boatoption-price" placeholder="Price per person (EGP)">
                    <input type="number" id="new-boatoption-capacity" placeholder="Capacity">
                    <button type="button" id="add-boatoption-btn">+ Add</button>
                </div>
            </div>

            <div class="schedule-section">
                <h4>Trip Photo Gallery</h4>
                <div id="trip-gallery-list"></div>

                <div class="schedule-add-row">
                    <input type="text" id="new-gallery-image" placeholder="images/trip-photo1.jpg">
                    <input type="text" id="new-gallery-caption" placeholder="Write description for this photo">
                    <button type="button" id="add-gallery-image-btn">+ Add</button>
                </div>
            </div>

            <div class="schedule-section">
                <h4>Optional Add-ons</h4>


            <div class="schedule-section">
                <h4>Optional Add-ons</h4>
                <div id="addons-list"></div>

                               <div class="schedule-add-row">
                    <input type="text" id="new-addon-name" placeholder="Addon name (e.g. Diving)">
                    <select id="new-addon-type">
                        <option value="per_person">Per Person</option>
                        <option value="per_boat">Per Boat</option>
                    </select>
                    <input type="number" id="new-addon-price" placeholder="Price (EGP)">
                </div>
                <div class="schedule-add-row">
                    <input type="text" id="new-addon-image" placeholder="images/diving.jpeg">
                    <input type="text" id="new-addon-description" placeholder="Short description of this activity">
                    <button type="button" id="add-addon-btn">+ Add</button>
                </div>
            </div>

            <div>
                <button type="submit" class="book-btn">${editingTripId ? "Update Trip" : "Add Trip"}</button>
                <button type="button" id="cancel-form-btn">Cancel</button>
            </div>
        </form>
    `;


                   renderBoatOptionsList();
    populateBoatOptionSelect();
    renderAddonsList();
    renderTripGalleryList();

    document.getElementById("add-boatoption-btn").addEventListener("click", addBoatOption);
    document.getElementById("add-addon-btn").addEventListener("click", addAddon);
    document.getElementById("add-gallery-image-btn").addEventListener("click", addGalleryImage);


    document.getElementById("cancel-form-btn").addEventListener("click", () => {
        formContainer.innerHTML = "";
        editingTripId = null;
        currentSchedule = [];
    });

    document.getElementById("trip-form").addEventListener("submit", handleTripFormSubmit);
}

function renderScheduleList() {
    const scheduleList = document.getElementById("schedule-list");

    if (currentSchedule.length === 0) {
        scheduleList.innerHTML = "<p class='no-slots'>No dates added yet.</p>";
        return;
    }

    scheduleList.innerHTML = currentSchedule.map((slot, index) => {
    const booked = scheduleOccupancy[index] || 0;
    const occupancyText = currentTripCapacity ? ` — 👥 ${booked}/${currentTripCapacity} booked` : "";
    return `
        <div class="schedule-slot">
            <span>📅 ${slot.date} — 🛥️ ${slot.boatName || "Not assigned"} — 👨‍✈️ ${slot.captainName || "Not assigned"}${occupancyText}</span>
            <button type="button" class="remove-slot-btn" data-index="${index}">✕</button>
        </div>
    `;
}).join("");
}

function populateBoatDropdown() {
    const boatSelect = document.getElementById("new-boat");

    let options = `<option value="">Select Boat</option>`;
    currentBoatOptions.forEach((opt) => {
        options += `<option value="${opt.boatId}" data-name="${opt.boatName}">${opt.boatName}</option>`;
    });

    boatSelect.innerHTML = options;
}




async function addScheduleSlot() {
    const date = document.getElementById("new-date").value;
    const boatSelect = document.getElementById("new-boat");
    const boatId = boatSelect.value;
    const boatName = boatId ? boatSelect.options[boatSelect.selectedIndex].dataset.name : "Not assigned";
    const captainName = document.getElementById("new-captain").value.trim() || "Not assigned";

    if (!date || !boatId) {
        alert("Please select a boat and date.");
        return;
    }

    currentSchedule.push({ date, boatId, boatName, captainName });
    renderScheduleList();

    document.getElementById("new-date").value = "";
    document.getElementById("new-boat").value = "";
    document.getElementById("new-captain").value = "";

    const conflicts = await checkScheduleConflicts(editingTripId);
    showConflictWarning(conflicts);
}



function renderAddonsList() {
    const addonsList = document.getElementById("addons-list");

    if (currentAddons.length === 0) {
        addonsList.innerHTML = "<p class='no-slots'>No add-ons yet.</p>";
        return;
    }

        addonsList.innerHTML = currentAddons.map((addon, index) => `
        <div class="schedule-slot">
            <span>➕ ${addon.name} — ${addon.price} EGP ${addon.type === "per_person" ? "/ person" : "/ boat"} ${addon.image ? `— 🖼️ ${addon.image}` : ""}</span>
            <button type="button" class="remove-addon-btn" data-index="${index}">✕</button>
        </div>
    `).join("");

    document.querySelectorAll(".remove-addon-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const index = parseInt(btn.dataset.index);
            currentAddons.splice(index, 1);
            renderAddonsList();
        });
    });
}

function addAddon() {
    const name = document.getElementById("new-addon-name").value.trim();
    const type = document.getElementById("new-addon-type").value;
    const price = parseFloat(document.getElementById("new-addon-price").value);
    const image = document.getElementById("new-addon-image").value.trim();
    const description = document.getElementById("new-addon-description").value.trim();

    if (!name || isNaN(price)) {
        alert("Please enter an addon name and price.");
        return;
    }

    currentAddons.push({ name, type, price, image, description });
    renderAddonsList();

    document.getElementById("new-addon-name").value = "";
    document.getElementById("new-addon-price").value = "";
    document.getElementById("new-addon-image").value = "";
    document.getElementById("new-addon-description").value = "";
}



function renderBoatOptionsList() {
    const list = document.getElementById("boat-options-list");

    if (currentBoatOptions.length === 0) {
        list.innerHTML = "<p class='no-slots'>No boats added yet. Add one below.</p>";
        return;
    }

    list.innerHTML = currentBoatOptions.map((opt, index) => `
        <div class="schedule-slot">
            <span>🛥️ ${opt.boatName} — ${opt.price} EGP / person — 👥 up to ${opt.capacity}</span>
            <button type="button" class="remove-boatoption-btn" data-index="${index}">✕</button>
        </div>
    `).join("");

    document.querySelectorAll(".remove-boatoption-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const index = parseInt(btn.dataset.index);
            currentBoatOptions.splice(index, 1);
            renderBoatOptionsList();
            populateBoatDropdown(); // refresh schedule boat dropdown too
        });
    });
}

async function populateBoatOptionSelect() {
    const select = document.getElementById("new-boatoption-select");

    try {
        const snapshot = await getDocs(collection(db, "boats"));
        let options = `<option value="">Select Boat</option>`;

        snapshot.forEach((docSnap) => {
    const boat = docSnap.data();
    const images = boat.images && boat.images.length > 0 ? boat.images : (boat.image ? [boat.image] : []);
    options += `<option value="${docSnap.id}" data-name="${boat.name}" data-capacity="${boat.capacity || ""}" data-images='${JSON.stringify(images)}'>${boat.name}</option>`;
});

        select.innerHTML = options;

        select.addEventListener("change", () => {
            const selected = select.options[select.selectedIndex];
            const capacity = selected.dataset.capacity;
            if (capacity) {
                document.getElementById("new-boatoption-capacity").value = capacity;
            }
        });
    } catch (error) {
        console.error("Error loading boats for options:", error);
    }
}

function addBoatOption() {
    const select = document.getElementById("new-boatoption-select");
    const boatId = select.value;

    if (!boatId) {
        alert("Please select a boat.");
        return;
    }

    const selected = select.options[select.selectedIndex];
    const boatName = selected.dataset.name;
    const images = JSON.parse(selected.dataset.images || "[]");
    const price = parseFloat(document.getElementById("new-boatoption-price").value);
    const capacity = parseInt(document.getElementById("new-boatoption-capacity").value);

    if (isNaN(price) || isNaN(capacity)) {
        alert("Please enter price and capacity.");
        return;
    }

    currentBoatOptions.push({ boatId, boatName, images, price, capacity });
    renderBoatOptionsList();
    populateBoatDropdown();

    select.value = "";
    document.getElementById("new-boatoption-price").value = "";
    document.getElementById("new-boatoption-capacity").value = "";
}



function renderTripGalleryList() {
    const list = document.getElementById("trip-gallery-list");

    if (currentTripGallery.length === 0) {
        list.innerHTML = "<p class='no-slots'>No gallery photos yet.</p>";
        return;
    }

    list.innerHTML = currentTripGallery.map((item, index) => `
        <div class="schedule-slot">
            <span>🖼️ ${item.image || "No image"} ${item.caption ? `— ${item.caption}` : ""}</span>
            <button type="button" class="remove-gallery-image-btn" data-index="${index}">✕</button>
        </div>
    `).join("");

    document.querySelectorAll(".remove-gallery-image-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const index = parseInt(btn.dataset.index);
            currentTripGallery.splice(index, 1);
            renderTripGalleryList();
        });
    });
}

function addGalleryImage() {
    const path = document.getElementById("new-gallery-image").value.trim();
    const caption = document.getElementById("new-gallery-caption").value.trim();

    if (!path) {
        alert("Please enter an image path.");
        return;
    }

    currentTripGallery.push({ image: path, caption });
    renderTripGalleryList();

    document.getElementById("new-gallery-image").value = "";
    document.getElementById("new-gallery-caption").value = "";
}





function showConflictWarning(conflicts) {
    let warningBox = document.getElementById("conflict-warning");
    if (!warningBox) {
        warningBox = document.createElement("div");
        warningBox.id = "conflict-warning";
        document.getElementById("schedule-list").insertAdjacentElement("afterend", warningBox);
    }

    if (conflicts.length === 0) {
        warningBox.innerHTML = "";
        warningBox.className = "";
    } else {
        warningBox.className = "conflict-warning-box";
        warningBox.innerHTML = conflicts.map((c) => `<p>⚠️ ${c}</p>`).join("");
    }
}

async function editTrip(tripId) {
    try {
        const snapshot = await getDocs(collection(db, "trips"));
        let tripData = null;

        snapshot.forEach((docSnap) => {
            if (docSnap.id === tripId) {
                tripData = docSnap.data();
            }
        });

        if (tripData) {
    editingTripId = tripId;
    await showTripForm(tripData);
}
    } catch (error) {
        console.error("Error loading trip for edit:", error);
    }
}

async function handleTripFormSubmit(e) {
    e.preventDefault();

            const tripData = {
        name: document.getElementById("trip-name").value,
        location: document.getElementById("trip-location").value,
        duration: document.getElementById("trip-duration").value,
        description: document.getElementById("trip-description").value,
        background: document.getElementById("trip-background").value,
        boatOptions: currentBoatOptions,
        schedule: currentSchedule,
        addons: currentAddons,
        gallery: currentTripGallery
    
    
    };

    try {
        if (editingTripId) {
            await updateDoc(doc(db, "trips", editingTripId), tripData);
        } else {
            await addDoc(collection(db, "trips"), tripData);
        }

                document.getElementById("trip-form-container").innerHTML = "";
        editingTripId = null;
        currentSchedule = [];
        currentAddons = [];
        currentBoatOptions = [];
        currentTripGallery = [];
        loadTripsList();

        
    } catch (error) {
        console.error("Error saving trip:", error);
        alert("Failed to save trip. Please try again.");
    }
}

async function deleteTrip(tripId) {
    const confirmed = confirm("Are you sure you want to delete this trip?");
    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, "trips", tripId));
        loadTripsList();
    } catch (error) {
        console.error("Error deleting trip:", error);
        alert("Failed to delete trip. Please try again.");
    }
}

/* ---------------- BOATS ---------------- */

async function loadBoatsList() {
    const listContainer = document.getElementById("admin-boats-list");

    try {
        const snapshot = await getDocs(collection(db, "boats"));

        if (snapshot.empty) {
            listContainer.innerHTML = "<p>No boats yet. Add one above.</p>";
            return;
        }

        let html = "";
        snapshot.forEach((docSnap) => {
            const boat = docSnap.data();
            const statusLabel = {
                active: "🟢 Active",
                maintenance: "🟡 Maintenance",
                out_of_service: "🔴 Out of Service"
            }[boat.status] || boat.status;

            const images = boat.images && boat.images.length > 0 
                ? boat.images 
                : (boat.image ? [boat.image] : []);

            const thumbnailsHTML = images.map((img) => `
                <img src="${img}" alt="${boat.name}" class="admin-boat-thumb">
            `).join("");

            html += `
                <div class="admin-boat-card">
                    ${images.length > 0 ? `<div class="admin-boat-thumbs">${thumbnailsHTML}</div>` : ""}
                    <div class="admin-trip-row">
                        <span><strong>${boat.name}</strong> — ${boat.capacity} people — ${statusLabel}</span>
                        <div>
                            <button class="edit-boat-btn" data-id="${docSnap.id}">Edit</button>
                            <button class="delete-boat-btn" data-id="${docSnap.id}">Delete</button>
                        </div>
                    </div>
                </div>
            `;
        });

        listContainer.innerHTML = html;
        document.querySelectorAll(".edit-boat-btn").forEach((btn) => {
            btn.addEventListener("click", () => editBoat(btn.dataset.id));
        });

        document.querySelectorAll(".delete-boat-btn").forEach((btn) => {
            btn.addEventListener("click", () => deleteBoat(btn.dataset.id));
        });

    } catch (error) {
        console.error("Error loading boats:", error);
        listContainer.innerHTML = "<p>Failed to load boats.</p>";
    }
}

function showBoatForm(boat = null) {
    const formContainer = document.getElementById("boat-form-container");
    currentBoatImages = boat?.images ? [...boat.images] : (boat?.image ? [boat.image] : []);

    formContainer.innerHTML = `
        <form id="boat-form" class="admin-form">
            <h4>Basic Info</h4>

            <label>Boat Name: <input type="text" id="boat-name" value="${boat?.name || ""}" required></label>
            <label>Capacity: <input type="number" id="boat-capacity" value="${boat?.capacity || ""}" required></label>
            <label>Status:
                <select id="boat-status">
                    <option value="active" ${boat?.status === "active" ? "selected" : ""}>Active</option>
                    <option value="maintenance" ${boat?.status === "maintenance" ? "selected" : ""}>Maintenance</option>
                    <option value="out_of_service" ${boat?.status === "out_of_service" ? "selected" : ""}>Out of Service</option>
                </select>
            </label>

            <h4>Technical Details (owner only)</h4>

            <label>Engine: <input type="text" id="boat-engine" value="${boat?.engine || ""}" placeholder="e.g. Yamaha 250HP"></label>
            <label>Length: <input type="text" id="boat-length" value="${boat?.length || ""}" placeholder="e.g. 12 meters"></label>
            <label>Year Built: <input type="text" id="boat-year" value="${boat?.year || ""}" placeholder="e.g. 2021"></label>
            <label>Maintenance Notes: <textarea id="boat-notes">${boat?.notes || ""}</textarea></label>

                                    <h4>Public Info (shown to customers)</h4>

            <div class="schedule-section">
                <h4>Photos</h4>
                <div id="boat-images-list"></div>

                <div class="schedule-add-row">
                    <input type="text" id="new-boat-image" placeholder="images/boat1.jpg">
                    <button type="button" id="add-boat-image-btn">+ Add</button>
                </div>
            </div>

            <label>Short Description: <textarea id="boat-description" placeholder="A comfortable, spacious boat perfect for family trips">${boat?.description || ""}</textarea></label><div>
                <button type="submit" class="book-btn">${editingBoatId ? "Update Boat" : "Add Boat"}</button>
                <button type="button" id="cancel-boat-form-btn">Cancel</button>
            </div>
        </form>
    `;

        renderBoatImagesList();
    document.getElementById("add-boat-image-btn").addEventListener("click", addBoatImage);

    document.getElementById("cancel-boat-form-btn").addEventListener("click", () => {
        formContainer.innerHTML = "";
        editingBoatId = null;
    });

    document.getElementById("boat-form").addEventListener("submit", handleBoatFormSubmit);
}

function renderBoatImagesList() {
    const list = document.getElementById("boat-images-list");

    if (currentBoatImages.length === 0) {
        list.innerHTML = "<p class='no-slots'>No photos added yet.</p>";
        return;
    }

    list.innerHTML = currentBoatImages.map((imgPath, index) => `
        <div class="schedule-slot">
            <span>🖼️ ${imgPath}</span>
            <button type="button" class="remove-boat-image-btn" data-index="${index}">✕</button>
        </div>
    `).join("");

    document.querySelectorAll(".remove-boat-image-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const index = parseInt(btn.dataset.index);
            currentBoatImages.splice(index, 1);
            renderBoatImagesList();
        });
    });
}

function addBoatImage() {
    const path = document.getElementById("new-boat-image").value.trim();

    if (!path) {
        alert("Please enter an image path.");
        return;
    }

    currentBoatImages.push(path);
    renderBoatImagesList();

    document.getElementById("new-boat-image").value = "";
}

async function editBoat(boatId) {
    try {
        const snapshot = await getDocs(collection(db, "boats"));
        let boatData = null;

        snapshot.forEach((docSnap) => {
            if (docSnap.id === boatId) {
                boatData = docSnap.data();
            }
        });

        if (boatData) {
            editingBoatId = boatId;
            showBoatForm(boatData);
        }
    } catch (error) {
        console.error("Error loading boat for edit:", error);
    }
}

async function handleBoatFormSubmit(e) {
    e.preventDefault();

        const boatData = {
        name: document.getElementById("boat-name").value,
        capacity: parseInt(document.getElementById("boat-capacity").value),
        status: document.getElementById("boat-status").value,
        engine: document.getElementById("boat-engine").value,
        length: document.getElementById("boat-length").value,
        year: document.getElementById("boat-year").value,
        notes: document.getElementById("boat-notes").value,
        images: currentBoatImages,
        description: document.getElementById("boat-description").value
    };


    try {
        if (editingBoatId) {
            await updateDoc(doc(db, "boats", editingBoatId), boatData);
        } else {
            await addDoc(collection(db, "boats"), boatData);
        }

        document.getElementById("boat-form-container").innerHTML = "";
        editingBoatId = null;
        loadBoatsList();

    } catch (error) {
        console.error("Error saving boat:", error);
        alert("Failed to save boat. Please try again.");
    }
}

async function deleteBoat(boatId) {
    const confirmed = confirm("Are you sure you want to delete this boat?");
    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, "boats", boatId));
        loadBoatsList();
    } catch (error) {
        console.error("Error deleting boat:", error);
        alert("Failed to delete boat. Please try again.");
    }
}



async function loadRevenue() {
    const revenueContainer = document.getElementById("admin-revenue");

    try {
        const snapshot = await getDocs(collection(db, "bookings"));

        let todayRevenue = 0, todayCost = 0;
        let weekRevenue = 0, weekCost = 0;
        let monthRevenue = 0, monthCost = 0;
        let allTimeRevenue = 0, allTimeCost = 0;

        const revenueByTrip = {};
        const revenueByBoat = {};
        const revenueByMonth = {};

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        snapshot.forEach((docSnap) => {
    const booking = docSnap.data();
    if (booking.status === "cancelled") return;

    const revenue = booking.totalPrice || 0;
    const cost = booking.cost || 0;
    const bookingDate = new Date(booking.createdAt);

            allTimeRevenue += revenue;
            allTimeCost += cost;

            if (bookingDate >= startOfMonth) { monthRevenue += revenue; monthCost += cost; }
            if (bookingDate >= startOfWeek) { weekRevenue += revenue; weekCost += cost; }
            if (bookingDate >= startOfToday) { todayRevenue += revenue; todayCost += cost; }

            const tripKey = booking.tripName || "Unknown Trip";
            if (!revenueByTrip[tripKey]) revenueByTrip[tripKey] = { revenue: 0, cost: 0 };
            revenueByTrip[tripKey].revenue += revenue;
            revenueByTrip[tripKey].cost += cost;

            const boatKey = booking.boatName || "Not assigned";
            if (!revenueByBoat[boatKey]) revenueByBoat[boatKey] = { revenue: 0, cost: 0 };
            revenueByBoat[boatKey].revenue += revenue;
            revenueByBoat[boatKey].cost += cost;

            const monthKey = `${bookingDate.getFullYear()}-${String(bookingDate.getMonth() + 1).padStart(2, "0")}`;
            if (!revenueByMonth[monthKey]) revenueByMonth[monthKey] = { revenue: 0, cost: 0 };
            revenueByMonth[monthKey].revenue += revenue;
            revenueByMonth[monthKey].cost += cost;
        });

        const tripRowsHTML = Object.entries(revenueByTrip)
            .sort((a, b) => b[1].revenue - a[1].revenue)
            .map(([name, data]) => {
                const profit = data.revenue - data.cost;
                const margin = data.revenue > 0 ? ((profit / data.revenue) * 100).toFixed(1) : "0.0";
                return `
                    <div class="revenue-breakdown-row">
                        <span>${name}</span>
                        <span>Revenue: ${data.revenue.toLocaleString()} EGP</span>
                        <span>Cost: ${data.cost.toLocaleString()} EGP</span>
                        <span>Profit: ${profit.toLocaleString()} EGP (${margin}%)</span>
                    </div>
                `;
            }).join("");

        const boatRowsHTML = Object.entries(revenueByBoat)
            .sort((a, b) => b[1].revenue - a[1].revenue)
            .map(([name, data]) => {
                const profit = data.revenue - data.cost;
                return `
                    <div class="revenue-breakdown-row">
                        <span>${name}</span>
                        <span>Revenue: ${data.revenue.toLocaleString()} EGP</span>
                        <span>Cost: ${data.cost.toLocaleString()} EGP</span>
                        <span>Profit: ${profit.toLocaleString()} EGP</span>
                    </div>
                `;
            }).join("");

        const monthNames = ["January", "February", "March", "April", "May", "June", 
                             "July", "August", "September", "October", "November", "December"];

        const monthRowsHTML = Object.entries(revenueByMonth)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([monthKey, data]) => {
                const [year, month] = monthKey.split("-");
                const monthLabel = `${monthNames[parseInt(month) - 1]} ${year}`;
                const profit = data.revenue - data.cost;
                const margin = data.revenue > 0 ? ((profit / data.revenue) * 100).toFixed(1) : "0.0";
                return `
                    <div class="revenue-breakdown-row">
                        <span>${monthLabel}</span>
                        <span>Revenue: ${data.revenue.toLocaleString()} EGP</span>
                        <span>Cost: ${data.cost.toLocaleString()} EGP</span>
                        <span>Profit: ${profit.toLocaleString()} EGP (${margin}%)</span>
                    </div>
                `;
            }).join("");

        const allTimeProfit = allTimeRevenue - allTimeCost;
        const todayProfit = todayRevenue - todayCost;
        const weekProfit = weekRevenue - weekCost;
        const monthProfit = monthRevenue - monthCost;

        revenueContainer.innerHTML = `
            <div class="revenue-summary">
                <div class="revenue-card">
                    <span class="revenue-label">Today</span>
                    <span class="revenue-amount">${todayRevenue.toLocaleString()} EGP</span>
                    <span class="revenue-sub">Profit: ${todayProfit.toLocaleString()} EGP</span>
                </div>
                <div class="revenue-card">
                    <span class="revenue-label">This Week</span>
                    <span class="revenue-amount">${weekRevenue.toLocaleString()} EGP</span>
                    <span class="revenue-sub">Profit: ${weekProfit.toLocaleString()} EGP</span>
                </div>
                <div class="revenue-card">
                    <span class="revenue-label">This Month</span>
                    <span class="revenue-amount">${monthRevenue.toLocaleString()} EGP</span>
                    <span class="revenue-sub">Profit: ${monthProfit.toLocaleString()} EGP</span>
                </div>
                <div class="revenue-card">
                    <span class="revenue-label">All Time</span>
                    <span class="revenue-amount">${allTimeRevenue.toLocaleString()} EGP</span>
                    <span class="revenue-sub">Cost: ${allTimeCost.toLocaleString()} EGP</span>
                    <span class="revenue-sub"><strong>Profit: ${allTimeProfit.toLocaleString()} EGP</strong></span>
                </div>
            </div>

            <div class="revenue-breakdown-section">
                <h4>Revenue & Profit by Trip</h4>
                ${tripRowsHTML || "<p>No data yet.</p>"}
            </div>

            <div class="revenue-breakdown-section">
                <h4>Revenue & Profit by Boat</h4>
                ${boatRowsHTML || "<p>No data yet.</p>"}
            </div>

            <div class="revenue-breakdown-section">
                <h4>Revenue & Profit by Month</h4>
                ${monthRowsHTML || "<p>No data yet.</p>"}
            </div>
        `;

    } catch (error) {
        console.error("Error loading revenue:", error);
        revenueContainer.innerHTML = "<p>Failed to load revenue.</p>";
    }
}


/* ---------------- EXPENSES ---------------- */

async function loadExpensesList() {
    const listContainer = document.getElementById("admin-expenses-list");
    const summaryContainer = document.getElementById("expenses-summary");
    const selectedMonth = document.getElementById("expense-month-filter").value;

    try {
        const snapshot = await getDocs(collection(db, "expenses"));

        let expenses = [];
        snapshot.forEach((docSnap) => {
            expenses.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Filter by selected month
        expenses = expenses.filter((exp) => exp.month === selectedMonth);

        if (expenses.length === 0) {
            listContainer.innerHTML = "<p>No expenses recorded for this month.</p>";
            summaryContainer.innerHTML = "";
            return;
        }

        let html = "";
        let totalExpenses = 0;
        const byCategory = {};

        expenses.forEach((exp) => {
            totalExpenses += exp.amount || 0;
            byCategory[exp.category] = (byCategory[exp.category] || 0) + (exp.amount || 0);

            html += `
                <div class="admin-trip-row">
                    <span><strong>${exp.category}</strong> — ${exp.amount.toLocaleString()} EGP ${exp.notes ? `— ${exp.notes}` : ""}</span>
                    <div>
                        <button class="edit-expense-btn" data-id="${exp.id}">Edit</button>
                        <button class="delete-expense-btn" data-id="${exp.id}">Delete</button>
                    </div>
                </div>
            `;
        });

        listContainer.innerHTML = html;

        const categoryRowsHTML = Object.entries(byCategory).map(([cat, amount]) => `
            <div class="revenue-breakdown-row">
                <span>${cat}</span>
                <span>${amount.toLocaleString()} EGP</span>
            </div>
        `).join("");

        summaryContainer.innerHTML = `
            <h4>Total Expenses This Month: ${totalExpenses.toLocaleString()} EGP</h4>
            ${categoryRowsHTML}
        `;

        document.querySelectorAll(".edit-expense-btn").forEach((btn) => {
            btn.addEventListener("click", () => editExpense(btn.dataset.id));
        });

        document.querySelectorAll(".delete-expense-btn").forEach((btn) => {
            btn.addEventListener("click", () => deleteExpense(btn.dataset.id));
        });

    } catch (error) {
        console.error("Error loading expenses:", error);
        listContainer.innerHTML = "<p>Failed to load expenses.</p>";
    }
}



async function loadNetProfit() {
    const container = document.getElementById("net-profit-summary");
    const selectedMonth = document.getElementById("expense-month-filter").value;

    try {
        const [bookingsSnap, expensesSnap] = await Promise.all([
            getDocs(collection(db, "bookings")),
            getDocs(collection(db, "expenses"))
        ]);

        let tripRevenue = 0, tripCost = 0;
        bookingsSnap.forEach((docSnap) => {
            const b = docSnap.data();
            if (b.status === "cancelled") return;
            if (extractMonthFromScheduleText(b.scheduleText) === selectedMonth) {
                tripRevenue += b.totalPrice || 0;
                tripCost += b.cost || 0;
            }
        });

        let totalExpenses = 0;
        expensesSnap.forEach((docSnap) => {
            const exp = docSnap.data();
            if (exp.month === selectedMonth) totalExpenses += exp.amount || 0;
        });

        const netProfit = tripRevenue - tripCost - totalExpenses;

        container.innerHTML = `
            <h4>Net Profit — ${selectedMonth}</h4>
            <div class="revenue-breakdown-row">
                <span>Trip Revenue</span>
                <span>${tripRevenue.toLocaleString()} EGP</span>
            </div>
            <div class="revenue-breakdown-row">
                <span>Trip Costs</span>
                <span>${tripCost.toLocaleString()} EGP</span>
            </div>
            <div class="revenue-breakdown-row">
                <span>Monthly Expenses</span>
                <span>${totalExpenses.toLocaleString()} EGP</span>
            </div>
            <div class="revenue-breakdown-row">
                <span><strong>Net Profit</strong></span>
                <span><strong>${netProfit.toLocaleString()} EGP</strong></span>
            </div>
        `;
    } catch (error) {
        console.error("Error computing net profit:", error);
        container.innerHTML = "<p>Failed to load net profit.</p>";
    }
}








function showExpenseForm(expense = null) {
    const formContainer = document.getElementById("expense-form-container");
    const selectedMonth = document.getElementById("expense-month-filter").value;

    formContainer.innerHTML = `
        <form id="expense-form" class="admin-form">
            <label>Category:
                <select id="expense-category">
                    <option value="Marina Rent" ${expense?.category === "Marina Rent" ? "selected" : ""}>Marina Rent</option>
                    <option value="Captain Salaries" ${expense?.category === "Captain Salaries" ? "selected" : ""}>Captain Salaries</option>
                    <option value="Maintenance" ${expense?.category === "Maintenance" ? "selected" : ""}>Maintenance</option>
                    <option value="Fuel" ${expense?.category === "Fuel" ? "selected" : ""}>Fuel</option>
                    <option value="Other" ${expense?.category === "Other" ? "selected" : ""}>Other</option>
                </select>
            </label>
            <label>Amount (EGP): <input type="number" id="expense-amount" value="${expense?.amount || ""}" required></label>
            <label>Month: <input type="month" id="expense-month" value="${expense?.month || selectedMonth}" required></label>
            <label>Notes: <input type="text" id="expense-notes" value="${expense?.notes || ""}" placeholder="Optional details"></label>

            <div>
                <button type="submit" class="book-btn">${editingExpenseId ? "Update Expense" : "Add Expense"}</button>
                <button type="button" id="cancel-expense-form-btn">Cancel</button>
            </div>
        </form>
    `;

    document.getElementById("cancel-expense-form-btn").addEventListener("click", () => {
        formContainer.innerHTML = "";
        editingExpenseId = null;
    });

    document.getElementById("expense-form").addEventListener("submit", handleExpenseFormSubmit);
}

async function editExpense(expenseId) {
    try {
        const snapshot = await getDocs(collection(db, "expenses"));
        let expenseData = null;

        snapshot.forEach((docSnap) => {
            if (docSnap.id === expenseId) {
                expenseData = docSnap.data();
            }
        });

        if (expenseData) {
            editingExpenseId = expenseId;
            showExpenseForm(expenseData);
        }
    } catch (error) {
        console.error("Error loading expense for edit:", error);
    }
}

async function handleExpenseFormSubmit(e) {
    e.preventDefault();

    const expenseData = {
        category: document.getElementById("expense-category").value,
        amount: parseFloat(document.getElementById("expense-amount").value),
        month: document.getElementById("expense-month").value,
        notes: document.getElementById("expense-notes").value
    };

    try {
        if (editingExpenseId) {
            await updateDoc(doc(db, "expenses", editingExpenseId), expenseData);
        } else {
            await addDoc(collection(db, "expenses"), expenseData);
        }

        document.getElementById("expense-form-container").innerHTML = "";
        editingExpenseId = null;
        loadExpensesList();

    } catch (error) {
        console.error("Error saving expense:", error);
        alert("Failed to save expense. Please try again.");
    }
}

async function deleteExpense(expenseId) {
    const confirmed = confirm("Are you sure you want to delete this expense?");
    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, "expenses", expenseId));
        loadExpensesList();
    } catch (error) {
        console.error("Error deleting expense:", error);
        alert("Failed to delete expense. Please try again.");
    }
}

