/**
 * จัดการแผนที่ Leaflet, แถบเครื่องมือควบคุมแผนที่สไตล์โมเดิร์น
 * และ Visual Engine แสดงการเจริญเติบโตของต้นข้าวในแปลงนา
 */
class MapManager {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.drawnItems = null;
    this.currentPolygonLayer = null;
    this.activeDrawHandler = null;
    this.onPolygonChangeCallback = null;

    // ระบบแสดงต้นข้าวในแปลง (Rice Plants Visual Engine)
    this.ricePlants = []; // รายการพิกัดต้นข้าวในแปลง
    this.riceLayerGroup = null;
    this.weatherEffectLayer = null;
    this.currentStageId = 1;
    this.currentWeatherState = "normal"; // normal, rain, flood, drought, heat

    this.tileLayers = {
      satellite: null,
      street: null
    };
    this.currentTileType = "satellite";
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

    // 2. สร้างแผนที่ (ปิด zoomControl เดิม เพื่อใช้ custom toolbar)
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

    // 4. ผูกการทำงานกับ Custom Toolbar บนหน้าเว็บ
    this.bindCustomToolbar();

    // 5. สร้างแปลงตัวอย่างเริ่มต้น
    this.createSamplePolygon(defaultCoords);
  }

  bindCustomToolbar() {
    const btnPoly = document.getElementById("toolDrawPoly");
    const btnRect = document.getElementById("toolDrawRect");
    const btnClear = document.getElementById("toolClear");
    const btnTile = document.getElementById("toolToggleTile");
    const btnZoomIn = document.getElementById("toolZoomIn");
    const btnZoomOut = document.getElementById("toolZoomOut");

    if (btnPoly) {
      btnPoly.addEventListener("click", () => this.startDrawMode("polygon", btnPoly));
    }
    if (btnRect) {
      btnRect.addEventListener("click", () => this.startDrawMode("rectangle", btnRect));
    }
    if (btnClear) {
      btnClear.addEventListener("click", () => this.clearPaddy());
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

  startDrawMode(type, btnElement) {
    if (this.activeDrawHandler) {
      this.activeDrawHandler.disable();
      this.activeDrawHandler = null;
    }

    // ล้างสถานะ active ของปุ่มอื่น
    document.querySelectorAll(".map-tool-btn").forEach((b) => b.classList.remove("active"));
    if (btnElement) btnElement.classList.add("active");

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
      this.drawnItems.clearLayers();
      const layer = e.layer;
      this.drawnItems.addLayer(layer);
      this.currentPolygonLayer = layer;

      if (btnElement) btnElement.classList.remove("active");
      this.activeDrawHandler = null;

      this.generateRicePlantPositions(layer);
      this.renderRiceVisuals(this.currentStageId, this.currentWeatherState);
      this.triggerPolygonChange(layer);
    });
  }

  clearPaddy() {
    this.drawnItems.clearLayers();
    this.riceLayerGroup.clearLayers();
    this.weatherEffectLayer.clearLayers();
    this.currentPolygonLayer = null;
    this.ricePlants = [];
    if (this.onPolygonChangeCallback) {
      this.onPolygonChangeCallback(null);
    }
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
      color: "#d4af37",
      fillColor: "#38a169",
      fillOpacity: 0.25,
      weight: 2
    });

    this.drawnItems.addLayer(polygon);
    this.currentPolygonLayer = polygon;
    this.map.fitBounds(polygon.getBounds(), { padding: [50, 50] });

    this.generateRicePlantPositions(polygon);
    this.renderRiceVisuals(1, "normal");

    setTimeout(() => {
      this.triggerPolygonChange(polygon);
    }, 200);
  }

  /**
   * สร้างพิกัดต้นข้าวสุ่มกระจายสม่ำเสมอภายในขอบเขต Polygon (Point-in-Polygon Sampling)
   */
  generateRicePlantPositions(polygonLayer) {
    this.ricePlants = [];
    if (!polygonLayer) return;

    const bounds = polygonLayer.getBounds();
    const minLat = bounds.getSouth();
    const maxLat = bounds.getNorth();
    const minLng = bounds.getWest();
    const maxLng = bounds.getEast();

    const targetCount = 35; // จำนวนต้นข้าวจำลองในแปลง
    let attempts = 0;

    while (this.ricePlants.length < targetCount && attempts < 300) {
      attempts++;
      const randLat = minLat + Math.random() * (maxLat - minLat);
      const randLng = minLng + Math.random() * (maxLng - minLng);
      const pt = L.latLng(randLat, randLng);

      // ตรวจสอบว่าจุดอยู่ภายในรูปหลายเหลี่ยมจริงหรือไม่ (Ray-casting)
      if (this.isPointInsidePolygon(pt, polygonLayer.getLatLngs()[0])) {
        this.ricePlants.push({
          lat: randLat,
          lng: randLng,
          swayOffset: Math.random() * 2 // จังหวะการไหวของรวงข้าว
        });
      }
    }
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
   * วาดและอัปเดตไอคอนต้นข้าวในแปลงตามระยะการเจริญเติบโต (1-5) และสภาพอากาศ
   */
  renderRiceVisuals(stageId, weatherState = "normal") {
    this.currentStageId = stageId;
    this.currentWeatherState = weatherState;
    this.riceLayerGroup.clearLayers();
    this.weatherEffectLayer.clearLayers();

    if (!this.ricePlants.length || !this.currentPolygonLayer) return;

    // กำหนดสีและรูปร่างของต้นข้าวตาม 5 ระยะ
    let iconSvg = "";
    let plantScale = 1;

    // ตรวจสอบสถานะภัยแล้ง/น้ำท่วม
    const isFlood = weatherState === "flood";
    const isDrought = weatherState === "drought";

    if (stageId === 1) {
      // 1. ระยะกล้า: ต้นกล้าจิ๋วสีเขียวอ่อน
      const color = isDrought ? "#a08150" : "#68d391";
      iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="${color}"><path d="M12 2C12 2 7 9 7 14C7 16.8 9.2 19 12 19C14.8 19 17 16.8 17 14C17 9 12 2 12 2Z"/></svg>`;
    } else if (stageId === 2) {
      // 2. ระยะแตกกอ: กอข้าวเขียวชอุ่มแตก 3 แฉก
      const color = isDrought ? "#967d48" : "#38a169";
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="${color}"><path d="M12 2L15 10L20 8L16 15L19 22L12 18L5 22L8 15L4 8L9 10L12 2Z"/></svg>`;
    } else if (stageId === 3) {
      // 3. ระยะตั้งท้อง: ข้าวเติบโตเต็มที่ กอแน่น
      const color = isDrought ? "#8c7240" : "#276749";
      iconSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="${color}"><path d="M12 2C8 6 6 12 6 22H18C18 12 16 6 12 2Z"/></svg>`;
    } else if (stageId === 4) {
      // 4. ระยะออกรวง: รวงข้าวเริ่มโค้งโน้มตัว สีเขียวอมทอง
      const color = isDrought ? "#a6884a" : "#ecc94b";
      iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="${color}"><path d="M14 2C10 5 8 10 9 22C12 20 16 14 17 8C17 4 15 2 14 2Z"/></svg>`;
    } else {
      // 5. ระยะสุกแก่: รวงข้าวสีทองอร่ามเต็มทุ่งนา
      const color = isDrought ? "#b58d3d" : "#ffd700";
      iconSvg = `<svg width="26" height="26" viewBox="0 0 24 24" fill="${color}"><path d="M12 2L14.5 8.5L21 9L16 13.5L17.5 20L12 16.5L6.5 20L8 13.5L3 9L9.5 8.5L12 2Z"/></svg>`;
    }

    // ปรับสีขอบแปลงนาตามสภาพอากาศ
    if (isFlood) {
      this.currentPolygonLayer.setStyle({
        fillColor: "#0077b6",
        fillOpacity: 0.55,
        color: "#00b4d8",
        weight: 3
      });
    } else if (isDrought) {
      this.currentPolygonLayer.setStyle({
        fillColor: "#7c5e3f",
        fillOpacity: 0.45,
        color: "#d97706",
        weight: 2
      });
    } else {
      this.currentPolygonLayer.setStyle({
        fillColor: stageId === 5 ? "#d4af37" : "#38a169",
        fillOpacity: stageId === 5 ? 0.35 : 0.25,
        color: stageId === 5 ? "#ffd700" : "#d4af37",
        weight: 2
      });
    }

    // วาดไอคอนต้นข้าวแต่ละต้นลงในแผนที่
    this.ricePlants.forEach((p) => {
      const riceIcon = L.divIcon({
        className: "rice-crop-icon",
        html: `<div style="transform: scale(${isFlood ? 0.7 : 1}); transition: transform 0.3s;">${iconSvg}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([p.lat, p.lng], { icon: riceIcon });
      this.riceLayerGroup.addLayer(marker);
    });

    // แสดงเอฟเฟกต์สภาพอากาศเหนือแปลงนา (เช่น ฝนตก)
    if (weatherState === "rain" || weatherState === "flood") {
      const bounds = this.currentPolygonLayer.getBounds();
      const center = bounds.getCenter();
      const rainBadge = L.marker(center, {
        icon: L.divIcon({
          className: "rain-badge-icon",
          html: `<div style="background:rgba(0,180,216,0.85); color:#fff; padding:4px 10px; border-radius:20px; font-size:11px; white-space:nowrap; box-shadow:0 2px 10px rgba(0,0,0,0.5);"><i class="fa-solid fa-cloud-showers-heavy"></i> ${isFlood ? 'น้ำท่วมขังสะสม!' : 'ฝนตกต่อเนื่อง'}</div>`,
          iconAnchor: [50, 20]
        })
      });
      this.weatherEffectLayer.addLayer(rainBadge);
    }
  }

  triggerPolygonChange(layer) {
    if (!layer || !this.onPolygonChangeCallback) return;
    const geojson = layer.toGeoJSON();
    this.onPolygonChangeCallback(geojson.geometry);
  }

  onPolygonChange(callback) {
    this.onPolygonChangeCallback = callback;
  }
}
