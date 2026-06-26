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
  document.getElementById("patientAlert").classList.add("hidden");
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
    const generic = (results[0]?.openfda?.generic_name?.[0] || "this medicine");
    renderPatientAlert(generic, results);

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
  smoothScrollToResults();
}

/* ===== MODAL SYSTEM ===== */
function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
  // measure scrollbar width to prevent layout shift
  const sw = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.style.setProperty("--scrollbar-width", sw + "px");
  document.body.classList.add("modal-open");
  if (id === "patientModal") loadProfileToForm();
}
function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
  // only remove modal-open if no other modals are open
  const anyOpen = ["loginModal","registerModal","aboutModal","termsModal","supportModal","patientModal"]
    .some(mid => !document.getElementById(mid)?.classList.contains("hidden"));
  if (!anyOpen) document.body.classList.remove("modal-open");
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
    ["loginModal","registerModal","aboutModal","termsModal","supportModal","patientModal"].forEach(closeModal);
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

/* ===== PATIENT PROFILE ===== */
let patientProfile = JSON.parse(localStorage.getItem("medPatient") || "null");

function savePatientProfile(e) {
  e.preventDefault();

  const dob    = document.getElementById("pfDob").value;
  const weight = parseFloat(document.getElementById("pfWeight").value) || null;
  const height = parseFloat(document.getElementById("pfHeight").value) || null;

  // Calculate age from DOB
  let age = null;
  if (dob) {
    const today = new Date();
    const birth = new Date(dob);
    age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  }

  // Calculate BMI
  let bmi = null;
  if (weight && height) bmi = (weight / ((height / 100) ** 2)).toFixed(1);

  patientProfile = {
    name:        document.getElementById("pfName").value.trim(),
    dob, age, gender:  document.getElementById("pfGender").value,
    bloodGroup:  document.getElementById("pfBloodGroup").value,
    weight, height, bmi,
    bp:          document.getElementById("pfBP").value.trim(),
    pulse:       document.getElementById("pfPulse").value.trim(),
    sugar:       document.getElementById("pfSugar").value.trim(),
    temp:        document.getElementById("pfTemp").value.trim(),
    allergies:   document.getElementById("pfAllergies").value.trim(),
    conditions:  document.getElementById("pfConditions").value.trim(),
    medicines:   document.getElementById("pfMedicines").value.trim(),
    notes:       document.getElementById("pfNotes").value.trim(),
  };

  localStorage.setItem("medPatient", JSON.stringify(patientProfile));
  closeModal("patientModal");
  renderPatientDashboard();
  showToast("✅ Health profile saved!");
}

function loadProfileToForm() {
  if (!patientProfile) return;
  const set = (id, val) => { if (val && document.getElementById(id)) document.getElementById(id).value = val; };
  set("pfName",        patientProfile.name);
  set("pfDob",         patientProfile.dob);
  set("pfGender",      patientProfile.gender);
  set("pfBloodGroup",  patientProfile.bloodGroup);
  set("pfWeight",      patientProfile.weight);
  set("pfHeight",      patientProfile.height);
  set("pfBP",          patientProfile.bp);
  set("pfPulse",       patientProfile.pulse);
  set("pfSugar",       patientProfile.sugar);
  set("pfTemp",        patientProfile.temp);
  set("pfAllergies",   patientProfile.allergies);
  set("pfConditions",  patientProfile.conditions);
  set("pfMedicines",   patientProfile.medicines);
  set("pfNotes",       patientProfile.notes);
}

/* ===== Classify vitals ===== */
function bpClass(bp) {
  if (!bp) return null;
  const parts = bp.split("/");
  if (parts.length !== 2) return null;
  const sys = parseInt(parts[0]), dia = parseInt(parts[1]);
  if (isNaN(sys) || isNaN(dia)) return null;
  if (sys < 90  || dia < 60)  return { label: "Low BP",        cls: "warn",   icon: "fa-arrow-down" };
  if (sys <= 120 && dia <= 80) return { label: "Normal BP",    cls: "",       icon: "fa-check-circle" };
  if (sys <= 130 && dia <= 80) return { label: "Elevated BP",  cls: "warn",   icon: "fa-arrow-up" };
  if (sys <= 140 || dia <= 90) return { label: "High BP Stage 1", cls: "warn",icon: "fa-triangle-exclamation" };
  return { label: "High BP Stage 2", cls: "danger", icon: "fa-circle-exclamation" };
}

function bmiLabel(bmi) {
  const b = parseFloat(bmi);
  if (b < 18.5) return { label: "Underweight", cls: "bmi-under" };
  if (b < 25)   return { label: "Normal",       cls: "bmi-normal" };
  if (b < 30)   return { label: "Overweight",   cls: "bmi-over" };
  return              { label: "Obese",          cls: "bmi-obese" };
}

function sugarClass(s) {
  const v = parseInt(s);
  if (isNaN(v)) return null;
  if (v < 70)   return { label: "Low Sugar",    cls: "danger" };
  if (v <= 100) return { label: "Normal Sugar", cls: "" };
  if (v <= 125) return { label: "Pre-Diabetic", cls: "warn" };
  return              { label: "High Sugar",     cls: "danger" };
}

