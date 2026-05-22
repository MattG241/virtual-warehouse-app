const storageKey = "virtualWarehouse:v4";
const DEFAULT_AISLE_COUNT = 15;
const DEFAULT_BAY_COUNT = 25;
const DEFAULT_LEVEL_COUNT = 5;
const DEFAULT_SLOT_COUNT = 6;

const products = [
  ["NKDLEG-BLK", "NKD Scrunch Leggings - Black", 90],
  ["NKDBRA-OFW", "NKD Sports Bra - Off White", 78],
  ["FREHWS-BLK", "Fleece Hoodie - Black", 54],
  ["FORTRP-GRY", "Force Training Pant - Grey", 70],
  ["EMGTBK-SND", "Energy Tank - Sand", 82],
  ["RIBTNK-WHI", "Ribbed Tank - White", 64],
  ["LFTLEG-MGO", "Lift Leggings - Mango", 58],
  ["MFXTSH-BLK", "Motion Tee - Black", 74],
  ["SIGDUF-BLK", "Signature Duffel - Black", 38],
  ["STWCAP", "Streetwear Cap", 44],
  ["LSOCKS-BWG", "Crew Socks - Black/White/Grey", 120],
  ["HCBSBL-LAV", "Hera Seamless Bra - Lavender", 66]
];

let state = loadState();
let selectedAisleId = state.aisles[0]?.id;
let selectedBayId = state.aisles[0]?.bays[0]?.id;
let selectedLaneId = state.aisles[0]?.bays[0]?.lanes[0]?.id;
let selectedSlotCode = firstSlot()?.code || "";
let activeView = "walkthrough";
let warehouseMode = "overview";
let bayIndex = 0;

const els = {
  pageTitle: document.getElementById("pageTitle"),
  globalSearch: document.getElementById("globalSearch"),
  resetDataButton: document.getElementById("resetDataButton"),
  walkthroughView: document.getElementById("walkthroughView"),
  layoutView: document.getElementById("layoutView"),
  dashboardView: document.getElementById("dashboardView"),
  navButtons: document.querySelectorAll(".nav-button"),
  warehouseModeButtons: document.querySelectorAll("[data-warehouse-mode]"),
  aisleSelector: document.getElementById("aisleSelector"),
  prevBayButton: document.getElementById("prevBayButton"),
  nextBayButton: document.getElementById("nextBayButton"),
  currentBayLabel: document.getElementById("currentBayLabel"),
  warehouse3d: document.getElementById("warehouse3d"),
  selectedSlotTitle: document.getElementById("selectedSlotTitle"),
  selectedSlotStatus: document.getElementById("selectedSlotStatus"),
  slotDetail: document.getElementById("slotDetail"),
  warehouseMap: document.getElementById("warehouseMap"),
  layoutCanvas: document.getElementById("layoutCanvas"),
  structureEditor: document.getElementById("structureEditor"),
  addAisleButton: document.getElementById("addAisleButton"),
  addBayButton: document.getElementById("addBayButton"),
  addLaneButton: document.getElementById("addLaneButton"),
  addSlotButton: document.getElementById("addSlotButton"),
  removeSelectedButton: document.getElementById("removeSelectedButton"),
  metricAisles: document.getElementById("metricAisles"),
  metricBays: document.getElementById("metricBays"),
  metricSlots: document.getElementById("metricSlots"),
  metricUnits: document.getElementById("metricUnits"),
  metricHealthy: document.getElementById("metricHealthy"),
  metricWatch: document.getElementById("metricWatch"),
  metricLow: document.getElementById("metricLow"),
  aisleFilter: document.getElementById("aisleFilter"),
  statusFilter: document.getElementById("statusFilter"),
  inventoryTable: document.getElementById("inventoryTable"),
  alertList: document.getElementById("alertList"),
  emptyBoxList: document.getElementById("emptyBoxList"),
  stockForm: document.getElementById("stockForm"),
  skuSelect: document.getElementById("skuSelect"),
  adjustmentInput: document.getElementById("adjustmentInput"),
  noteInput: document.getElementById("noteInput"),
  activityLog: document.getElementById("activityLog")
};

