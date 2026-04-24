import {
  initMap,
  setMarkers,
  focusOnItem,
  getCategoryPalette,
  zoomIn,
  zoomOut,
  resetExtent,
  toggleBasemap,
  locateUser,
  toggleHeatmap,
  toggleMeasureMode,
  toggleRoutingMode,
  setRoutingUiHandlers,
  clearRoutingPath,
  findNearestSite,
  exportToGeoJson,
  renderImportedGeoJson
} from "./map.js";
import { loadExcelData } from "./excelHandler.js";
import { createSpatialIndex } from "./spatialIndex.js";
import { debounce, scheduleFrame } from "./performance.js";
import { createAppState, setData, setSpatialIndex, updateFilteredData } from "./state.js";
import {
  classifyHeritageType,
  filterByLayerVisibility,
  getCategories,
  getCategoryCounts,
  filterByCategories,
  getSuggestions
} from "./filters.js";
import {
  uiEls,
  showLoading,
  updateCounts,
  updateNearest,
  notify,
  renderCategoryFilters,
  renderLegend,
  renderCharts,
  showSuggestions,
  hideSuggestions,
  bindSidebarToggle,
  bindThemeToggle
} from "./ui.js";

const state = createAppState();

// Defensive close button wiring (works even if button is replaced dynamically).
document.addEventListener("DOMContentLoaded", () => {
  const bindDirect = () => {
    const closeBtn = document.getElementById("closePanelBtn");
    const panel = document.getElementById("sidePanel");
    if (!closeBtn || !panel) {
      console.warn("Close button or panel not found");
      return;
    }
    closeBtn.addEventListener("click", () => {
      panel.classList.add("hidden");
    });
  };

  try {
    bindDirect();
  } catch (error) {
    console.error("Close button binding failed:", error);
  }
});

document.addEventListener("click", (e) => {
  try {
    const target = e.target;
    if (target && target.id === "closePanelBtn") {
      const panel = document.getElementById("sidePanel");
      if (panel) panel.classList.add("hidden");
    }
  } catch (error) {
    console.error("Close button click handler failed:", error);
  }
});

function refreshMap() {
  const layerFiltered = filterByLayerVisibility(
    state.filteredData,
    state.layerState.tangible,
    state.layerState.intangible
  );
  setMarkers(layerFiltered, state.layerState);
  toggleHeatmap(layerFiltered, state.layerState.heatmap);
  updateCounts(layerFiltered.length, state.allData.length);
  renderLegend(getCategoryPalette());
  renderCharts(getCategoryCounts(layerFiltered));
}
const refreshMapScheduled = scheduleFrame(refreshMap);

function applyCategoryFilters() {
  const categoryFiltered = filterByCategories(state.allData, state.selectedCategories);
  updateFilteredData(state, categoryFiltered);
  refreshMapScheduled();
}

function getSearchPool() {
  const categoryFiltered = filterByCategories(state.allData, state.selectedCategories);
  return filterByLayerVisibility(categoryFiltered, state.layerState.tangible, state.layerState.intangible);
}

function bindSearch() {
  const suggestDebounced = debounce(() => {
    const suggestions = getSuggestions(getSearchPool(), uiEls.searchInput.value || "");
    showSuggestions(suggestions, (item) => {
      uiEls.searchInput.value = item.name || "";
      hideSuggestions();
      focusOnItem(item, { highlight: true });
    });
  }, 150);

  const runSearch = () => {
    hideSuggestions();
    const query = (uiEls.searchInput.value || "").trim();
    if (!query) {
      notify("اكتب كلمة البحث أولاً.", true);
      return;
    }
    const pool = getSearchPool();
    const match = getSuggestions(pool, query, 1)[0];
    if (!match) {
      notify("لا توجد نتائج مطابقة للبحث.", true);
      return;
    }
    focusOnItem(match, { highlight: true });
    notify(`تم الانتقال إلى: ${match.name || "موقع تراثي"}.`);
  };

  uiEls.searchBtn.addEventListener("click", runSearch);
  uiEls.searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearch();
  });
  uiEls.searchInput.addEventListener("input", suggestDebounced);
  document.addEventListener("click", (event) => {
    if (!uiEls.searchSuggestions.contains(event.target) && event.target !== uiEls.searchInput) {
      hideSuggestions();
    }
  });
}

