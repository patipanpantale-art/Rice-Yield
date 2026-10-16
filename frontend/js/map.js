/**
 * จัดการแผนที่ Leaflet และระบบแปลงนาแบบโต้ตอบ (Interactive Map Manager)
 * ปรับปรุง:
 * 1. แผนที่ดาวเทียมไฮบริด มีชื่อจังหวัด/อำเภอ/ถนน (Esri World Imagery + Boundaries/Places) พร้อมระบบ Fade-out เมื่อซูมใกล้
 * 2. ค้นหา 77 จังหวัด: ตีกรอบจังหวัดสีเข้ม + กรอบอำเภอสีจาง + หมุดชื่อจังหวัด และจางหายไป (Fade-out) เมื่อลบคำค้น
 * 3. เริ่มต้นระบบด้วย 0 แปลงนา (ไม่มีแปลงหลอกเริ่มต้น)
 * 4. รองรับการกำหนดพันธุ์ข้าวรายแปลง (แต่ละแปลงเลือกพันธุ์ต่างกันได้)
 * 5. ระบบป้ายพิลแปลงนาตรงกลาง แสดงชื่อแปลงและพันธุ์ข้าว
 * 6. รองรับการเลื่อนแถบแท็บแปลงนาด้วยปุ่ม < และ >
 */
class MapManager {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.drawnItems = null;
    this.activeDrawHandler = null;
    
    // โหมดการทำงาน: "pan", "polygon", "rectangle", "delete"
    this.currentMode = "pan";

    // รายการแปลง: { id, number, name, variety, layer, geometry, ricePlants }
    this.paddies = [];
    this.activePaddyId = null;

    // เลเยอร์การแสดงผล
    this.riceLayerGroup = null;
    this.weatherEffectLayer = null;
    this.paddyBadgeLayer = null;
    this.provinceHighlightLayer = null; // เลเยอร์ตีกรอบจังหวัดจากการค้นหา
    this.labelsLayer = null; // เลเยอร์ชื่อเมือง/ถนนบนดาวเทียม

    this.currentStageId = 1;
    this.currentWeatherState = "normal";
    this.lastRenderedStage = null;
    this.lastRenderedWeather = null;
    this.lastRenderedPaddyId = null;

    this.tileLayers = {
      satellite: null,
      street: null
    };
    this.currentTileType = "satellite";

