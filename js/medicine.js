const FDA_URL = "https://api.fda.gov/drug/label.json";

let searchHistory  = JSON.parse(localStorage.getItem("medHistory")   || "[]");
let favourites     = JSON.parse(localStorage.getItem("medFavourites") || "[]");
let currentMedName = "";
let acIndex        = -1;
let acItems        = [];
let debounceTimer  = null;

/* ===== Health Tips Ticker ===== */
const tips = [
  "Always take medicines with a full glass of water unless directed otherwise.",
  "Never share prescription medicines with others.",
  "Store medicines away from heat, moisture and direct sunlight.",
  "Check expiry dates before taking any medicine.",
  "Do not crush or chew tablets unless your doctor says so.",
  "Take antibiotics for the full prescribed course even if you feel better.",
  "Never mix medicines with alcohol without consulting your doctor.",
  "Keep all medicines out of reach of children.",
  "Inform your doctor about all supplements you are taking.",
  "Do not stop heart or blood pressure medicines abruptly."
];
let tipIndex = 0;
function rotateTip() {
  const el = document.getElementById("tipText");
  el.style.opacity = 0;
  setTimeout(() => {
    el.textContent = tips[tipIndex % tips.length];
    el.style.transition = "opacity 0.6s";
    el.style.opacity = 1;
    tipIndex++;
  }, 400);
}
rotateTip();
setInterval(rotateTip, 5000);

/* ===== Theme ===== */
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", isDark ? "light" : "dark");
  document.getElementById("themeIcon").className = isDark ? "fa-solid fa-moon" : "fa-solid fa-sun";
  localStorage.setItem("medTheme", isDark ? "light" : "dark");
}
(function () {
  if (localStorage.getItem("medTheme") === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    document.getElementById("themeIcon").className = "fa-solid fa-sun";
  }
})();

/* ===== Helpers ===== */
function clean(text) {
  if (!text) return null;
  const val = (Array.isArray(text) ? text[0] : String(text)).replace(/\s+/g, " ").trim();
  return val.length > 0 ? val : null;
}

// Merge field: pick first non-null value across multiple result objects
function merge(results, ...keys) {
  for (const r of results) {
    for (const k of keys) {
      const v = clean(r[k]);
      if (v) return v;
    }
  }
  return null;
}

// Merge openfda field
function mergeOFDA(results, key) {
  for (const r of results) {
    const v = r.openfda?.[key]?.[0];
    if (v) return v;
  }
  return null;
}

function show(id, value) { document.getElementById(id).textContent = clean(value); }

/* ===== History ===== */
function saveHistory(query) {
  searchHistory = [query, ...searchHistory.filter(h => h.toLowerCase() !== query.toLowerCase())].slice(0, 5);
  localStorage.setItem("medHistory", JSON.stringify(searchHistory));
  renderHistory();
}
function renderHistory() {
  const bar = document.getElementById("historyBar");
  if (!searchHistory.length) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  bar.innerHTML = '<span style="color:rgba(255,255,255,0.5);font-size:0.78rem;">Recent:</span> ' +
    searchHistory.map(h => `<span class="history-chip" onclick="quickSearch('${h}')">🕐 ${h}</span>`).join("");
}
renderHistory();

/* ===== Favourites ===== */
function renderFavourites() {
  const sec  = document.getElementById("favSection");
  const list = document.getElementById("favList");
  if (!favourites.length) { sec.classList.add("hidden"); return; }
  sec.classList.remove("hidden");
  list.innerHTML = favourites.map(f =>
    `<button class="pop-chip" onclick="quickSearch('${f}')">⭐ ${f}</button>`
  ).join("");
}
renderFavourites();

function toggleFavourite() {
  const btn = document.getElementById("favBtn");
  if (!currentMedName) return;
  const idx = favourites.indexOf(currentMedName);
  if (idx === -1) {
    favourites.push(currentMedName);
    btn.classList.add("fav-active");
    btn.innerHTML = '<i class="fa-solid fa-star"></i>';
    showToast("⭐ Added to favourites!");
  } else {
    favourites.splice(idx, 1);
    btn.classList.remove("fav-active");
    btn.innerHTML = '<i class="fa-regular fa-star"></i>';
    showToast("🗑️ Removed from favourites");
  }
  localStorage.setItem("medFavourites", JSON.stringify(favourites));
  renderFavourites();
}

