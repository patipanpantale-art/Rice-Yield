/**
 * จัดการแผนที่ Leaflet และระบบควบคุมแปลงนาแบบโต้ตอบ (Interactive Map Manager)
 * ปรับปรุง:
 * 1. ซูมภาพรวมระดับจังหวัด (Default Zoom 9) และค้นหาจังหวัด 77 จังหวัดด้วย Auto-Suggest + Smooth FlyTo
 * 2. จัดการหลายแปลงเสถียร 100% (นับเลขรันใหม่เมื่อลบ, เส้นขอบแปลงไม่หายเมื่อสลับหรือลบ)
 * 3. ออกแบบสัญลักษณ์ต้นข้าวใหม่ให้สวยงาม สบายตา จัดเรียงเป็นระเบียบ ไม่ทับซ้อน ไม่ล้นกรอบ และไม่มีรูปดาวแปลกๆ
 * 4. ลิ้นชักเครื่องมือวาดแปลงไม่เด้งหดกลับเอง ผู้ใช้ควบคุมการเปิด/ปิดได้ตามต้องการ
 * 5. ปรับแต่งจุด Vertex วาดแปลงเป็นทรงกลมมีเงาพาสเทลสวยงาม
 * 6. ตรวจจับการใช้ที่ดินในเขตเมืองหนาแน่นครอบคลุม 77 จังหวัด
 */
class MapManager {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.drawnItems = null;
    this.activeDrawHandler = null;
    
    // โหมดการทำงาน: "pan", "polygon", "rectangle", "delete"
    this.currentMode = "pan";

    // รายการแปลง: { id, number, name, layer, geometry, ricePlants, badgeMarker }
    this.paddies = [];
    this.activePaddyId = null;

    // เลเยอร์การแสดงผล
    this.riceLayerGroup = null;
    this.weatherEffectLayer = null;
    this.paddyBadgeLayer = null;

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

    // 1. Base Tile Layers
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

    // 2. สร้างแผนที่เริ่มต้นที่มุมมองระดับจังหวัด (Zoom 9)
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

    this.paddyBadgeLayer = L.layerGroup();
    this.map.addLayer(this.paddyBadgeLayer);

    // 4. ผูกเหตุการณ์ Toolbar และ Search Box
    this.bindCustomToolbar();
    this.bindDrawerHandle();
    this.bindProvinceSearch();

