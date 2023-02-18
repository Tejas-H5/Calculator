// deprecated, cause setting innerText or textContent is probably better
function sanitizeHTML(html) {
    return html
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function lerp(a, b, t) {
    if (t < 0) return a;
    if (t > 1) return b;

    return a + (b - a) * t;
}