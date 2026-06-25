const FDA_URL = "https://api.fda.gov/drug/label.json";
let searchHistory = JSON.parse(localStorage.getItem("medHistory") || "[]");

/* ===== Theme Toggle ===== */
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", isDark ? "light" : "dark");
  document.getElementById("themeIcon").className = isDark ? "fa-solid fa-moon" : "fa-solid fa-sun";
  localStorage.setItem("medTheme", isDark ? "light" : "dark");
}

// Restore saved theme
(function () {
  const saved = localStorage.getItem("medTheme");
  if (saved === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    document.getElementById("themeIcon").className = "fa-solid fa-sun";
  }
})();

/* ===== Helpers ===== */
function clean(text) {
  if (!text) return "Not available";
  return Array.isArray(text) ? text[0].replace(/\s+/g, " ").trim() : String(text).replace(/\s+/g, " ").trim();
}

function show(id, value) {
  document.getElementById(id).textContent = clean(value);
}

/* ===== Search History ===== */
function saveHistory(query) {
  searchHistory = [query, ...searchHistory.filter(h => h.toLowerCase() !== query.toLowerCase())].slice(0, 5);
  localStorage.setItem("medHistory", JSON.stringify(searchHistory));
  renderHistory();
}

function renderHistory() {
  const bar = document.getElementById("historyBar");
  if (searchHistory.length === 0) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  bar.innerHTML = searchHistory.map(h =>
    `<span class="history-chip" onclick="quickSearch('${h}')">${h}</span>`
  ).join("");
}

function quickSearch(name) {
  document.getElementById("medInput").value = name;
  searchMedicine();
}

renderHistory();

/* ===== Safety Score ===== */
function calcSafety(d) {
  let score = 100;
  if (d.boxed_warning)    score -= 40;
  if (d.warnings)         score -= 20;
  if (d.contraindications) score -= 15;
  if (d.adverse_reactions) score -= 10;
  score = Math.max(score, 10);

  const fill = document.getElementById("safetyFill");
  const text = document.getElementById("safetyText");

  fill.style.width = "0%";
  setTimeout(() => { fill.style.width = score + "%"; }, 100);

  fill.className = "safety-fill";
  if (score >= 65) {
    text.textContent = `Generally Safe (${score}%)`;
  } else if (score >= 35) {
    fill.classList.add("moderate");
    text.textContent = `Use with Caution (${score}%)`;
  } else {
    fill.classList.add("low");
    text.textContent = `High Risk – Consult Doctor (${score}%)`;
  }
}

/* ===== Copy to Clipboard ===== */
function copyCard(id) {
  const text = document.getElementById(id).textContent;
  navigator.clipboard.writeText(text).then(() => showToast());
}

function showToast() {
  const toast = document.getElementById("toast");
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, 2000);
}

/* ===== Main Search ===== */
async function searchMedicine() {
  const query = document.getElementById("medInput").value.trim();
  const errorDiv = document.getElementById("error");
  const errorText = document.getElementById("errorText");
  const loader = document.getElementById("loader");
  const results = document.getElementById("results");

  errorDiv.classList.add("hidden");
  results.classList.add("hidden");

  if (!query) return;

  loader.classList.remove("hidden");

  try {
    let result = await fetchFDA(`openfda.brand_name:"${query}"`);
    if (!result) result = await fetchFDA(`openfda.generic_name:"${query}"`);
    if (!result) result = await fetchFDA(query);

    if (!result) throw new Error(`No results for "${query}". Try: Ibuprofen, Aspirin, Metformin, Amoxicillin`);

    saveHistory(query);
    renderData(result);

  } catch (err) {
    errorText.textContent = err.message;
    errorDiv.classList.remove("hidden");
  } finally {
    loader.classList.add("hidden");
  }
}

async function fetchFDA(searchTerm) {
  try {
    const res = await fetch(`${FDA_URL}?search=${encodeURIComponent(searchTerm)}&limit=1`);
    const data = await res.json();
    return data.results?.[0] || null;
  } catch {
    return null;
  }
}

function renderData(d) {
  const openfda = d.openfda || {};

  const genericName = openfda.generic_name?.[0] || "Unknown Medicine";
  const brandName   = openfda.brand_name?.[0]   || "";
  const rxStatus    = openfda.product_type?.[0]  || "";
  const route       = openfda.route?.[0]         || "";

  document.getElementById("medName").textContent = genericName.toUpperCase();

  const brandBadge = document.getElementById("medBrand");
  brandBadge.textContent = brandName;
  brandBadge.classList.toggle("hidden", !brandName);

  const rxBadge = document.getElementById("rxBadge");
  rxBadge.textContent = rxStatus;
  rxBadge.classList.toggle("hidden", !rxStatus);

  const routeBadge = document.getElementById("routeBadge");
  routeBadge.textContent = route;
  routeBadge.classList.toggle("hidden", !route);

  show("purpose",           d.purpose || d.indications_and_usage);
  show("dosage",            d.dosage_and_administration);
  show("warnings",          d.warnings || d.warnings_and_cautions || d.boxed_warning);
  show("sideEffects",       d.adverse_reactions || d.side_effects);
  show("contraindications", d.contraindications);
  show("precautions",       d.precautions || d.use_in_specific_populations);
  show("storage",           d.storage_and_handling || d.how_supplied_storage_and_handling);
  show("manufacturer",      openfda.manufacturer_name?.[0] || "Not available");

  calcSafety(d);

  document.getElementById("results").classList.remove("hidden");
}

document.getElementById("medInput").addEventListener("keydown", e => {
  if (e.key === "Enter") searchMedicine();
});
