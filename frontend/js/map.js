/**
 * จัดการแผนที่ Leaflet, แถบเครื่องมือควบคุมแผนที่สไตล์โมเดิร์น
 * รองรับหลายแปลง (Multi-Paddy รันเลขใหม่อัตโนมัติเมื่อลบ), ลิ้นชักเครื่องมือพับได้ (Retractable Drawer),
 * และระบบตรวจจับการใช้ประโยชน์ที่ดิน (Land-Use Verification)
 */
class MapManager {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.drawnItems = null;
    this.activeDrawHandler = null;
    
    // โหมดการทำงาน: "pan" (เมาส์ปกติ), "polygon", "rectangle", "delete" (ลบแปลง)
    this.currentMode = "pan";

    // จัดการหลายแปลง (Multi-Paddy State)
    this.paddies = []; // รายการแปลง: { id, number, name, layer, geometry, ricePlants }
    this.activePaddyId = null;

    // ระบบแสดงต้นข้าวในแปลง (Rice Plants Visual Engine)
    this.riceLayerGroup = null;
    this.weatherEffectLayer = null;
    this.currentStageId = 1;
    this.currentWeatherState = "normal"; // normal, rain, flood, drought, heat
    this.lastRenderedStage = null;
    this.lastRenderedWeather = null;

    this.tileLayers = {
      satellite: null,
      street: null
    };
    this.currentTileType = "satellite";

