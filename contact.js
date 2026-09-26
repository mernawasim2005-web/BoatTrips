const WHATSAPP_NUMBER = "201271311016";

const contactForm = document.getElementById("contact-form");
const contactName = document.getElementById("contact-name");
const contactPhone = document.getElementById("contact-phone");
const contactSubject = document.getElementById("contact-subject");
const contactMessage = document.getElementById("contact-message");
const contactStatus = document.getElementById("contact-status");

function setContactStatus(text, state) {
    contactStatus.textContent = text;
    contactStatus.className = state ? `contact-status is-${state}` : "contact-status";
}

if (contactForm) {
    contactForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const name = contactName.value.trim();
        const phone = contactPhone.value.trim();
        const message = contactMessage.value.trim();

        if (!name || !phone || !message) {
            setContactStatus("Please fill in your name, phone number and message.", "error");
            return;
        }

        const subject = contactSubject.value;
        const text = [
            `New ${subject.toLowerCase()} message from the website`,
            "",
            `Name: ${name}`,
            `Phone: ${phone}`,
            "",
            message
        ].join("\n");

        setContactStatus("Opening WhatsApp with your message...", "success");
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`, "_blank");
    });
}

const presetSubjects = {
    booking: "Trip booking",
    group: "Group or private charter",
    availability: "Boat availability"
};

const requestedSubject = new URLSearchParams(window.location.search).get("subject");
if (requestedSubject && presetSubjects[requestedSubject]) {
    contactSubject.value = presetSubjects[requestedSubject];
}
