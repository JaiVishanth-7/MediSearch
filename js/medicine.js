const FDA_URL = "https://api.fda.gov/drug/label.json";

function clean(text) {
  if (!text) return "Not available";
  return Array.isArray(text) ? text[0].replace(/\s+/g, " ").trim() : text;
}

function show(id, value) {
  document.getElementById(id).textContent = clean(value);
}

async function searchMedicine() {
  const query = document.getElementById("medInput").value.trim();
  const errorDiv = document.getElementById("error");
  const loader = document.getElementById("loader");
  const results = document.getElementById("results");

  errorDiv.classList.add("hidden");
  results.classList.add("hidden");

  if (!query) return;

  loader.classList.remove("hidden");

  try {
    const res = await fetch(`${FDA_URL}?search=openfda.brand_name:"${query}"+openfda.generic_name:"${query}"&limit=1`);
    const data = await res.json();

    if (!res.ok || !data.results || data.results.length === 0) {
      // Try broader search
      const res2 = await fetch(`${FDA_URL}?search=${encodeURIComponent(query)}&limit=1`);
      const data2 = await res2.json();

      if (!res2.ok || !data2.results || data2.results.length === 0) {
        throw new Error("Medicine not found. Try a generic name like 'Ibuprofen' or 'Paracetamol'.");
      }
      renderData(data2.results[0]);
    } else {
      renderData(data.results[0]);
    }

  } catch (err) {
    errorDiv.textContent = err.message || "Something went wrong. Please try again.";
    errorDiv.classList.remove("hidden");
  } finally {
    loader.classList.add("hidden");
  }
}

function renderData(d) {
  const openfda = d.openfda || {};

  const brandName = openfda.brand_name?.[0] || "Unknown Brand";
  const genericName = openfda.generic_name?.[0] || d.id || "Unknown";

  document.getElementById("medName").textContent = genericName.toUpperCase();
  document.getElementById("medBrand").textContent = brandName;

  show("purpose",           d.purpose || d.indications_and_usage);
  show("dosage",            d.dosage_and_administration);
  show("warnings",          d.warnings || d.warnings_and_cautions || d.boxed_warning);
  show("sideEffects",       d.adverse_reactions || d.side_effects);
  show("contraindications", d.contraindications);
  show("precautions",       d.precautions || d.use_in_specific_populations);
  show("storage",           d.storage_and_handling || d.how_supplied_storage_and_handling);
  show("manufacturer",      openfda.manufacturer_name?.[0] || d.set_id || "Not available");

  document.getElementById("results").classList.remove("hidden");
}

document.getElementById("medInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchMedicine();
});
