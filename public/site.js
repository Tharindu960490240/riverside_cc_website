/* ===== Riverside Cricket Club — shared script for the About and Contact pages ===== */
const $ = (sel) => document.querySelector(sel);

function setupNav() {
  const toggle = $(".nav-toggle");
  const nav = $("#main-nav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });
}

/* ---------- Contact form ---------- */
function setupContactForm() {
  const form = $("#contact-form");
  if (!form) return;
  const status = $("#cf-status");
  const submit = $("#cf-submit");

  // /contact?topic=sponsorship pre-selects the topic (used by "Advertise with us")
  const topic = new URLSearchParams(location.search).get("topic");
  if (topic && form.topic.querySelector(`option[value="${CSS.escape(topic)}"]`)) form.topic.value = topic;

  const show = (text, kind) => {
    status.textContent = text;
    status.className = `form-status ${kind || ""}`;
  };

  const fieldError = (input, message) => {
    input.setAttribute("aria-invalid", "true");
    input.focus();
    show(message, "is-error");
  };

  form.addEventListener("input", (e) => e.target.removeAttribute("aria-invalid"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.name = (data.name || "").trim();
    data.email = (data.email || "").trim();
    data.message = (data.message || "").trim();

    if (!data.name) return fieldError(form.name, "Please enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return fieldError(form.email, "Please enter a valid email address so we can reply.");
    if (data.message.length < 5) return fieldError(form.message, "Please write a short message.");

    submit.disabled = true;
    submit.textContent = "Sending…";
    show("", "");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Something went wrong.");
      form.reset();
      show("Thanks! Your message has been sent. A club volunteer will reply by email.", "is-success");
    } catch (err) {
      show(`${err.message} You can also message us on Facebook or Instagram.`, "is-error");
    } finally {
      submit.disabled = false;
      submit.textContent = "Send message";
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();
  setupNav();
  setupContactForm();
});