/* ===== Safety Score ===== */
function calcSafety(d) {
  let score = 100;
  if (d.boxed_warning)             score -= 40;
  if (d.warnings)                  score -= 15;
  if (d.contraindications)         score -= 10;
  if (d.adverse_reactions)         score -= 10;
  if (d.drug_abuse_and_dependence) score -= 10;
  if (d.drug_interactions)         score -= 5;
  score = Math.max(score, 10);
  const fill = document.getElementById("safetyFill");
  const text = document.getElementById("safetyText");
  fill.style.width = "0%";
  setTimeout(() => { fill.style.width = score + "%"; }, 100);
  fill.className = "safety-fill";
  if (score >= 65)      { text.textContent = `Generally Safe (${score}%)`; }
  else if (score >= 35) { fill.classList.add("moderate"); text.textContent = `Use with Caution (${score}%)`; }
  else                  { fill.classList.add("low");      text.textContent = `High Risk – Consult Doctor (${score}%)`; }
}

/* ===== Copy Dynamic Card ===== */
function copyDynCard(id) {
  const el = document.getElementById(id);
  if (el) navigator.clipboard.writeText(el.textContent).then(() => showToast("✅ Copied to clipboard!"));
}

/* ===== Text to Speech ===== */
function speakMedicine() {
  if (!('speechSynthesis' in window)) { showToast("❌ TTS not supported in this browser"); return; }
  window.speechSynthesis.cancel();
  let text = `Medicine: ${currentMedName}. `;
  document.querySelectorAll("#dynamicCards .card p").forEach(p => {
    const heading = p.closest(".card").querySelector("h3")?.textContent?.trim() || "";
    const val = p.textContent.trim();
    if (val) text += `${heading}: ${val.substring(0, 300)}. `;
  });
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.9;
  window.speechSynthesis.speak(utter);
  showToast("🔊 Reading aloud...");
}

