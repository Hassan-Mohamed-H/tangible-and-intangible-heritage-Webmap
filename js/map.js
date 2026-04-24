import { createBatchProcessor } from "./performance.js";
import { queryNearest } from "./spatialIndex.js";

const QENA_CENTER = [26.1551, 32.7160];
const QENA_ZOOM = 9;
const CATEGORY_COLORS = {};
const FALLBACK_COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

let map;
let clusterLayer;
let markerRefs = [];
let userLatLng = null;
let userMarker = null;
let routeLine = null;
let heatLayer = null;
let measureMode = false;
let measurePoints = [];
let measureLayer = null;
let geoJsonLayer = null;
let activeTileName = "light";
let lightLayer;
let darkLayer;
let satelliteLayer;
let heatCacheKey = "";
let routingMode = false;
let routingNotify = () => {};
let routingStatusHandler = () => {};
let routingMetricsHandler = () => {};
let routingInFlight = false;
let activeMarkerHighlightTimer = null;
let activeMarkerHighlightEl = null;
let sidePanelEl = null;
let panelTitleEl = null;
let panelLocationEl = null;
let panelOverviewEl = null;
let panelDetailsEl = null;
let panelCloseBtnEl = null;
let panelRouteBtnEl = null;
let panelOverviewTabEl = null;
let panelDetailsTabEl = null;
let panelGalleryEl = null;
let panelGalleryTrackEl = null;
let panelGalleryDotsEl = null;
let panelPrevImageBtnEl = null;
let panelNextImageBtnEl = null;
let selectedPanelItem = null;
let panelImages = [];
let panelImageIndex = 0;
const markerByItem = new WeakMap();
const processMarkerBatches = createBatchProcessor(350);

function getCategoryColor(category) {
  if (!CATEGORY_COLORS[category]) {
    CATEGORY_COLORS[category] = FALLBACK_COLORS[Object.keys(CATEGORY_COLORS).length % FALLBACK_COLORS.length];
  }
  return CATEGORY_COLORS[category];
}

function createMarkerHtml(category) {
  const color = getCategoryColor(category);
  const icon = getCategoryIcon(category);
  return `<div class="custom-marker" style="background:${color};"><span>${icon}</span></div>`;
}

export function initMap() {
  map = L.map("map", {
    zoomControl: false,
    preferCanvas: true
  }).setView(QENA_CENTER, QENA_ZOOM);

  lightLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  });

  darkLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap &copy; CARTO"
  });

  satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri"
  });

  satelliteLayer.addTo(map);

  clusterLayer = L.markerClusterGroup({
    disableClusteringAtZoom: 16,
    spiderfyOnMaxZoom: true,
    animate: true,
    chunkedLoading: true,
    chunkInterval: 120,
    chunkDelay: 15,
    removeOutsideVisibleBounds: true
  });

  map.addLayer(clusterLayer);
  measureLayer = L.layerGroup().addTo(map);
  geoJsonLayer = L.layerGroup().addTo(map);
  initSidePanel();

  map.on("click", (e) => {
    if (measureMode) {
      addMeasurePoint(e.latlng);
    }
  });

  return map;
}

