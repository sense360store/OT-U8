const initFooterYear = () => {
  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
};

document.addEventListener("DOMContentLoaded", () => {
  initFooterYear();
});