function makeInitialState() {
  return {
    aisles: Array.from({ length: DEFAULT_AISLE_COUNT }, (_, aisleIndex) => ({
      id: codePart("A", aisleIndex + 1),
      name: "",
      zone: aisleIndex < 5 ? "Pick" : aisleIndex < 10 ? "Bulk" : "Reserve",
      x: 4 + (aisleIndex % 5) * 18,
      y: 8 + Math.floor(aisleIndex / 5) * 28,
      bays: Array.from({ length: DEFAULT_BAY_COUNT }, (_, bayIndexValue) =>
        makeBay(bayIndexValue + 1, aisleIndex, bayIndexValue)
      )
    })),
    activity: [
      {
        text: "Warehouse layout loaded",
        detail: "15 aisles, 25 bays each, odd bays left, even bays right, 6 boxes wide",
        at: new Date().toLocaleString()
      }
    ]
  };
}

function makeBay(number, aisleIndex = 0, bayIndexValue = 0) {
  return {
    id: codePart("B", number),
    side: number % 2 === 1 ? "left" : "right",
    lanes: Array.from({ length: DEFAULT_LEVEL_COUNT }, (_, laneIndex) => makeLane(laneIndex + 1, aisleIndex, bayIndexValue))
  };
}

function makeLane(number, aisleIndex = 0, bayIndexValue = 0) {
  return {
    id: codePart("L", number, 2),
    slots: Array.from({ length: DEFAULT_SLOT_COUNT }, (_, slotIndex) =>
      makeSlot(slotIndex + 1, aisleIndex, bayIndexValue, number - 1, slotIndex)
    )
  };
}

function makeSlot(number, aisleIndex = 0, bayIndexValue = 0, laneIndex = 0, slotIndex = 0) {
  const productSeed = aisleIndex * 7 + bayIndexValue * 3 + laneIndex * 2 + slotIndex;
  const itemOne = products[productSeed % products.length];
  const itemTwo = products[(productSeed + 5) % products.length];
  const maxOne = itemOne[2];
  const maxTwo = itemTwo[2];
  const cycle = (aisleIndex + 2) * (bayIndexValue + 3) * (laneIndex + 1) * (slotIndex + 2);
  let qtyOne = Math.max(3, Math.round(maxOne * ([0.18, 0.34, 0.56, 0.82, 0.95][cycle % 5])));
  let qtyTwo = Math.max(2, Math.round(maxTwo * ([0.14, 0.42, 0.68, 0.78][cycle % 4])));
  if (cycle % 23 === 0) {
    qtyOne = 0;
    qtyTwo = 0;
  }

  return {
    id: `S${number}`,
    type: "Box",
    column: number,
    width: 1,
    depth: 1,
    skus: [
      { sku: itemOne[0], name: itemOne[1], qty: qtyOne, max: maxOne },
      { sku: itemTwo[0], name: itemTwo[1], qty: qtyTwo, max: maxTwo }
    ]
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.aisles) return parsed;
    }
  } catch (error) {
    console.warn("Could not load warehouse state", error);
  }
  return makeInitialState();
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

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
  return new Intl.NumberFormat("en-AU").format(value);
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

function fillPercent(itemOrSlot) {
  if (Array.isArray(itemOrSlot.skus)) {
    const qty = itemOrSlot.skus.reduce((sum, item) => sum + item.qty, 0);
    const max = itemOrSlot.skus.reduce((sum, item) => sum + item.max, 0);
    return max ? Math.round((qty / max) * 100) : 0;
  }
  return itemOrSlot.max ? Math.round((itemOrSlot.qty / itemOrSlot.max) * 100) : 0;
}

function stockSummaryForSlots(slots) {
  const qty = slots.reduce((sum, slot) => sum + slot.skus.reduce((slotSum, item) => slotSum + item.qty, 0), 0);
  const max = slots.reduce((sum, slot) => sum + slot.skus.reduce((slotSum, item) => slotSum + item.max, 0), 0);
  const percent = max ? Math.round((qty / max) * 100) : 0;
  return {
    qty,
    max,
    percent,
    status: statusForPercent(percent),
    empty: qty === 0
  };
}

