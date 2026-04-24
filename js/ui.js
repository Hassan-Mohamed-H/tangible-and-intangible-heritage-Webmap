function byId(id) {
  return document.getElementById(id);
}

export const uiEls = {
  searchInput: byId("searchInput"),
  searchBtn: byId("searchBtn"),
  searchSuggestions: byId("searchSuggestions"),
  categoryFilters: byId("categoryFilters"),
  legend: byId("legend"),
  visibleCount: byId("visibleCount"),
  totalCount: byId("totalCount"),
  nearestName: byId("nearestName"),
  nearestDistance: byId("nearestDistance"),
  loadingOverlay: byId("loadingOverlay"),
  toastContainer: byId("toastContainer"),
  sidebar: byId("sidebar"),
  toggleSidebarBtn: byId("toggleSidebarBtn"),
  toggleTangible: byId("toggleTangible"),
  toggleIntangible: byId("toggleIntangible"),
  toggleHeatmap: byId("toggleHeatmap"),
  zoomInBtn: byId("zoomInBtn"),
  zoomOutBtn: byId("zoomOutBtn"),
  basemapBtn: byId("basemapBtn"),
  themeBtn: byId("themeBtn"),
  resetBtn: byId("resetBtn"),
  locateBtn: byId("locateBtn"),
  measureBtn: byId("measureBtn"),
  routingBtn: byId("routingBtn"),
  nearestBtn: byId("nearestBtn"),
  routingPanel: byId("routingPanel"),
  routingStatus: byId("routingStatus"),
  routingDistance: byId("routingDistance"),
  routingDuration: byId("routingDuration"),
  clearRouteBtn: byId("clearRouteBtn"),
  importGeoJsonBtn: byId("importGeoJsonBtn"),
  exportGeoJsonBtn: byId("exportGeoJsonBtn"),
  geoJsonInput: byId("geoJsonInput"),
  pieChart: byId("pieChart"),
  barChart: byId("barChart")
};

export function showLoading(show) {
  uiEls.loadingOverlay.classList.toggle("visible", show);
}

export function updateCounts(visible, total) {
  uiEls.visibleCount.textContent = String(visible);
  uiEls.totalCount.textContent = String(total);
}

export function updateNearest(name = "-", distanceText = "-") {
  uiEls.nearestName.textContent = name;
  uiEls.nearestDistance.textContent = distanceText;
}

export function notify(message, isError = false, ms = 3000) {
  const toast = document.createElement("div");
  toast.className = `toast ${isError ? "error" : ""}`;
  toast.textContent = message;
  uiEls.toastContainer.appendChild(toast);
  window.setTimeout(() => toast.remove(), ms);
}

export function renderCategoryFilters(categories, selectedCategories, onChange) {
  uiEls.categoryFilters.innerHTML = "";
  categories.forEach((category) => {
    const label = document.createElement("label");
    label.className = "filter-item";
    const checked = selectedCategories.has(category);
    label.innerHTML = `<input type="checkbox" value="${category}" ${checked ? "checked" : ""} /> ${category}`;
    const input = label.querySelector("input");
    input.addEventListener("change", (ev) => onChange(category, ev.target.checked));
    uiEls.categoryFilters.appendChild(label);
  });
}

export function renderLegend(palette = {}) {
  uiEls.legend.innerHTML = "";
  Object.entries(palette).forEach(([category, color]) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-color" style="background:${color};"></span><span>${category}</span>`;
    uiEls.legend.appendChild(item);
  });
}

export function bindSidebarToggle() {
  uiEls.toggleSidebarBtn.addEventListener("click", () => {
    const isCollapsed = uiEls.sidebar.classList.toggle("collapsed");
    uiEls.toggleSidebarBtn.textContent = isCollapsed ? "❯" : "❮";
  });
}

export function bindThemeToggle() {
  const key = "qena-theme";
  const saved = localStorage.getItem(key);
  if (saved === "dark") {
    document.body.classList.add("dark-mode");
    uiEls.themeBtn.textContent = "☀️";
  }

  uiEls.themeBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    const nowDark = document.body.classList.contains("dark-mode");
    localStorage.setItem(key, nowDark ? "dark" : "light");
    uiEls.themeBtn.textContent = nowDark ? "☀️" : "🌙";
  });
}

export function showSuggestions(suggestions, onSelect) {
  uiEls.searchSuggestions.innerHTML = "";
  if (!suggestions.length) {
    uiEls.searchSuggestions.classList.remove("visible");
    return;
  }

  suggestions.forEach((item) => {
    const button = document.createElement("button");
    button.className = "suggestion-item";
    button.type = "button";
    button.innerHTML = `<strong>${item.name}</strong><small>${item.category}</small>`;
    button.addEventListener("click", () => onSelect(item));
    uiEls.searchSuggestions.appendChild(button);
  });

  uiEls.searchSuggestions.classList.add("visible");
}

export function hideSuggestions() {
  uiEls.searchSuggestions.classList.remove("visible");
  uiEls.searchSuggestions.innerHTML = "";
}

let pieChartInstance = null;
let barChartInstance = null;

export function renderCharts(categoryCounts) {
  const labels = Object.keys(categoryCounts);
  const values = Object.values(categoryCounts);
  const colors = labels.map((_, index) => {
    const hue = (index * 47) % 360;
    return `hsl(${hue}, 75%, 55%)`;
  });

  if (!labels.length) return;

  if (!pieChartInstance) {
    pieChartInstance = new Chart(uiEls.pieChart, {
      type: "doughnut",
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 1 }] },
      options: {
        cutout: "45%",
        animation: { duration: 350 },
        plugins: {
          legend: { position: "bottom", labels: { font: { family: "Segoe UI" }, boxWidth: 12 } },
          tooltip: { rtl: true }
        }
      }
    });
  } else {
    pieChartInstance.data.labels = labels;
    pieChartInstance.data.datasets[0].data = values;
    pieChartInstance.data.datasets[0].backgroundColor = colors;
    pieChartInstance.update("none");
  }

  if (!barChartInstance) {
    barChartInstance = new Chart(uiEls.barChart, {
      type: "bar",
      data: {
        labels,
        datasets: [{ label: "عدد المواقع", data: values, backgroundColor: colors, borderRadius: 8 }]
      },
      options: {
        responsive: true,
        animation: { duration: 350 },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { ticks: { maxRotation: 0 } } },
        plugins: { legend: { display: false }, tooltip: { rtl: true } }
      }
    });
  } else {
    barChartInstance.data.labels = labels;
    barChartInstance.data.datasets[0].data = values;
    barChartInstance.data.datasets[0].backgroundColor = colors;
    barChartInstance.update("none");
  }
}