/* ===== Share ===== */
function shareMedicine() {
  const purpose = document.getElementById("purpose").textContent;
  const shareData = {
    title: `MediSearch – ${currentMedName}`,
    text: `${currentMedName}: ${purpose.substring(0, 120)}...`,
    url: window.location.href
  };
  if (navigator.share) {
    navigator.share(shareData);
  } else {
    navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}\n${shareData.url}`);
    showToast("🔗 Link copied to clipboard!");
  }
}

/* ===== Toast ===== */
function showToast(msg = "✅ Done!") {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, 2200);
}

/* ===== Autocomplete ===== */
const MEDICINE_LIST = [
  "Ibuprofen","Aspirin","Paracetamol","Amoxicillin","Metformin","Atorvastatin",
  "Cetirizine","Omeprazole","Azithromycin","Sertraline","Metoprolol","Lisinopril",
  "Amlodipine","Losartan","Simvastatin","Fluoxetine","Diazepam","Tramadol",
  "Ciprofloxacin","Doxycycline","Prednisone","Insulin","Warfarin","Clopidogrel",
  "Furosemide","Albuterol","Salbutamol","Ranitidine","Loratadine","Pantoprazole",
  "Esomeprazole","Gabapentin","Pregabalin","Hydroxychloroquine","Dexamethasone",
  "Clonazepam","Alprazolam","Zolpidem","Melatonin","Vitamin D","Vitamin C",
  "Folic Acid","Calcium Carbonate","Zinc","Iron Sulfate","Magnesium","Vitamin B12"
];

function onTyping() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const val = document.getElementById("medInput").value.trim().toLowerCase();
    if (!val || val.length < 2) { closeAutocomplete(); return; }
    acItems = MEDICINE_LIST.filter(m => m.toLowerCase().startsWith(val)).slice(0, 7);
    renderAutocomplete(val);
  }, 200);
}

function renderAutocomplete(query) {
  const list = document.getElementById("autocompleteList");
  if (!acItems.length) { closeAutocomplete(); return; }
  acIndex = -1;
  list.innerHTML = acItems.map((item, i) => {
    const bold = item.substring(0, query.length);
    const rest = item.substring(query.length);
    return `<li onclick="selectAC(${i})"><i class="fa-solid fa-capsules"></i><span><span class="ac-match">${bold}</span>${rest}</span></li>`;
  }).join("");
  list.classList.remove("hidden");
}

function selectAC(i) {
  document.getElementById("medInput").value = acItems[i];
  closeAutocomplete();
  searchMedicine();
}

function closeAutocomplete() {
  document.getElementById("autocompleteList").classList.add("hidden");
  acIndex = -1;
}

function onKeyDown(e) {
  const list = document.getElementById("autocompleteList");
  const items = list.querySelectorAll("li");
  if (e.key === "ArrowDown") {
    e.preventDefault();
    acIndex = Math.min(acIndex + 1, items.length - 1);
    items.forEach((li, i) => li.classList.toggle("active", i === acIndex));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    acIndex = Math.max(acIndex - 1, 0);
    items.forEach((li, i) => li.classList.toggle("active", i === acIndex));
  } else if (e.key === "Enter") {
    if (acIndex >= 0 && acItems[acIndex]) {
      document.getElementById("medInput").value = acItems[acIndex];
      closeAutocomplete();
    }
    searchMedicine();
  } else if (e.key === "Escape") {
    closeAutocomplete();
  }
}

document.addEventListener("click", e => {
  if (!e.target.closest(".search-wrapper")) closeAutocomplete();
});

/* ===== Navigation ===== */
function goHome() {
  document.getElementById("results").classList.add("hidden");
  document.getElementById("error").classList.add("hidden");
  document.getElementById("homepage").classList.remove("hidden");
  document.getElementById("medInput").value = "";
  window.speechSynthesis?.cancel();
}

/* ===== Main Search ===== */
async function searchMedicine() {
  const query = document.getElementById("medInput").value.trim();
  const errorDiv  = document.getElementById("error");
  const errorText = document.getElementById("errorText");
  const loader    = document.getElementById("loader");
  const results   = document.getElementById("results");
  const homepage  = document.getElementById("homepage");

  closeAutocomplete();
  errorDiv.classList.add("hidden");
  results.classList.add("hidden");
  if (!query) return;

  homepage.classList.add("hidden");
  loader.classList.remove("hidden");

  try {
    let results = await fetchFDA(`openfda.brand_name:"${query}"`);
    if (!results) results = await fetchFDA(`openfda.generic_name:"${query}"`);
    if (!results) results = await fetchFDA(query);
    if (!results) throw new Error(`No results for "${query}". Try: Ibuprofen, Aspirin, Metformin`);

    saveHistory(query);
    renderData(results);

  } catch (err) {
    errorText.textContent = err.message;
    errorDiv.classList.remove("hidden");
    homepage.classList.remove("hidden");
  } finally {
    loader.classList.add("hidden");
  }
}

async function fetchFDA(term) {
  try {
    const res = await fetch(`${FDA_URL}?search=${encodeURIComponent(term)}&limit=5`);
    const data = await res.json();
    return data.results || null;
  } catch { return null; }
}

function quickSearch(name) {
  document.getElementById("medInput").value = name;
  searchMedicine();
}

/* ===== ALL FDA FIELD DEFINITIONS ===== */
const FIELD_DEFS = [
  // id, label, icon, color-class, keys[]
  ["purpose",            "Purpose / Uses",                 "fa-circle-info",          "card-blue",   ["purpose","indications_and_usage"]],
  ["dosage",             "Dosage & Administration",         "fa-pills",                "card-green",  ["dosage_and_administration"]],
  ["warnings",           "Warnings",                        "fa-triangle-exclamation", "card-orange", ["warnings","warnings_and_cautions"]],
  ["boxed_warning",      "Boxed Warning",                   "fa-skull-crossbones",     "card-red",    ["boxed_warning"]],
  ["sideEffects",        "Adverse Reactions / Side Effects","fa-virus-slash",          "card-red",    ["adverse_reactions","side_effects"]],
  ["contraindications",  "Contraindications",               "fa-ban",                  "card-purple", ["contraindications"]],
  ["drugInteractions",   "Drug Interactions",               "fa-capsules",             "card-orange", ["drug_interactions"]],
  ["precautions",        "Precautions",                     "fa-shield-halved",        "card-teal",   ["precautions","general_precautions"]],
  ["pregnancy",          "Pregnancy & Lactation",           "fa-person-pregnant",      "card-purple", ["pregnancy","nursing_mothers","pregnancy_or_breast_feeding"]],
  ["pediatric",          "Pediatric Use",                   "fa-child",                "card-teal",   ["pediatric_use"]],
  ["geriatric",          "Geriatric Use",                   "fa-person-cane",          "card-blue",   ["geriatric_use"]],
  ["overdosage",         "Overdosage",                      "fa-circle-exclamation",   "card-red",    ["overdosage"]],
  ["drugAbuse",          "Drug Abuse & Dependence",         "fa-biohazard",            "card-orange", ["drug_abuse_and_dependence","controlled_substance","abuse","dependence"]],
  ["clinicalPharm",      "Clinical Pharmacology",           "fa-flask",                "card-blue",   ["clinical_pharmacology","clinical_pharmacology_and_pharmacokinetics"]],
  ["mechanism",          "Mechanism of Action",             "fa-atom",                 "card-green",  ["mechanism_of_action"]],
  ["pharmacokinetics",   "Pharmacokinetics",                "fa-chart-line",           "card-teal",   ["pharmacokinetics"]],
  ["pharmacodynamics",   "Pharmacodynamics",                "fa-wave-square",          "card-purple", ["pharmacodynamics"]],
  ["activeIngredients",  "Active Ingredients",              "fa-vial",                 "card-green",  ["active_ingredient"]],
  ["inactiveIngredients","Inactive Ingredients",            "fa-vial-circle-check",    "card-blue",   ["inactive_ingredient"]],
  ["description",        "Drug Description",                "fa-file-medical",         "card-teal",   ["description"]],
  ["clinicalStudies",    "Clinical Studies",                "fa-microscope",           "card-purple", ["clinical_studies"]],
  ["animalPharm",        "Animal Pharmacology",             "fa-paw",                  "card-blue",   ["animal_pharmacology_and_or_toxicology"]],
  ["howSupplied",        "How Supplied",                    "fa-box",                  "card-green",  ["how_supplied","how_supplied_storage_and_handling"]],
  ["storage",            "Storage & Handling",              "fa-boxes-stacked",        "card-blue",   ["storage_and_handling"]],
  ["patientInfo",        "Patient Information",             "fa-user-injured",         "card-teal",   ["patient_medication_information","spl_patient_package_insert","information_for_patients","information_for_patient_caregivers"]],
  ["labeling",           "Instructions for Use",            "fa-list-check",           "card-green",  ["instructions_for_use","spl_medguide"]],
  ["recentChanges",      "Recent Label Changes",            "fa-rotate",               "card-orange", ["recent_major_changes"]],
  ["references",         "References",                      "fa-book-medical",         "card-purple", ["references"]],
  ["manufacturer",       "Manufacturer",                    "fa-user-doctor",          "card-green",  ["_openfda_manufacturer"]],
];

/* ===== Render ===== */
function renderData(results) {
  const first   = results[0];
  const openfda = first.openfda || {};

  const generic = mergeOFDA(results, "generic_name")  || "Unknown Medicine";
  const brand   = mergeOFDA(results, "brand_name")    || "";
  const rx      = mergeOFDA(results, "product_type")  || "";
  const route   = mergeOFDA(results, "route")         || "";
  const ndc     = mergeOFDA(results, "product_ndc")   || "";
  const substance = mergeOFDA(results, "substance_name") || "";
  const mfr     = mergeOFDA(results, "manufacturer_name") || "";
  const appNo   = mergeOFDA(results, "application_number") || "";
  const pharmClass = mergeOFDA(results, "pharm_class_epc") || mergeOFDA(results, "pharm_class_moa") || "";

  currentMedName = generic;
  document.getElementById("medName").textContent = generic.toUpperCase();

  // Badges
  const badgesRow = document.getElementById("badgesRow");
  badgesRow.innerHTML = [
    brand      ? `<span class="badge brand-badge">${brand}</span>` : "",
    rx         ? `<span class="badge rx-badge">${rx}</span>` : "",
    route      ? `<span class="badge route-badge">${route}</span>` : "",
    pharmClass ? `<span class="badge pharm-badge">${pharmClass}</span>` : "",
  ].join("");

  // Favourite state
  const favBtn = document.getElementById("favBtn");
  favBtn.className = "action-btn" + (favourites.includes(generic) ? " fav-active" : "");
  favBtn.innerHTML = favourites.includes(generic)
    ? '<i class="fa-solid fa-star"></i>'
    : '<i class="fa-regular fa-star"></i>';

  // Meta strip
  const metaItems = [
    mfr      && { icon: "fa-industry",        label: "Manufacturer", val: mfr },
    ndc      && { icon: "fa-barcode",          label: "NDC",          val: ndc },
    substance && { icon: "fa-atom",            label: "Substance",    val: substance },
    appNo    && { icon: "fa-file-signature",   label: "App No.",      val: appNo },
  ].filter(Boolean);

  document.getElementById("metaStrip").innerHTML = metaItems.map(m =>
    `<div class="meta-item"><i class="fa-solid ${m.icon}"></i><strong>${m.label}:</strong> ${m.val}</div>`
  ).join("");

  // Build dynamic cards — only render fields that have data
  const colors = ["card-blue","card-green","card-orange","card-red","card-purple","card-teal"];
  const cardsEl = document.getElementById("dynamicCards");
  cardsEl.innerHTML = "";

  let cardCount = 0;
  FIELD_DEFS.forEach(([id, label, icon, colorClass, keys]) => {
    let value;
    if (id === "manufacturer") {
      value = mfr || null;
    } else {
      value = merge(results, ...keys);
    }
    if (!value) return; // skip — no data, no card

    const color = colorClass || colors[cardCount % colors.length];
    const safeId = `dyn_${id}`;
    const card = document.createElement("div");
    card.className = `card ${color}`;
    card.style = `--i:${cardCount}`;
    card.innerHTML = `
      <div class="card-header">
        <h3><i class="fa-solid ${icon}"></i> ${label}</h3>
        <button class="copy-btn" onclick="copyDynCard('${safeId}')" title="Copy"><i class="fa-regular fa-copy"></i></button>
      </div>
      <p id="${safeId}">${value}</p>`;
    cardsEl.appendChild(card);
    cardCount++;
  });

  document.getElementById("fieldCount").innerHTML =
    `<i class="fa-solid fa-circle-check"></i> ${cardCount} information fields found for this medicine.`;

  calcSafety(first);
  document.getElementById("results").classList.remove("hidden");
}

/* ===== MODAL SYSTEM ===== */
function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
  document.body.style.overflow = "";
}
function closeOnOverlay(e, id) {
  if (e.target === e.currentTarget) closeModal(id);
}
function switchModal(closeId, openId) {
  closeModal(closeId);
  openModal(openId);
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    ["loginModal","registerModal","aboutModal","termsModal","supportModal"].forEach(closeModal);
    document.body.style.overflow = "";
  }
});

/* ===== AUTH ===== */
function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl  = document.getElementById("loginError");

  const users = JSON.parse(localStorage.getItem("medUsers") || "[]");
  const user  = users.find(u => u.email === email && u.password === password);

  if (!user) {
    errorEl.textContent = "❌ Invalid email or password.";
    errorEl.classList.remove("hidden");
    return;
  }
  errorEl.classList.add("hidden");
  localStorage.setItem("medCurrentUser", JSON.stringify(user));
  closeModal("loginModal");
  updateNavUser(user);
  showToast(`👋 Welcome back, ${user.name.split(" ")[0]}!`);
}

function handleRegister(e) {
  e.preventDefault();
  const name     = document.getElementById("regName").value.trim();
  const email    = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const confirm  = document.getElementById("regConfirm").value;
  const errorEl  = document.getElementById("regError");

  if (password.length < 6) {
    errorEl.textContent = "❌ Password must be at least 6 characters."; errorEl.classList.remove("hidden"); return;
  }
  if (password !== confirm) {
    errorEl.textContent = "❌ Passwords do not match."; errorEl.classList.remove("hidden"); return;
  }
  const users = JSON.parse(localStorage.getItem("medUsers") || "[]");
  if (users.find(u => u.email === email)) {
    errorEl.textContent = "❌ An account with this email already exists."; errorEl.classList.remove("hidden"); return;
  }
  const newUser = { name, email, password };
  users.push(newUser);
  localStorage.setItem("medUsers", JSON.stringify(users));
  localStorage.setItem("medCurrentUser", JSON.stringify(newUser));
  errorEl.classList.add("hidden");
  closeModal("registerModal");
  updateNavUser(newUser);
  showToast(`🎉 Welcome to MediSearch, ${name.split(" ")[0]}!`);
}

function logOut() {
  localStorage.removeItem("medCurrentUser");
  document.getElementById("navUser").classList.add("hidden");
  document.getElementById("navGuest").classList.remove("hidden");
  showToast("👋 Signed out successfully.");
}

function updateNavUser(user) {
  document.getElementById("navGuest").classList.add("hidden");
  document.getElementById("navUser").classList.remove("hidden");
  document.getElementById("userAvatar").textContent = user.name.charAt(0).toUpperCase();
  document.getElementById("userGreet").textContent  = `Hi, ${user.name.split(" ")[0]}`;
}

// Restore session on load
(function () {
  const saved = localStorage.getItem("medCurrentUser");
  if (saved) updateNavUser(JSON.parse(saved));
})();

/* ===== NEWSLETTER ===== */
function subscribeNewsletter(e) {
  e.preventDefault();
  const email   = document.getElementById("newsletterEmail").value.trim();
  const success = document.getElementById("newsletterSuccess");
  const subs    = JSON.parse(localStorage.getItem("medSubscribers") || "[]");
  if (!subs.includes(email)) {
    subs.push(email);
    localStorage.setItem("medSubscribers", JSON.stringify(subs));
  }
  success.classList.remove("hidden");
  document.getElementById("newsletterEmail").value = "";
  showToast("📧 Subscribed successfully!");
}