export function setMarkers(data, layerVisibility = { tangible: true, intangible: true }) {
  clusterLayer.clearLayers();
  markerRefs = [];
  markerByItem.clear?.();

  const markers = [];

  data.forEach((item) => {
    if (item.heritageType === "intangible" && !layerVisibility.intangible) return;
    if (item.heritageType !== "intangible" && !layerVisibility.tangible) return;

    const icon = L.divIcon({
      html: createMarkerHtml(item.category),
      className: "",
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    const marker = L.marker([item.lat, item.lng], {
      icon,
      title: item.name || "موقع تراثي"
    });

    marker.on("click", () => {
      if (!routingMode) return;
      requestRouteTo(item);
    });
    marker.on("click", () => {
      openSidePanel(item);
      applyMarkerHighlight(marker);
    });
    marker.__data = item;
    markers.push(marker);
  });

  processMarkerBatches(
    markers,
    (marker) => {
      markerRefs.push(marker);
      markerByItem.set(marker.__data, marker);
      clusterLayer.addLayer(marker);
    },
    null
  );
}

export function focusOnItem(item, options = {}) {
  const target = markerByItem.get(item) || markerRefs.find((m) => m.__data === item);
  if (!target) return;
  const { zoom = 14, highlight = true } = options;
  clusterLayer.zoomToShowLayer(target, () => {
    const latLng = target.getLatLng();
    map.flyTo(latLng, zoom, { duration: 0.8 });
    setTimeout(() => openSidePanel(target.__data), 650);
    if (highlight) applyMarkerHighlight(target);
  });
}

export function getCategoryPalette() {
  return { ...CATEGORY_COLORS };
}

export function zoomIn() {
  map.zoomIn();
}

export function zoomOut() {
  map.zoomOut();
}

export function resetExtent() {
  map.flyTo(QENA_CENTER, QENA_ZOOM, { duration: 0.8 });
}

export function toggleBasemap() {
  if (activeTileName === "light") {
    map.removeLayer(lightLayer);
    darkLayer.addTo(map);
    activeTileName = "dark";
  } else if (activeTileName === "dark") {
    map.removeLayer(darkLayer);
    satelliteLayer.addTo(map);
    activeTileName = "satellite";
  } else {
    map.removeLayer(satelliteLayer);
    lightLayer.addTo(map);
    activeTileName = "light";
  }
  return activeTileName;
}

export function locateUser(notify) {
  if (!map) return;
  map.locate({ setView: true, maxZoom: 14 });
  map.once("locationfound", (e) => {
    userLatLng = e.latlng;
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker(e.latlng, {
      radius: 8,
      color: "#0ea5e9",
      weight: 2,
      fillOpacity: 0.25
    })
      .bindPopup("موقعك الحالي")
      .addTo(map)
      .openPopup();
    notify("تم تحديد موقعك بنجاح.");
  });
  map.once("locationerror", () => {
    notify("تعذر الحصول على موقعك. تأكد من صلاحيات المتصفح.", true);
  });
}

export function toggleHeatmap(data, show) {
  if (!show) {
    if (heatLayer) map.removeLayer(heatLayer);
    heatCacheKey = "";
    return;
  }
  const points = data.map((item) => [item.lat, item.lng, 0.7]);
  const cacheKey = `${points.length}:${points[0]?.[0] || 0}:${points[0]?.[1] || 0}`;
  if (heatLayer && cacheKey === heatCacheKey) return;
  heatCacheKey = cacheKey;
  if (!heatLayer) {
    heatLayer = L.heatLayer(points, { radius: 24, blur: 18, maxZoom: 16, minOpacity: 0.35 });
  } else {
    heatLayer.setLatLngs(points);
  }
  heatLayer.addTo(map);
}

export function toggleMeasureMode(notify) {
  measureMode = !measureMode;
  if (!measureMode) {
    measurePoints = [];
    measureLayer.clearLayers();
    notify("تم إيقاف أداة القياس.");
    return false;
  }
  notify("أداة القياس مفعلة. انقر نقطتين أو أكثر على الخريطة.");
  return true;
}

function addMeasurePoint(latlng) {
  measurePoints.push(latlng);
  L.circleMarker(latlng, { radius: 5, color: "#22c55e", fillOpacity: 0.8 }).addTo(measureLayer);
  if (measurePoints.length >= 2) {
    measureLayer.clearLayers();
    L.polyline(measurePoints, { color: "#22c55e", weight: 3, dashArray: "6,4" }).addTo(measureLayer);
    measurePoints.forEach((pt) => L.circleMarker(pt, { radius: 5, color: "#16a34a", fillOpacity: 0.9 }).addTo(measureLayer));
    const distance = getPathDistance(measurePoints);
    const center = measurePoints[Math.floor(measurePoints.length / 2)];
    L.marker(center, {
      icon: L.divIcon({ className: "distance-label", html: `<span>${formatDistance(distance)}</span>` })
    }).addTo(measureLayer);
  }
}

function getPathDistance(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += points[i - 1].distanceTo(points[i]);
  }
  return total;
}

function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} كم` : `${Math.round(meters)} م`;
}

export function findNearestSite(items, notify, spatialIndex = null) {
  if (!userLatLng) {
    notify("حدد موقعك أولاً لاستخدام أقرب موقع.", true);
    return null;
  }
  const distanceFn = (latA, lngA, latB, lngB) => L.latLng(latA, lngA).distanceTo(L.latLng(latB, lngB));
  const nearest = spatialIndex && spatialIndex.items?.length
    ? queryNearest(spatialIndex, userLatLng, distanceFn)
    : linearNearest(items, userLatLng, distanceFn);
  if (!nearest) return null;
  drawRouteTo(nearest.item);
  return nearest;
}

function drawRouteTo(item) {
  if (routeLine) map.removeLayer(routeLine);
  routeLine = L.polyline([userLatLng, [item.lat, item.lng]], {
    color: "#0ea5e9",
    weight: 4,
    opacity: 0.85
  }).addTo(map);
}

export function exportToGeoJson(items) {
  return {
    type: "FeatureCollection",
    features: items.map((item) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [item.lng, item.lat] },
      properties: {
        name: item.name,
        category: item.category,
        description: item.description,
        heritageType: item.heritageType,
        image: item.image || ""
      }
    }))
  };
}

export function renderImportedGeoJson(geojson, notify) {
  geoJsonLayer.clearLayers();
  const layer = L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) => {
      const color = getCategoryColor(feature.properties?.category || "مستورد");
      return L.circleMarker(latlng, {
        radius: 6,
        color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: 2
      });
    },
    onEachFeature: (feature, layerInstance) => {
      const props = feature.properties || {};
      const latlng = typeof layerInstance.getLatLng === "function" ? layerInstance.getLatLng() : null;
      const modalData = {
        name: props.name || "عنصر مستورد",
        category: props.category || "مستورد",
        description: props.description || "لا يوجد وصف.",
        image: props.image || "",
        lat: latlng?.lat || QENA_CENTER[0],
        lng: latlng?.lng || QENA_CENTER[1],
        raw: props
      };
      layerInstance.on("click", () => openSidePanel(modalData));
    }
  });
  geoJsonLayer.addLayer(layer);
  const bounds = layer.getBounds();
  if (bounds.isValid()) map.fitBounds(bounds.pad(0.2));
  notify("تم استيراد ملف GeoJSON بنجاح.");
}

function getCategoryIcon(category = "") {
  const normalized = String(category).toLowerCase();
  if (normalized.includes("لامادي")) return "🎭";
  if (normalized.includes("اثري") || normalized.includes("معبد")) return "🏛️";
  if (normalized.includes("ديني") || normalized.includes("مسجد")) return "🕌";
  return "📍";
}

function linearNearest(items, origin, distanceFn) {
  let nearest = null;
  let minDistance = Number.POSITIVE_INFINITY;
  items.forEach((item) => {
    const dist = distanceFn(origin.lat, origin.lng, item.lat, item.lng);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = item;
    }
  });
  return nearest ? { item: nearest, distance: minDistance } : null;
}

export function toggleRoutingMode(notify) {
  routingNotify = typeof notify === "function" ? notify : () => {};
  routingMode = !routingMode;
  if (routingMode) {
    routingStatusHandler("جاهز لاختيار نقطة الوجهة");
    routingMetricsHandler("-", "-");
    routingNotify("تم تفعيل وضع التوجيه. انقر على أي موقع لعرض المسار.");
  } else {
    routingStatusHandler("متوقف");
    routingNotify("تم إيقاف وضع التوجيه.");
  }
  return routingMode;
}

export function setRoutingUiHandlers({ onStatusChange, onMetricsChange } = {}) {
  if (typeof onStatusChange === "function") routingStatusHandler = onStatusChange;
  if (typeof onMetricsChange === "function") routingMetricsHandler = onMetricsChange;
}

export function clearRoutingPath() {
  if (routeLine && map) map.removeLayer(routeLine);
  routeLine = null;
  routingStatusHandler(routingMode ? "جاهز لاختيار نقطة الوجهة" : "متوقف");
  routingMetricsHandler("-", "-");
}

async function requestRouteTo(item) {
  if (!map || routingInFlight) return;
  routingInFlight = true;
  routingStatusHandler("جاري تحديد موقعك...");
  try {
    const origin = await getCurrentPosition();
    userLatLng = L.latLng(origin.lat, origin.lng);
    routingStatusHandler("جاري حساب المسار...");
    const route = await fetchRoadRoute(userLatLng, L.latLng(item.lat, item.lng));
    drawRoadRoute(route.coordinates);
    const km = (route.distance / 1000).toFixed(2);
    const minutes = Math.max(1, Math.round(route.duration / 60));
    routingStatusHandler(`المسار إلى ${item.name || "الوجهة"} جاهز`);
    routingMetricsHandler(`${km} كم`, `${minutes} دقيقة`);
    routingNotify(`المسافة ${km} كم - الزمن المتوقع ${minutes} دقيقة.`);
  } catch (error) {
    routingStatusHandler("تعذر حساب المسار");
    routingMetricsHandler("-", "-");
    routingNotify(error.message || "تعذر رسم المسار حالياً.", true);
  } finally {
    routingInFlight = false;
  }
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("المتصفح لا يدعم تحديد الموقع الجغرافي."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error("تم رفض إذن الموقع. فعّل الصلاحية ثم أعد المحاولة."));
          return;
        }
        reject(new Error("تعذر الحصول على موقعك الحالي."));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

async function fetchRoadRoute(origin, destination) {
  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
  const response = await fetch(osrmUrl);
  if (!response.ok) {
    throw new Error("فشل الاتصال بخدمة التوجيه.");
  }
  const data = await response.json();
  const firstRoute = data.routes?.[0];
  if (!firstRoute?.geometry?.coordinates?.length) {
    throw new Error("لم يتم العثور على مسار طرقي لهذا الموقع.");
  }
  return {
    coordinates: firstRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distance: firstRoute.distance,
    duration: firstRoute.duration
  };
}

function drawRoadRoute(latLngs) {
  if (routeLine) map.removeLayer(routeLine);
  routeLine = L.polyline(latLngs, {
    color: "#0ea5e9",
    weight: 5,
    opacity: 0.9
  }).addTo(map);
  map.fitBounds(routeLine.getBounds().pad(0.2));
}

function applyMarkerHighlight(marker) {
  const markerEl = marker.getElement()?.querySelector(".custom-marker") || marker.getElement();
  if (!markerEl) return;
  if (activeMarkerHighlightEl) activeMarkerHighlightEl.classList.remove("marker-highlight");
  if (activeMarkerHighlightTimer) window.clearTimeout(activeMarkerHighlightTimer);
  markerEl.classList.add("marker-highlight");
  activeMarkerHighlightEl = markerEl;
  activeMarkerHighlightTimer = window.setTimeout(() => {
    markerEl.classList.remove("marker-highlight");
    if (activeMarkerHighlightEl === markerEl) activeMarkerHighlightEl = null;
    activeMarkerHighlightTimer = null;
  }, 2200);
}

function initSidePanel() {
  sidePanelEl = document.getElementById("sidePanel");
  panelTitleEl = document.getElementById("panelTitle");
  panelLocationEl = document.getElementById("panelLocation");
  panelOverviewEl = document.getElementById("panelOverview");
  panelDetailsEl = document.getElementById("panelDetails");
  panelCloseBtnEl = document.getElementById("closePanelBtn") || document.getElementById("panelCloseBtn");
  panelRouteBtnEl = document.getElementById("panelRouteBtn");
  panelOverviewTabEl = document.getElementById("panelOverviewTab");
  panelDetailsTabEl = document.getElementById("panelDetailsTab");
  panelGalleryEl = document.getElementById("panelGallery");
  panelGalleryTrackEl = document.getElementById("panelGalleryTrack");
  panelGalleryDotsEl = document.getElementById("panelGalleryDots");
  panelPrevImageBtnEl = document.getElementById("panelPrevImageBtn");
  panelNextImageBtnEl = document.getElementById("panelNextImageBtn");
  if (
    !sidePanelEl
    || !panelTitleEl
    || !panelLocationEl
    || !panelOverviewEl
    || !panelDetailsEl
    || !panelRouteBtnEl
    || !panelOverviewTabEl
    || !panelDetailsTabEl
    || !panelGalleryEl
    || !panelGalleryTrackEl
    || !panelGalleryDotsEl
    || !panelPrevImageBtnEl
    || !panelNextImageBtnEl
  ) return;

  panelCloseBtnEl?.addEventListener("click", closeSidePanel);
  panelRouteBtnEl.addEventListener("click", () => {
    if (!selectedPanelItem) return;
    requestRouteTo(selectedPanelItem);
  });
  panelOverviewTabEl.addEventListener("click", () => setSidePanelTab("overview"));
  panelDetailsTabEl.addEventListener("click", () => setSidePanelTab("details"));
  panelPrevImageBtnEl.addEventListener("click", () => shiftGallery(-1));
  panelNextImageBtnEl.addEventListener("click", () => shiftGallery(1));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !sidePanelEl.classList.contains("hidden")) {
      closeSidePanel();
    }
  });
}

function openSidePanel(item) {
  if (!sidePanelEl || !panelOverviewEl || !panelDetailsEl || !item) return;
  selectedPanelItem = item;
  const rowData = item.raw && typeof item.raw === "object" ? item.raw : item;

  panelTitleEl.textContent = item.name || rowData.name || rowData["الاسم"] || "بدون اسم";
  panelLocationEl.textContent = rowData.location || rowData["الموقع"] || rowData.address || "";
  panelImages = extractImages(rowData);
  panelImageIndex = 0;
  renderGallery();
  panelOverviewEl.innerHTML = buildSidePanelOverview(rowData, item);
  panelDetailsEl.innerHTML = buildSidePanelRows(rowData, item);
  setSidePanelTab("overview");
  sidePanelEl.classList.remove("hidden");
  // Force open (fallback if CSS is overridden elsewhere).
  sidePanelEl.style.transform = "translateX(0)";
  sidePanelEl.setAttribute("aria-hidden", "false");
}

function closeSidePanel() {
  if (!sidePanelEl) return;
  console.log("Closing panel...");
  sidePanelEl.classList.add("hidden");
  // Force close (fallback if CSS specificity/inline styles conflict).
  sidePanelEl.style.transform = "translateX(-100%)";
  sidePanelEl.setAttribute("aria-hidden", "true");
}

function setSidePanelTab(tabName) {
  const overviewActive = tabName === "overview";
  panelOverviewTabEl?.classList.toggle("active", overviewActive);
  panelDetailsTabEl?.classList.toggle("active", !overviewActive);
  panelOverviewTabEl?.setAttribute("aria-selected", overviewActive ? "true" : "false");
  panelDetailsTabEl?.setAttribute("aria-selected", !overviewActive ? "true" : "false");
  panelOverviewEl?.classList.toggle("active", overviewActive);
  panelDetailsEl?.classList.toggle("active", !overviewActive);
}

function buildSidePanelOverview(rowData, item) {
  const summaryKeys = Object.keys(rowData).filter((key) => {
    const normalized = String(key).toLowerCase();
    return /name|title|اسم|category|type|تصنيف|description|desc|وصف|location|address|موقع|عنوان/.test(normalized);
  });
  const summaryRows = summaryKeys
    .slice(0, 6)
    .map((key) => {
      const value = rowData[key];
      if (value === null || value === undefined || String(value).trim() === "") return "";
      return `<div class="panel-row"><strong>${getFieldIcon(key)} ${escapeHtml(String(key))}</strong><span>${escapeHtml(String(value))}</span></div>`;
    })
    .join("");
  const coordsRow = Number.isFinite(item.lat) && Number.isFinite(item.lng)
    ? `<div class="panel-row"><strong>🧭 الإحداثيات</strong><span>${item.lat.toFixed(5)} , ${item.lng.toFixed(5)}</span></div>`
    : "";
  return `${summaryRows}${coordsRow}`;
}

function buildSidePanelRows(rowData, item) {
  const rows = Object.keys(rowData)
    .filter((key) => String(key).trim())
    .map((key) => {
      const value = rowData[key];
      if (value === null || value === undefined || String(value).trim() === "") return "";
      return `
        <div class="panel-row">
          <strong>${getFieldIcon(key)} ${escapeHtml(String(key))}</strong>
          <span>${escapeHtml(String(value))}</span>
        </div>
      `;
    })
    .join("");

  const coordsRow = Number.isFinite(item.lat) && Number.isFinite(item.lng)
    ? `<div class="panel-row"><strong>🧭 الإحداثيات</strong><span>${item.lat.toFixed(5)} , ${item.lng.toFixed(5)}</span></div>`
    : "";

  return `${rows}${coordsRow}`;
}

function extractImages(data) {
  if (!data || typeof data !== "object") return [];

  const key = Object.keys(data).find((k) =>
    ["image", "img", "photo", "images"].includes(String(k).toLowerCase())
  );

  if (!key || !data[key]) return [];

  const value = data[key];
  const asString = Array.isArray(value) ? value.map((v) => String(v ?? "").trim()).join(",") : String(value);

  return asString
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function renderGallery() {
  if (!panelGalleryEl || !panelGalleryTrackEl || !panelGalleryDotsEl) return;
  if (!panelImages.length) {
    panelGalleryEl.classList.remove("empty");
    panelGalleryTrackEl.innerHTML = `<img src="/assets/default.jpg" alt="الصورة الافتراضية" loading="lazy" onerror="this.src='/assets/default.jpg'" />`;
    panelGalleryDotsEl.innerHTML = "";
    if (panelPrevImageBtnEl) panelPrevImageBtnEl.disabled = true;
    if (panelNextImageBtnEl) panelNextImageBtnEl.disabled = true;
    panelGalleryTrackEl.style.transform = "translateX(0)";
    return;
  }
  panelGalleryEl.classList.remove("empty");
  panelGalleryTrackEl.innerHTML = panelImages
    .map((src) => `<img src="${escapeHtml(src)}" alt="صورة الموقع" loading="lazy" onerror="this.src='/assets/default.jpg'" />`)
    .join("");
  panelGalleryDotsEl.innerHTML = panelImages
    .map((_, index) => `<button type="button" class="gallery-dot ${index === panelImageIndex ? "active" : ""}" data-index="${index}" aria-label="صورة ${index + 1}"></button>`)
    .join("");
  panelGalleryDotsEl.querySelectorAll(".gallery-dot").forEach((button) => {
    button.addEventListener("click", () => {
      panelImageIndex = Number(button.dataset.index) || 0;
      updateGalleryPosition();
    });
  });
  if (panelPrevImageBtnEl) panelPrevImageBtnEl.disabled = panelImages.length <= 1;
  if (panelNextImageBtnEl) panelNextImageBtnEl.disabled = panelImages.length <= 1;
  updateGalleryPosition();
}

function shiftGallery(step) {
  if (!panelImages.length) return;
  panelImageIndex = (panelImageIndex + step + panelImages.length) % panelImages.length;
  updateGalleryPosition();
}

function updateGalleryPosition() {
  if (!panelGalleryTrackEl || !panelGalleryDotsEl) return;
  panelGalleryTrackEl.style.transform = `translateX(-${panelImageIndex * 100}%)`;
  panelGalleryDotsEl.querySelectorAll(".gallery-dot").forEach((dot, index) => {
    dot.classList.toggle("active", index === panelImageIndex);
  });
}

function getFieldIcon(fieldName = "") {
  const normalized = String(fieldName).toLowerCase().trim();
  if (/name|title|اسم/.test(normalized)) return "📍";
  if (/category|type|تصنيف|فئة/.test(normalized)) return "🏷️";
  if (/desc|detail|note|وصف|تفاصيل|ملاحظ/.test(normalized)) return "📝";
  if (/image|photo|img|picture|صورة/.test(normalized)) return "🖼️";
  if (/date|time|تاريخ|زمن/.test(normalized)) return "🕒";
  if (/lat|latitude|خط العرض/.test(normalized)) return "📐";
  if (/lng|lon|longitude|خط الطول/.test(normalized)) return "📏";
  if (/address|location|site|مكان|موقع|عنوان/.test(normalized)) return "🗺️";
  return "•";
}

function isImagePath(value = "") {
  const normalized = String(value).trim();
  return /^\/?data\/.+\.(png|jpe?g|gif|webp|svg)$/i.test(normalized) || /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(normalized);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