/* ===== Render Patient Dashboard ===== */
function renderPatientDashboard() {
  const dash = document.getElementById("patientDashboard");
  if (!patientProfile || !patientProfile.name) { dash.classList.add("hidden"); return; }
  dash.classList.remove("hidden");

  const p = patientProfile;

  // Avatar
  document.getElementById("pdAvatar").textContent = p.name.charAt(0).toUpperCase();
  document.getElementById("pdName").textContent = p.name;

  // Subtitle
  const sub = [
    p.age    ? `${p.age} yrs` : null,
    p.gender ? p.gender.charAt(0).toUpperCase() + p.gender.slice(1) : null,
    p.bloodGroup || null,
  ].filter(Boolean).join(" • ");
  document.getElementById("pdSub").textContent = sub || "Health Profile";

  // Vitals chips
  const vitals = [];

  if (p.age) {
    const ageGroup = p.age < 12 ? "Child" : p.age < 18 ? "Teen" : p.age >= 65 ? "Senior" : "Adult";
    vitals.push({ icon: "fa-cake-candles", label: "Age", val: `${p.age} yrs (${ageGroup})`, cls: "" });
  }
  if (p.weight) vitals.push({ icon: "fa-weight-scale", label: "Weight", val: `${p.weight} kg`, cls: "" });
  if (p.height) vitals.push({ icon: "fa-ruler-vertical", label: "Height", val: `${p.height} cm`, cls: "" });

  if (p.bmi) {
    const bl = bmiLabel(p.bmi);
    vitals.push({ icon: "fa-calculator", label: "BMI", val: `${p.bmi} <span class="bmi-badge ${bl.cls}">${bl.label}</span>`, cls: bl.cls === "bmi-normal" ? "" : "warn" });
  }

  if (p.bp) {
    const bc = bpClass(p.bp);
    vitals.push({ icon: bc?.icon || "fa-heart-pulse", label: "Blood Pressure", val: `${p.bp} mmHg${bc ? ` — ${bc.label}` : ""}`, cls: bc?.cls || "" });
  }

  if (p.pulse) vitals.push({ icon: "fa-wave-square", label: "Pulse", val: `${p.pulse} bpm`, cls: parseInt(p.pulse) > 100 || parseInt(p.pulse) < 55 ? "warn" : "" });

  if (p.sugar) {
    const sc = sugarClass(p.sugar);
    vitals.push({ icon: "fa-droplet", label: "Blood Sugar", val: `${p.sugar} mg/dL${sc ? ` — ${sc.label}` : ""}`, cls: sc?.cls || "" });
  }

  if (p.temp) {
    const t = parseFloat(p.temp);
    const tCls = t > 99.5 ? "warn" : t > 103 ? "danger" : "";
    vitals.push({ icon: "fa-thermometer", label: "Temperature", val: `${p.temp}°F${t > 99.5 ? " — Fever" : ""}`, cls: tCls });
  }

  if (p.allergies)  vitals.push({ icon: "fa-ban",        label: "Allergies",   val: p.allergies,  cls: "warn" });
  if (p.conditions) vitals.push({ icon: "fa-stethoscope", label: "Conditions",  val: p.conditions, cls: "warn" });

  document.getElementById("pdVitals").innerHTML = vitals.map(v =>
    `<div class="pd-vital-chip ${v.cls}">
      <i class="fa-solid ${v.icon}"></i>
      <div><strong>${v.label}</strong><br><span>${v.val}</span></div>
    </div>`
  ).join("");

  // Medicines row
  const medsRow  = document.getElementById("pdMedsRow");
  const medsList = document.getElementById("pdMedsList");
  if (p.medicines) {
    const meds = p.medicines.split(",").map(m => m.trim()).filter(Boolean);
    medsRow.classList.remove("hidden");
    medsList.innerHTML = meds.map(m =>
      `<button class="pop-chip" onclick="quickSearch('${m}')">💊 ${m}</button>`
    ).join("");
  } else {
    medsRow.classList.add("hidden");
  }
}

