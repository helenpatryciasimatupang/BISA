/* =========================================================
   HP TAKEOUT DETECTOR
   FINAL VERSION - ALL POINT MODE
   ========================================================= */

const $ = (id) => document.getElementById(id);
let lastTakeoutRows = [];

function setStatus(msg) {
  $("status").textContent = msg;
}

/* ===================== READ KMZ ===================== */
async function readKmzOrKml(file) {
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".kml")) return await file.text();

  if (lower.endsWith(".kmz")) {
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const kmlFile = Object.keys(zip.files).find(f => f.toLowerCase().endsWith(".kml"));
    if (!kmlFile) throw new Error("KMZ tidak berisi file KML");
    return await zip.files[kmlFile].async("text");
  }

  throw new Error("File harus KMZ / KML");
}

/* ===================== PARSE ALL POINT ===================== */
function parseAllPoints(kmlText) {
  const dom = new DOMParser().parseFromString(kmlText, "text/xml");
  const placemarks = [...dom.getElementsByTagName("Placemark")];

  const results = [];

  for (const pm of placemarks) {
    const point = pm.getElementsByTagName("Point")[0];
    if (!point) continue;

    const coordText = point.getElementsByTagName("coordinates")[0]?.textContent;
    if (!coordText) continue;

    const [lon, lat] = coordText.trim().split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const name = pm.getElementsByTagName("name")[0]?.textContent?.trim() || "(NO_NAME)";

    results.push({
      hpId: name,
      lat,
      lon
    });
  }

  return results;
}

/* ===================== DISTANCE ===================== */
function distM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat/2)**2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ===================== TABLE ===================== */
function renderTableTakeout(rows) {
  const tbody = $("table").querySelector("tbody");
  tbody.innerHTML = "";

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.hpId}</td>
      <td>${Number(r.lat).toFixed(7)}</td>
      <td>${Number(r.lon).toFixed(7)}</td>
      <td>${r.reason}</td>
    `;
    tbody.appendChild(tr);
  }
}

/* ===================== CSV ===================== */
function toCsv(rows) {
  const header = ["HP_ID","Lat","Lon","Reason"];
  const lines = [header.join(",")];

  for (const r of rows) {
    lines.push([
      `"${r.hpId}"`,
      r.lat,
      r.lon,
      `"${r.reason}"`
    ].join(","));
  }

  return lines.join("\n");
}

function downloadCsv(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ===================== MAIN ===================== */
$("run").addEventListener("click", async () => {
  try {
    const survey = $("survey").files[0];
    const design = $("design").files[0];
    const radius = Number($("radius").value || 0);

    if (!survey || !design) return alert("Upload KMZ Survey & KMZ Design");

    setStatus("Parsing...");
    $("download").disabled = true;
    lastTakeoutRows = [];
    renderTableTakeout([]);

    const [sKml, dKml] = await Promise.all([
      readKmzOrKml(survey),
      readKmzOrKml(design)
    ]);

    const sHP = parseAllPoints(sKml);
    const dHP = parseAllPoints(dKml);

    let matched = 0;
    const takeout = [];

    for (const hp of sHP) {
      let found = dHP.some(d => d.hpId === hp.hpId);

      if (!found && radius > 0) {
        found = dHP.some(d =>
          distM(hp.lat, hp.lon, d.lat, d.lon) <= radius
        );
      }

      if (found) {
        matched++;
      } else {
        takeout.push({ ...hp, reason: "TAKEOUT" });
      }
    }

    renderTableTakeout(takeout);
    lastTakeoutRows = takeout;

    $("summary").textContent =
      `Survey: ${sHP.length} | Design: ${dHP.length} | Matched: ${matched} | TAKEOUT: ${takeout.length}`;

    $("download").disabled = takeout.length === 0;
    setStatus("Selesai");

  } catch (err) {
    alert(err.message);
    setStatus("Error");
  }
});

$("download").addEventListener("click", () => {
  downloadCsv("hp_takeout.csv", toCsv(lastTakeoutRows));
});