function totalUnitsForSlot(slot) {
  return slot.skus.reduce((sum, item) => sum + item.qty, 0);
}

function statusForPercent(percent) {
  if (percent <= 30) return "low";
  if (percent <= 60) return "watch";
  return "healthy";
}

function statusFor(itemOrSlot) {
  return statusForPercent(fillPercent(itemOrSlot));
}

function statusLabel(status) {
  return status === "low" ? "Low" : status === "watch" ? "Watch" : "Healthy";
}

function baySideLabel(bayOrSlot) {
  const side = bayOrSlot?.side || bayOrSlot?.baySide || "left";
  return side === "left" ? "Odd / Left" : "Even / Right";
}

function boxPositionLabel(slotOrNumber) {
  const number = typeof slotOrNumber === "number" ? slotOrNumber : slotOrNumber?.column || codeNumber(slotOrNumber?.id);
  return `S${number}`;
}

function aisleDisplayName(aisle) {
  return aisle.name ? `${aisle.id} - ${aisle.name}` : aisle.id;
}

function barColor(status) {
  return status === "low" ? "#c24135" : status === "watch" ? "#c78314" : "#2f855a";
}

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
        const slot = lane.slots.find((candidate) => locationCode(aisle, bay, lane, candidate) === code);
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
    ...slot.skus.flatMap((item) => [item.sku, item.name])
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

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
  renderEmptyBoxes();
  renderSkuSelect();
  renderActivity();
  renderWarehouse3d();
}

function keepSelectionValid() {
  if (!state.aisles.length) state = makeInitialState();
  const aisle = getAisle();
  selectedAisleId = aisle.id;
  if (!aisle.bays.length) aisle.bays.push(makeBay(nextNumber([], "B")));
  if (!selectedBayId || !aisle.bays.some((bay) => bay.id === selectedBayId)) selectedBayId = aisle.bays[0].id;
  bayIndex = Math.max(0, aisle.bays.findIndex((bay) => bay.id === selectedBayId));
  const bay = getBay();
  if (!bay.lanes.length) bay.lanes.push(makeLane(nextNumber([], "L")));
  if (!selectedLaneId || !bay.lanes.some((lane) => lane.id === selectedLaneId)) selectedLaneId = bay.lanes[0].id;
  const lane = getLane();
  if (!lane.slots.length) lane.slots.push(makeSlot(nextNumber([], "S")));
  if (!selectedSlotCode || !findRealSlot(selectedSlotCode)) {
    selectedSlotCode = locationCode(aisle, bay, lane, lane.slots[0]);
  }
}

function renderMetrics() {
  const slots = allSlots();
  const rows = allSkuRows();
  const counts = slots.reduce(
    (acc, slot) => {
      acc[statusFor(slot)] += 1;
      return acc;
    },
    { healthy: 0, watch: 0, low: 0 }
  );

  els.metricAisles.textContent = state.aisles.length;
  els.metricBays.textContent = state.aisles.reduce((sum, aisle) => sum + aisle.bays.length, 0);
  els.metricSlots.textContent = slots.length;
  els.metricUnits.textContent = formatNumber(rows.reduce((sum, item) => sum + item.qty, 0));
  els.metricHealthy.textContent = counts.healthy;
  els.metricWatch.textContent = counts.watch;
  els.metricLow.textContent = counts.low;
}