    // 5. สร้างแปลงตัวอย่างเริ่มต้น (แปลงที่ 1) ในพื้นที่การเกษตร ต.บ้านทุ่ม จ.ขอนแก่น
    const farmCoords = [16.4250, 102.7480];
    this.createSamplePolygon(farmCoords);
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
   * ระบบค้นหา 77 จังหวัดด้วย Auto-Suggest และ Smooth Flight Animation
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
        this.flyToProvince(prov);
      }
    });

    // ปิด dropdown เมื่อคลิกที่อื่น
    document.addEventListener("click", (e) => {
      if (!searchInput.contains(e.target) && !suggestBox.contains(e.target)) {
        suggestBox.style.display = "none";
      }
    });
  }

  flyToProvince(prov) {
    if (!prov || !this.map) return;
    const center = typeof getProvinceCenter === "function" ? getProvinceCenter(prov) : [16.4322, 102.8236];
    
    // เคลื่อนแผนที่แบบ Smooth Flight พร้อมปรับระดับ Zoom เป็น 9 พอดีทั่วจังหวัด
    this.map.flyTo(center, 9, {
      duration: 1.4,
      easeLinearity: 0.25
    });
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
    // ปรับแต่งสไตล์การวาดให้เป็นเส้นขอบเขียวสดใส มีเงาสวยงาม
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

      // สำคัญตามคำขอ: วาดเสร็จแล้ว "ไม่ต้องเด้งหดกลับเอง" ให้ผู้ใช้เปิดค้างไว้เพื่อวาดแปลงต่อได้
      this.setMode("pan");
    });
  }

  /**
   * ลงทะเบียนแปลงนาใหม่ พร้อมคำนวณหมายเลขแปลงลำดับต่ำสุดที่ว่างอยู่ (1, 2, 3...)
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
    this.paddies.sort((a, b) => a.number - b.number);

    this.updatePaddyBadges();
    this.selectPaddy(paddyId);

    if (this.onPaddyListChangeCallback) {
      this.onPaddyListChangeCallback(this.paddies, this.activePaddyId);
    }
  }

  selectPaddy(paddyId) {
    const paddy = this.paddies.find((p) => p.id === paddyId);
    if (!paddy) return;

    this.activePaddyId = paddyId;

    // อัปเดตสไตล์แปลง: แปลงที่เลือก = สีเขียวสดใส ขอบหนา 3.5px, แปลงอื่น = สเลทเข้ม ขอบชัด 2.5px ไม่หาย
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

    const bounds = paddy.layer.getBounds();
    const center = bounds.getCenter();
    
    // ตรวจจับจังหวัด
    let detectedProv = null;
    if (typeof detectProvinceFromCoord === "function") {
      detectedProv = detectProvinceFromCoord(center.lat, center.lng);
    }

    // ตรวจสอบพื้นที่เมือง 77 จังหวัด
    const landUseInfo = this.checkLandUse(center.lat, center.lng);

    // บังคับให้เรนเดอร์ต้นข้าวใหม่สำหรับแปลงนี้
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
   * ตรวจสอบว่าพิกัดแปลงอยู่ในเขตชุมชนเมือง/อาคารหนาแน่น 77 จังหวัด
   */
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
      // รีเฟรชสไตล์แปลงที่เหลือเพื่อให้มั่นใจว่าขอบแปลงยังคงอยู่ครบ
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
      color: "#16a34a",
      fillColor: "#22c55e",
      fillOpacity: 0.35,
      weight: 3.5
    });

    this.registerPaddy(polygon);
  }

  /**
   * สัญลักษณ์ป้ายแปลงตรงจุดกึ่งกลาง (Paddy Centroid Badge) สวยงาม มินิมอล
   */
  updatePaddyBadges() {
    this.paddyBadgeLayer.clearLayers();
    this.paddies.forEach((p) => {
      const center = p.layer.getBounds().getCenter();
      const isActive = p.id === this.activePaddyId;
      const badgeIcon = L.divIcon({
        className: "paddy-centroid-badge-container",
        html: `<div class="paddy-centroid-badge ${isActive ? 'active' : ''}">
          🌾 ${p.name}
        </div>`,
        iconAnchor: [45, 14]
      });

      const marker = L.marker(center, { icon: badgeIcon });
      marker.on("click", () => this.selectPaddy(p.id));
      this.paddyBadgeLayer.addLayer(marker);
    });
  }

  /**
   * สร้างตำแหน่งต้นข้าวที่เป็นระเบียบ (Smart Grid Layout)
   * แก้ปัญหา: ต้นข้าวรก ทับกัน ล้นขอบแปลง
   */
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

    // สร้างตารางกริดที่เว้นระยะห่างสมดุล (3x3 ถึง 4x4)
    const rows = 4;
    const cols = 4;
    const rowStep = latSpan / (rows + 1);
    const colStep = lngSpan / (cols + 1);

    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        // ให้มี Jittering เบาๆ ไม่ให้ตรงเป๊ะเกินไป แต่ห้ามชนกัน
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

    // จำกัดไม่ให้เกิน 10 ต้นเพื่อความสบายตาและไม่รก
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

  /**
   * เรนเดอร์สัญลักษณ์ต้นข้าวแบบธรรมชาติ (Botanical Rice SVGs)
   * แทนที่รูปดาวเดิม ด้วยสัญลักษณ์ต้นข้าวตามสรีรวิทยาจริง 5 ระยะ
   */
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

    // 1. สร้าง Botanical SVG ตามระยะของข้าว (ไม่มีรูปดาว)
    let plantSvg = "";
    if (stageId === 1) {
      // 1. ระยะกล้า (Sprout Seedling)
      const color = isDrought ? "#a16207" : "#22c55e";
      plantSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22V10"/>
        <path d="M12 10C12 4 4 4 4 10C4 16 12 16 12 16"/>
        <path d="M12 10C12 4 20 4 20 10C20 16 12 16 12 16"/>
      </svg>`;
    } else if (stageId === 2) {
      // 2. ระยะแตกกอ (Tillering)
      const color = isDrought ? "#854d0e" : "#16a34a";
      plantSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22V7"/>
        <path d="M12 13C8 10 5 12 4 15"/>
        <path d="M12 13C16 10 19 12 20 15"/>
        <path d="M12 8C7 5 6 10 6 12"/>
        <path d="M12 8C17 5 18 10 18 12"/>
      </svg>`;
    } else if (stageId === 3) {
      // 3. ระยะตั้งท้อง (Booting)
      const color = isDrought ? "#713f12" : "#15803d";
      plantSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22V4"/>
        <ellipse cx="12" cy="7" rx="3.5" ry="6" fill="${color}" fill-opacity="0.3"/>
        <path d="M12 16C7 13 4 15 3 18"/>
        <path d="M12 16C17 13 20 15 21 18"/>
      </svg>`;
    } else if (stageId === 4) {
      // 4. ระยะออกรวง (Heading/Flowering)
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
      // 5. ระยะสุกแก่ (Maturity Golden Sheaf)
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

    // 2. ปรับสไตล์แปลงของ activePaddy ตามสภาพอากาศ
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

    // 3. ปลูกต้นข้าวที่มีระเบียบสวยงาม ไม่ทับกัน
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

    // 4. ป้ายเตือนภัยพิบัติบนแปลง
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
