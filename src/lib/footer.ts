/** Keeps the footer's copyright year current without needing a rebuild every January 1st. */
export function initFooterYear(): void {
  const el = document.getElementById("footer-year");
  if (el) el.textContent = String(new Date().getFullYear());
}