function renderAisleSelector() {
  els.aisleSelector.innerHTML = "";
  state.aisles.forEach((aisle) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = aisle.id;
    button.title = `${aisleDisplayName(aisle)} - ${aisle.zone}`;
    button.className = aisle.id === selectedAisleId ? "active" : "";
    button.addEventListener("click", () => {
      selectedAisleId = aisle.id;
      selectedBayId = aisle.bays[Math.min(bayIndex, aisle.bays.length - 1)]?.id || aisle.bays[0]?.id;
      selectedLaneId = getBay()?.lanes[0]?.id;
      selectedSlotCode = getBay()?.lanes[0]?.slots[0] ? locationCode(aisle, getBay(), getBay().lanes[0], getBay().lanes[0].slots[0]) : "";
      render();
    });
    els.aisleSelector.appendChild(button);
  });

  const aisle = getAisle();
  const bay = getBay();
  els.currentBayLabel.textContent = bay ? `${bay.id} ${baySideLabel(bay)}` : "B--";
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
  els.selectedSlotTitle.textContent = slot.code;
  els.selectedSlotStatus.textContent = statusLabel(status);
  els.selectedSlotStatus.className = `status-pill ${status}`;
  els.slotDetail.className = "box-detail";
  els.slotDetail.innerHTML = `
    <div class="location-strip">
      <div><span>Aisle</span><strong>${slot.aisleId}</strong></div>
      <div><span>Bay</span><strong>${slot.bayId}</strong></div>
      <div><span>Row / Box</span><strong>${slot.laneId}.${boxPositionLabel(slot)}</strong></div>
    </div>
    <div class="detail-meta">
      <span>${baySideLabel(slot)}</span>
      <span>Box ${boxPositionLabel(slot)} left-to-right</span>
      <span>${slot.zone}</span>
      <span>${slot.slotType}</span>
    </div>
    <div class="sku-stack">
      ${slot.skus
        .map((item) => {
          const percent = fillPercent(item);
          const itemStatus = statusForPercent(percent);
          return `
            <article class="sku-card">
              <header>
                <div>
                  <h4>${item.sku}</h4>
                  <span class="sku-meta">${item.name}</span>
                </div>
                <span class="status-tag ${itemStatus}">${formatNumber(item.qty)} / ${formatNumber(item.max)}</span>
              </header>
              <div class="stock-bar" style="--fill: ${percent}%; --bar: ${barColor(itemStatus)}"><i></i></div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderMap() {
  const query = els.globalSearch.value.trim();
  els.warehouseMap.innerHTML = "";

  state.aisles.forEach((aisle) => {
    const aisleEl = document.createElement("div");
    aisleEl.className = "map-lane";
    aisleEl.innerHTML = `<div class="map-lane-label">${aisle.id}<small>${aisle.name || aisle.zone}</small></div>`;
    const baysEl = document.createElement("div");
    baysEl.className = "map-bay-sides";

    ["left", "right"].forEach((side) => {
      const sideEl = document.createElement("div");
      sideEl.className = `map-bay-side ${side}`;
      sideEl.innerHTML = `<div class="bay-side-title">${side === "left" ? "Odd bays / left" : "Even bays / right"}</div>`;
      const bayGrid = document.createElement("div");
      bayGrid.className = "map-shelves";

      aisle.bays.filter((bay) => (bay.side || (codeNumber(bay.id) % 2 === 1 ? "left" : "right")) === side).forEach((bay) => {
      const button = document.createElement("button");
      button.type = "button";
      const active = aisle.id === selectedAisleId && bay.id === selectedBayId;
      button.className = `map-shelf${active ? " active" : ""}`;
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
      const units = slots.flatMap((slot) => slot.skus).reduce((sum, item) => sum + item.qty, 0);
      button.innerHTML = `
        <strong>${bay.id}</strong>
        <span class="sku-meta">${baySideLabel(bay)} / ${bay.lanes.length} L / ${DEFAULT_SLOT_COUNT} wide</span>
        <span class="sku-meta">${formatNumber(units)} units</span>
        <span class="mini-boxes">
          ${slots
            .filter((slot) => slot.laneId === selectedLaneId || slot.laneId === bay.lanes[0]?.id)
            .slice(0, DEFAULT_SLOT_COUNT)
            .map((slot) => `<i class="mini-box ${statusFor(slot)}" style="opacity:${slotMatchesSearch(slot, query) ? 1 : 0.18}"></i>`)
            .join("")}
        </span>
      `;
      button.addEventListener("click", () => {
        selectedAisleId = aisle.id;
        selectedBayId = bay.id;
        selectedLaneId = bay.lanes[0]?.id;
        if (bay.lanes[0]?.slots[0]) selectedSlotCode = locationCode(aisle, bay, bay.lanes[0], bay.lanes[0].slots[0]);
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
    const oddBays = aisle.bays.filter((bay) => (bay.side || (codeNumber(bay.id) % 2 === 1 ? "left" : "right")) === "left").length;
    const evenBays = aisle.bays.length - oddBays;
    aisleButton.innerHTML = `
      <strong>${aisle.id}</strong>
      <span>${aisle.name || "No aisle name set"}</span>
      <small>${oddBays} odd left / ${evenBays} even right</small>
      <small>${aisle.bays.length} bays / 6 wide / ${aisleSlots.length} S</small>
      <span class="layout-slot-strip">
        ${aisleSlots
          .slice(0, 32)
          .map((slot) => `<i class="${statusFor(slot)}" style="opacity:${slotMatchesSearch(slot, query) ? 1 : 0.2}"></i>`)
          .join("")}
      </span>
    `;
    aisleButton.addEventListener("pointerdown", startAisleDrag);
    aisleButton.addEventListener("click", () => {
      selectedAisleId = aisle.id;
      selectedBayId = aisle.bays[0]?.id;
      selectedLaneId = aisle.bays[0]?.lanes[0]?.id;
      if (aisle.bays[0]?.lanes[0]?.slots[0]) {
        selectedSlotCode = locationCode(aisle, aisle.bays[0], aisle.bays[0].lanes[0], aisle.bays[0].lanes[0].slots[0]);
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
      <input id="editAisleName" type="text" value="${aisle.name}" placeholder="e.g. Returns, Fast Pick, Footwear" />
    </label>
    <label>
      Zone
      <input id="editAisleZone" type="text" value="${aisle.zone}" />
    </label>
    <label>
      Selected Bay
      <select id="editBaySelect">
        ${aisle.bays.map((item) => `<option value="${item.id}" ${item.id === bay.id ? "selected" : ""}>${item.id} - ${baySideLabel(item)}</option>`).join("")}
      </select>
    </label>
    <div class="structure-stat">
      <span>Bay side</span>
      <strong>${baySideLabel(bay)}</strong>
    </div>
    <label>
      Selected L
      <select id="editLaneSelect">
        ${bay.lanes.map((item) => `<option value="${item.id}" ${item.id === lane.id ? "selected" : ""}>${item.id}</option>`).join("")}
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
    <label>
      S Type
      <select id="editSlotType">
        ${["Box", "Pallet", "Bin", "Empty", "Oversize"].map((type) => `<option ${slot?.type === type ? "selected" : ""}>${type}</option>`).join("")}
      </select>
    </label>
  `;

  document.getElementById("editAisleName").addEventListener("input", (event) => {
    aisle.name = event.target.value;
    saveState();
    renderAisleSelector();
  });
  document.getElementById("editAisleZone").addEventListener("input", (event) => {
    aisle.zone = event.target.value;
    saveState();
    renderAisleSelector();
    renderMap();
    renderWarehouse3d();
  });
  document.getElementById("editBaySelect").addEventListener("change", (event) => {
    selectedBayId = event.target.value;
    selectedLaneId = getBay().lanes[0]?.id;
    const nextLane = getLane();
    if (nextLane?.slots[0]) selectedSlotCode = locationCode(getAisle(), getBay(), nextLane, nextLane.slots[0]);
    render();
  });
  document.getElementById("editLaneSelect").addEventListener("change", (event) => {
    selectedLaneId = event.target.value;
    const nextLane = getLane();
    if (nextLane?.slots[0]) selectedSlotCode = locationCode(getAisle(), getBay(), nextLane, nextLane.slots[0]);
    render();
  });
  document.querySelectorAll(".slot-picker button").forEach((button) => {
    button.addEventListener("click", () => {
      selectSlot(button.dataset.code);
      render();
    });
  });
  document.getElementById("editSlotType").addEventListener("change", (event) => {
    const match = findRealSlot(selectedSlotCode);
    if (!match) return;
    match.slot.type = event.target.value;
    saveState();
    renderSlotDetail();
    renderWarehouse3d();
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
  els.aisleFilter.value = [...state.aisles.map((aisle) => aisle.id), "all"].includes(currentAisle) ? currentAisle : "all";
}

function renderInventoryTable() {
  const query = els.globalSearch.value.trim().toLowerCase();
  const aisleFilter = els.aisleFilter.value || "all";
  const statusFilter = els.statusFilter.value || "all";
  const rowLimit = query || aisleFilter !== "all" || statusFilter !== "all" ? 1200 : 500;

  const rows = allSkuRows().filter((item) => {
    const status = statusFor(item);
    const searchable = [item.sku, item.name, item.code, item.aisleId, item.bayId, item.laneId, item.slotId]
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
    els.inventoryTable.innerHTML = `<tr><td colspan="11" class="no-results">No stock lines match the current filters.</td></tr>`;
    return;
  }

  els.inventoryTable.innerHTML = visibleRows
    .map((item) => {
      const percent = fillPercent(item);
      const status = statusForPercent(percent);
      return `
        <tr>
          <td><strong>${item.code}</strong></td>
          <td>${item.aisleId}</td>
          <td>${item.bayId}</td>
          <td>${item.baySide === "left" ? "Odd / Left" : "Even / Right"}</td>
          <td>${item.laneId}</td>
          <td>${boxPositionLabel(item)}</td>
          <td><strong>${item.sku}</strong></td>
          <td>${item.name}</td>
          <td>${formatNumber(item.qty)}</td>
          <td class="stock-cell">
            <span class="status-tag ${status}">${statusLabel(status)}</span>
            <div class="stock-bar" style="--fill: ${percent}%; --bar: ${barColor(status)}"><i></i></div>
          </td>
          <td><button class="box-action" data-code="${item.code}" type="button">View</button></td>
        </tr>
      `;
    })
    .join("") +
    (rows.length > visibleRows.length
      ? `<tr><td colspan="11" class="no-results">Showing ${formatNumber(visibleRows.length)} of ${formatNumber(rows.length)} stock lines. Use search or filters to narrow the list.</td></tr>`
      : "");

  els.inventoryTable.querySelectorAll(".box-action").forEach((button) => {
    button.addEventListener("click", () => {
      selectSlot(button.dataset.code);
      setView("walkthrough");
      render();
    });
  });
}

function renderAlerts() {
  const alerts = allSkuRows()
    .map((item) => ({ ...item, percent: fillPercent(item), status: statusFor(item) }))
    .filter((item) => item.status !== "healthy")
    .sort((a, b) => a.percent - b.percent)
    .slice(0, 10);

  if (!alerts.length) {
    els.alertList.innerHTML = `<div class="no-results">No replenishment alerts right now.</div>`;
    return;
  }

  els.alertList.innerHTML = alerts
    .map(
      (item) => `
        <article class="alert-card ${item.status}">
          <header>
            <h4>${item.sku}</h4>
            <span class="status-tag ${item.status}">${item.percent}%</span>
          </header>
          <p>${item.name}</p>
          <p>${item.code}</p>
        </article>
      `
    )
    .join("");
}

function renderEmptyBoxes() {
  const emptySlots = allSlots()
    .filter((slot) => totalUnitsForSlot(slot) === 0 || slot.type === "Empty")
    .sort((a, b) => a.code.localeCompare(b.code));

  if (!emptySlots.length) {
    els.emptyBoxList.innerHTML = `<div class="no-results">No empty boxes found. A box appears here when all SKU quantities in that S position are 0 or the S type is set to Empty.</div>`;
    return;
  }

  els.emptyBoxList.innerHTML = `<div class="empty-summary">${formatNumber(emptySlots.length)} empty boxes found</div>` + emptySlots
    .map(
      (slot) => `
        <article class="empty-card">
          <header>
            <h4>${slot.code}</h4>
            <span class="status-tag empty">Empty</span>
          </header>
          <p>${baySideLabel(slot)} / ${slot.laneId} / ${boxPositionLabel(slot)}</p>
          <button class="box-action" data-code="${slot.code}" type="button">View</button>
        </article>
      `
    )
    .join("");

  els.emptyBoxList.querySelectorAll(".box-action").forEach((button) => {
    button.addEventListener("click", () => {
      selectSlot(button.dataset.code);
      setView("walkthrough");
      warehouseMode = "box";
      updateWarehouseModeButtons();
      render();
    });
  });
}

function renderSkuSelect() {
  const selectedSku = els.skuSelect.value;
  let rows = allSkuRows().filter((item) => item.aisleId === selectedAisleId && item.bayId === selectedBayId);
  if (!rows.length) rows = allSkuRows().slice(0, 100);
  rows.sort((a, b) => a.code.localeCompare(b.code));
  els.skuSelect.innerHTML = rows
    .map((item) => `<option value="${item.code}|${item.sku}">${item.code} / ${item.sku} (${item.qty})</option>`)
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
  item.qty = Math.max(0, Math.min(item.max, item.qty + delta));
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
  const max = collection.reduce((highest, item) => Math.max(highest, codeNumber(item.id)), 0);
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
  selectedSlotCode = locationCode(aisle, aisle.bays[0], aisle.bays[0].lanes[0], aisle.bays[0].lanes[0].slots[0]);
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
  els.navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === view));
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
  els.warehouse3d.className = `warehouse-3d mode-${warehouseMode}`;
  els.warehouse3d.innerHTML = renderers[warehouseMode]();
  bindWarehouse3dActions();
}

function renderWarehouseOverview() {
  const slots = allSlots();
  return `
    <div class="warehouse-perspective overview-perspective">
      ${state.aisles.map((aisle) => {
        const aisleSlots = slots.filter((slot) => slot.aisleId === aisle.id);
        const summary = stockSummaryForSlots(aisleSlots);
        const low = aisleSlots.filter((slot) => statusFor(slot) === "low").length;
        return `
          <button type="button" class="wh-aisle-card ${summary.status} ${aisle.id === selectedAisleId ? "selected" : ""}" data-aisle-id="${aisle.id}">
            <span class="wh-aisle-title">${aisle.id}</span>
            <span class="wh-aisle-sub">${aisle.name || aisle.zone}</span>
            <span class="wh-rack-pair">
              <i></i><i></i>
            </span>
            <span class="wh-aisle-meta">${summary.percent}% full / ${low} low</span>
          </button>
        `;
      }).join("")}
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
        ${aisle.bays.map((bay) => `<button type="button" class="bay-floor-marker ${bay.id === selectedBayId ? "selected" : ""}" data-bay-id="${bay.id}">${bay.id}</button>`).join("")}
      </div>
      <div class="rack-wall right-wall">
        ${renderBayWall(aisle, "right")}
      </div>
    </div>
  `;
}

function renderBayWall(aisle, side) {
  return aisle.bays
    .filter((bay) => (bay.side || (codeNumber(bay.id) % 2 === 1 ? "left" : "right")) === side)
    .map((bay) => {
      const slots = bay.lanes.flatMap((lane) => lane.slots.map((slot) => ({
        ...slot,
        code: locationCode(aisle, bay, lane, slot),
        aisleId: aisle.id,
        bayId: bay.id,
        baySide: side,
        laneId: lane.id,
        slotId: slot.id
      })));
      const summary = stockSummaryForSlots(slots);
      return `
        <button type="button" class="rack-bay ${summary.status} ${bay.id === selectedBayId ? "selected" : ""}" data-bay-id="${bay.id}">
          <span>${bay.id}</span>
          <span class="rack-bay-boxes">${slots.slice(0, 18).map((slot) => `<i class="${statusFor(slot)}"></i>`).join("")}</span>
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
        <span>${baySideLabel(bay)} / shelf rows ${bay.lanes[0]?.id} to ${bay.lanes[bay.lanes.length - 1]?.id}</span>
      </div>
      <div class="row-rack">
        ${bay.lanes.slice().reverse().map((lane) => `
          ${(() => {
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
          <button type="button" class="shelf-row ${summary.status} ${lane.id === selectedLaneId ? "selected" : ""}" data-lane-id="${lane.id}">
            <span class="shelf-row-label">${lane.id}</span>
            <span class="shelf-row-boxes">
              ${laneSlots.map((slot) => {
                return `<i class="${statusFor(slot)} ${slot.code === selectedSlotCode ? "selected" : ""}" data-code="${slot.code}">${boxPositionLabel(slot)}</i>`;
              }).join("")}
            </span>
          </button>
            `;
          })()}
        `).join("")}
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
        <span>Boxes are left-to-right: S1, S2, S3, S4, S5, S6</span>
      </div>
      <div class="box-line">
        ${lane.slots.map((slot) => {
          const code = locationCode(aisle, bay, lane, slot);
          const slotInfo = { ...slot, code, aisleId: aisle.id, bayId: bay.id, laneId: lane.id, slotId: slot.id };
          const percent = fillPercent(slotInfo);
          return `
            <button type="button" class="box-position ${statusFor(slotInfo)} ${code === selectedSlotCode ? "selected" : ""}" data-code="${code}">
              <strong>${boxPositionLabel(slot)}</strong>
              <span>${slot.id}</span>
              <em style="--fill:${percent}%"></em>
            </button>
          `;
        }).join("")}
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
      if (aisle.bays[0]?.lanes[0]?.slots[0]) selectedSlotCode = locationCode(aisle, aisle.bays[0], aisle.bays[0].lanes[0], aisle.bays[0].lanes[0].slots[0]);
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
      if (bay.lanes[0]?.slots[0]) selectedSlotCode = locationCode(aisle, bay, bay.lanes[0], bay.lanes[0].slots[0]);
      warehouseMode = "row";
      updateWarehouseModeButtons();
      render();
    });
  });
  els.warehouse3d.querySelectorAll("[data-lane-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedLaneId = button.dataset.laneId;
      const lane = getLane();
      if (lane.slots[0]) selectedSlotCode = locationCode(getAisle(), getBay(), lane, lane.slots[0]);
      warehouseMode = "box";
      updateWarehouseModeButtons();
      render();
    });
  });
  els.warehouse3d.querySelectorAll("[data-code]").forEach((button) => {
    button.addEventListener("click", () => {
      selectSlot(button.dataset.code);
      warehouseMode = "box";
      updateWarehouseModeButtons();
      render();
    });
  });
}

els.navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setView(button.dataset.view);
    render();
  });
});

function updateWarehouseModeButtons() {
  els.warehouseModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.warehouseMode === warehouseMode);
  });
}

els.warehouseModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    warehouseMode = button.dataset.warehouseMode;
    updateWarehouseModeButtons();
    renderWarehouse3d();
  });
});

els.prevBayButton.addEventListener("click", () => {
  const aisle = getAisle();
  bayIndex = Math.max(0, bayIndex - 1);
  selectedBayId = aisle.bays[bayIndex].id;
  const bay = getBay();
  selectedLaneId = bay.lanes[0]?.id;
  if (bay.lanes[0]?.slots[0]) selectedSlotCode = locationCode(aisle, bay, bay.lanes[0], bay.lanes[0].slots[0]);
  render();
});

els.nextBayButton.addEventListener("click", () => {
  const aisle = getAisle();
  bayIndex = Math.min(aisle.bays.length - 1, bayIndex + 1);
  selectedBayId = aisle.bays[bayIndex].id;
  const bay = getBay();
  selectedLaneId = bay.lanes[0]?.id;
  if (bay.lanes[0]?.slots[0]) selectedSlotCode = locationCode(aisle, bay, bay.lanes[0], bay.lanes[0].slots[0]);
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
  state = makeInitialState();
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
