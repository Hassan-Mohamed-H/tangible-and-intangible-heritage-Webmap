function pickValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return row[key];
    }
  }
  return null;
}

function toNumber(value) {
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadExcelData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error("ملف Excel لا يحتوي على أوراق.");
    }

    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!rawRows.length) return [];

    const cleaned = [];
    for (const row of rawRows) {
      const latRaw = pickValue(row, ["Latitude", "latitude", "lat", "LAT", "Y", "y", "خط العرض"]);
      const lngRaw = pickValue(row, ["Longitude", "longitude", "lng", "LNG", "X", "x", "خط الطول"]);

      const lat = toNumber(latRaw);
      const lng = toNumber(lngRaw);
      if (lat === null || lng === null) continue;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;

      cleaned.push({
        lat,
        lng,
        category: String(
          pickValue(row, ["Category", "category","نوع التراث", "Type", "type", "الفئة", "تصنيف"]) || "غير مصنف"
        ),
        name: String(pickValue(row, ["Name", "name", "Title", "title", "الاسم"]) || "موقع تراثي"),
        description: String(
          pickValue(row, ["Description", "description", "Details","وصف التراث", "details", "الوصف"]) || "لا يوجد وصف."
        ),
        image: String(pickValue(row, ["Image", "image", "Photo", "photo", "صورة", "رابط الصورة"]) || ""),
        raw: row
      });
    }

    return cleaned;
  } catch (error) {
    throw new Error(`فشل تحميل ملف البيانات: ${error.message}`);
  }
}
