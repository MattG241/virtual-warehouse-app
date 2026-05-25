const storageKey = "virtualWarehouse:v5";
const DATA = window.WAREHOUSE_DATA || {
  generatedAt: "",
  aisleBays: {},
  levels: 7,
  slots: 7,
  skus: {},
  grid: {},
  other: []
};
const LEVEL_COUNT = DATA.levels || 7;
const SLOT_COUNT = DATA.slots || 7;
const DEFAULT_SLOT_COUNT = SLOT_COUNT;
// A box at or below this unit count counts as "Low" (needs replenishing soon).
const LOW_UNITS = 5;

const $ = (id) => document.getElementById(id);

let state = loadState();
let selectedAisleId = state.aisles[0]?.id;
let selectedBayId = state.aisles[0]?.bays[0]?.id;
let selectedLaneId = state.aisles[0]?.bays[0]?.lanes[0]?.id;
let selectedSlotCode = firstSlot()?.code || "";
let activeView = "walkthrough";
let warehouseMode = "overview";
let bayIndex = 0;
let emptyFocus = false;

const els = {
  pageTitle: $("pageTitle"),
  globalSearch: $("globalSearch"),
  resetDataButton: $("resetDataButton"),
  walkthroughView: $("walkthroughView"),
  layoutView: $("layoutView"),
  dashboardView: $("dashboardView"),
  navButtons: document.querySelectorAll(".nav-button"),
  warehouseModeButtons: document.querySelectorAll("[data-warehouse-mode]"),
  emptyHighlightButton: $("emptyHighlightButton"),
  aisleSelector: $("aisleSelector"),
  prevBayButton: $("prevBayButton"),
  nextBayButton: $("nextBayButton"),
  currentBayLabel: $("currentBayLabel"),
  warehouse3d: $("warehouse3d"),
  selectedSlotTitle: $("selectedSlotTitle"),
  selectedSlotStatus: $("selectedSlotStatus"),
  slotDetail: $("slotDetail"),
  warehouseMap: $("warehouseMap"),
  layoutCanvas: $("layoutCanvas"),
  structureEditor: $("structureEditor"),
  addAisleButton: $("addAisleButton"),
  addBayButton: $("addBayButton"),
  addLaneButton: $("addLaneButton"),
  addSlotButton: $("addSlotButton"),
  removeSelectedButton: $("removeSelectedButton"),
  metricAisles: $("metricAisles"),
  metricBays: $("metricBays"),
  metricSlots: $("metricSlots"),
  metricUnits: $("metricUnits"),
  metricEmpty: $("metricEmpty"),
  metricLow: $("metricLow"),
  metricStocked: $("metricStocked"),
  aisleFilter: $("aisleFilter"),
  statusFilter: $("statusFilter"),
  inventoryTable: $("inventoryTable"),
  alertList: $("alertList"),
  emptyBoxList: $("emptyBoxList"),
  otherLocList: $("otherLocList"),
  stockForm: $("stockForm"),
  skuSelect: $("skuSelect"),
  adjustmentInput: $("adjustmentInput"),
  noteInput: $("noteInput"),
  activityLog: $("activityLog")
};

// --- Build the warehouse from the live inventory data --------------------

function makeSlot(slotNumber, parentCode) {
  const code = parentCode ? `${parentCode}.S${slotNumber}` : "";
  const entries = (code && DATA.grid[code]) || [];
  const skus = entries.map(([item, qty, type]) => {
    const meta = DATA.skus[item] || ["", "", ""];
    return {
      sku: item,
      name: meta[0] || item,
      color: meta[1] || "",
      size: meta[2] || "",
      qty: Number(qty) || 0,
      type: type || "Pick"
    };
  });
  return { id: `S${slotNumber}`, type: "Box", column: slotNumber, width: 1, depth: 1, skus };
}

function makeLane(laneNumber, parentCode) {
  const laneId = codePart("L", laneNumber, 2);
  const code = parentCode ? `${parentCode}.${laneId}` : "";
  return {
    id: laneId,
    slots: Array.from({ length: SLOT_COUNT }, (_, index) => makeSlot(index + 1, code))
  };
}

function makeBay(bayNumber, parentCode) {
  const bayId = codePart("B", bayNumber);
  const code = parentCode ? `${parentCode}.${bayId}` : "";
  return {
    id: bayId,
    side: bayNumber % 2 === 1 ? "left" : "right",
    lanes: Array.from({ length: LEVEL_COUNT }, (_, index) => makeLane(index + 1, code))
  };
}

function buildStateFromData() {
  const aisleNumbers = Object.keys(DATA.aisleBays || {})
    .map(Number)
    .sort((a, b) => a - b);

  const aisles = aisleNumbers.map((number, index) => {
    const aisleId = codePart("A", number);
    const bayCount = DATA.aisleBays[number] || 0;
    return {
      id: aisleId,
      name: "",
      zone: "Pick racking",
      x: 4 + (index % 5) * 18,
      y: 8 + Math.floor(index / 5) * 42,
      bays: Array.from({ length: bayCount }, (_, bay) => makeBay(bay + 1, aisleId))
    };
  });

  return {
    dataVersion: DATA.generatedAt || "",
    aisles,
    activity: [
      {
        text: "Live inventory loaded",
        detail: `${aisleNumbers.length} aisles, ${formatNumber(Object.keys(DATA.grid).length)} stocked boxes from ${formatNumber(DATA.rowCount || 0)} stock lines`,
        at: new Date().toLocaleString()
      }
    ]
  };
}

function loadState() {
  // Server-stored layout is the source of truth across all users. localStorage
  // is only used as an in-session backup if the server has nothing yet.
  const remote = window.WAREHOUSE_DATA && window.WAREHOUSE_DATA.layout;
  if (remote && Array.isArray(remote.aisles) && remote.aisles.length > 0) {
    return remote;
  }
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.aisles) return parsed;
    }
  } catch (error) {
    console.warn("Could not load cached warehouse state", error);
  }
  return buildStateFromData();
}

let _layoutSaveTimer = null;
function saveState() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch (error) {
    console.warn("Could not cache warehouse state", error);
  }
  if (_layoutSaveTimer) clearTimeout(_layoutSaveTimer);
  // Skip the server save attempt if we know the user is signed out — the
  // 401 round-trip just adds noise. The change still sits in localStorage
  // so they don't lose it if they sign in next.
  if (document.body.classList.contains('is-signed-out')) {
    return;
  }
  _layoutSaveTimer = setTimeout(() => {
    fetch('./api/layout', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': window.__clientId || '',
      },
      body: JSON.stringify({ aisles: state.aisles, dataVersion: state.dataVersion || '' }),
    })
      .then((r) => {
        if (r.status === 401) {
          console.warn("Layout save rejected — sign in to persist edits.");
          document.body.classList.add('is-signed-out');
          document.body.classList.remove('is-signed-in');
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      })
      .catch((err) => console.warn("Could not save layout to server", err.message));
  }, 1000);
}