/* ===== Patient Alert on Search Results ===== */
function renderPatientAlert(medName, results) {
  const alertEl = document.getElementById("patientAlert");
  alertEl.className = "patient-alert hidden";
  alertEl.innerHTML = "";
  if (!patientProfile || !patientProfile.name) return;

  const p       = patientProfile;
  const d       = results[0];
  const warnings = (d.warnings?.[0] || d.warnings_and_cautions?.[0] || "").toLowerCase();
  const preg     = (d.pregnancy?.[0] || "").toLowerCase();
  const ped      = (d.pediatric_use?.[0] || "").toLowerCase();
  const ger      = (d.geriatric_use?.[0] || "").toLowerCase();
  const contra   = (d.contraindications?.[0] || "").toLowerCase();

  const alerts  = [];
  const dangers = [];
  const infos   = [];

  // Age-based alerts
  if (p.age) {
    if (p.age < 12 && ped && /not recommended|contraindicated|avoid|do not use/i.test(ped)) {
      dangers.push(`⚠️ <strong>Pediatric Warning:</strong> This medicine may not be recommended for children under 12. Consult a paediatrician.`);
    }
    if (p.age >= 65 && ger) {
      alerts.push(`👴 <strong>Geriatric Note (Age ${p.age}):</strong> Older adults may require dose adjustments. Check with your doctor.`);
    }
    if (p.age < 18) {
      infos.push(`🧒 <strong>Minor Patient:</strong> Always have a guardian present and consult a doctor before administering this medicine.`);
    }
  }

  // Gender-based alerts
  if (p.gender === "female" && preg && /pregnancy|pregnant|lactation|nursing|breast/i.test(preg)) {
    alerts.push(`🤰 <strong>Pregnancy / Lactation Alert:</strong> This medicine has specific notes for female patients. Review the Pregnancy & Lactation section carefully.`);
  }

  // Blood pressure alerts
  if (p.bp) {
    const bc = bpClass(p.bp);
    if (bc && (bc.cls === "warn" || bc.cls === "danger")) {
      const bpKeywords = /blood pressure|hypertension|hypotension|cardiovascular/i;
      if (bpKeywords.test(warnings) || bpKeywords.test(contra)) {
        dangers.push(`❤️ <strong>Blood Pressure Alert (Your BP: ${p.bp} — ${bc.label}):</strong> This medicine may interact with blood pressure conditions. Consult your doctor.`);
      }
    }
  }

  // Allergy cross-check
  if (p.allergies) {
    const allergyList = p.allergies.split(",").map(a => a.trim().toLowerCase());
    const medLower    = medName.toLowerCase();
    allergyList.forEach(allergy => {
      if (allergy && medLower.includes(allergy)) {
        dangers.push(`🚨 <strong>Allergy Alert:</strong> You have listed "<strong>${allergy}</strong>" as an allergy — this may conflict with ${medName}. Do NOT take without consulting a doctor.`);
      }
    });
  }

  // Blood sugar / diabetes
  if (p.sugar && parseInt(p.sugar) > 125) {
    if (/diabetes|glucose|glycemia|insulin/i.test(warnings + contra)) {
      alerts.push(`🩸 <strong>Diabetic Alert (Sugar: ${p.sugar} mg/dL):</strong> This medicine has notes relating to blood sugar. Monitor levels closely.`);
    }
  }

  // Current medicines interaction hint
  if (p.medicines) {
    const currentMeds = p.medicines.split(",").map(m => m.trim().toLowerCase());
    const drugInt = (d.drug_interactions?.[0] || "").toLowerCase();
    const matchedMeds = currentMeds.filter(cm => cm && drugInt.includes(cm));
    if (matchedMeds.length > 0) {
      dangers.push(`💊 <strong>Possible Drug Interaction:</strong> You are currently taking <strong>${matchedMeds.join(", ")}</strong> which may interact with ${medName}. Review the Drug Interactions section.`);
    }
    infos.push(`📋 <strong>Your Current Medicines:</strong> ${p.medicines}`);
  }

  // BMI note
  if (p.bmi) {
    const bl = bmiLabel(p.bmi);
    if (bl.label !== "Normal") {
      infos.push(`⚖️ <strong>BMI Note (${p.bmi} — ${bl.label}):</strong> Dosage recommendations may vary based on body weight. Verify with your physician.`);
    }
  }

  const allAlerts = [...dangers, ...alerts, ...infos];
  if (!allAlerts.length) {
    alertEl.className = "patient-alert alert-info";
    alertEl.innerHTML = `<div class="pa-title"><i class="fa-solid fa-user-check"></i> Personalised Check for ${p.name}</div>
      <p>✅ No specific alerts found for your profile with this medicine. Always consult your doctor before use.</p>`;
    alertEl.classList.remove("hidden");
    return;
  }

  const mainCls = dangers.length ? "alert-danger" : alerts.length ? "alert-warning" : "alert-info";
  alertEl.className = `patient-alert ${mainCls}`;
  alertEl.innerHTML = `
    <div class="pa-title"><i class="fa-solid fa-user-shield"></i> Personalised Alerts for ${p.name} (Age: ${p.age || "N/A"}, ${p.gender || ""})</div>
    <ul>${allAlerts.map(a => `<li>${a}</li>`).join("")}</ul>`;
  alertEl.classList.remove("hidden");
}

// Init on page load
renderPatientDashboard();

/* ===== SCROLL PROGRESS BAR + BACK TO TOP ===== */
const scrollBar = document.getElementById("scrollProgress");
const backToTopBtn = document.getElementById("backToTop");

window.addEventListener("scroll", () => {
  const scrollTop    = window.scrollY || document.documentElement.scrollTop;
  const docHeight    = document.documentElement.scrollHeight - window.innerHeight;
  const scrollPct    = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

  // Progress bar
  if (scrollBar) scrollBar.style.width = scrollPct + "%";

  // Back to top visibility
  if (backToTopBtn) {
    if (scrollTop > 320) backToTopBtn.classList.add("visible");
    else                 backToTopBtn.classList.remove("visible");
  }
}, { passive: true });

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Smooth scroll to results after search
function smoothScrollToResults() {
  const el = document.getElementById("results");
  if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
}