function bindMapControls() {
  uiEls.zoomInBtn.addEventListener("click", zoomIn);
  uiEls.zoomOutBtn.addEventListener("click", zoomOut);
  uiEls.resetBtn.addEventListener("click", resetExtent);
  uiEls.basemapBtn.addEventListener("click", () => {
    const mode = toggleBasemap();
    if (mode === "dark") notify("تم تفعيل الخريطة الداكنة.");
    else if (mode === "satellite") notify("تم تفعيل الخريطة الفضائية.");
    else notify("تم تفعيل الخريطة الفاتحة.");
  });
  uiEls.locateBtn.addEventListener("click", () => locateUser(notify));
  uiEls.measureBtn.addEventListener("click", () => {
    const enabled = toggleMeasureMode(notify);
    uiEls.measureBtn.classList.toggle("active", enabled);
  });
  uiEls.routingBtn.addEventListener("click", () => {
    const enabled = toggleRoutingMode(notify);
    uiEls.routingBtn.classList.toggle("active", enabled);
    uiEls.routingPanel.classList.toggle("visible", enabled);
  });
  uiEls.clearRouteBtn.addEventListener("click", () => {
    clearRoutingPath();
    notify("تم مسح مسار التوجيه.");
  });
  uiEls.nearestBtn.addEventListener("click", () => {
    const nearest = findNearestSite(state.filteredData, notify, state.spatialIndex);
    if (!nearest) return;
    focusOnItem(nearest.item);
    updateNearest(nearest.item.name, nearest.distance >= 1000 ? `${(nearest.distance / 1000).toFixed(2)} كم` : `${Math.round(nearest.distance)} م`);
    notify("تم تحديد أقرب موقع ورسم المسار.");
  });
}

function bindLayerControls() {
  const syncLayerState = () => {
    state.layerState = {
      tangible: uiEls.toggleTangible.checked,
      intangible: uiEls.toggleIntangible.checked,
      heatmap: uiEls.toggleHeatmap.checked
    };
    refreshMapScheduled();
  };
  uiEls.toggleTangible.addEventListener("change", syncLayerState);
  uiEls.toggleIntangible.addEventListener("change", syncLayerState);
  uiEls.toggleHeatmap.addEventListener("change", syncLayerState);
}

function bindGeoJsonTools() {
  uiEls.importGeoJsonBtn.addEventListener("click", () => uiEls.geoJsonInput.click());
  uiEls.geoJsonInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const geojson = JSON.parse(text);
      renderImportedGeoJson(geojson, notify);
    } catch (error) {
      notify("فشل استيراد ملف GeoJSON. تأكد من صحة الملف.", true);
      console.error(error);
    } finally {
      uiEls.geoJsonInput.value = "";
    }
  });

  uiEls.exportGeoJsonBtn.addEventListener("click", () => {
    const geojson = exportToGeoJson(state.allData);
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "qena-heritage.geojson";
    link.click();
    URL.revokeObjectURL(url);
    notify("تم تصدير البيانات بصيغة GeoJSON.");
  });
}

async function bootstrap() {
  try {
    initMap();
    setRoutingUiHandlers({
      onStatusChange: (text) => {
        uiEls.routingStatus.textContent = text;
      },
      onMetricsChange: (distance, duration) => {
        uiEls.routingDistance.textContent = distance;
        uiEls.routingDuration.textContent = duration;
      }
    });
    bindSidebarToggle();
    bindThemeToggle();
    bindSearch();
    bindMapControls();
    bindLayerControls();
    bindGeoJsonTools();

    showLoading(true);
    const loaded = await loadExcelData("./data/sample.xlsx");
    const normalized = loaded.map((item) => ({ ...item, heritageType: classifyHeritageType(item.category) }));
    if (!normalized.length) {
      notify("الملف محمل بنجاح، لكن لا توجد نقاط صالحة للعرض.", true, 4500);
      showLoading(false);
      return;
    }
    setData(state, normalized);
    setSpatialIndex(state, createSpatialIndex(state.allData));

    const categories = getCategories(state.allData);
    state.selectedCategories = new Set(categories);
    renderCategoryFilters(categories, state.selectedCategories, (category, isChecked) => {
      if (isChecked) state.selectedCategories.add(category);
      else state.selectedCategories.delete(category);
      applyCategoryFilters();
    });

    updateFilteredData(state, [...state.allData]);
    refreshMapScheduled();
    updateNearest();
    notify(`تم تحميل ${state.allData.length} موقع تراثي.`);
  } catch (error) {
    notify(error.message || "حدث خطأ أثناء تحميل البيانات.", true, 6000);
    console.error(error);
  } finally {
    showLoading(false);
  }
}

bootstrap();