    // Callbacks
    this.onPolygonChangeCallback = null;
    this.onPaddyListChangeCallback = null;
  }

  init(defaultCoords = [16.4322, 102.8236], defaultZoom = 14) {
    if (!window.L) {
      console.error("[MapManager] ไม่พบไลบรารี Leaflet");
      return;
    }

    // 1. กำหนด Base Tile Layers
    this.tileLayers.street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    });

    this.tileLayers.satellite = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Tiles &copy; Esri &mdash; World Imagery"
      }
    );

    // 2. สร้างแผนที่
    this.map = L.map(this.containerId, {
      center: defaultCoords,
      zoom: defaultZoom,
      zoomControl: false,
      layers: [this.tileLayers.satellite]
    });

    // 3. กำหนดกลุ่มเลเยอร์
    this.drawnItems = new L.FeatureGroup();
    this.map.addLayer(this.drawnItems);

    this.riceLayerGroup = L.layerGroup();
    this.map.addLayer(this.riceLayerGroup);

    this.weatherEffectLayer = L.layerGroup();
    this.map.addLayer(this.weatherEffectLayer);

    // 4. ผูกการทำงานกับ Custom Toolbar และ Retractable Drawer
    this.bindCustomToolbar();
    this.bindDrawerHandle();

    // 5. สร้างแปลงตัวอย่างเริ่มต้น (แปลงที่ 1)
    this.createSamplePolygon(defaultCoords);
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
      color: "#d97706",
      fillColor: "#22c55e",
      fillOpacity: 0.25,
      weight: 2
    };

    if (type === "polygon") {
      this.activeDrawHandler = new L.Draw.Polygon(this.map, { shapeOptions });
    } else if (type === "rectangle") {
      this.activeDrawHandler = new L.Draw.Rectangle(this.map, { shapeOptions });
    }

    this.activeDrawHandler.enable();

    this.map.once(L.Draw.Event.CREATED, (e) => {
      const layer = e.layer;
      this.registerPaddy(layer);

      // วาดเสร็จ กลับสู่โหมดเมาส์ปกติและย่อลิ้นชักขึ้นเพื่อไม่บังจอ
      this.setMode("pan");
      const toolbar = document.getElementById("customMapToolbar");
      const chevron = document.getElementById("drawerChevron");
      if (toolbar) {
        toolbar.classList.add("collapsed");
        if (chevron) chevron.style.transform = "rotate(0)";
      }
    });
  }

  /**
   * ลงทะเบียนแปลงนาใหม่ โดยค้นหาหมายเลขแปลงที่ยังว่างอยู่ (แก้ปัญหาลบแปลง 1 แล้วยังขึ้นเป็นแปลง 2)
   */
  registerPaddy(layer) {
    this.drawnItems.addLayer(layer);

    // หาหมายเลขแปลงลำดับต่ำสุดที่ยังว่างอยู่ (1, 2, 3...)
    const usedNumbers = this.paddies.map((p) => p.number);
    let nextNum = 1;
    while (usedNumbers.includes(nextNum)) {
      nextNum++;
    }

    const paddyId = Date.now() + Math.floor(Math.random() * 1000);
    const paddyName = `แปลงที่ ${nextNum}`;
    const plants = this.generateRicePlantPositions(layer);

    const paddyObj = {
      id: paddyId,
      number: nextNum,
      name: paddyName,
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
    // เรียงตามหมายเลขแปลงเพื่อความเรียบร้อย
    this.paddies.sort((a, b) => a.number - b.number);

    this.selectPaddy(paddyId);

    if (this.onPaddyListChangeCallback) {
      this.onPaddyListChangeCallback(this.paddies, this.activePaddyId);
    }
  }

  selectPaddy(paddyId) {
    const paddy = this.paddies.find((p) => p.id === paddyId);
    if (!paddy) return;

    this.activePaddyId = paddyId;

    // อัปเดตสไตล์แปลงที่ถูกเลือก
    this.paddies.forEach((p) => {
      if (p.id === paddyId) {
        p.layer.setStyle({ color: "#d97706", weight: 3, fillOpacity: 0.3 });
      } else {
        p.layer.setStyle({ color: "#94a3b8", weight: 1.5, fillOpacity: 0.15 });
      }
    });

    const bounds = paddy.layer.getBounds();
    const center = bounds.getCenter();
    
    // ตรวจจับจังหวัดของแปลง
    let detectedProv = null;
    if (typeof detectProvinceFromCoord === "function") {
      detectedProv = detectProvinceFromCoord(center.lat, center.lng);
    }

    // ตรวจสอบการใช้ประโยชน์ที่ดินเบื้องต้น (Land-Use check)
    const landUseInfo = this.checkLandUse(center.lat, center.lng);

    this.lastRenderedStage = null;
    this.lastRenderedWeather = null;
    this.renderRiceVisuals(this.currentStageId, this.currentWeatherState);

    if (this.onPolygonChangeCallback) {
      this.onPolygonChangeCallback(paddy.geometry, detectedProv, paddy, landUseInfo);
    }

    if (this.onPaddyListChangeCallback) {
      this.onPaddyListChangeCallback(this.paddies, this.activePaddyId);
    }
  }

  /**
   * ตรวจสอบว่าพิกัดแปลงอยู่ในเขตชุมชนเมืองหนาแน่น หรือเขตเกษตรกรรมจริง (Land-Use Verification)
   */
  checkLandUse(lat, lng) {
    // พิกัดตัวอย่างของเขตเมืองใหญ่หนาแน่น (เทศบาลนคร/ใจกลางเมือง)
    const urbanCenters = [
      { name: "ใจกลางกรุงเทพมหานคร", lat: 13.7563, lng: 100.5018, radius: 0.10 },
      { name: "เขตเทศบาลนครขอนแก่น (ตัวเมือง)", lat: 16.4419, lng: 102.8360, radius: 0.025 },
      { name: "เขตคูเมืองเชียงใหม่ (ตัวเมือง)", lat: 18.7883, lng: 98.9853, radius: 0.025 },
      { name: "เขตเทศบาลนครนครราชสีมา (ตัวเมือง)", lat: 14.9799, lng: 102.0977, radius: 0.03 }
    ];

    for (const u of urbanCenters) {
      const dist = Math.sqrt(Math.pow(lat - u.lat, 2) + Math.pow(lng - u.lng, 2));
      if (dist < u.radius) {
        return {
          isPaddyArea: false,
          zoneType: "ชุมชนเมืองหนาแน่น",
          warning: `⚠️ แปลงนี้อยู่ใน${u.name} ซึ่งไม่ใช่พื้นที่เกษตรกรรม (ในระบบจริงจะกรองด้วย LDD Land Use รหัส A101)`
        };
      }
    }

    return {
      isPaddyArea: true,
      zoneType: "พื้นที่เกษตรกรรม (นาข้าว)",
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
      if (this.paddies.length > 0) {
        this.selectPaddy(this.paddies[0].id);
      } else {
        this.activePaddyId = null;
        this.riceLayerGroup.clearLayers();
        this.weatherEffectLayer.clearLayers();
        if (this.onPolygonChangeCallback) {
          this.onPolygonChangeCallback(null, null, null, null);
        }
      }
    }

    if (this.onPaddyListChangeCallback) {
      this.onPaddyListChangeCallback(this.paddies, this.activePaddyId);
    }

    this.setMode("pan");
  }

  clearAllPaddies() {
    this.drawnItems.clearLayers();
    this.riceLayerGroup.clearLayers();
    this.weatherEffectLayer.clearLayers();
    this.paddies = [];
    this.activePaddyId = null;

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

  createSamplePolygon(center) {
    const lat = center[0];
    const lng = center[1];
    const delta = 0.0012;

    const sampleCoords = [
      [lat - delta, lng - delta],
      [lat - delta, lng + delta],
      [lat + delta, lng + delta],
      [lat + delta, lng - delta]
    ];

    const polygon = L.polygon(sampleCoords, {
      color: "#d97706",
      fillColor: "#22c55e",
      fillOpacity: 0.25,
      weight: 3
    });

    this.registerPaddy(polygon);
    this.map.fitBounds(polygon.getBounds(), { padding: [50, 50] });
  }

  generateRicePlantPositions(polygonLayer) {
    const plants = [];
    if (!polygonLayer) return plants;

    const bounds = polygonLayer.getBounds();
    const minLat = bounds.getSouth();
    const maxLat = bounds.getNorth();
    const minLng = bounds.getWest();
    const maxLng = bounds.getEast();

    const targetCount = 28;
    let attempts = 0;
    const latLngs = polygonLayer.getLatLngs()[0];

    while (plants.length < targetCount && attempts < 220) {
      attempts++;
      const randLat = minLat + Math.random() * (maxLat - minLat);
      const randLng = minLng + Math.random() * (maxLng - minLng);
      const pt = L.latLng(randLat, randLng);

      if (this.isPointInsidePolygon(pt, latLngs)) {
        plants.push({
          lat: randLat,
          lng: randLng,
          swayOffset: Math.random() * 2
        });
      }
    }
    return plants;
  }

  isPointInsidePolygon(point, vs) {
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
    if (stageId === this.lastRenderedStage && weatherState === this.lastRenderedWeather) {
      return;
    }

    this.lastRenderedStage = stageId;
    this.lastRenderedWeather = weatherState;
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

    let iconSvg = "";
    if (stageId === 1) {
      const color = isDrought ? "#a16207" : "#22c55e";
      iconSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="${color}"><path d="M12 2C12 2 7 9 7 14C7 16.8 9.2 19 12 19C14.8 19 17 16.8 17 14C17 9 12 2 12 2Z"/></svg>`;
    } else if (stageId === 2) {
      const color = isDrought ? "#854d0e" : "#16a34a";
      iconSvg = `<svg width="17" height="17" viewBox="0 0 24 24" fill="${color}"><path d="M12 2L15 10L20 8L16 15L19 22L12 18L5 22L8 15L4 8L9 10L12 2Z"/></svg>`;
    } else if (stageId === 3) {
      const color = isDrought ? "#713f12" : "#15803d";
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="${color}"><path d="M12 2C8 6 6 12 6 22H18C18 12 16 6 12 2Z"/></svg>`;
    } else if (stageId === 4) {
      const color = isDrought ? "#92400e" : "#eab308";
      iconSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="${color}"><path d="M14 2C10 5 8 10 9 22C12 20 16 14 17 8C17 4 15 2 14 2Z"/></svg>`;
    } else {
      const color = isDrought ? "#a16207" : "#f59e0b";
      iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="${color}"><path d="M12 2L14.5 8.5L21 9L16 13.5L17.5 20L12 16.5L6.5 20L8 13.5L3 9L9.5 8.5L12 2Z"/></svg>`;
    }

    if (activePaddy.layer) {
      if (isFlood) {
        activePaddy.layer.setStyle({ fillColor: "#0284c7", fillOpacity: 0.5, color: "#0284c7", weight: 3 });
      } else if (isDrought) {
        activePaddy.layer.setStyle({ fillColor: "#ea580c", fillOpacity: 0.4, color: "#c2410c", weight: 2 });
      } else {
        activePaddy.layer.setStyle({
          fillColor: stageId === 5 ? "#d97706" : "#22c55e",
          fillOpacity: 0.25,
          color: stageId === 5 ? "#d97706" : "#16a34a",
          weight: 3
        });
      }
    }

    this.riceLayerGroup.clearLayers();
    activePaddy.ricePlants.forEach((p) => {
      const riceIcon = L.divIcon({
        className: "rice-crop-icon",
        html: `<div style="transform: scale(${isFlood ? 0.7 : 1}); will-change: transform;">${iconSvg}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
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
          html: `<div style="background:#0284c7; color:#fff; padding:3px 9px; border-radius:14px; font-size:10.5px; white-space:nowrap; box-shadow:0 2px 8px rgba(0,0,0,0.2); font-weight:500;"><i class="fa-solid fa-cloud-showers-heavy"></i> ${isFlood ? 'น้ำท่วมขังแปลงนา!' : 'ฝนตกต่อเนื่อง'}</div>`,
          iconAnchor: [45, 18]
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