// --- Small helpers -------------------------------------------------------

function codePart(prefix, number, size = 2) {
  return `${prefix}${String(number).padStart(size, "0")}`;
}

function codeNumber(code) {
  return Number(String(code).replace(/\D/g, "")) || 0;
}

function locationCode(aisle, bay, lane, slot) {
  return `${aisle.id}.${bay.id}.${lane.id}.${slot.id}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-AU").format(value || 0);
}

function allSlots() {
  return state.aisles.flatMap((aisle) =>
    aisle.bays.flatMap((bay) =>
      bay.lanes.flatMap((lane) =>
        lane.slots.map((slot) => ({
          ...slot,
          code: locationCode(aisle, bay, lane, slot),
          aisleId: aisle.id,
          aisleName: aisle.name,
          zone: aisle.zone,
          bayId: bay.id,
          baySide: bay.side || (codeNumber(bay.id) % 2 === 1 ? "left" : "right"),
          laneId: lane.id,
          slotId: slot.id,
          slotType: slot.type
        }))
      )
    )
  );
}

function allSkuRows() {
  return allSlots().flatMap((slot) =>
    slot.skus.map((item) => ({
      ...item,
      code: slot.code,
      slotId: slot.id,
      slotType: slot.type,
      aisleId: slot.aisleId,
      aisleName: slot.aisleName,
      bayId: slot.bayId,
      baySide: slot.baySide,
      laneId: slot.laneId,
      zone: slot.zone
    }))
  );
}

function firstSlot() {
  return allSlots()[0];
}

// --- Occupancy / status --------------------------------------------------

function slotUnits(slot) {
  return (slot.skus || []).reduce((sum, item) => sum + (item.qty || 0), 0);
}

function totalUnitsForSlot(slot) {
  return slotUnits(slot);
}

// CSS class names: "healthy" = stocked (green), "low" = red, "empty" = blue outline.
function statusForUnits(units) {
  if (units <= 0) return "empty";
  if (units <= LOW_UNITS) return "low";
  return "healthy";
}

function statusFor(itemOrSlot) {
  if (Array.isArray(itemOrSlot.skus)) return statusForUnits(slotUnits(itemOrSlot));
  return statusForUnits(itemOrSlot.qty || 0);
}

function statusLabel(status) {
  if (status === "empty") return "Empty";
  if (status === "low") return "Low";
  return "Stocked";
}

function barColor(status) {
  if (status === "empty") return "#94a3b8";
  if (status === "low") return "#c24135";
  return "#2f855a";
}

function fillPercent(itemOrSlot) {
  const units = Array.isArray(itemOrSlot.skus)
    ? slotUnits(itemOrSlot)
    : itemOrSlot.qty || 0;
  return Math.max(0, Math.min(100, Math.round((units / 40) * 100)));
}

function stockSummaryForSlots(slots) {
  const units = slots.reduce((sum, slot) => sum + slotUnits(slot), 0);
  const total = slots.length;
  const emptyCount = slots.filter((slot) => slotUnits(slot) === 0).length;
  const lowCount = slots.filter((slot) => statusFor(slot) === "low").length;
  const occupied = total - emptyCount;
  const percent = total ? Math.round((occupied / total) * 100) : 0;
  let status = "healthy";
  if (total && emptyCount === total) status = "empty";
  else if (total && emptyCount / total >= 0.5) status = "low";
  return { units, total, emptyCount, lowCount, occupied, percent, status };
}

function baySideLabel(bayOrSlot) {
  const side = bayOrSlot?.side || bayOrSlot?.baySide || "left";
  return side === "left" ? "Odd / Left" : "Even / Right";
}

function boxPositionLabel(slotOrNumber) {
  const number =
    typeof slotOrNumber === "number"
      ? slotOrNumber
      : slotOrNumber?.column || codeNumber(slotOrNumber?.id);
  return `S${number}`;
}

function aisleDisplayName(aisle) {
  return aisle.name ? `${aisle.id} - ${aisle.name}` : aisle.id;
}

// --- Selection getters ---------------------------------------------------

function getAisle(id = selectedAisleId) {
  return state.aisles.find((aisle) => aisle.id === id) || state.aisles[0];
}

function getBay(aisleId = selectedAisleId, bayId = selectedBayId) {
  const aisle = getAisle(aisleId);
  return aisle?.bays.find((bay) => bay.id === bayId) || aisle?.bays[0];
}

function getLane(aisleId = selectedAisleId, bayId = selectedBayId, laneId = selectedLaneId) {
  const bay = getBay(aisleId, bayId);
  return bay?.lanes.find((lane) => lane.id === laneId) || bay?.lanes[0];
}

function getSlot(code = selectedSlotCode) {
  return allSlots().find((slot) => slot.code === code) || firstSlot();
}

function findRealSlot(code) {
  for (const aisle of state.aisles) {
    for (const bay of aisle.bays) {
      for (const lane of bay.lanes) {
        const slot = lane.slots.find(
          (candidate) => locationCode(aisle, bay, lane, candidate) === code
        );
        if (slot) return { aisle, bay, lane, slot };
      }
    }
  }
  return null;
}

function selectSlot(code) {
  const match = findRealSlot(code);
  if (!match) return;
  selectedAisleId = match.aisle.id;
  selectedBayId = match.bay.id;
  selectedLaneId = match.lane.id;
  selectedSlotCode = code;
  bayIndex = match.aisle.bays.findIndex((bay) => bay.id === match.bay.id);
}

function jumpToBay(aisleId, bayId, mode = "row") {
  const aisle = getAisle(aisleId);
  if (!aisle) return;
  selectedAisleId = aisle.id;
  const bay = aisle.bays.find((item) => item.id === bayId) || aisle.bays[0];
  selectedBayId = bay.id;
  bayIndex = aisle.bays.findIndex((item) => item.id === bay.id);
  selectedLaneId = bay.lanes[0]?.id;
  if (bay.lanes[0]?.slots[0]) {
    selectedSlotCode = locationCode(aisle, bay, bay.lanes[0], bay.lanes[0].slots[0]);
  }
  setView("walkthrough");
  warehouseMode = mode;
  updateWarehouseModeButtons();
  render();
}

function slotMatchesSearch(slot, query) {
  if (!query) return true;
  const haystack = [
    slot.code,
    slot.aisleName,
    slot.bayId,
    slot.baySide,
    slot.laneId,
    slot.slotId,
    boxPositionLabel(slot),
    slot.slotType,
    slot.zone,
    ...slot.skus.flatMap((item) => [item.sku, item.name, item.color, item.size])
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

// --- Render orchestration ------------------------------------------------

function render() {
  keepSelectionValid();
  renderMetrics();
  renderAisleSelector();
  renderSlotDetail();
  renderMap();
  renderLayoutBuilder();
  renderFilters();
  renderInventoryTable();
  renderAlerts();
  renderEmptyFinder();
  renderOtherLocations();
  renderSkuSelect();
  renderActivity();
  renderWarehouse3d();
}

function keepSelectionValid() {
  if (!state.aisles.length) state = buildStateFromData();
  const aisle = getAisle();
  selectedAisleId = aisle.id;
  if (!aisle.bays.length) aisle.bays.push(makeBay(nextNumber([], "B")));
  if (!selectedBayId || !aisle.bays.some((bay) => bay.id === selectedBayId)) {
    selectedBayId = aisle.bays[0].id;
  }
  bayIndex = Math.max(0, aisle.bays.findIndex((bay) => bay.id === selectedBayId));
  const bay = getBay();
  if (!bay.lanes.length) bay.lanes.push(makeLane(nextNumber([], "L")));
  if (!selectedLaneId || !bay.lanes.some((lane) => lane.id === selectedLaneId)) {
    selectedLaneId = bay.lanes[0].id;
  }
  const lane = getLane();
  if (!lane.slots.length) lane.slots.push(makeSlot(nextNumber([], "S")));
  if (!selectedSlotCode || !findRealSlot(selectedSlotCode)) {
    selectedSlotCode = locationCode(aisle, bay, lane, lane.slots[0]);
  }
}

function renderMetrics() {
  const slots = allSlots();
  let empty = 0;
  let low = 0;
  let stocked = 0;
  let units = 0;
  slots.forEach((slot) => {
    const slotTotal = slotUnits(slot);
    units += slotTotal;
    const status = statusForUnits(slotTotal);
    if (status === "empty") empty += 1;
    else if (status === "low") low += 1;
    else stocked += 1;
  });

  els.metricAisles.textContent = state.aisles.length;
  els.metricBays.textContent = formatNumber(
    state.aisles.reduce((sum, aisle) => sum + aisle.bays.length, 0)
  );
  els.metricSlots.textContent = formatNumber(slots.length);
  els.metricUnits.textContent = formatNumber(units);
  els.metricEmpty.textContent = formatNumber(empty);
  els.metricLow.textContent = formatNumber(low);
  els.metricStocked.textContent = formatNumber(stocked);
}

function renderAisleSelector() {
  els.aisleSelector.innerHTML = "";
  state.aisles.forEach((aisle) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = aisle.id;
    button.title = `${aisleDisplayName(aisle)} - ${aisle.bays.length} bays`;
    button.className = aisle.id === selectedAisleId ? "active" : "";
    button.addEventListener("click", () => {
      selectedAisleId = aisle.id;
      selectedBayId =
        aisle.bays[Math.min(bayIndex, aisle.bays.length - 1)]?.id || aisle.bays[0]?.id;
      selectedLaneId = getBay()?.lanes[0]?.id;
      selectedSlotCode = getBay()?.lanes[0]?.slots[0]
        ? locationCode(aisle, getBay(), getBay().lanes[0], getBay().lanes[0].slots[0])
        : "";
      render();
    });
    els.aisleSelector.appendChild(button);
  });

  const aisle = getAisle();
  const bay = getBay();
  const sideShort = bay ? (bay.side === "left" ? "L" : "R") : "";
  els.currentBayLabel.textContent = bay ? `${bay.id} · ${sideShort}` : "B--";
  els.prevBayButton.disabled = bayIndex <= 0;
  els.nextBayButton.disabled = bayIndex >= aisle.bays.length - 1;
}

function renderSlotDetail() {
  const slot = getSlot();
  if (!slot) {
    els.selectedSlotTitle.textContent = "Select a slot";
    els.selectedSlotStatus.textContent = "Idle";
    els.selectedSlotStatus.className = "status-pill";
    els.slotDetail.className = "box-detail empty-detail";
    els.slotDetail.textContent = "Choose any S position in the 3D view, map, or builder.";
    return;
  }

  const status = statusFor(slot);
  const units = slotUnits(slot);
  els.selectedSlotTitle.textContent = slot.code;
  els.selectedSlotStatus.textContent = statusLabel(status);
  els.selectedSlotStatus.className = `status-pill ${status}`;
  els.slotDetail.className = "box-detail";

  const header = `
    <div class="location-strip">
      <div><span>Aisle</span><strong>${slot.aisleId}</strong></div>
      <div><span>Bay</span><strong>${slot.bayId}</strong></div>
      <div><span>Row / Box</span><strong>${slot.laneId}.${boxPositionLabel(slot)}</strong></div>
    </div>
    <div class="detail-meta">
      <span>${baySideLabel(slot)}</span>
      <span>Box ${boxPositionLabel(slot)} left-to-right</span>
      <span>${formatNumber(units)} units</span>
    </div>
  `;

  if (!slot.skus.length) {
    els.slotDetail.innerHTML =
      header +
      `<div class="empty-box-callout">
        <strong>Empty box</strong>
        <p>No stock in this position - available to replenish.</p>
      </div>`;
    return;
  }

  els.slotDetail.innerHTML =
    header +
    `<div class="sku-stack">
      ${slot.skus
        .map((item) => {
          const itemStatus = statusForUnits(item.qty);
          const variant = [item.color, item.size].filter(Boolean).join(" / ");
          return `
            <article class="sku-card">
              <header>
                <div>
                  <h4>${item.sku}</h4>
                  <span class="sku-meta">${item.name}${variant ? ` - ${variant}` : ""}</span>
                </div>
                <span class="status-tag ${itemStatus}">${formatNumber(item.qty)} units</span>
              </header>
              <div class="stock-bar" style="--fill: ${fillPercent(item)}%; --bar: ${barColor(itemStatus)}"><i></i></div>
            </article>
          `;
        })
        .join("")}
    </div>`;
}

function renderMap() {
  const query = els.globalSearch.value.trim();
  els.warehouseMap.innerHTML = "";

  state.aisles.forEach((aisle) => {
    const aisleEl = document.createElement("div");
    aisleEl.className = "map-lane";
    aisleEl.innerHTML = `<div class="map-lane-label">${aisle.id}<small>${aisle.bays.length} bays</small></div>`;
    const baysEl = document.createElement("div");
    baysEl.className = "map-bay-sides";

    ["left", "right"].forEach((side) => {
      const sideEl = document.createElement("div");
      sideEl.className = `map-bay-side ${side}`;
      sideEl.innerHTML = `<div class="bay-side-title">${side === "left" ? "Odd bays / left" : "Even bays / right"}</div>`;
      const bayGrid = document.createElement("div");
      bayGrid.className = "map-shelves";

      aisle.bays
        .filter(
          (bay) =>
            (bay.side || (codeNumber(bay.id) % 2 === 1 ? "left" : "right")) === side
        )
        .forEach((bay) => {
          const button = document.createElement("button");
          button.type = "button";
          const active = aisle.id === selectedAisleId && bay.id === selectedBayId;
          const slots = bay.lanes.flatMap((lane) =>
            lane.slots.map((slot) => ({
              ...slot,
              code: locationCode(aisle, bay, lane, slot),
              aisleName: aisle.name,
              aisleId: aisle.id,
              zone: aisle.zone,
              bayId: bay.id,
              baySide: bay.side || (codeNumber(bay.id) % 2 === 1 ? "left" : "right"),
              laneId: lane.id,
              slotId: slot.id
            }))
          );
          const summary = stockSummaryForSlots(slots);
          button.className = `map-shelf ${summary.status}${active ? " active" : ""}`;
          button.innerHTML = `
            <strong>${bay.id}</strong>
            <span class="sku-meta">${summary.emptyCount} empty / ${slots.length} boxes</span>
            <span class="sku-meta">${formatNumber(summary.units)} units</span>
            <span class="mini-boxes">
              ${slots
                .filter(
                  (slot) =>
                    slot.laneId === selectedLaneId || slot.laneId === bay.lanes[0]?.id
                )
                .slice(0, DEFAULT_SLOT_COUNT)
                .map(
                  (slot) =>
                    `<i class="mini-box ${statusFor(slot)}" style="opacity:${
                      slotMatchesSearch(slot, query) ? 1 : 0.18
                    }"></i>`
                )
                .join("")}
            </span>
          `;
          button.addEventListener("click", () => {
            selectedAisleId = aisle.id;
            selectedBayId = bay.id;
            selectedLaneId = bay.lanes[0]?.id;
            if (bay.lanes[0]?.slots[0]) {
              selectedSlotCode = locationCode(aisle, bay, bay.lanes[0], bay.lanes[0].slots[0]);
            }
            render();
          });
          bayGrid.appendChild(button);
        });
      sideEl.appendChild(bayGrid);
      baysEl.appendChild(sideEl);
    });

    aisleEl.appendChild(baysEl);
    els.warehouseMap.appendChild(aisleEl);
  });
}

function renderLayoutBuilder() {
  renderLayoutCanvas();
  renderStructureEditor();
}

function renderLayoutCanvas() {
  const query = els.globalSearch.value.trim();
  const slots = allSlots();
  els.layoutCanvas.innerHTML = '<div class="layout-gridlines" aria-hidden="true"></div>';

  state.aisles.forEach((aisle) => {
    const aisleButton = document.createElement("button");
    aisleButton.type = "button";
    aisleButton.className = `layout-aisle${aisle.id === selectedAisleId ? " selected" : ""}`;
    aisleButton.style.left = `${aisle.x}%`;
    aisleButton.style.top = `${aisle.y}%`;
    const aisleSlots = slots.filter((slot) => slot.aisleId === aisle.id);
    const emptyCount = aisleSlots.filter((slot) => slotUnits(slot) === 0).length;
    aisleButton.innerHTML = `
      <strong>${aisle.id}</strong>
      <span>${aisle.name || "No aisle name set"}</span>
      <small>${aisle.bays.length} bays / ${LEVEL_COUNT} levels / ${SLOT_COUNT} wide</small>
      <small>${formatNumber(emptyCount)} empty of ${formatNumber(aisleSlots.length)} boxes</small>
      <span class="layout-slot-strip">
        ${aisleSlots
          .slice(0, 32)
          .map(
            (slot) =>
              `<i class="${statusFor(slot)}" style="opacity:${
                slotMatchesSearch(slot, query) ? 1 : 0.2
              }"></i>`
          )
          .join("")}
      </span>
    `;
    aisleButton.addEventListener("pointerdown", startAisleDrag);
    aisleButton.addEventListener("click", () => {
      selectedAisleId = aisle.id;
      selectedBayId = aisle.bays[0]?.id;
      selectedLaneId = aisle.bays[0]?.lanes[0]?.id;
      if (aisle.bays[0]?.lanes[0]?.slots[0]) {
        selectedSlotCode = locationCode(
          aisle,
          aisle.bays[0],
          aisle.bays[0].lanes[0],
          aisle.bays[0].lanes[0].slots[0]
        );
      }
      render();
    });
    aisleButton.dataset.aisleId = aisle.id;
    els.layoutCanvas.appendChild(aisleButton);
  });
}

function startAisleDrag(event) {
  const aisle = getAisle(event.currentTarget.dataset.aisleId);
  const canvasRect = els.layoutCanvas.getBoundingClientRect();
  const startX = event.clientX;
  const startY = event.clientY;
  const originalX = aisle.x;
  const originalY = aisle.y;
  event.currentTarget.setPointerCapture(event.pointerId);

  function onMove(moveEvent) {
    const dx = ((moveEvent.clientX - startX) / canvasRect.width) * 100;
    const dy = ((moveEvent.clientY - startY) / canvasRect.height) * 100;
    aisle.x = Math.max(0, Math.min(82, originalX + dx));
    aisle.y = Math.max(0, Math.min(82, originalY + dy));
    event.currentTarget.style.left = `${aisle.x}%`;
    event.currentTarget.style.top = `${aisle.y}%`;
  }

  function onUp() {
    event.currentTarget.removeEventListener("pointermove", onMove);
    event.currentTarget.removeEventListener("pointerup", onUp);
    saveState();
    renderWarehouse3d();
  }

  selectedAisleId = aisle.id;
  event.currentTarget.addEventListener("pointermove", onMove);
  event.currentTarget.addEventListener("pointerup", onUp);
}

function renderStructureEditor() {
  const aisle = getAisle();
  const bay = getBay();
  const lane = getLane();
  const slot = getSlot();
  els.structureEditor.innerHTML = `
    <div class="code-preview">${slot?.code || "No location"}</div>
    <label>
      Optional Aisle Name
      <input id="editAisleName" type="text" value="${aisle.name}" placeholder="e.g. Womens Core, Footwear" />
    </label>
    <label>
      Selected Bay
      <select id="editBaySelect">
        ${aisle.bays
          .map(
            (item) =>
              `<option value="${item.id}" ${item.id === bay.id ? "selected" : ""}>${item.id} - ${baySideLabel(item)}</option>`
          )
          .join("")}
      </select>
    </label>
    <div class="structure-stat">
      <span>Bay side</span>
      <strong>${baySideLabel(bay)}</strong>
    </div>
    <label>
      Selected L
      <select id="editLaneSelect">
        ${bay.lanes
          .map(
            (item) =>
              `<option value="${item.id}" ${item.id === lane.id ? "selected" : ""}>${item.id}</option>`
          )
          .join("")}
      </select>
    </label>
    <div class="slot-picker">
      ${lane.slots
        .map((item) => {
          const code = locationCode(aisle, bay, lane, item);
          return `<button type="button" class="${code === selectedSlotCode ? "active" : ""}" data-code="${code}">${boxPositionLabel(item)}</button>`;
        })
        .join("")}
    </div>
  `;

  $("editAisleName").addEventListener("input", (event) => {
    aisle.name = event.target.value;
    saveState();
    renderAisleSelector();
  });
  $("editBaySelect").addEventListener("change", (event) => {
    selectedBayId = event.target.value;
    selectedLaneId = getBay().lanes[0]?.id;
    const nextLane = getLane();
    if (nextLane?.slots[0]) {
      selectedSlotCode = locationCode(getAisle(), getBay(), nextLane, nextLane.slots[0]);
    }
    render();
  });
  $("editLaneSelect").addEventListener("change", (event) => {
    selectedLaneId = event.target.value;
    const nextLane = getLane();
    if (nextLane?.slots[0]) {
      selectedSlotCode = locationCode(getAisle(), getBay(), nextLane, nextLane.slots[0]);
    }
    render();
  });
  document.querySelectorAll(".slot-picker button").forEach((button) => {
    button.addEventListener("click", () => {
      selectSlot(button.dataset.code);
      render();
    });
  });
}

function renderFilters() {
  const currentAisle = els.aisleFilter.value || "all";
  els.aisleFilter.innerHTML = '<option value="all">All aisles</option>';
  state.aisles.forEach((aisle) => {
    const option = document.createElement("option");
    option.value = aisle.id;
    option.textContent = aisle.name ? `${aisle.id} - ${aisle.name}` : aisle.id;
    els.aisleFilter.appendChild(option);
  });
  els.aisleFilter.value = [...state.aisles.map((aisle) => aisle.id), "all"].includes(
    currentAisle
  )
    ? currentAisle
    : "all";
}

function inventoryRows() {
  return allSlots().flatMap((slot) => {
    if (slot.skus.length) {
      return slot.skus.map((item) => ({
        empty: false,
        sku: item.sku,
        name: item.name,
        color: item.color,
        size: item.size,
        qty: item.qty,
        code: slot.code,
        aisleId: slot.aisleId,
        bayId: slot.bayId,
        baySide: slot.baySide,
        laneId: slot.laneId,
        slotId: slot.slotId
      }));
    }
    return [
      {
        empty: true,
        sku: "",
        name: "Empty box",
        color: "",
        size: "",
        qty: 0,
        code: slot.code,
        aisleId: slot.aisleId,
        bayId: slot.bayId,
        baySide: slot.baySide,
        laneId: slot.laneId,
        slotId: slot.slotId
      }
    ];
  });
}

function renderInventoryTable() {
  const query = els.globalSearch.value.trim().toLowerCase();
  const aisleFilter = els.aisleFilter.value || "all";
  const statusFilter = els.statusFilter.value || "all";
  const rowLimit = query || aisleFilter !== "all" || statusFilter !== "all" ? 1500 : 400;

  const rows = inventoryRows().filter((item) => {
    const status = item.empty ? "empty" : statusForUnits(item.qty);
    const searchable = [
      item.sku,
      item.name,
      item.color,
      item.size,
      item.code,
      item.aisleId,
      item.bayId,
      item.laneId,
      item.slotId
    ]
      .join(" ")
      .toLowerCase();
    return (
      (aisleFilter === "all" || item.aisleId === aisleFilter) &&
      (statusFilter === "all" || status === statusFilter) &&
      (!query || searchable.includes(query))
    );
  });
  const visibleRows = rows.slice(0, rowLimit);

  if (!rows.length) {
    els.inventoryTable.innerHTML = `<tr><td colspan="11" class="no-results">No locations match the current filters.</td></tr>`;
    return;
  }

  els.inventoryTable.innerHTML =
    visibleRows
      .map((item) => {
        const status = item.empty ? "empty" : statusForUnits(item.qty);
        const variant = [item.color, item.size].filter(Boolean).join(" / ");
        return `
        <tr class="${item.empty ? "empty-row" : ""}">
          <td><strong>${item.code}</strong></td>
          <td>${item.aisleId}</td>
          <td>${item.bayId}</td>
          <td>${item.baySide === "left" ? "Odd / Left" : "Even / Right"}</td>
          <td>${item.laneId}</td>
          <td>${boxPositionLabel({ id: item.slotId })}</td>
          <td>${item.sku ? `<strong>${item.sku}</strong>` : "-"}</td>
          <td>${item.empty ? "<em>Empty box</em>" : `${item.name}${variant ? ` - ${variant}` : ""}`}</td>
          <td>${formatNumber(item.qty)}</td>
          <td class="stock-cell"><span class="status-tag ${status}">${statusLabel(status)}</span></td>
          <td><button class="box-action" data-code="${item.code}" type="button">View</button></td>
        </tr>
      `;
      })
      .join("") +
    (rows.length > visibleRows.length
      ? `<tr><td colspan="11" class="no-results">Showing ${formatNumber(
          visibleRows.length
        )} of ${formatNumber(rows.length)} locations. Use search or filters to narrow the list.</td></tr>`
      : "");

  els.inventoryTable.querySelectorAll(".box-action").forEach((button) => {
    button.addEventListener("click", () => {
      selectSlot(button.dataset.code);
      setView("walkthrough");
      warehouseMode = "box";
      updateWarehouseModeButtons();
      render();
    });
  });
}

function renderAlerts() {
  const alerts = allSkuRows()
    .filter((item) => statusForUnits(item.qty) === "low")
    .sort((a, b) => a.qty - b.qty)
    .slice(0, 12);

  if (!alerts.length) {
    els.alertList.innerHTML = `<div class="no-results">No low-stock lines right now.</div>`;
    return;
  }

  els.alertList.innerHTML = alerts
    .map(
      (item) => `
        <article class="alert-card low">
          <header>
            <h4>${item.sku}</h4>
            <span class="status-tag low">${formatNumber(item.qty)} left</span>
          </header>
          <p>${item.name}</p>
          <p>${item.code}</p>
        </article>
      `
    )
    .join("");
}

function renderEmptyFinder() {
  let emptyBoxes = 0;
  let emptyRows = 0;
  let emptyBays = 0;
  const fullyEmptyBays = [];
  const bayStats = [];

  state.aisles.forEach((aisle) => {
    aisle.bays.forEach((bay) => {
      let bayEmpty = 0;
      let bayTotal = 0;
      bay.lanes.forEach((lane) => {
        const laneEmpty = lane.slots.filter((slot) => slotUnits(slot) === 0).length;
        if (lane.slots.length && laneEmpty === lane.slots.length) emptyRows += 1;
        bayEmpty += laneEmpty;
        bayTotal += lane.slots.length;
      });
      emptyBoxes += bayEmpty;
      const entry = { aisleId: aisle.id, bayId: bay.id, empty: bayEmpty, total: bayTotal };
      bayStats.push(entry);
      if (bayTotal && bayEmpty === bayTotal) {
        emptyBays += 1;
        fullyEmptyBays.push(entry);
      }
    });
  });

  const replenTargets = bayStats
    .filter((bay) => bay.empty > 0 && bay.empty < bay.total)
    .sort((a, b) => b.empty - a.empty)
    .slice(0, 40);

  const summary = `
    <div class="empty-summary-grid">
      <div class="es-empty"><span>Empty boxes</span><strong>${formatNumber(emptyBoxes)}</strong></div>
      <div class="es-empty"><span>Empty rows</span><strong>${formatNumber(emptyRows)}</strong></div>
      <div class="es-empty"><span>Empty bays</span><strong>${formatNumber(emptyBays)}</strong></div>
    </div>
  `;

  const fullyEmptyBlock = fullyEmptyBays.length
    ? `<h4 class="finder-heading">Completely empty bays (${formatNumber(fullyEmptyBays.length)})</h4>
       <div class="chip-row">
         ${fullyEmptyBays
           .slice(0, 60)
           .map(
             (bay) =>
               `<button class="loc-chip empty" type="button" data-aisle="${bay.aisleId}" data-bay="${bay.bayId}">${bay.aisleId}.${bay.bayId}</button>`
           )
           .join("")}
         ${fullyEmptyBays.length > 60 ? `<span class="chip-more">+${formatNumber(fullyEmptyBays.length - 60)} more</span>` : ""}
       </div>`
    : "";

  const replenBlock = replenTargets.length
    ? `<h4 class="finder-heading">Bays with the most space to replenish</h4>
       ${replenTargets
         .map(
           (bay) => `
            <article class="replen-card">
              <div>
                <h4>${bay.aisleId}.${bay.bayId}</h4>
                <p>${formatNumber(bay.empty)} empty of ${formatNumber(bay.total)} boxes</p>
              </div>
              <div class="replen-meter" style="--fill:${Math.round((bay.empty / bay.total) * 100)}%"><i></i></div>
              <button class="box-action" type="button" data-aisle="${bay.aisleId}" data-bay="${bay.bayId}">Open bay</button>
            </article>
          `
         )
         .join("")}`
    : `<div class="no-results">Every bay is fully stocked.</div>`;

  els.emptyBoxList.innerHTML = summary + fullyEmptyBlock + replenBlock;

  els.emptyBoxList.querySelectorAll("[data-bay]").forEach((button) => {
    button.addEventListener("click", () => {
      jumpToBay(button.dataset.aisle, button.dataset.bay, "row");
    });
  });
}

function renderOtherLocations() {
  const query = els.globalSearch.value.trim().toLowerCase();
  const rows = (DATA.other || [])
    .map(([loc, sku, qty, type, zone]) => {
      const meta = DATA.skus[sku] || ["", "", ""];
      return {
        loc,
        sku,
        name: meta[0] || sku,
        variant: [meta[1], meta[2]].filter(Boolean).join(" / "),
        qty: Number(qty) || 0,
        type,
        zone
      };
    })
    .filter((row) => {
      if (!query) return true;
      return [row.loc, row.sku, row.name, row.variant, row.zone, row.type]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

  if (!els.otherLocList) return;

  if (!rows.length) {
    els.otherLocList.innerHTML = `<tr><td colspan="5" class="no-results">No bulk / overflow locations match the search.</td></tr>`;
    return;
  }

  const visible = rows.slice(0, 600);
  els.otherLocList.innerHTML =
    visible
      .map(
        (row) => `
        <tr>
          <td><strong>${row.loc}</strong></td>
          <td>${row.zone}</td>
          <td>${row.sku || "-"}</td>
          <td>${row.name}${row.variant ? ` - ${row.variant}` : ""}</td>
          <td>${formatNumber(row.qty)}</td>
        </tr>
      `
      )
      .join("") +
    (rows.length > visible.length
      ? `<tr><td colspan="5" class="no-results">Showing ${formatNumber(
          visible.length
        )} of ${formatNumber(rows.length)} bulk / overflow lines. Use search to narrow the list.</td></tr>`
      : "");
}

function renderSkuSelect() {
  const selectedSku = els.skuSelect.value;
  let rows = allSkuRows().filter(
    (item) => item.aisleId === selectedAisleId && item.bayId === selectedBayId
  );
  if (!rows.length) rows = allSkuRows().slice(0, 100);
  rows.sort((a, b) => a.code.localeCompare(b.code));
  els.skuSelect.innerHTML = rows
    .map(
      (item) =>
        `<option value="${item.code}|${item.sku}">${item.code} / ${item.sku} (${item.qty})</option>`
    )
    .join("");
  if ([...els.skuSelect.options].some((option) => option.value === selectedSku)) {
    els.skuSelect.value = selectedSku;
  }
}

function renderActivity() {
  els.activityLog.innerHTML = state.activity
    .slice(0, 12)
    .map(
      (entry) => `
        <article class="activity-row">
          <p>${entry.text}</p>
          <span>${entry.detail} - ${entry.at}</span>
        </article>
      `
    )
    .join("");
}

function adjustStock(code, sku, delta, note) {
  const match = findRealSlot(code);
  if (!match) return;
  const item = match.slot.skus.find((skuItem) => skuItem.sku === sku);
  if (!item) return;
  const before = item.qty;
  item.qty = Math.max(0, item.qty + delta);
  const applied = item.qty - before;

  state.activity.unshift({
    text: `${applied >= 0 ? "+" : ""}${applied} units ${sku}`,
    detail: `${code}${note ? ` / ${note}` : ""}`,
    at: new Date().toLocaleString()
  });
  selectSlot(code);
  saveState();
}

function nextNumber(collection, prefix) {
  const max = collection.reduce(
    (highest, item) => Math.max(highest, codeNumber(item.id)),
    0
  );
  return max + 1;
}

function addAisle() {
  const number = nextNumber(state.aisles, "A");
  const aisle = {
    id: codePart("A", number),
    name: "",
    zone: "New Zone",
    x: 8 + ((state.aisles.length * 18) % 72),
    y: 10 + ((state.aisles.length * 16) % 64),
    bays: [makeBay(1)]
  };
  state.aisles.push(aisle);
  selectedAisleId = aisle.id;
  selectedBayId = aisle.bays[0].id;
  selectedLaneId = aisle.bays[0].lanes[0].id;
  selectedSlotCode = locationCode(
    aisle,
    aisle.bays[0],
    aisle.bays[0].lanes[0],
    aisle.bays[0].lanes[0].slots[0]
  );
  saveState();
  render();
}

function addBay() {
  const aisle = getAisle();
  const bay = makeBay(nextNumber(aisle.bays, "B"));
  aisle.bays.push(bay);
  selectedBayId = bay.id;
  selectedLaneId = bay.lanes[0].id;
  selectedSlotCode = locationCode(aisle, bay, bay.lanes[0], bay.lanes[0].slots[0]);
  saveState();
  render();
}

function addLane() {
  const aisle = getAisle();
  const bay = getBay();
  const lane = makeLane(nextNumber(bay.lanes, "L"));
  bay.lanes.push(lane);
  selectedLaneId = lane.id;
  selectedSlotCode = locationCode(aisle, bay, lane, lane.slots[0]);
  saveState();
  render();
}

function addSlot() {
  const aisle = getAisle();
  const bay = getBay();
  const lane = getLane();
  const slot = makeSlot(nextNumber(lane.slots, "S"));
  lane.slots.push(slot);
  selectedSlotCode = locationCode(aisle, bay, lane, slot);
  saveState();
  render();
}

function removeSelected() {
  const match = findRealSlot(selectedSlotCode);
  if (!match) return;

  if (match.lane.slots.length > 1) {
    match.lane.slots = match.lane.slots.filter((slot) => slot.id !== match.slot.id);
  } else if (match.bay.lanes.length > 1) {
    match.bay.lanes = match.bay.lanes.filter((lane) => lane.id !== match.lane.id);
  } else if (match.aisle.bays.length > 1) {
    match.aisle.bays = match.aisle.bays.filter((bay) => bay.id !== match.bay.id);
  } else if (state.aisles.length > 1) {
    state.aisles = state.aisles.filter((aisle) => aisle.id !== match.aisle.id);
  }

  const next = firstSlot();
  if (next) selectSlot(next.code);
  saveState();
  render();
}

function setView(view) {
  activeView = view;
  const titles = {
    walkthrough: "Walkthrough",
    layout: "Layout Builder",
    dashboard: "Admin Dashboard"
  };
  els.pageTitle.textContent = titles[view];
  els.walkthroughView.classList.toggle("active-view", view === "walkthrough");
  els.layoutView.classList.toggle("active-view", view === "layout");
  els.dashboardView.classList.toggle("active-view", view === "dashboard");
  els.navButtons.forEach((button) =>
    button.classList.toggle("active", button.dataset.view === view)
  );
  if (view === "walkthrough") setTimeout(renderWarehouse3d, 0);
}

function renderWarehouse3d() {
  if (!els.warehouse3d || !els.walkthroughView.classList.contains("active-view")) return;
  const renderers = {
    overview: renderWarehouseOverview,
    aisle: renderWarehouseAisle,
    row: renderWarehouseRows,
    box: renderWarehouseBoxes
  };
  els.warehouse3d.className = `warehouse-3d mode-${warehouseMode}${
    emptyFocus ? " empty-focus" : ""
  }`;
  els.warehouse3d.innerHTML = renderers[warehouseMode]();
  bindWarehouse3dActions();
}

function renderWarehouseOverview() {
  const slots = allSlots();
  return `
    <div class="warehouse-perspective overview-perspective">
      ${state.aisles
        .map((aisle) => {
          const aisleSlots = slots.filter((slot) => slot.aisleId === aisle.id);
          const summary = stockSummaryForSlots(aisleSlots);
          const emptyBays = aisle.bays.filter((bay) =>
            bay.lanes.every((lane) => lane.slots.every((slot) => slotUnits(slot) === 0))
          ).length;
          return `
          <button type="button" class="wh-aisle-card ${summary.status} ${
            aisle.id === selectedAisleId ? "selected" : ""
          }" data-aisle-id="${aisle.id}">
            <span class="wh-aisle-title">${aisle.id}</span>
            <span class="wh-aisle-sub">${aisle.name || `${aisle.bays.length} bays`}</span>
            <span class="wh-rack-pair"><i></i><i></i></span>
            <span class="wh-aisle-meta">${formatNumber(summary.emptyCount)} empty boxes</span>
            <span class="wh-aisle-meta">${emptyBays} empty bays</span>
          </button>
        `;
        })
        .join("")}
    </div>
  `;
}

function renderWarehouseAisle() {
  const aisle = getAisle();
  return `
    <div class="aisle-scene">
      <div class="aisle-scene-label">
        <strong>${aisleDisplayName(aisle)}</strong>
        <span>Odd bays left, even bays right</span>
      </div>
      <div class="rack-wall left-wall">
        ${renderBayWall(aisle, "left")}
      </div>
      <div class="walkway-3d">
        ${aisle.bays
          .map(
            (bay) =>
              `<button type="button" class="bay-floor-marker ${
                bay.id === selectedBayId ? "selected" : ""
              }" data-bay-id="${bay.id}">${bay.id}</button>`
          )
          .join("")}
      </div>
      <div class="rack-wall right-wall">
        ${renderBayWall(aisle, "right")}
      </div>
    </div>
  `;
}

function renderBayWall(aisle, side) {
  return aisle.bays
    .filter(
      (bay) => (bay.side || (codeNumber(bay.id) % 2 === 1 ? "left" : "right")) === side
    )
    .map((bay) => {
      const slots = bay.lanes.flatMap((lane) =>
        lane.slots.map((slot) => ({
          ...slot,
          code: locationCode(aisle, bay, lane, slot),
          aisleId: aisle.id,
          bayId: bay.id,
          baySide: side,
          laneId: lane.id,
          slotId: slot.id
        }))
      );
      const summary = stockSummaryForSlots(slots);
      return `
        <button type="button" class="rack-bay ${summary.status} ${
        bay.id === selectedBayId ? "selected" : ""
      }" data-bay-id="${bay.id}">
          <span>${bay.id}<small>${summary.emptyCount} empty</small></span>
          <span class="rack-bay-boxes">${slots
            .slice(0, 21)
            .map((slot) => `<i class="${statusFor(slot)}"></i>`)
            .join("")}</span>
        </button>
      `;
    })
    .join("");
}

function renderWarehouseRows() {
  const aisle = getAisle();
  const bay = getBay();
  return `
    <div class="row-scene">
      <div class="row-scene-header">
        <strong>${aisle.id}.${bay.id}</strong>
        <span>${baySideLabel(bay)} / shelf rows ${bay.lanes[0]?.id} to ${
    bay.lanes[bay.lanes.length - 1]?.id
  }</span>
      </div>
      <div class="row-rack">
        ${bay.lanes
          .slice()
          .reverse()
          .map((lane) => {
            const laneSlots = lane.slots.map((slot) => ({
              ...slot,
              code: locationCode(aisle, bay, lane, slot),
              aisleId: aisle.id,
              bayId: bay.id,
              laneId: lane.id,
              slotId: slot.id
            }));
            const summary = stockSummaryForSlots(laneSlots);
            return `
          <button type="button" class="shelf-row ${summary.status} ${
              lane.id === selectedLaneId ? "selected" : ""
            }" data-lane-id="${lane.id}">
            <span class="shelf-row-label">${lane.id}<small>${summary.emptyCount} empty</small></span>
            <span class="shelf-row-boxes">
              ${laneSlots
                .map(
                  (slot) =>
                    `<i class="${statusFor(slot)} ${
                      slot.code === selectedSlotCode ? "selected" : ""
                    }" data-code="${slot.code}">${boxPositionLabel(slot)}</i>`
                )
                .join("")}
            </span>
          </button>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderWarehouseBoxes() {
  const aisle = getAisle();
  const bay = getBay();
  const lane = getLane();
  return `
    <div class="box-scene">
      <div class="row-scene-header">
        <strong>${aisle.id}.${bay.id}.${lane.id}</strong>
        <span>Boxes left-to-right: S1 to S${SLOT_COUNT}</span>
      </div>
      <div class="box-line">
        ${lane.slots
          .map((slot) => {
            const code = locationCode(aisle, bay, lane, slot);
            const units = slotUnits(slot);
            const status = statusForUnits(units);
            return `
            <button type="button" class="box-position ${status} ${
              code === selectedSlotCode ? "selected" : ""
            }" data-code="${code}">
              <strong>${boxPositionLabel(slot)}</strong>
              <span>${status === "empty" ? "Empty" : `${formatNumber(units)} units`}</span>
              <em style="--fill:${fillPercent(slot)}%"></em>
            </button>
          `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function bindWarehouse3dActions() {
  els.warehouse3d.querySelectorAll("[data-aisle-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedAisleId = button.dataset.aisleId;
      const aisle = getAisle();
      selectedBayId = aisle.bays[0]?.id;
      selectedLaneId = aisle.bays[0]?.lanes[0]?.id;
      if (aisle.bays[0]?.lanes[0]?.slots[0]) {
        selectedSlotCode = locationCode(
          aisle,
          aisle.bays[0],
          aisle.bays[0].lanes[0],
          aisle.bays[0].lanes[0].slots[0]
        );
      }
      warehouseMode = "aisle";
      updateWarehouseModeButtons();
      render();
    });
  });
  els.warehouse3d.querySelectorAll("[data-bay-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const aisle = getAisle();
      selectedBayId = button.dataset.bayId;
      bayIndex = aisle.bays.findIndex((bay) => bay.id === selectedBayId);
      const bay = getBay();
      selectedLaneId = bay.lanes[0]?.id;
      if (bay.lanes[0]?.slots[0]) {
        selectedSlotCode = locationCode(aisle, bay, bay.lanes[0], bay.lanes[0].slots[0]);
      }
      warehouseMode = "row";
      updateWarehouseModeButtons();
      render();
    });
  });
  els.warehouse3d.querySelectorAll("[data-lane-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedLaneId = button.dataset.laneId;
      const lane = getLane();
      if (lane.slots[0]) {
        selectedSlotCode = locationCode(getAisle(), getBay(), lane, lane.slots[0]);
      }
      warehouseMode = "box";
      updateWarehouseModeButtons();
      render();
    });
  });
  els.warehouse3d.querySelectorAll("[data-code]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      selectSlot(button.dataset.code);
      warehouseMode = "box";
      updateWarehouseModeButtons();
      render();
    });
  });
}

function updateWarehouseModeButtons() {
  els.warehouseModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.warehouseMode === warehouseMode);
  });
}

els.navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setView(button.dataset.view);
    render();
  });
});

els.warehouseModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    warehouseMode = button.dataset.warehouseMode;
    updateWarehouseModeButtons();
    renderWarehouse3d();
  });
});

if (els.emptyHighlightButton) {
  els.emptyHighlightButton.addEventListener("click", () => {
    emptyFocus = !emptyFocus;
    els.emptyHighlightButton.classList.toggle("active", emptyFocus);
    els.emptyHighlightButton.textContent = emptyFocus
      ? "Showing empties"
      : "Highlight empties";
    renderWarehouse3d();
  });
}

els.prevBayButton.addEventListener("click", () => {
  const aisle = getAisle();
  bayIndex = Math.max(0, bayIndex - 1);
  selectedBayId = aisle.bays[bayIndex].id;
  const bay = getBay();
  selectedLaneId = bay.lanes[0]?.id;
  if (bay.lanes[0]?.slots[0]) {
    selectedSlotCode = locationCode(aisle, bay, bay.lanes[0], bay.lanes[0].slots[0]);
  }
  render();
});

els.nextBayButton.addEventListener("click", () => {
  const aisle = getAisle();
  bayIndex = Math.min(aisle.bays.length - 1, bayIndex + 1);
  selectedBayId = aisle.bays[bayIndex].id;
  const bay = getBay();
  selectedLaneId = bay.lanes[0]?.id;
  if (bay.lanes[0]?.slots[0]) {
    selectedSlotCode = locationCode(aisle, bay, bay.lanes[0], bay.lanes[0].slots[0]);
  }
  render();
});

els.globalSearch.addEventListener("input", render);
els.aisleFilter.addEventListener("change", renderInventoryTable);
els.statusFilter.addEventListener("change", renderInventoryTable);
els.addAisleButton.addEventListener("click", addAisle);
els.addBayButton.addEventListener("click", addBay);
els.addLaneButton.addEventListener("click", addLane);
els.addSlotButton.addEventListener("click", addSlot);
els.removeSelectedButton.addEventListener("click", removeSelected);

els.stockForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const [code, sku] = els.skuSelect.value.split("|");
  const delta = Number(els.adjustmentInput.value);
  if (!Number.isFinite(delta) || delta === 0) return;
  adjustStock(code, sku, delta, els.noteInput.value.trim());
  els.noteInput.value = "";
  render();
});

els.resetDataButton.addEventListener("click", () => {
  state = buildStateFromData();
  const slot = firstSlot();
  selectedAisleId = state.aisles[0].id;
  selectedBayId = state.aisles[0].bays[0].id;
  selectedLaneId = state.aisles[0].bays[0].lanes[0].id;
  selectedSlotCode = slot.code;
  saveState();
  render();
});

setView(activeView);
updateWarehouseModeButtons();
render();
