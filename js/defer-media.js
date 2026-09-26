function loadDeferredMedia() {
    document.querySelectorAll("video source[data-src]").forEach((source) => {
        source.src = source.dataset.src;
        source.removeAttribute("data-src");
        source.parentElement.load();
    });
}

window.addEventListener("load", loadDeferredMedia, { once: true });