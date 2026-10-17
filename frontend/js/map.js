/**
 * จัดการแผนที่ Leaflet และระบบแปลงนาแบบโต้ตอบ (Interactive Map Manager)
 * ปรับปรุง:
 * 1. ค้นหา 77 จังหวัด: วาดเส้นตามรูปขอบเขตจริงของจังหวัด (GeoJSON) พร้อมป้ายชื่อใหญ่ตรงกลาง และเมื่อซูมใกล้ (Zoom >= 11) ชื่อจะเปลี่ยนเป็นอำเภอเมือง และเส้นขอบจะจางลง
 * 2. แก้ไขบั๊กวาดแปลงแรกแล้วเด้ง 2 แปลงซ้อนกัน (ผูก Event เดียวใน init)
 * 3. ปรับสีกรอบแปลงนาและตัวหนังสือให้คมชัด เด่นชัด ไม่กลืนกับแผนที่ดาวเทียม
 * 4. วางป้ายชื่อแปลงให้อยู่ชั้นบนสุดเสมอ (Top Z-Index) โดยต้นข้าวและสัญลักษณ์สภาพอากาศจะไม่ทับหรือบดบังชื่อแปลง
 * 5. แผนที่ดาวเทียมไฮบริด Esri + Labels พร้อมระบบ Fade-out เมื่อซูมใกล้
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
    this.hoverPaddyId = null;
    this.activeVisualStyle = null;

    // เลเยอร์การแสดงผล
    this.riceLayerGroup = null;
    this.weatherEffectLayer = null;
    this.paddyBadgeLayer = null;
    this.provinceHighlightLayer = null; // เลเยอร์ตีกรอบจังหวัดจากการค้นหา
    this.labelsLayer = null; // เลเยอร์ชื่อเมือง/ถนนบนดาวเทียม

    // ข้อมูลขอบเขตจริง 77 จังหวัด
    this.provincesGeoJSON = null;
    this.activeProvince = null;
    this.currentProvincePolygon = null;
    this.activeProvinceBadge = null;

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
    this.onHoverChangeCallback = null;
    this.onPaddyDeletedCallback = null;
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

    // Fade-out เลเยอร์ตัวหนังสือและเส้นขอบจังหวัดเมื่อซูมลึก
    this.map.on("zoomend", () => {
      const z = this.map.getZoom();
      if (this.labelsLayer) {
        if (z >= 15) {
          this.labelsLayer.setOpacity(0.15);
        } else if (z >= 13) {
          this.labelsLayer.setOpacity(0.45);
        } else {
          this.labelsLayer.setOpacity(0.85);
        }
      }

      // ปรับความโปร่งใสของเส้นขอบเขตจังหวัดและอำเภอตามระดับการซูม (Point 3, 4)
      if (this.currentProvincePolygon) {
        if (z >= 11) {
          this.currentProvincePolygon.setStyle({
            weight: 2.0,
            opacity: 0.40,
            fillOpacity: 0.04
          });
        } else {
          this.currentProvincePolygon.setStyle({
            weight: 3.5,
            opacity: 0.95,
            fillOpacity: 0.12
          });
        }
      }

      if (this.amphoeGeoJsonLayer) {
        if (z >= 10) {
          this.amphoeGeoJsonLayer.setStyle({ opacity: 0.45, weight: 1.2 });
        } else if (z >= 8) {
          this.amphoeGeoJsonLayer.setStyle({ opacity: 0.25, weight: 0.9 });
        } else {
          this.amphoeGeoJsonLayer.setStyle({ opacity: 0.10, weight: 0.6 });
        }
      }
    });

    // 4. เลเยอร์กลุ่มต่างๆ
    this.drawnItems = new L.FeatureGroup();
    this.map.addLayer(this.drawnItems);

    // เลเยอร์เส้นขอบเขตอำเภอทั่วไทย 928 อำเภอ (Point 4)
    this.amphoeLayer = L.layerGroup();
    this.map.addLayer(this.amphoeLayer);
    this.amphoeGeoJsonLayer = null;

    this.provinceHighlightLayer = L.layerGroup();
    this.map.addLayer(this.provinceHighlightLayer);

    this.riceLayerGroup = L.layerGroup();
    this.map.addLayer(this.riceLayerGroup);

    this.weatherEffectLayer = L.layerGroup();
    this.map.addLayer(this.weatherEffectLayer);

    this.paddyBadgeLayer = L.layerGroup();
    this.map.addLayer(this.paddyBadgeLayer);

    // 5. โหลดข้อมูลขอบเขตจริง 77 จังหวัด
    fetch("data/thailand_provinces.geojson")
      .then((res) => res.json())
      .then((geojson) => {
        this.provincesGeoJSON = geojson;
        console.log("[MapManager] โหลดขอบเขตจริง 77 จังหวัดเรียบร้อย");
      })
      .catch((err) => console.warn("[MapManager] โหลด GeoJSON 77 จังหวัดไม่สำเร็จ:", err));

    // โหลดข้อมูลขอบเขต 928 อำเภอทั่วไทย (Point 4)
    fetch("data/thailand_amphoes.geojson")
      .then((res) => res.json())
      .then((geojson) => {
        this.amphoesGeoJSON = geojson;
        // ทำ Bounding Box Pre-filter เพื่อให้ค้นหาตำแหน่งอำเภอได้ไวระดับเสี้ยววินาที
        if (geojson && geojson.features && window.turf) {
          geojson.features.forEach((f) => {
            try {
              f._bbox = turf.bbox(f);
            } catch (e) {}
          });
        }
        this.renderAmphoeBoundaries();
        console.log("[MapManager] โหลดขอบเขต 928 อำเภอเรียบร้อย");
      })
      .catch((err) => console.warn("[MapManager] โหลด GeoJSON อำเภอไม่สำเร็จ:", err));

    // 6. Point 2: ลงทะเบียน Event CREATED เพียงครั้งเดียว ป้องกันบั๊กสร้างแปลงซ้อนกัน
    this.map.on(L.Draw.Event.CREATED, (e) => {
      const layer = e.layer;
      this.registerPaddy(layer);
      this.setMode("pan");
    });

    // 7. ผูกเหตุการณ์ Toolbar และ Search Box
    this.bindCustomToolbar();
    this.bindDrawerHandle();
    this.bindProvinceSearch();

    // กด Esc เพื่อยกเลิกการวาด/โหมดลบ กลับสู่โหมดปกติ
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.currentMode !== "pan") this.setMode("pan");
    });

    if (this.onPaddyListChangeCallback) {
      this.onPaddyListChangeCallback([], null);
    }
  }

  /**
   * วาดเส้นขอบเขตอำเภอทั่วไทย 928 อำเภอ สีเขียวจาง ไม่รกสายตา (Point 4)
   */
  renderAmphoeBoundaries() {
    if (!this.amphoesGeoJSON || !this.amphoeLayer) return;
    this.amphoeLayer.clearLayers();

    this.amphoeGeoJsonLayer = L.geoJSON(this.amphoesGeoJSON, {
      style: {
        color: "#16a34a",
        weight: 1.0,
        opacity: 0.35,
        fillColor: "#22c55e",
        fillOpacity: 0.015,
        dashArray: "3, 3"
      },
      interactive: false
    });
    this.amphoeLayer.addLayer(this.amphoeGeoJsonLayer);
  }

  /**
   * ตรวจจับอำเภอจริงจากพิกัด [lat, lng] (Point 4)
   */
  findAmphoeFromCoord(lat, lng) {
    if (!this.amphoesGeoJSON || !this.amphoesGeoJSON.features) return null;
    const pt = [lng, lat]; // Turf [lon, lat]

    for (const f of this.amphoesGeoJSON.features) {
      if (f._bbox) {
        if (lng < f._bbox[0] || lat < f._bbox[1] || lng > f._bbox[2] || lat > f._bbox[3]) {
          continue;
        }
      }
      if (window.turf && typeof turf.booleanPointInPolygon === "function") {
        try {
          if (turf.booleanPointInPolygon(pt, f)) {
            return f.properties;
          }
        } catch (e) {}
      }
    }
    return null;
  }

  bindDrawerHandle() {
    const handle = document.getElementById("toolbarToggleHandle");
    const toolbar = document.getElementById("customMapToolbar");
    const chevron = document.getElementById("drawerChevron");

    if (handle && toolbar) {
      const syncChevron = () => {
        if (chevron) chevron.style.transform = toolbar.classList.contains("collapsed") ? "rotate(0)" : "rotate(180deg)";
      };
      handle.addEventListener("click", () => {
        toolbar.classList.toggle("collapsed");
        syncChevron();
      });
      syncChevron();
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
   * ระบบค้นหาจังหวัด 77 จังหวัด พร้อมกรอบเส้นขอบเขตจริงและป้ายชื่อขนาดใหญ่
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
        // ลบกรอบไฮไลต์ออกทันทีเมื่อลบข้อความในช่องค้นหา
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
   * ตีกรอบขอบเขตจริงของจังหวัด (ไม่ใช่กรอบสี่เหลี่ยม) ตามรูปทรงเรขาคณิต (Point 3)
   */
  highlightAndFlyToProvince(prov) {
    if (!prov || !this.map) return;
    this.provinceHighlightLayer.clearLayers();
    this.activeProvince = prov;

    const [minLon, minLat, maxLon, maxLat] = prov.b;
    const center = [(minLat + maxLat) / 2, (minLon + maxLon) / 2];

    // ค้นหารูปทรงเรขาคณิตจริงของจังหวัดจาก GeoJSON
    let foundFeature = null;
    if (this.provincesGeoJSON && this.provincesGeoJSON.features) {
      const targetName = prov.name_en.toLowerCase().replace(/[^a-z]/g, "");
      foundFeature = this.provincesGeoJSON.features.find((f) => {
        const fName = (f.properties.name || "").toLowerCase().replace(/[^a-z]/g, "");
        return fName === targetName;
      });
    }

    if (foundFeature) {
      // 1. วาดเส้นตามรูปขอบเขตจริงของจังหวัด
      this.currentProvincePolygon = L.geoJSON(foundFeature, {
        style: {
          color: "#16a34a",
          weight: 3.5,
          fillColor: "#22c55e",
          fillOpacity: 0.12,
          dashArray: null,
          interactive: false
        }
      });
      this.provinceHighlightLayer.addLayer(this.currentProvincePolygon);
    } else {
      // Fallback กรณีไม่มีรูปทรง
      const boundsCoords = [
        [minLat, minLon], [minLat, maxLon], [maxLat, maxLon], [maxLat, minLon]
      ];
      this.currentProvincePolygon = L.polygon(boundsCoords, {
        color: "#16a34a",
        weight: 3.5,
        fillColor: "#22c55e",
        fillOpacity: 0.12,
        interactive: false
      });
      this.provinceHighlightLayer.addLayer(this.currentProvincePolygon);
    }

    // Point 3: เอาหมุดชื่อออกเลย ไม่บังตัวหนังสือบนแผนที่ เหลือเพียงกรอบตามเขตจังหวัด
    this.activeProvinceBadge = null;

    // 3. บินไปยังพิกัดจังหวัดอย่างนุ่มนวล
    if (foundFeature) {
      this.map.fitBounds(this.currentProvincePolygon.getBounds(), {
        padding: [30, 30],
        maxZoom: 10,
        animate: true,
        duration: 1.4
      });
    } else {
      this.map.flyTo(center, 9, { duration: 1.4, easeLinearity: 0.25 });
    }
  }

  clearProvinceHighlight() {
    this.activeProvince = null;
    this.currentProvincePolygon = null;
    this.activeProvinceBadge = null;
    if (this.provinceHighlightLayer) {
      this.provinceHighlightLayer.clearLayers();
    }
  }

  setMode(mode, btnElement) {
    this.cleanupRectDrawer();
    this.cleanupPolygonDrawer();

    this.currentMode = mode;
    document.querySelectorAll(".map-tool-btn").forEach((b) => b.classList.remove("active"));
    const container = document.getElementById(this.containerId);

    this.updateDrawHint(mode);
    const mapEl = document.getElementById(this.containerId);
    if (mapEl) mapEl.classList.toggle("map-drawing-mode", mode === "polygon" || mode === "rectangle");
    if (this.paddies) {
      this.paddies.forEach((p) => p.layer && p.layer.closeTooltip && p.layer.closeTooltip());
    }

    if (mode === "pan") {
      const btnPan = document.getElementById("toolPan");
      if (btnPan) btnPan.classList.add("active");
      if (container) container.classList.remove("map-delete-mode");
    } else if (mode === "delete") {
      if (btnElement) btnElement.classList.add("active");
      if (container) container.classList.add("map-delete-mode");
    } else if (mode === "polygon") {
      if (btnElement) btnElement.classList.add("active");
      if (container) container.classList.remove("map-delete-mode");
      this.startDrawPolygon();
    } else if (mode === "rectangle") {
      if (btnElement) btnElement.classList.add("active");
      if (container) container.classList.remove("map-delete-mode");
      this.start2ClickRectangle();
    }
  }

  /** แถบคำแนะนำบนแผนที่ระหว่างวาด/ลบแปลง */
  updateDrawHint(mode) {
    const el = document.getElementById("mapDrawHint");
    if (!el) return;
    const hints = {
      polygon: `<i class="fa-solid fa-draw-polygon"></i> คลิกวางจุดมุมแปลงทีละจุด · <b>คลิกจุดแรก</b> หรือ <b>ดับเบิลคลิก</b> เพื่อจบ · <kbd>Esc</kbd> ยกเลิก`,
      rectangle: `<i class="fa-regular fa-square"></i> คลิกมุมแรก แล้วคลิก <b>มุมตรงข้าม</b> เพื่อสร้างแปลงสี่เหลี่ยม · <kbd>Esc</kbd> ยกเลิก`,
      delete: `<i class="fa-solid fa-eraser"></i> คลิกที่แปลงเพื่อลบ (กด "เลิกทำ" ได้) · <kbd>Esc</kbd> ออกจากโหมดลบ`
    };
    if (hints[mode]) {
      el.innerHTML = hints[mode];
      el.className = `map-draw-hint show${mode === "delete" ? " danger" : ""}`;
    } else {
      el.className = "map-draw-hint";
    }
  }

  /**
   * วาดแปลงสี่เหลี่ยมแบบ 2-Click: คลิกจุดมุมแรก -> ขยับเมาส์ดูตัวอย่าง -> คลิกจุดมุมตรงข้ามเพื่อเสร็จสิ้น (Point 2)
   */
  start2ClickRectangle() {
    this.cleanupRectDrawer();

    const shapeOptions = {
      color: "#22c55e",
      fillColor: "#16a34a",
      fillOpacity: 0.35,
      weight: 3.5,
      dashArray: "5, 5"
    };

    let corner1 = null;
    let previewRect = null;

    const onMapClick = (e) => {
      if (!corner1) {
        corner1 = e.latlng;
        previewRect = L.rectangle([corner1, corner1], shapeOptions).addTo(this.map);
      } else {
        const corner2 = e.latlng;
        cleanup();
        const finalRect = L.rectangle([corner1, corner2], {
          color: "#22c55e",
          fillColor: "#16a34a",
          fillOpacity: 0.35,
          weight: 4
        });
        this.registerPaddy(finalRect);
        this.setMode("pan");
      }
    };

    const onMouseMove = (e) => {
      if (corner1 && previewRect) {
        previewRect.setBounds([corner1, e.latlng]);
      }
    };

    const cleanup = () => {
      this.map.off("click", onMapClick);
      this.map.off("mousemove", onMouseMove);
      if (previewRect) {
        this.map.removeLayer(previewRect);
        previewRect = null;
      }
      this.rectDrawer = null;
    };

    this.map.on("click", onMapClick);
    this.map.on("mousemove", onMouseMove);

    this.rectDrawer = { cleanup };
  }

  cleanupRectDrawer() {
    if (this.rectDrawer && typeof this.rectDrawer.cleanup === "function") {
      this.rectDrawer.cleanup();
      this.rectDrawer = null;
    }
  }

  /**
   * วาดแปลงอิสระ (Polygon) พร้อมระบบคลิกบรรจบจุดเริ่มต้น หรือดับเบิลคลิกเพื่อเสร็จสิ้น (Point 2)
   */
  startDrawPolygon() {
    this.cleanupPolygonDrawer();

    const shapeOptions = {
      color: "#22c55e",
      fillColor: "#16a34a",
      fillOpacity: 0.3,
      weight: 3.5,
      dashArray: "5, 5"
    };

    this.activeDrawHandler = new L.Draw.Polygon(this.map, {
      shapeOptions,
      showArea: true,
      guidelineDistance: 15,
      icon: new L.DivIcon({
        className: "leaflet-drawing-vertex-icon",
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      })
    });

    this.activeDrawHandler.enable();

    // ดักจับคลิกเพื่อบรรจบจุดแรก (Snap to first vertex)
    const onMapClick = (e) => {
      if (!this.activeDrawHandler || !this.activeDrawHandler._poly) return;
      const latlngs = this.activeDrawHandler._poly.getLatLngs();
      if (!latlngs || latlngs.length < 3) return;

      const firstPt = latlngs[0];
      const p1 = this.map.latLngToContainerPoint(firstPt);
      const p2 = this.map.latLngToContainerPoint(e.latlng);

      if (p1.distanceTo(p2) <= 35) {
        L.DomEvent.stopPropagation(e);
        this.activeDrawHandler.completeShape();
      }
    };

    const onDblClick = (e) => {
      if (!this.activeDrawHandler || !this.activeDrawHandler._poly) return;
      const latlngs = this.activeDrawHandler._poly.getLatLngs();
      if (latlngs && latlngs.length >= 3) {
        L.DomEvent.stopPropagation(e);
        this.activeDrawHandler.completeShape();
      }
    };

    this.map.on("click", onMapClick);
    this.map.on("dblclick", onDblClick);

    this.polygonExtraCleanup = () => {
      this.map.off("click", onMapClick);
      this.map.off("dblclick", onDblClick);
    };
  }

  cleanupPolygonDrawer() {
    if (this.polygonExtraCleanup) {
      this.polygonExtraCleanup();
      this.polygonExtraCleanup = null;
    }
    if (this.activeDrawHandler) {
      this.activeDrawHandler.disable();
      this.activeDrawHandler = null;
    }
  }

  /**
   * ลงทะเบียนแปลงนาใหม่ พร้อมคำนวณพื้นที่และที่ตั้งจังหวัดทันที
   */
  registerPaddy(layer) {
    this.cleanupRectDrawer();
    this.cleanupPolygonDrawer();

    this.drawnItems.addLayer(layer);

    const usedNumbers = this.paddies.map((p) => p.number);
    let nextNum = 1;
    while (usedNumbers.includes(nextNum)) {
      nextNum++;
    }

    const paddyId = String(Date.now() + Math.floor(Math.random() * 1000));
    const plants = this.generateRicePlantPositions(layer);

    // อ่านพันธุ์ข้าวปัจจุบันที่เลือกไว้บนแผงซ้าย (ใช้เป็นพันธุ์ของแปลงใหม่)
    const varietySelect = document.getElementById("riceVariety");
    const currentVariety = getVarietySpec(varietySelect ? varietySelect.value : "kdml105").key;

    const geom = layer.toGeoJSON().geometry;
    const areaRes = window.AreaCalculator ? AreaCalculator.calculateArea(geom) : null;
    const center = layer.getBounds().getCenter();

    // ตรวจสอบอำเภอและจังหวัดจริงจาก GeoJSON ขอบเขต 928 อำเภอทั่วไทย
    const amphoeProp = this.findAmphoeFromCoord(center.lat, center.lng);
    let detectedProv = null;
    let locationStr = "ไม่ทราบตำแหน่ง (นอกขอบเขตไทย?)";

    if (amphoeProp) {
      const pName = amphoeProp.pro_th.startsWith("จ.") ? amphoeProp.pro_th : `จ.${amphoeProp.pro_th}`;
      const aName = amphoeProp.amp_th.startsWith("อ.") ? amphoeProp.amp_th : `อ.${amphoeProp.amp_th}`;
      locationStr = `${pName} ${aName}`;
      if (typeof THAI_PROVINCES !== "undefined") {
        detectedProv = THAI_PROVINCES.find((p) => p.name_th === amphoeProp.pro_th || amphoeProp.pro_th.includes(p.name_th)) || null;
      }
    } else if (typeof detectProvinceFromCoord === "function") {
      detectedProv = detectProvinceFromCoord(center.lat, center.lng);
      if (detectedProv) locationStr = `จ.${detectedProv.name_th}`;
    }

    const paddyObj = {
      id: paddyId,
      number: nextNum,
      name: `แปลงที่ ${nextNum}`,
      variety: currentVariety,
      params: buildPaddyParams(currentVariety),
      layer: layer,
      geometry: geom,
      areaResult: areaRes,
      locationStr: locationStr,
      amphoeProp: amphoeProp,
      detectedProv: detectedProv,
      soil: null,
      ricePlants: plants
    };

    this.attachPaddyLayerEvents(paddyObj);

    this.paddies.push(paddyObj);
    this.paddies.sort((a, b) => a.number - b.number);

    this.updatePaddyBadges();
    this.selectPaddy(paddyId, { source: "draw" });
  }

  /** ผูกเหตุการณ์คลิก/โฮเวอร์ของรูปแปลงบนแผนที่ */
  attachPaddyLayerEvents(paddy) {
    const layer = paddy.layer;
    layer.off("click mouseover mouseout");

    layer.on("click", (e) => {
      // ระหว่างวาดแปลงใหม่ ให้คลิกทะลุไปยังตัววาด ไม่เลือกแปลงเดิม
      if (this.isDrawingMode()) return;
      L.DomEvent.stopPropagation(e);
      if (this.currentMode === "delete") {
        this.deletePaddy(paddy.id);
      } else {
        this.selectPaddy(paddy.id, { source: "map" });
      }
    });
    layer.on("mouseover", () => {
      if (!this.isDrawingMode()) this.setHoverPaddy(paddy.id, "map");
    });
    layer.on("mouseout", () => this.setHoverPaddy(null, "map"));

    layer.bindTooltip(() => this.getPaddyTooltipHtml(paddy), {
      sticky: true,
      direction: "top",
      offset: [0, -12],
      className: "paddy-hover-tooltip",
      opacity: 1
    });
  }

  getPaddyTooltipHtml(paddy) {
    const spec = getVarietySpec(paddy.variety);
    const area = paddy.areaResult ? paddy.areaResult.formattedThai : "-";
    const hint = this.currentMode === "delete"
      ? `<div class="pht-hint danger"><i class="fa-solid fa-eraser"></i> คลิกเพื่อลบแปลงนี้</div>`
      : (String(paddy.id) === String(this.activePaddyId)
        ? `<div class="pht-hint">กำลังเลือกแปลงนี้อยู่</div>`
        : `<div class="pht-hint">คลิกเพื่อเลือกและดูรายละเอียดทางขวา</div>`);
    return `<div class="pht-title">🌾 ${paddy.name}</div>
      <div class="pht-row">${spec.name} · ${getPaddyDuration(paddy)} วัน</div>
      <div class="pht-row">${area}</div>
      ${hint}`;
  }

  isDrawingMode() {
    return this.currentMode === "polygon" || this.currentMode === "rectangle";
  }

  /**
   * เลือกแปลงนา
   * @param {string} paddyId
   * @param {{source?: "map"|"panel"|"draw"|"delete"|"restore", fly?: boolean}} opts
   *   fly = เลื่อน/ซูมแผนที่ไปกึ่งกลางแปลง (ใช้เมื่อเลือกจากแผงขวา)
   */
  selectPaddy(paddyId, opts = {}) {
    const paddy = this.paddies.find((p) => String(p.id) === String(paddyId));
    if (!paddy) return;
    const source = opts.source || "map";

    this.activePaddyId = paddy.id;
    this.lastRenderedPaddyId = null;
    this.applyAllPaddyStyles();

    // ซิงก์พันธุ์ข้าวของแปลงนี้เข้ากับตัวเลือกบนแผงซ้าย
    const varietySelect = document.getElementById("riceVariety");
    if (varietySelect && paddy.variety) varietySelect.value = paddy.variety;

    if (opts.fly) this.flyToPaddy(paddy);
    this.pulsePaddy(paddy);

    const center = paddy.layer.getBounds().getCenter();
    let detectedProv = paddy.detectedProv;
    if (!paddy.amphoeProp) {
      const amphoeProp = this.findAmphoeFromCoord(center.lat, center.lng);
      if (amphoeProp) {
        paddy.amphoeProp = amphoeProp;
        const pName = amphoeProp.pro_th.startsWith("จ.") ? amphoeProp.pro_th : `จ.${amphoeProp.pro_th}`;
        const aName = amphoeProp.amp_th.startsWith("อ.") ? amphoeProp.amp_th : `อ.${amphoeProp.amp_th}`;
        paddy.locationStr = `${pName} ${aName}`;
        if (typeof THAI_PROVINCES !== "undefined" && !detectedProv) {
          detectedProv = THAI_PROVINCES.find((p) => p.name_th === amphoeProp.pro_th || amphoeProp.pro_th.includes(p.name_th)) || null;
          paddy.detectedProv = detectedProv;
        }
      }
    }
    if (!detectedProv && typeof detectProvinceFromCoord === "function") {
      detectedProv = detectProvinceFromCoord(center.lat, center.lng);
      paddy.detectedProv = detectedProv;
    }

    const landUseInfo = this.checkLandUse(center.lat, center.lng);

    this.renderRiceVisuals(this.currentStageId, this.currentWeatherState);
    this.updatePaddyBadges();

    if (this.onPolygonChangeCallback) {
      this.onPolygonChangeCallback(paddy.geometry, detectedProv, paddy, landUseInfo, source);
    }
    if (this.onPaddyListChangeCallback) {
      this.onPaddyListChangeCallback(this.paddies, this.activePaddyId, source);
    }
  }

  /** เลื่อนแผนที่ไปยังจุดกึ่งกลางแปลง และซูมให้เห็นทั้งแปลงพอดี */
  flyToPaddy(paddy) {
    if (!this.map || !paddy) return;
    const bounds = paddy.layer.getBounds();
    const center = bounds.getCenter();
    const fitZoom = this.map.getBoundsZoom(bounds, false, L.point(120, 120));
    const targetZoom = Math.max(6, Math.min(fitZoom, 17));
    this.map.flyTo(center, targetZoom, { duration: 0.8, easeLinearity: 0.3 });
  }

  /** เอฟเฟกต์กะพริบเส้นขอบแปลงเพื่อบอกตำแหน่ง */
  pulsePaddy(paddy) {
    const el = paddy && paddy.layer && paddy.layer.getElement ? paddy.layer.getElement() : null;
    if (!el) return;
    el.classList.remove("paddy-pulse");
    void el.getBoundingClientRect();
    el.classList.add("paddy-pulse");
    clearTimeout(paddy._pulseTimer);
    paddy._pulseTimer = setTimeout(() => el.classList.remove("paddy-pulse"), 1400);
  }

  /** ไฮไลต์แปลงเมื่อเอาเมาส์ชี้ (ทั้งจากแผนที่และจากการ์ดฝั่งขวา) */
  setHoverPaddy(paddyId, source = "map") {
    const next = paddyId === null || paddyId === undefined ? null : String(paddyId);
    if (this.hoverPaddyId === next) return;
    this.hoverPaddyId = next;
    this.applyAllPaddyStyles();
    this.paddyBadgeLayer.eachLayer((m) => {
      const el = m.getElement && m.getElement();
      if (el) el.classList.toggle("is-hover", next !== null && m.options.paddyId === next);
    });
    if (this.onHoverChangeCallback) this.onHoverChangeCallback(next, source);
  }

  /** สไตล์แปลง: แปลงที่เลือก = เขียวทึบ (หรือสีตามสภาพอากาศ), แปลงอื่น = ส้มเส้นประ, โฮเวอร์ = ขอบขาวหนา */
  getPaddyStyle(paddy) {
    const isActive = String(paddy.id) === String(this.activePaddyId);
    const isHover = this.hoverPaddyId !== null && String(paddy.id) === this.hoverPaddyId;
    let style;
    if (isActive) {
      style = { color: "#22c55e", weight: 4.5, fillOpacity: 0.35, fillColor: "#16a34a", dashArray: null };
      if (this.activeVisualStyle) style = { ...style, ...this.activeVisualStyle };
    } else {
      style = { color: "#f59e0b", weight: 2.5, fillOpacity: 0.22, fillColor: "#d97706", dashArray: "4, 4" };
    }
    if (isHover) {
      style = { ...style, color: "#ffffff", weight: isActive ? 5.5 : 4, fillOpacity: Math.min(0.55, style.fillOpacity + 0.15), dashArray: null };
    }
    return style;
  }

  applyAllPaddyStyles() {
    this.paddies.forEach((p) => p.layer.setStyle(this.getPaddyStyle(p)));
  }

  updateActivePaddyVariety(newVariety) {
    const activePaddy = this.paddies.find((p) => String(p.id) === String(this.activePaddyId));
    if (!activePaddy) return;
    this.setPaddyVariety(activePaddy.id, newVariety);
  }

  /** เปลี่ยนพันธุ์ข้าวของแปลง (รีเซ็ตตัวแปรชีวภาพเป็นค่ามาตรฐานของพันธุ์ใหม่) */
  setPaddyVariety(paddyId, newVariety) {
    const paddy = this.paddies.find((p) => String(p.id) === String(paddyId));
    if (!paddy) return null;
    const fertility = (paddy.params && paddy.params.fertilityFactor) || DEFAULT_FERTILITY;
    paddy.variety = getVarietySpec(newVariety).key;
    paddy.params = buildPaddyParams(paddy.variety, fertility);
    this.updatePaddyBadges();
    if (this.onPaddyListChangeCallback) {
      this.onPaddyListChangeCallback(this.paddies, this.activePaddyId, "variety");
    }
    return paddy;
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

  /**
   * ลบแปลง และคืนข้อมูลแปลงที่ถูกลบ (ใช้สำหรับปุ่ม "เลิกทำ")
   */
  deletePaddy(paddyId) {
    const idx = this.paddies.findIndex((p) => String(p.id) === String(paddyId));
    if (idx === -1) return null;

    const paddy = this.paddies[idx];
    const wasActive = String(this.activePaddyId) === String(paddyId);
    paddy.layer.closeTooltip && paddy.layer.closeTooltip();
    this.drawnItems.removeLayer(paddy.layer);
    if (this.map.hasLayer(paddy.layer)) this.map.removeLayer(paddy.layer);
    this.paddies.splice(idx, 1);
    if (this.hoverPaddyId === String(paddyId)) this.setHoverPaddy(null, "delete");

    if (wasActive) {
      this.riceLayerGroup.clearLayers();
      this.weatherEffectLayer.clearLayers();
      this.lastRenderedPaddyId = null;

      if (this.paddies.length > 0) {
        const next = this.paddies[Math.min(idx, this.paddies.length - 1)];
        this.selectPaddy(next.id, { source: "delete" });
      } else {
        this.activePaddyId = null;
        if (this.onPolygonChangeCallback) this.onPolygonChangeCallback(null, null, null, null, "delete");
        if (this.onPaddyListChangeCallback) this.onPaddyListChangeCallback(this.paddies, null, "delete");
      }
    } else {
      // ลบแปลงที่ไม่ได้เลือก: ไม่ต้องเลื่อนแผนที่หรือเปลี่ยนแปลงที่เลือกอยู่
      if (this.onPaddyListChangeCallback) this.onPaddyListChangeCallback(this.paddies, this.activePaddyId, "delete");
    }

    this.updatePaddyBadges();
    if (this.currentMode === "delete" && this.paddies.length === 0) this.setMode("pan");
    if (this.onPaddyDeletedCallback) this.onPaddyDeletedCallback([paddy]);
    return paddy;
  }

  /** นำแปลงที่ถูกลบกลับมา (ปุ่มเลิกทำ) */
  restorePaddies(paddies) {
    if (!paddies || paddies.length === 0) return;
    let lastId = null;
    paddies.forEach((paddy) => {
      if (this.paddies.some((p) => p.number === paddy.number)) {
        // หมายเลขเดิมถูกใช้ไปแล้ว: ให้หมายเลขใหม่
        let n = 1;
        while (this.paddies.some((p) => p.number === n)) n++;
        paddy.number = n;
        paddy.name = `แปลงที่ ${n}`;
      }
      this.drawnItems.addLayer(paddy.layer);
      this.attachPaddyLayerEvents(paddy);
      this.paddies.push(paddy);
      lastId = paddy.id;
    });
    this.paddies.sort((a, b) => a.number - b.number);
    this.updatePaddyBadges();
    this.selectPaddy(lastId, { source: "restore", fly: true });
  }

  clearAllPaddies() {
    this.cleanupRectDrawer();
    this.cleanupPolygonDrawer();
    if (this.paddies.length === 0) return [];

    const removed = this.paddies.slice();
    removed.forEach((p) => {
      if (p.layer) {
        p.layer.closeTooltip && p.layer.closeTooltip();
        this.drawnItems.removeLayer(p.layer);
        if (this.map.hasLayer(p.layer)) this.map.removeLayer(p.layer);
      }
    });

    this.riceLayerGroup.clearLayers();
    this.weatherEffectLayer.clearLayers();
    this.paddyBadgeLayer.clearLayers();
    this.paddies = [];
    this.activePaddyId = null;
    this.hoverPaddyId = null;
    this.lastRenderedPaddyId = null;

    if (this.onPolygonChangeCallback) this.onPolygonChangeCallback(null, null, null, null, "delete");
    if (this.onPaddyListChangeCallback) this.onPaddyListChangeCallback(this.paddies, null, "delete");
    this.setMode("pan");
    if (this.onPaddyDeletedCallback) this.onPaddyDeletedCallback(removed);
    return removed;
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
   * ป้ายชื่อแปลงตรงจุดกึ่งกลาง (จัดกึ่งกลางด้วย CSS ไม่ว่าชื่อจะยาวเท่าไร)
   */
  updatePaddyBadges() {
    this.paddyBadgeLayer.clearLayers();

    this.paddies.forEach((p) => {
      const center = p.layer.getBounds().getCenter();
      const isActive = String(p.id) === String(this.activePaddyId);
      const isHover = this.hoverPaddyId !== null && String(p.id) === this.hoverPaddyId;
      const spec = getVarietySpec(p.variety);

      const badgeIcon = L.divIcon({
        className: `paddy-centroid-badge-container${isHover ? " is-hover" : ""}`,
        html: `<div class="paddy-centroid-badge ${isActive ? "active" : ""}">
          🌾 ${p.name} <span class="paddy-badge-variety">(${spec.short})</span>
        </div>`,
        iconSize: null
      });

      const marker = L.marker(center, { icon: badgeIcon, zIndexOffset: 1300, paddyId: String(p.id), keyboard: false });
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        if (this.isDrawingMode()) return;
        if (this.currentMode === "delete") {
          this.deletePaddy(p.id);
        } else {
          this.selectPaddy(p.id, { source: "map" });
        }
      });
      marker.on("mouseover", () => this.setHoverPaddy(p.id, "map"));
      marker.on("mouseout", () => this.setHoverPaddy(null, "map"));
      this.paddyBadgeLayer.addLayer(marker);
    });
  }

  /**
   * สุ่มตำแหน่งต้นข้าว โดยเว้นระยะปลอดภัยรอบจุดกึ่งกลาง ไม่ให้เกิดทับหรืออยู่ใกล้ป้ายชื่อแปลง (Point 3, 7)
   */
  generateRicePlantPositions(polygonLayer) {
    const plants = [];
    if (!polygonLayer) return plants;

    const bounds = polygonLayer.getBounds();
    const center = bounds.getCenter();
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

        // เว้นพื้นที่ปลอดภัยรอบจุดกึ่งกลางแปลง ไม่ให้ต้นข้าวไปเกิดทับหรืออยู่ใต้ป้ายชื่อแปลง (Point 3, 7)
        const dLat = Math.abs(pLat - center.lat) / (latSpan || 0.001);
        const dLng = Math.abs(pLng - center.lng) / (lngSpan || 0.001);
        if (dLat < 0.32 && dLng < 0.42) {
          continue;
        }

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

  isPointInsidePolygonWithBuffer(point, vs, buffer = 0.0001) {
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i].lng, yi = vs[i].lat;
      const xj = vs[j].lng, yj = vs[j].lat;
      const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
        (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  renderRiceVisuals(stageId, weatherState) {
    this.currentStageId = stageId;
    this.currentWeatherState = weatherState;

    if (this.paddies.length === 0 || !this.activePaddyId) {
      this.riceLayerGroup.clearLayers();
      this.weatherEffectLayer.clearLayers();
      return;
    }

    const activePaddy = this.paddies.find((p) => String(p.id) === String(this.activePaddyId));
    if (!activePaddy) return;

    if (this.lastRenderedStage === stageId && 
        this.lastRenderedWeather === weatherState && 
        String(this.lastRenderedPaddyId) === String(this.activePaddyId)) {
      return;
    }

    this.lastRenderedStage = stageId;
    this.lastRenderedWeather = weatherState;
    this.lastRenderedPaddyId = this.activePaddyId;

    let plantSvg = "";
    // stageId 6 = แปลงนี้ครบอายุเก็บเกี่ยวแล้ว (สภาพอากาศหลังจากนี้ไม่มีผลกับแปลง)
    const isHarvested = (stageId === 6);
    const isFlood = !isHarvested && (weatherState === "flood");
    const isDrought = !isHarvested && (weatherState === "drought");

    if (stageId === 1) {
      const color = isDrought ? "#a16207" : "#22c55e";
      plantSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22v-9"/>
        <path d="M9 13c0-3.5 3-5 3-5s3 1.5 3 5"/>
      </svg>`;
    } else if (stageId === 2) {
      const color = isDrought ? "#a16207" : "#16a34a";
      plantSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22V10"/>
        <path d="M8 14C5 12 4 9 4 6c3 0 6 2 7 5"/>
        <path d="M16 14c3-2 4-5 4-8-3 0-6 2-7 5"/>
      </svg>`;
    } else if (stageId === 3) {
      const color = isDrought ? "#a16207" : "#15803d";
      plantSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22V8"/>
        <path d="M12 8C10 5 8 4 6 5c0 3 2 5 6 6"/>
        <path d="M12 8c2-3 4-4 6-3 0 3-2 5-6 6"/>
        <path d="M12 12C9 10 7 11 5 14"/>
        <path d="M12 12c3-2 5-1 7 2"/>
      </svg>`;
    } else if (stageId === 4) {
      const color = isDrought ? "#a16207" : "#eab308";
      plantSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22V8"/>
        <path d="M12 8c-2-4-5-5-7-4 1 3 3 5 7 6"/>
        <circle cx="8" cy="6" r="1.5" fill="${color}"/>
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

    if (isFlood) {
      this.activeVisualStyle = { fillColor: "#0284c7", fillOpacity: 0.5, color: "#0284c7", weight: 4.5 };
    } else if (isDrought) {
      this.activeVisualStyle = { fillColor: "#ea580c", fillOpacity: 0.4, color: "#c2410c", weight: 4.5 };
    } else if (stageId >= 5) {
      this.activeVisualStyle = { fillColor: "#fef08a", fillOpacity: isHarvested ? 0.5 : 0.35, color: "#d97706", weight: 4.5 };
    } else {
      this.activeVisualStyle = null;
    }
    if (activePaddy.layer) activePaddy.layer.setStyle(this.getPaddyStyle(activePaddy));

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
      const marker = L.marker([p.lat, p.lng], { icon: riceIcon, interactive: false, zIndexOffset: 800 });
      this.riceLayerGroup.addLayer(marker);
    });

    this.weatherEffectLayer.clearLayers();
    if (!isHarvested && (weatherState === "rain" || weatherState === "flood")) {
      const bounds = activePaddy.layer.getBounds();
      const center = bounds.getCenter();
      const topLat = bounds.getNorth();
      // วางป้ายมรสุมเหนือแปลงนา ไม่ให้ทับป้ายชื่อแปลงตรงกลาง (Point 3)
      const rainBadge = L.marker([topLat, center.lng], {
        icon: L.divIcon({
          className: "rain-badge-icon",
          html: `<div style="background:#0284c7; color:#fff; padding:3px 9px; border-radius:6px; font-size:10.5px; white-space:nowrap; box-shadow:var(--shadow-md); font-weight:600; border:1px solid #ffffff;">
            <i class="fa-solid fa-cloud-showers-heavy"></i> ${isFlood ? 'น้ำท่วมขัง!' : 'ฝนตกต่อเนื่อง'}
          </div>`,
          iconAnchor: [45, 28]
        }),
        interactive: false,
        zIndexOffset: 900
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
