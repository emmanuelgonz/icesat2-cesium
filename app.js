// ICESat-2 real-time tracker: CelesTrak TLE + satellite.js SGP4 propagation in CesiumJS.

// Cesium ion access token comes from config.js (copy config.example.js).
const CESIUM_ION_TOKEN = window.CESIUM_ION_TOKEN || "";

const NORAD_ID = 43613;
const TLE_URL = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${NORAD_ID}&FORMAT=TLE`;
const TLE_REFRESH_MS = 6 * 60 * 60 * 1000;   // re-download TLE every 6 h
const TRACK_REFRESH_MS = 60 * 1000;           // rebuild orbit path / ground track every 60 s
const TRACK_STEP_S = 30;                      // sample spacing along the orbit path

const statusEl = document.getElementById("status");
let satrec = null;

if (CESIUM_ION_TOKEN) {
  Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;
} else {
  statusEl.textContent = "No Cesium ion token set in config.js:\nimagery and terrain will not load.";
}

const viewer = new Cesium.Viewer("cesiumContainer", {
  terrain: Cesium.Terrain.fromWorldTerrain(),
  timeline: true,
  animation: true,
});

// Run the clock in real time, starting now.
viewer.clock.currentTime = Cesium.JulianDate.now();
viewer.clock.clockRange = Cesium.ClockRange.UNBOUNDED;
viewer.clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK;
viewer.clock.shouldAnimate = true;

// Propagate the TLE to a JS Date; returns Earth-fixed Cartesian3 (m) and geodetic lat/lon/alt.
function propagate(date) {
  if (!satrec) return null;
  const pv = satellite.propagate(satrec, date);
  if (!pv || !pv.position) return null;
  const gmst = satellite.gstime(date);
  const ecf = satellite.eciToEcf(pv.position, gmst);
  const geo = satellite.eciToGeodetic(pv.position, gmst);
  return {
    cartesian: new Cesium.Cartesian3(ecf.x * 1000, ecf.y * 1000, ecf.z * 1000),
    lat: satellite.degreesLat(geo.latitude),
    lon: satellite.degreesLong(geo.longitude),
    altKm: geo.height,
  };
}

const positionCallback = (time, result) => {
  const state = propagate(Cesium.JulianDate.toDate(time));
  return state ? Cesium.Cartesian3.clone(state.cartesian, result) : undefined;
};

const satellitePosition = Cesium.CallbackPositionProperty
  ? new Cesium.CallbackPositionProperty(positionCallback, false)
  : new Cesium.CallbackProperty(positionCallback, false);

const satEntity = viewer.entities.add({
  name: "ICESat-2",
  position: satellitePosition,
  point: { pixelSize: 10, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
  label: {
    text: "ICESat-2",
    font: "14px sans-serif",
    fillColor: Cesium.Color.WHITE,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 2,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    pixelOffset: new Cesium.Cartesian2(0, -18),
  },
  viewFrom: new Cesium.Cartesian3(-2.0e6, -2.0e6, 1.5e6),
});

const orbitEntity = viewer.entities.add({
  name: "ICESat-2 orbit path",
  polyline: { positions: [], width: 1.5, material: Cesium.Color.CYAN.withAlpha(0.7), arcType: Cesium.ArcType.NONE },
});

const groundTrackEntity = viewer.entities.add({
  name: "ICESat-2 ground track",
  polyline: { positions: [], width: 2, material: Cesium.Color.YELLOW.withAlpha(0.8), clampToGround: true },
});

// Sample one orbital period behind and one ahead of the current clock time.
function rebuildTracks() {
  if (!satrec) return;
  const periodS = (2 * Math.PI / satrec.no) * 60;   // satrec.no is mean motion in rad/min
  const now = Cesium.JulianDate.toDate(viewer.clock.currentTime).getTime();
  const orbit = [];
  const ground = [];
  for (let t = -periodS; t <= periodS; t += TRACK_STEP_S) {
    const state = propagate(new Date(now + t * 1000));
    if (!state) continue;
    orbit.push(state.cartesian);
    ground.push(Cesium.Cartesian3.fromDegrees(state.lon, state.lat, 0));
  }
  orbitEntity.polyline.positions = orbit;
  groundTrackEntity.polyline.positions = ground;
}

function updatePanel() {
  const date = Cesium.JulianDate.toDate(viewer.clock.currentTime);
  const state = propagate(date);
  document.getElementById("time").textContent = date.toISOString().slice(0, 19).replace("T", " ");
  if (!state) return;
  document.getElementById("lat").textContent = `${state.lat.toFixed(2)}°`;
  document.getElementById("lon").textContent = `${state.lon.toFixed(2)}°`;
  document.getElementById("alt").textContent = `${state.altKm.toFixed(1)} km`;
}

// TLE epoch is stored as Julian date in satrec.jdsatepoch (+ fraction in newer satellite.js builds).
function tleEpochString() {
  const jd = satrec.jdsatepoch + (satrec.jdsatepochF || 0);
  return new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 16).replace("T", " ");
}

async function loadTle() {
  try {
    const response = await fetch(TLE_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const lines = (await response.text()).trim().split(/\r?\n/).map((l) => l.trim());
    const line1 = lines.find((l) => l.startsWith("1 "));
    const line2 = lines.find((l) => l.startsWith("2 "));
    if (!line1 || !line2) throw new Error("TLE lines not found in CelesTrak response");
    satrec = satellite.twoline2satrec(line1, line2);
    document.getElementById("epoch").textContent = tleEpochString();
    rebuildTracks();
  } catch (err) {
    console.error(err);
    statusEl.textContent = `TLE download failed: ${err.message}`;
  }
}

document.getElementById("followBtn").addEventListener("click", (event) => {
  const following = viewer.trackedEntity === satEntity;
  viewer.trackedEntity = following ? undefined : satEntity;
  event.target.textContent = following ? "Follow ICESat-2" : "Stop following";
});

loadTle();
setInterval(loadTle, TLE_REFRESH_MS);
setInterval(rebuildTracks, TRACK_REFRESH_MS);
setInterval(updatePanel, 1000);
