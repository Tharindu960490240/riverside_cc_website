/* ===== "Back to top" button (all pages) ===== */
(function () {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "to-top";
  btn.setAttribute("aria-label", "Back to top");
  btn.hidden = true;
  btn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  document.body.append(btn);

  const update = () => {
    const show = window.scrollY > 600;
    if (show && btn.hidden) {
      btn.hidden = false;
      requestAnimationFrame(() => btn.classList.add("is-visible"));
    } else if (!show && !btn.hidden) {
      btn.classList.remove("is-visible");
      btn.hidden = true;
    }
  };

  btn.addEventListener("click", () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    // Put keyboard focus back at the top of the page (the logo link)
    document.querySelector(".brand")?.focus({ preventScroll: true });
  });

  window.addEventListener("scroll", update, { passive: true });
  update();
})();
