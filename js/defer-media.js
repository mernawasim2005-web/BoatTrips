/**
 * Progressive hero-video loading.
 *
 * The MP4 is ~5 MB, so it stays off the critical path entirely: the <video>
 * ships with its <source> src withheld and only attaches once the page is
 * idle and the connection looks decent. Until then the poster image renders.
 * Reduced-motion, Save-Data and phone-sized viewports never get the video.
 *
 * After attaching, playback is driven by a single piece of state -- "is this
 * video actually worth decoding right now" -- so a backgrounded or
 * scrolled-past hero stops holding a decoder thread and compositor budget.
 */
(function () {
    "use strict";

    var videos = Array.prototype.slice.call(document.querySelectorAll("video")).filter(function (video) {
        return video.querySelector("source[data-src]");
    });
    if (!videos.length) return;

    var sources = [];
    var attached = false;

    videos.forEach(function (video) {
        Array.prototype.push.apply(
            sources,
            Array.prototype.slice.call(video.querySelectorAll("source[data-src]"))
        );
    });

    function reducedMotion() {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    function connectionAllowsVideo() {
        var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!c) return true; // unknown: assume it is fine
        if (c.saveData) return false;
        return c.effectiveType !== "slow-2g" && c.effectiveType !== "2g";
    }

    // Decorative background video is skipped on phones: ~5 MB is not worth
    // mobile data. Note that trips.html asks for this with a `media` attribute
    // on its <source>, which no browser applies to <video>, so the gate lives
    // here and applies to every hero video on the site.
    function viewportAllowsVideo() {
        return !window.matchMedia("(max-width: 767px)").matches;
    }

    /* ---------- playback state ---------- */

    var pageVisible = !document.hidden;
    var onScreen = true;

    function shouldPlay() {
        return attached && pageVisible && onScreen;
    }

    function applyPlayback() {
        var play = shouldPlay();
        videos.forEach(function (video) {
            if (play) {
                if (video.paused) {
                    var attempt = video.play();
                    // Autoplay can still be refused (policy, low power mode).
                    if (attempt && typeof attempt.catch === "function") attempt.catch(function () {});
                }
            } else if (!video.paused) {
                video.pause();
            }
        });
    }

    if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (entries) {
            onScreen = entries.some(function (entry) { return entry.isIntersecting; });
            applyPlayback();
        }, { threshold: 0.01 });
        videos.forEach(function (video) { io.observe(video); });
    } else {
        // Old-browser fallback: one throttled scroll listener.
        var ticking = false;
        window.addEventListener("scroll", function () {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(function () {
                onScreen = videos.some(function (video) {
                    var rect = video.getBoundingClientRect();
                    return rect.bottom > 0 && rect.top < window.innerHeight;
                });
                applyPlayback();
                ticking = false;
            });
        }, { passive: true });
    }

    document.addEventListener("visibilitychange", function () {
        pageVisible = !document.hidden;
        applyPlayback();
    });

    /* ---------- attaching the sources ---------- */

    function attach() {
        if (attached || !sources.length) return;
        attached = true;
        sources.forEach(function (source) {
            source.src = source.dataset.src;
            source.removeAttribute("data-src");
        });
        videos.forEach(function (video) {
            video.load();
            // Deliberately keep the poster attribute: the browser swaps it out
            // itself once the first frame decodes. Clearing it here would flash
            // the empty hero in the meantime.
        });
        applyPlayback();
    }

    if (reducedMotion() || !connectionAllowsVideo() || !viewportAllowsVideo()) return;

    if ("requestIdleCallback" in window) {
        window.requestIdleCallback(attach, { timeout: 2500 });
    } else {
        window.addEventListener("load", function () {
            window.setTimeout(attach, 200);
        }, { once: true });
    }
})();