    // Callbacks
    this.onPolygonChangeCallback = null;
    this.onPaddyListChangeCallback = null;
  }

  init(defaultCoords = [16.4322, 102.8236], defaultZoom = 9) {
    if (!window.L) {
      console.error("[MapManager] ไม่พบไลบรารี Leaflet");
      return;
    }

    // 1. แผนที่ถนน OpenStreetMap
    this.tileLayers.street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    });

    // 2. แผนที่ดาวเทียมไฮบริด (World Imagery + Boundaries & Places Labels)
    const satBase = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Tiles &copy; Esri &mdash; World Imagery"
      }
    );

    this.labelsLayer = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        opacity: 0.85,
        attribution: "Labels &copy; Esri Boundaries & Places"
      }
    );

    this.tileLayers.satellite = L.layerGroup([satBase, this.labelsLayer]);

    // 3. สร้างแผนที่เริ่มต้นที่ระดับจังหวัด (Zoom 9 เห็นภาพรวมจังหวัดขอนแก่น)
    this.map = L.map(this.containerId, {
      center: defaultCoords,
      zoom: defaultZoom,
      zoomControl: false,
      layers: [this.tileLayers.satellite]
    });

    // Fade-out เลเยอร์ตัวหนังสือเมื่อซูมลึกระดับแปลงนา (Zoom >= 15)
    this.map.on("zoomend", () => {
      const z = this.map.getZoom();
      if (this.labelsLayer) {
        if (z >= 15) {
          this.labelsLayer.setOpacity(0.15); // จางลงเพื่อไม่ให้ลายตาตอนดูแปลงนา
        } else if (z >= 13) {
          this.labelsLayer.setOpacity(0.45);
        } else {
          this.labelsLayer.setOpacity(0.85); // คมชัดเมื่อดูระดับอำเภอ/จังหวัด
        }
      }
    });

    // 4. เลเยอร์กลุ่มต่างๆ
    this.drawnItems = new L.FeatureGroup();
    this.map.addLayer(this.drawnItems);

    this.provinceHighlightLayer = L.layerGroup();
    this.map.addLayer(this.provinceHighlightLayer);

    this.riceLayerGroup = L.layerGroup();
    this.map.addLayer(this.riceLayerGroup);

    this.weatherEffectLayer = L.layerGroup();
    this.map.addLayer(this.weatherEffectLayer);

    this.paddyBadgeLayer = L.layerGroup();
    this.map.addLayer(this.paddyBadgeLayer);

    // 5. ผูกเหตุการณ์ Toolbar และ Search Box
    this.bindCustomToolbar();
    this.bindDrawerHandle();
    this.bindProvinceSearch();
    this.bindPaddyTabsScroll();

    // เริ่มต้นด้วย 0 แปลงนา (ไม่มีแปลงตัวอย่างหลอกเริ่มต้นตามคำขอ)
    if (this.onPaddyListChangeCallback) {
      this.onPaddyListChangeCallback([], null);
    }
  }

  bindDrawerHandle() {
    const handle = document.getElementById("toolbarToggleHandle");
    const toolbar = document.getElementById("customMapToolbar");
    const chevron = document.getElementById("drawerChevron");

    if (handle && toolbar) {
      handle.addEventListener("click", () => {
        toolbar.classList.toggle("collapsed");
        if (chevron) {
          chevron.style.transform = toolbar.classList.contains("collapsed") ? "rotate(0)" : "rotate(180deg)";
        }
      });
    }
  }

  bindCustomToolbar() {
    const btnPan = document.getElementById("toolPan");
    const btnPoly = document.getElementById("toolDrawPoly");
    const btnRect = document.getElementById("toolDrawRect");
    const btnDelete = document.getElementById("toolDelete");
    const btnClear = document.getElementById("toolClear");
    const btnTile = document.getElementById("toolToggleTile");
    const btnZoomIn = document.getElementById("toolZoomIn");
    const btnZoomOut = document.getElementById("toolZoomOut");

    if (btnPan) {
      btnPan.addEventListener("click", () => this.setMode("pan", btnPan));
    }
    if (btnPoly) {
      btnPoly.addEventListener("click", () => {
        if (this.currentMode === "polygon") {
          this.setMode("pan", btnPan);
        } else {
          this.setMode("polygon", btnPoly);
        }
      });
    }
    if (btnRect) {
      btnRect.addEventListener("click", () => {
        if (this.currentMode === "rectangle") {
          this.setMode("pan", btnPan);
        } else {
          this.setMode("rectangle", btnRect);
        }
      });
    }
    if (btnDelete) {
      btnDelete.addEventListener("click", () => {
        if (this.currentMode === "delete") {
          this.setMode("pan", btnPan);
        } else {
          this.setMode("delete", btnDelete);
        }
      });
    }
    if (btnClear) {
      btnClear.addEventListener("click", () => this.clearAllPaddies());
    }
    if (btnTile) {
      btnTile.addEventListener("click", () => this.toggleTileLayer(btnTile));
    }
    if (btnZoomIn) {
      btnZoomIn.addEventListener("click", () => this.map.zoomIn());
    }
    if (btnZoomOut) {
      btnZoomOut.addEventListener("click", () => this.map.zoomOut());
    }
  }

  /**
   * เลื่อนแถบแท็บแปลงนาด้วยปุ่ม < และ >
   */
  bindPaddyTabsScroll() {
    const prevBtn = document.getElementById("btnPaddyTabPrev");
    const nextBtn = document.getElementById("btnPaddyTabNext");
    const container = document.getElementById("paddyTabsContainer");

    if (prevBtn && container) {
      prevBtn.addEventListener("click", () => {
        container.scrollBy({ left: -140, behavior: "smooth" });
      });
    }
    if (nextBtn && container) {
      nextBtn.addEventListener("click", () => {
        container.scrollBy({ left: 140, behavior: "smooth" });
      });
    }
  }

  /**
   * ระบบค้นหาจังหวัด 77 จังหวัด: ตีกรอบขอบเขตสีเข้ม + ขอบเขตอำเภอสีจาง + หมุดชื่อจังหวัด
   * และลบกรอบออกเมื่อล้างคำค้นหา
   */
  bindProvinceSearch() {
    const searchInput = document.getElementById("provinceSearchInput");
    const suggestBox = document.getElementById("provinceSuggestBox");
    if (!searchInput || !suggestBox) return;

    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.trim();
      if (!q) {
        suggestBox.style.display = "none";
        suggestBox.innerHTML = "";
        // เมื่อลบข้อความในช่องค้นหา ให้ล้างกรอบไฮไลต์จังหวัดแบบเฟดออก
        this.clearProvinceHighlight();
        return;
      }

      const results = typeof searchProvinces === "function" ? searchProvinces(q) : [];
      if (results.length === 0) {
        suggestBox.innerHTML = `<div class="suggest-empty">ไม่พบจังหวัดที่ตรงกับ "${q}"</div>`;
        suggestBox.style.display = "block";
        return;
      }

      suggestBox.innerHTML = results.slice(0, 8).map((p) => {
        return `<div class="suggest-item" data-code="${p.code}">
          <span class="suggest-item-name">📍 ${p.name_th}</span>
          <span class="suggest-item-sub">${p.region_th} (${p.name_en})</span>
        </div>`;
      }).join("");

      suggestBox.style.display = "block";
    });

    suggestBox.addEventListener("click", (e) => {
      const item = e.target.closest(".suggest-item");
      if (!item) return;
      const code = item.getAttribute("data-code");
      const prov = THAI_PROVINCES.find((p) => p.code === code);
      if (prov) {
        searchInput.value = prov.name_th;
        suggestBox.style.display = "none";
        this.highlightAndFlyToProvince(prov);
      }
    });

    document.addEventListener("click", (e) => {
      if (!searchInput.contains(e.target) && !suggestBox.contains(e.target)) {
        suggestBox.style.display = "none";
      }
    });
  }

  /**
   * ตีกรอบขอบเขตจังหวัดสีเข้ม + ขอบเขตอำเภอสีจาง พร้อมบินไปอย่างนุ่มนวล
   */
  highlightAndFlyToProvince(prov) {
    if (!prov || !this.map) return;
    this.provinceHighlightLayer.clearLayers();

    const [minLon, minLat, maxLon, maxLat] = prov.b;
    const center = [(minLat + maxLat) / 2, (minLon + maxLon) / 2];

    // 1. ตีกรอบรอบนอกจังหวัด (Boundary Outline) สีเข้ม
    const provinceBoundsCoords = [
      [minLat, minLon],
      [minLat, maxLon],
      [maxLat, maxLon],
      [maxLat, minLon]
    ];

    const outerPolygon = L.polygon(provinceBoundsCoords, {
      color: "#16a34a",
      weight: 3.5,
      dashArray: null,
      fillColor: "#22c55e",
      fillOpacity: 0.12,
      interactive: false
    });
    this.provinceHighlightLayer.addLayer(outerPolygon);

    // 2. ตีกรอบเส้นแบ่งอำเภอย่อยๆ (Faint District Grid)
    const latSpan = maxLat - minLat;
    const lonSpan = maxLon - minLon;
    const subGridLines = [];

    for (let i = 1; i <= 2; i++) {
      const dLat = minLat + (latSpan / 3) * i;
      subGridLines.push([[dLat, minLon], [dLat, maxLon]]);
      const dLon = minLon + (lonSpan / 3) * i;
      subGridLines.push([[minLat, dLon], [maxLat, dLon]]);
    }

    subGridLines.forEach((pts) => {
      const line = L.polyline(pts, {
        color: "#65a30d",
        weight: 1.2,
        dashArray: "4, 6",
        opacity: 0.45,
        interactive: false
      });
      this.provinceHighlightLayer.addLayer(line);
    });

    // 3. ป้ายชื่อจังหวัดตรงกึ่งกลาง
    const provNameBadge = L.marker(center, {
      icon: L.divIcon({
        className: "province-title-badge-container",
        html: `<div class="province-title-badge">
          📍 ${prov.name_th} (${prov.region_th})
        </div>`,
        iconAnchor: [60, 20]
      }),
      interactive: false
    });
    this.provinceHighlightLayer.addLayer(provNameBadge);

    // 4. บินไปยังพิกัดจังหวัดอย่างนุ่มนวลที่ Zoom 9
    this.map.flyTo(center, 9, {
      duration: 1.4,
      easeLinearity: 0.25
    });
  }

  clearProvinceHighlight() {
    if (this.provinceHighlightLayer) {
      this.provinceHighlightLayer.clearLayers();
    }
  }

  setMode(mode, btnElement) {
    if (this.activeDrawHandler) {
      this.activeDrawHandler.disable();
      this.activeDrawHandler = null;
    }

    this.currentMode = mode;
    document.querySelectorAll(".map-tool-btn").forEach((b) => b.classList.remove("active"));
    const container = document.getElementById(this.containerId);

    if (mode === "pan") {
      const btnPan = document.getElementById("toolPan");
      if (btnPan) btnPan.classList.add("active");
      if (container) container.classList.remove("map-delete-mode");
    } else if (mode === "delete") {
      if (btnElement) btnElement.classList.add("active");
      if (container) container.classList.add("map-delete-mode");
    } else if (mode === "polygon" || mode === "rectangle") {
      if (btnElement) btnElement.classList.add("active");
      if (container) container.classList.remove("map-delete-mode");
      this.startDraw(mode);
    }
  }

  startDraw(type) {
    const shapeOptions = {
      color: "#16a34a",
      fillColor: "#22c55e",
      fillOpacity: 0.3,
      weight: 3,
      dashArray: "5, 5"
    };

    if (type === "polygon") {
      this.activeDrawHandler = new L.Draw.Polygon(this.map, {
        shapeOptions,
        showArea: true,
        guidelineDistance: 15,
        icon: new L.DivIcon({
          className: "leaflet-drawing-vertex-icon",
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        })
      });
    } else if (type === "rectangle") {
      this.activeDrawHandler = new L.Draw.Rectangle(this.map, { shapeOptions });
    }

    this.activeDrawHandler.enable();

    this.map.once(L.Draw.Event.CREATED, (e) => {
      const layer = e.layer;
      this.registerPaddy(layer);
      this.setMode("pan");
    });
  }

  /**
   * ลงทะเบียนแปลงนาใหม่ พร้อมบันทึกพันธุ์ข้าวประจำแปลง (Variety Per Paddy)
   */
  registerPaddy(layer) {
    this.drawnItems.addLayer(layer);

    const usedNumbers = this.paddies.map((p) => p.number);
    let nextNum = 1;
    while (usedNumbers.includes(nextNum)) {
      nextNum++;
    }

    const paddyId = Date.now() + Math.floor(Math.random() * 1000);
    const paddyName = `แปลงที่ ${nextNum}`;
    const plants = this.generateRicePlantPositions(layer);

    // อ่านพันธุ์ข้าวปัจจุบันที่เลือกไว้บนแผงซ้าย
    const varietySelect = document.getElementById("riceVariety");
    const currentVariety = varietySelect ? varietySelect.value : "kdml105";

    const paddyObj = {
      id: paddyId,
      number: nextNum,
      name: paddyName,
      variety: currentVariety,
      layer: layer,
      geometry: layer.toGeoJSON().geometry,
      ricePlants: plants
    };

    layer.on("click", () => {
      if (this.currentMode === "delete") {
        this.deletePaddy(paddyId);
      } else {
        this.selectPaddy(paddyId);
      }
    });

    this.paddies.push(paddyObj);
    this.paddies.sort((a, b) => a.number - b.number);

    this.updatePaddyBadges();
    this.selectPaddy(paddyId);

    if (this.onPaddyListChangeCallback) {
      this.onPaddyListChangeCallback(this.paddies, this.activePaddyId);
    }
  }

  /**
   * เลือกแปลงนา และซิงก์พันธุ์ข้าวของแปลงนั้นไปยังตัวเลือกพันธุ์ข้าวบนแผงซ้าย
   */
  selectPaddy(paddyId) {
    const paddy = this.paddies.find((p) => p.id === paddyId);
    if (!paddy) return;

    this.activePaddyId = paddyId;

    // อัปเดตสไตล์แปลง
    this.paddies.forEach((p) => {
      if (p.id === paddyId) {
        p.layer.setStyle({
          color: "#16a34a",
          weight: 3.5,
          fillOpacity: 0.35,
          fillColor: "#22c55e",
          dashArray: null
        });
      } else {
        p.layer.setStyle({
          color: "#475569",
          weight: 2.5,
          fillOpacity: 0.2,
          fillColor: "#64748b",
          dashArray: null
        });
      }
    });

    // ซิงก์พันธุ์ข้าวของแปลงนี้เข้ากับตัวเลือกบนแผงซ้าย
    const varietySelect = document.getElementById("riceVariety");
    if (varietySelect && paddy.variety) {
      varietySelect.value = paddy.variety;
      if (window.App) {
        window.App.modelParams.variety = paddy.variety;
      }
    }

    const bounds = paddy.layer.getBounds();
    const center = bounds.getCenter();
    
    let detectedProv = null;
    if (typeof detectProvinceFromCoord === "function") {
      detectedProv = detectProvinceFromCoord(center.lat, center.lng);
    }

    const landUseInfo = this.checkLandUse(center.lat, center.lng);

    this.lastRenderedPaddyId = null;
    this.renderRiceVisuals(this.currentStageId, this.currentWeatherState);

    this.updatePaddyBadges();

    if (this.onPolygonChangeCallback) {
      this.onPolygonChangeCallback(paddy.geometry, detectedProv, paddy, landUseInfo);
    }

    if (this.onPaddyListChangeCallback) {
      this.onPaddyListChangeCallback(this.paddies, this.activePaddyId);
    }
  }

  /**
   * อัปเดตพันธุ์ข้าวของแปลงปัจจุบัน เมื่อผู้ใช้เปลี่ยนค่าที่ตัวเลือกบนแผงซ้าย
   */
  updateActivePaddyVariety(newVariety) {
    const activePaddy = this.paddies.find((p) => p.id === this.activePaddyId);
    if (activePaddy) {
      activePaddy.variety = newVariety;
      this.updatePaddyBadges();
      if (this.onPaddyListChangeCallback) {
        this.onPaddyListChangeCallback(this.paddies, this.activePaddyId);
      }
    }
  }

  checkLandUse(lat, lng) {
    if (typeof checkUrbanZone77 === "function") {
      return checkUrbanZone77(lat, lng);
    }

    return {
      isPaddyArea: true,
      zoneType: "พื้นที่เกษตรกรรม (นาข้าว)",
      cityName: "พื้นที่เพาะปลูก",
      warning: null
    };
  }

  deletePaddy(paddyId) {
    const idx = this.paddies.findIndex((p) => p.id === paddyId);
    if (idx === -1) return;

    const paddy = this.paddies[idx];
    this.drawnItems.removeLayer(paddy.layer);
    this.paddies.splice(idx, 1);

    if (this.activePaddyId === paddyId) {
      this.riceLayerGroup.clearLayers();
      this.weatherEffectLayer.clearLayers();
      this.lastRenderedPaddyId = null;

      if (this.paddies.length > 0) {
        this.selectPaddy(this.paddies[0].id);
      } else {
        this.activePaddyId = null;
        if (this.onPolygonChangeCallback) {
          this.onPolygonChangeCallback(null, null, null, null);
        }
      }
    } else {
      this.selectPaddy(this.activePaddyId);
    }

    this.updatePaddyBadges();

    if (this.onPaddyListChangeCallback) {
      this.onPaddyListChangeCallback(this.paddies, this.activePaddyId);
    }

    this.setMode("pan");
  }

  clearAllPaddies() {
    this.drawnItems.clearLayers();
    this.riceLayerGroup.clearLayers();
    this.weatherEffectLayer.clearLayers();
    this.paddyBadgeLayer.clearLayers();
    this.paddies = [];
    this.activePaddyId = null;
    this.lastRenderedPaddyId = null;

    if (this.onPolygonChangeCallback) {
      this.onPolygonChangeCallback(null, null, null, null);
    }
    if (this.onPaddyListChangeCallback) {
      this.onPaddyListChangeCallback(this.paddies, null);
    }
    this.setMode("pan");
  }

  toggleTileLayer(btnElement) {
    if (this.currentTileType === "satellite") {
      this.map.removeLayer(this.tileLayers.satellite);
      this.map.addLayer(this.tileLayers.street);
      this.currentTileType = "street";
      if (btnElement) btnElement.innerHTML = `<i class="fa-solid fa-satellite" style="color:#0284c7;"></i> ดาวเทียม`;
    } else {
      this.map.removeLayer(this.tileLayers.street);
      this.map.addLayer(this.tileLayers.satellite);
      this.currentTileType = "satellite";
      if (btnElement) btnElement.innerHTML = `<i class="fa-solid fa-map" style="color:#16a34a;"></i> แผนที่ถนน`;
    }
  }

  /**
   * สัญลักษณ์ป้ายแปลงตรงจุดกึ่งกลาง แสดงชื่อแปลงและชื่อย่อพันธุ์ข้าว
   */
  updatePaddyBadges() {
    this.paddyBadgeLayer.clearLayers();
    const varietyNames = { kdml105: "มะลิ 105", rd6: "กข6", rd41: "กข41" };

    this.paddies.forEach((p) => {
      const center = p.layer.getBounds().getCenter();
      const isActive = p.id === this.activePaddyId;
      const vName = varietyNames[p.variety] || "มะลิ 105";

      const badgeIcon = L.divIcon({
        className: "paddy-centroid-badge-container",
        html: `<div class="paddy-centroid-badge ${isActive ? 'active' : ''}">
          🌾 ${p.name} <span style="font-size:9.5px; opacity:0.85;">(${vName})</span>
        </div>`,
        iconAnchor: [50, 14]
      });

      const marker = L.marker(center, { icon: badgeIcon });
      marker.on("click", () => this.selectPaddy(p.id));
      this.paddyBadgeLayer.addLayer(marker);
    });
  }

  generateRicePlantPositions(polygonLayer) {
    const plants = [];
    if (!polygonLayer) return plants;

    const bounds = polygonLayer.getBounds();
    const minLat = bounds.getSouth();
    const maxLat = bounds.getNorth();
    const minLng = bounds.getWest();
    const maxLng = bounds.getEast();

    const latSpan = maxLat - minLat;
    const lngSpan = maxLng - minLng;
    const latLngs = polygonLayer.getLatLngs()[0];

    const rows = 4;
    const cols = 4;
    const rowStep = latSpan / (rows + 1);
    const colStep = lngSpan / (cols + 1);

    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const jitterLat = (Math.random() - 0.5) * rowStep * 0.35;
        const jitterLng = (Math.random() - 0.5) * colStep * 0.35;

        const pLat = minLat + r * rowStep + jitterLat;
        const pLng = minLng + c * colStep + jitterLng;
        const pt = L.latLng(pLat, pLng);

        if (this.isPointInsidePolygonWithBuffer(pt, latLngs, 0.0001)) {
          plants.push({
            lat: pLat,
            lng: pLng,
            delay: (r + c) * 0.1
          });
        }
      }
    }

    return plants.slice(0, 10);
  }

  isPointInsidePolygonWithBuffer(point, vs, buffer) {
    const x = point.lat, y = point.lng;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i].lat, yi = vs[i].lng;
      const xj = vs[j].lat, yj = vs[j].lng;
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  renderRiceVisuals(stageId, weatherState = "normal") {
    if (
      stageId === this.lastRenderedStage &&
      weatherState === this.lastRenderedWeather &&
      this.activePaddyId === this.lastRenderedPaddyId
    ) {
      return;
    }

    this.lastRenderedStage = stageId;
    this.lastRenderedWeather = weatherState;
    this.lastRenderedPaddyId = this.activePaddyId;
    this.currentStageId = stageId;
    this.currentWeatherState = weatherState;

    const activePaddy = this.paddies.find((p) => p.id === this.activePaddyId);
    if (!activePaddy) {
      this.riceLayerGroup.clearLayers();
      this.weatherEffectLayer.clearLayers();
      return;
    }

    const isFlood = weatherState === "flood";
    const isDrought = weatherState === "drought";

    let plantSvg = "";
    if (stageId === 1) {
      const color = isDrought ? "#a16207" : "#22c55e";
      plantSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22V10"/>
        <path d="M12 10C12 4 4 4 4 10C4 16 12 16 12 16"/>
        <path d="M12 10C12 4 20 4 20 10C20 16 12 16 12 16"/>
      </svg>`;
    } else if (stageId === 2) {
      const color = isDrought ? "#854d0e" : "#16a34a";
      plantSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22V7"/>
        <path d="M12 13C8 10 5 12 4 15"/>
        <path d="M12 13C16 10 19 12 20 15"/>
        <path d="M12 8C7 5 6 10 6 12"/>
        <path d="M12 8C17 5 18 10 18 12"/>
      </svg>`;
    } else if (stageId === 3) {
      const color = isDrought ? "#713f12" : "#15803d";
      plantSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22V4"/>
        <ellipse cx="12" cy="7" rx="3.5" ry="6" fill="${color}" fill-opacity="0.3"/>
        <path d="M12 16C7 13 4 15 3 18"/>
        <path d="M12 16C17 13 20 15 21 18"/>
      </svg>`;
    } else if (stageId === 4) {
      const color = isDrought ? "#92400e" : "#ca8a04";
      plantSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22V8C12 4 16 3 18 4"/>
        <circle cx="16" cy="5" r="1.5" fill="${color}"/>
        <circle cx="14" cy="7" r="1.5" fill="${color}"/>
        <circle cx="17" cy="8" r="1.5" fill="${color}"/>
        <circle cx="15" cy="10" r="1.5" fill="${color}"/>
        <path d="M12 14C8 12 5 14 4 18"/>
      </svg>`;
    } else {
      const color = isDrought ? "#a16207" : "#d97706";
      const grainFill = isDrought ? "#78350f" : "#f59e0b";
      plantSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 22V10C11 5 17 3 20 5"/>
        <ellipse cx="18" cy="6" rx="2" ry="1.2" fill="${grainFill}"/>
        <ellipse cx="15" cy="8" rx="2" ry="1.2" fill="${grainFill}"/>
        <ellipse cx="17" cy="11" rx="2" ry="1.2" fill="${grainFill}"/>
        <ellipse cx="13" cy="12" rx="2" ry="1.2" fill="${grainFill}"/>
        <path d="M11 16C7 13 5 16 3 19"/>
      </svg>`;
    }

    if (activePaddy.layer) {
      if (isFlood) {
        activePaddy.layer.setStyle({ fillColor: "#0284c7", fillOpacity: 0.5, color: "#0284c7", weight: 3.5 });
      } else if (isDrought) {
        activePaddy.layer.setStyle({ fillColor: "#ea580c", fillOpacity: 0.4, color: "#c2410c", weight: 3.5 });
      } else {
        activePaddy.layer.setStyle({
          fillColor: stageId === 5 ? "#fef08a" : "#22c55e",
          fillOpacity: 0.35,
          color: stageId === 5 ? "#d97706" : "#16a34a",
          weight: 3.5
        });
      }
    }

    this.riceLayerGroup.clearLayers();
    activePaddy.ricePlants.forEach((p) => {
      const riceIcon = L.divIcon({
        className: "rice-crop-icon-modern",
        html: `<div class="rice-stalk-wrapper" style="animation-delay: ${p.delay || 0}s; transform: scale(${isFlood ? 0.75 : 1});">
          ${plantSvg}
        </div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 22]
      });
      const marker = L.marker([p.lat, p.lng], { icon: riceIcon, interactive: false });
      this.riceLayerGroup.addLayer(marker);
    });

    this.weatherEffectLayer.clearLayers();
    if (weatherState === "rain" || weatherState === "flood") {
      const bounds = activePaddy.layer.getBounds();
      const center = bounds.getCenter();
      const rainBadge = L.marker(center, {
        icon: L.divIcon({
          className: "rain-badge-icon",
          html: `<div style="background:#0284c7; color:#fff; padding:4px 10px; border-radius:6px; font-size:11px; white-space:nowrap; box-shadow:var(--shadow-md); font-weight:500;">
            <i class="fa-solid fa-cloud-showers-heavy"></i> ${isFlood ? 'น้ำท่วมขังแปลงนา!' : 'ฝนตกต่อเนื่อง'}
          </div>`,
          iconAnchor: [50, 24]
        }),
        interactive: false
      });
      this.weatherEffectLayer.addLayer(rainBadge);
    }
  }

  onPolygonChange(callback) {
    this.onPolygonChangeCallback = callback;
  }

  onPaddyListChange(callback) {
    this.onPaddyListChangeCallback = callback;
  }
}
