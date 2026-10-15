/**
 * จัดการแผนที่ Leaflet, แถบเครื่องมือควบคุมแผนที่สไตล์โมเดิร์น
 * รองรับหลายแปลง (Multi-Paddy), ลบแปลงแบบคลิกเลือก, และ Visual Engine ต้นข้าวประสิทธิภาพสูง 60 FPS
 */
class MapManager {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.drawnItems = null;
    this.activeDrawHandler = null;
    
    // โหมดการทำงานของแผนที่: "pan" (เมาส์ปกติ), "polygon", "rectangle", "delete" (ลบแปลง)
    this.currentMode = "pan";

    // จัดการหลายแปลง (Multi-Paddy State)
    this.paddies = []; // รายการแปลง: { id, name, layer, geometry, ricePlants, markers }
    this.activePaddyId = null;
    this.paddyCounter = 0;

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

  init(defaultCoords = [16.0678, 103.6578], defaultZoom = 14) {
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

    // 4. ผูกการทำงานกับ Custom Toolbar
    this.bindCustomToolbar();

    // 5. สร้างแปลงตัวอย่างเริ่มต้น (แปลงที่ 1)
    this.createSamplePolygon(defaultCoords);
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
    // ยกเลิก Draw Handler ที่ค้างอยู่
    if (this.activeDrawHandler) {
      this.activeDrawHandler.disable();
      this.activeDrawHandler = null;
    }

    this.currentMode = mode;

    // อัปเดตสไตล์ปุ่มเครื่องมือ
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
      color: "#d4af37",
      fillColor: "#38a169",
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

      // วาดเสร็จกลับสู่โหมดเมาส์ปกติ
      this.setMode("pan");
    });
  }

  registerPaddy(layer) {
    this.drawnItems.addLayer(layer);
    this.paddyCounter++;
    const paddyId = this.paddyCounter;
    const paddyName = `แปลงที่ ${paddyId}`;

    // คำนวณพิกัดต้นข้าวสำหรับแปลงนี้
    const plants = this.generateRicePlantPositions(layer);

    const paddyObj = {
      id: paddyId,
      name: paddyName,
      layer: layer,
      geometry: layer.toGeoJSON().geometry,
      ricePlants: plants,
      markers: [] // Cache ของ Leaflet Markers
    };

    // ผูก Event คลิกที่แปลง: ถ้าอยู่ในโหมดลบ ให้ลบแปลงนี้ ถ้าปกติให้เลือกแปลงนี้
    layer.on("click", () => {
      if (this.currentMode === "delete") {
        this.deletePaddy(paddyId);
      } else {
        this.selectPaddy(paddyId);
      }
    });

    this.paddies.push(paddyObj);
    this.selectPaddy(paddyId);

    if (this.onPaddyListChangeCallback) {
      this.onPaddyListChangeCallback(this.paddies, this.activePaddyId);
    }
  }

  selectPaddy(paddyId) {
    const paddy = this.paddies.find((p) => p.id === paddyId);
    if (!paddy) return;

    this.activePaddyId = paddyId;

    // อัปเดตสไตล์ขอบแปลงให้เด่นขึ้น
    this.paddies.forEach((p) => {
      if (p.id === paddyId) {
        p.layer.setStyle({ color: "#ffd700", weight: 3 });
      } else {
        p.layer.setStyle({ color: "#d4af37", weight: 1.5, fillOpacity: 0.15 });
      }
    });

    // ตรวจจับจังหวัดของแปลงนี้
    const bounds = paddy.layer.getBounds();
    const center = bounds.getCenter();
    let detectedProv = null;
    if (typeof detectProvinceFromCoord === "function") {
      detectedProv = detectProvinceFromCoord(center.lat, center.lng);
    }

    // บังคับเรนเดอร์ต้นข้าวใหม่สำหรับแปลงนี้
    this.lastRenderedStage = null;
    this.lastRenderedWeather = null;
    this.renderRiceVisuals(this.currentStageId, this.currentWeatherState);

    // แจ้ง Application Orchestrator ให้คำนวณผลผลิตของแปลงนี้
    if (this.onPolygonChangeCallback) {
      this.onPolygonChangeCallback(paddy.geometry, detectedProv, paddy);
    }

    if (this.onPaddyListChangeCallback) {
      this.onPaddyListChangeCallback(this.paddies, this.activePaddyId);
    }
  }

  deletePaddy(paddyId) {
    const idx = this.paddies.findIndex((p) => p.id === paddyId);
    if (idx === -1) return;

    const paddy = this.paddies[idx];
    this.drawnItems.removeLayer(paddy.layer);

    // ล้าง Markers ต้นข้าวของแปลงนี้
    if (paddy.markers && paddy.markers.length) {
      paddy.markers.forEach((m) => this.riceLayerGroup.removeLayer(m));
    }

    this.paddies.splice(idx, 1);

    // ถ้าแปลงที่ลบคือแปลงที่กำลัง active อยู่ ให้สลับไปแปลงแรกที่เหลืออยู่
    if (this.activePaddyId === paddyId) {
      if (this.paddies.length > 0) {
        this.selectPaddy(this.paddies[0].id);
      } else {
        this.activePaddyId = null;
        this.riceLayerGroup.clearLayers();
        this.weatherEffectLayer.clearLayers();
        if (this.onPolygonChangeCallback) {
          this.onPolygonChangeCallback(null, null, null);
        }
      }
    }

    if (this.onPaddyListChangeCallback) {
      this.onPaddyListChangeCallback(this.paddies, this.activePaddyId);
    }

    // หากลบเสร็จแล้ว ให้คืนสู่โหมดเมาส์ปกติ
    this.setMode("pan");
  }

  clearAllPaddies() {
    this.drawnItems.clearLayers();
    this.riceLayerGroup.clearLayers();
    this.weatherEffectLayer.clearLayers();
    this.paddies = [];
    this.activePaddyId = null;

    if (this.onPolygonChangeCallback) {
      this.onPolygonChangeCallback(null, null, null);
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
      if (btnElement) btnElement.innerHTML = `<i class="fa-solid fa-satellite"></i> แผนที่ถนน`;
    } else {
      this.map.removeLayer(this.tileLayers.street);
      this.map.addLayer(this.tileLayers.satellite);
      this.currentTileType = "satellite";
      if (btnElement) btnElement.innerHTML = `<i class="fa-solid fa-earth-americas"></i> ดาวเทียม`;
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
      color: "#ffd700",
      fillColor: "#38a169",
      fillOpacity: 0.25,
      weight: 3
    });

    this.registerPaddy(polygon);
    this.map.fitBounds(polygon.getBounds(), { padding: [50, 50] });
  }

  /**
   * สุ่มสร้างตำแหน่งต้นข้าวภายในแปลง (Point-in-Polygon)
   */
  generateRicePlantPositions(polygonLayer) {
    const plants = [];
    if (!polygonLayer) return plants;

    const bounds = polygonLayer.getBounds();
    const minLat = bounds.getSouth();
    const maxLat = bounds.getNorth();
    const minLng = bounds.getWest();
    const maxLng = bounds.getEast();

    const targetCount = 30; // ปรับเป็น 30 ต้นต่อแปลงเพื่อความสวยงามและไม่หน่วง
    let attempts = 0;
    const latLngs = polygonLayer.getLatLngs()[0];

    while (plants.length < targetCount && attempts < 250) {
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

  /**
   * เรนเดอร์การเติบโตของต้นข้าวในแปลงนาแบบ Optimized 60 FPS
   * ข้ามการสร้าง Marker ใหม่ถ้า stage และ weather ไม่เปลี่ยนแปลง!
   */
  renderRiceVisuals(stageId, weatherState = "normal") {
    // ป้องกันการวาดซ้ำที่ทำให้หน่วง (Skip unnecessary DOM redraws)
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

    // กำหนด SVG ต้นข้าวตามระยะ 1-5
    let iconSvg = "";
    if (stageId === 1) {
      const color = isDrought ? "#a08150" : "#68d391";
      iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="${color}"><path d="M12 2C12 2 7 9 7 14C7 16.8 9.2 19 12 19C14.8 19 17 16.8 17 14C17 9 12 2 12 2Z"/></svg>`;
    } else if (stageId === 2) {
      const color = isDrought ? "#967d48" : "#38a169";
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="${color}"><path d="M12 2L15 10L20 8L16 15L19 22L12 18L5 22L8 15L4 8L9 10L12 2Z"/></svg>`;
    } else if (stageId === 3) {
      const color = isDrought ? "#8c7240" : "#276749";
      iconSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="${color}"><path d="M12 2C8 6 6 12 6 22H18C18 12 16 6 12 2Z"/></svg>`;
    } else if (stageId === 4) {
      const color = isDrought ? "#a6884a" : "#ecc94b";
      iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="${color}"><path d="M14 2C10 5 8 10 9 22C12 20 16 14 17 8C17 4 15 2 14 2Z"/></svg>`;
    } else {
      const color = isDrought ? "#b58d3d" : "#ffd700";
      iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="${color}"><path d="M12 2L14.5 8.5L21 9L16 13.5L17.5 20L12 16.5L6.5 20L8 13.5L3 9L9.5 8.5L12 2Z"/></svg>`;
    }

    // ปรับสีขอบแปลงนา
    if (activePaddy.layer) {
      if (isFlood) {
        activePaddy.layer.setStyle({ fillColor: "#0077b6", fillOpacity: 0.55, color: "#00b4d8", weight: 3 });
      } else if (isDrought) {
        activePaddy.layer.setStyle({ fillColor: "#7c5e3f", fillOpacity: 0.45, color: "#d97706", weight: 2 });
      } else {
        activePaddy.layer.setStyle({
          fillColor: stageId === 5 ? "#d4af37" : "#38a169",
          fillOpacity: stageId === 5 ? 0.35 : 0.25,
          color: stageId === 5 ? "#ffd700" : "#d4af37",
          weight: 3
        });
      }
    }

    // อัปเดตหรือสร้าง Markers ต้นข้าวแบบแคช
    this.riceLayerGroup.clearLayers();
    activePaddy.ricePlants.forEach((p) => {
      const riceIcon = L.divIcon({
        className: "rice-crop-icon",
        html: `<div style="transform: scale(${isFlood ? 0.7 : 1}); will-change: transform;">${iconSvg}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      const marker = L.marker([p.lat, p.lng], { icon: riceIcon, interactive: false });
      this.riceLayerGroup.addLayer(marker);
    });

    // อัปเดตสภาพอากาศเหนือแปลงนา
    this.weatherEffectLayer.clearLayers();
    if (weatherState === "rain" || weatherState === "flood") {
      const bounds = activePaddy.layer.getBounds();
      const center = bounds.getCenter();
      const rainBadge = L.marker(center, {
        icon: L.divIcon({
          className: "rain-badge-icon",
          html: `<div style="background:rgba(0,180,216,0.9); color:#fff; padding:4px 10px; border-radius:20px; font-size:11px; white-space:nowrap; box-shadow:0 2px 10px rgba(0,0,0,0.5);"><i class="fa-solid fa-cloud-showers-heavy"></i> ${isFlood ? 'น้ำท่วมขังสะสม!' : 'ฝนตกต่อเนื่อง'}</div>`,
          iconAnchor: [50, 20]
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
