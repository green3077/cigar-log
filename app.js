// 시가 다이어리 메인 앱 로직
(() => {
  const GEMINI_KEY_STORAGE = "cigarlog_gemini_key";

  let currentPhotoFile = null;
  let currentLat = null;
  let currentLon = null;
  let editingId = null;
  let addMap = null, addMarker = null;
  let detailMap = null;

  const $ = (id) => document.getElementById(id);

  // ---------- 탭 네비게이션 ----------
  function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(screenId).classList.add("active");
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.screen === screenId);
    });
    if (screenId === "screen-log") renderLogList();
    if (screenId === "screen-settings") refreshSettingsInfo();
  }

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => showScreen(btn.dataset.screen));
  });

  $("btnBackToLog").addEventListener("click", () => showScreen("screen-log"));

  // ---------- 사진 선택 (촬영 / 갤러리) ----------
  // 휴대폰 사진은 원본이 매우 클 수 있어, 저장공간과 API 전송량을 줄이기 위해 리사이즈한다.
  async function preparePhotoFile(file) {
    if (!file || !file.type.startsWith("image/")) throw new Error("이미지 파일만 선택할 수 있습니다.");
    if (file.size > 12 * 1024 * 1024) throw new Error("이미지는 12MB 이하만 사용할 수 있습니다.");
    const bitmap = await createImageBitmap(file);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob || file;
  }

  async function handlePhotoFile(file) {
    if (!file) return;
    try {
      currentPhotoFile = await preparePhotoFile(file);
      const url = URL.createObjectURL(currentPhotoFile);
      $("photoPreview").src = url;
      $("photoPreview").classList.remove("hidden");
      $("photoPlaceholder").classList.add("hidden");
      $("btnAnalyze").disabled = false;
      $("analyzeStatus").textContent = "";
    } catch (err) {
      currentPhotoFile = null;
      $("btnAnalyze").disabled = true;
      $("analyzeStatus").textContent = "❌ " + err.message;
    }
  }
  $("btnTakePhoto").addEventListener("click", () => $("cameraInput").click());
  $("btnPickPhoto").addEventListener("click", () => $("galleryInput").click());
  $("cameraInput").addEventListener("change", (e) => handlePhotoFile(e.target.files[0]));
  $("galleryInput").addEventListener("change", (e) => handlePhotoFile(e.target.files[0]));

  // AI가 실패했을 때 현재 입력된 브랜드/라인 텍스트로 로컬 DB 검색을 자동으로 시도
  function tryDbFallback() {
    const brand = $("fBrand").value.trim();
    const line = $("fLine").value.trim();
    if (!brand && !line) return null;
    const dbMatch = findCigarInDB(brand, line);
    if (!dbMatch) return null;
    fillDbInfo(dbMatch, { overwrite: false, includeOriginWrapper: true });
    return dbMatch;
  }

  // ---------- AI 분석 (Gemini) ----------
  $("btnAnalyze").addEventListener("click", async () => {
    const apiKey = localStorage.getItem(GEMINI_KEY_STORAGE) || "";
    if (!currentPhotoFile) return;
    if (!apiKey) {
      const dbMatch = tryDbFallback();
      $("analyzeStatus").textContent = dbMatch
        ? `⚠️ Gemini API 키가 없어 DB 매칭으로 대체했습니다: ${dbMatch.brandKo} ${dbMatch.line}`
        : "⚠️ 설정 탭에서 Google Gemini API 키를 먼저 입력해주세요.";
      if (!dbMatch) showScreen("screen-settings");
      return;
    }
    $("btnAnalyze").disabled = true;
    $("analyzeStatus").textContent = "AI가 사진을 분석하고 있습니다...";
    try {
      const result = await CigarAI.analyzeImage(apiKey, currentPhotoFile);
      applyAiResult(result);
      if (result.isReceipt) {
        $("analyzeStatus").textContent = "✅ 영수증으로 인식했습니다. 내용을 확인해주세요.";
      } else {
        $("analyzeStatus").textContent = `✅ 분석 완료 (인식 확신도 ${result.confidence ?? "?"}%). 가격을 자동 검색하고 있습니다...`;
        await runPriceSearch(apiKey, { silentIfMissing: true });
        $("analyzeStatus").textContent = `✅ 분석 완료 (인식 확신도 ${result.confidence ?? "?"}%). 내용을 확인/수정해주세요.`;
      }
    } catch (err) {
      console.error(err);
      const dbMatch = tryDbFallback();
      $("analyzeStatus").textContent = dbMatch
        ? `⚠️ AI 분석 실패로 DB 매칭으로 대체했습니다: ${dbMatch.brandKo} ${dbMatch.line} (${err.message})`
        : "❌ " + err.message + " — 브랜드/라인을 직접 입력하면 DB에서 자동으로 찾아드립니다.";
    } finally {
      $("btnAnalyze").disabled = false;
    }
  });

  // DB 매칭 정보를 폼에 채워넣기. overwrite=false면 비어있는 필드만 채움 (AI 분석 결과를 덮어쓰지 않기 위함)
  function fillDbInfo(dbMatch, { overwrite = true, includeOriginWrapper = true } = {}) {
    const setIfNeeded = (id, value) => {
      if (!value) return;
      if (overwrite || !$(id).value || $(id).value === "0") $(id).value = value;
    };
    if (includeOriginWrapper) {
      setIfNeeded("fOrigin", dbMatch.origin);
      setIfNeeded("fWrapper", dbMatch.wrapper);
    }
    setIfNeeded("fStrength", String(dbMatch.strength));
    setIfNeeded("fRating", `${dbMatch.rating} / 100 (참고치, DB 매칭: ${dbMatch.brandKo} ${dbMatch.line})`);
    setIfNeeded("fPrice", formatPriceRange(dbMatch.priceKRW));
    setIfNeeded("fNotes", dbMatch.notes);
  }

  // 가격 검색 공통 로직: 수동 버튼과 AI 분석 성공 후 자동 호출 양쪽에서 재사용
  async function runPriceSearch(apiKey, { silentIfMissing = false } = {}) {
    const brand = $("fBrand").value.trim();
    const line = $("fLine").value.trim();
    if (!brand && !line) {
      if (!silentIfMissing) $("priceSearchStatus").textContent = "⚠️ 브랜드나 라인을 먼저 입력해주세요.";
      return;
    }
    $("btnPriceSearch").disabled = true;
    $("priceSearchStatus").textContent = "AI가 온라인 판매가를 검색하고 있습니다...";
    try {
      const r = await CigarAI.searchPrice(apiKey, brand, line);
      const existing = $("fPrice").value.trim();
      const tag = r.wasSearched ? "[AI 검색]" : "[AI 추정]";
      const addition = `${tag} ${r.text.replace(/\s*\n+\s*/g, " ")}`;
      $("fPrice").value = existing ? `${existing} · ${addition}` : addition;
      const sourceNote = r.sources.length
        ? " 출처: " + r.sources.map((s) => s.title || s.uri).join(", ")
        : r.wasSearched
        ? ""
        : " (실시간 검색 할당량 초과로 AI 지식 기반 추정치를 대신 사용했습니다)";
      $("priceSearchStatus").textContent = "✅ 결과를 가격 칸에 추가했습니다." + sourceNote;
    } catch (err) {
      console.error(err);
      $("priceSearchStatus").textContent = "❌ 검색 실패: " + err.message;
    } finally {
      $("btnPriceSearch").disabled = false;
    }
  }

  $("btnPriceSearch").addEventListener("click", async () => {
    const apiKey = localStorage.getItem(GEMINI_KEY_STORAGE) || "";
    if (!apiKey) {
      $("priceSearchStatus").textContent = "⚠️ 설정 탭에서 Google Gemini API 키를 먼저 입력해주세요.";
      showScreen("screen-settings");
      return;
    }
    await runPriceSearch(apiKey);
  });

  function applyAiResult(r) {
    if (r.brand) $("fBrand").value = r.brand;
    if (r.line) $("fLine").value = r.line;
    if (r.origin) $("fOrigin").value = r.origin;
    if (r.wrapper) $("fWrapper").value = r.wrapper;
    if (r.strength) $("fStrength").value = String(r.strength);
    if (r.tastingNotes) $("fNotes").value = r.tastingNotes;

    const dbMatch = findCigarInDB(r.brand, r.line);
    if (dbMatch) fillDbInfo(dbMatch, { overwrite: false, includeOriginWrapper: false });
    let price = $("fPrice").value;
    if (r.isReceipt && r.receiptPrice && !price) price = r.receiptPrice;
    if (r.expertOpinion) {
      $("fNotes").value = ($("fNotes").value ? $("fNotes").value + "\n\n" : "") + "[AI 코멘트] " + r.expertOpinion;
    }
    if (r.isReceipt && r.receiptStoreName) {
      $("fMemo").value = ($("fMemo").value ? $("fMemo").value + "\n" : "") + `구매처: ${r.receiptStoreName}`;
    }
    $("fPrice").value = price;
  }

  // ---------- 위치 ----------
  $("btnGeo").addEventListener("click", () => {
    if (!navigator.geolocation) {
      $("fLocationText").placeholder = "이 브라우저는 위치 기능을 지원하지 않습니다. 직접 입력해주세요.";
      return;
    }
    $("btnGeo").disabled = true;
    $("btnGeo").textContent = "위치 확인 중...";
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        currentLat = pos.coords.latitude;
        currentLon = pos.coords.longitude;
        showMap("mapPreview", currentLat, currentLon, false);
        $("btnGeo").textContent = "📍 현재 위치 가져오기";
        $("btnGeo").disabled = false;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${currentLat}&lon=${currentLon}&accept-language=ko`
          );
          const data = await res.json();
          if (data && data.display_name) $("fLocationText").value = data.display_name;
        } catch (e) {
          // 역지오코딩 실패 시 위경도만 표시
          $("fLocationText").value = `위도 ${currentLat.toFixed(5)}, 경도 ${currentLon.toFixed(5)}`;
        }
      },
      (err) => {
        $("btnGeo").textContent = "📍 현재 위치 가져오기";
        $("btnGeo").disabled = false;
        $("fLocationText").placeholder = "위치를 가져올 수 없습니다 (" + err.message + "). 직접 입력해주세요.";
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  function showMap(elId, lat, lon, isDetail) {
    const el = $(elId);
    el.classList.remove("hidden");
    if (isDetail) {
      if (detailMap) { detailMap.remove(); detailMap = null; }
      detailMap = L.map(elId).setView([lat, lon], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(detailMap);
      L.marker([lat, lon]).addTo(detailMap);
      setTimeout(() => detailMap.invalidateSize(), 100);
    } else {
      if (!addMap) {
        addMap = L.map(elId).setView([lat, lon], 15);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(addMap);
        addMarker = L.marker([lat, lon], { draggable: true }).addTo(addMap);
        addMarker.on("dragend", () => {
          const p = addMarker.getLatLng();
          currentLat = p.lat;
          currentLon = p.lng;
        });
      } else {
        addMap.setView([lat, lon], 15);
        addMarker.setLatLng([lat, lon]);
      }
      setTimeout(() => addMap.invalidateSize(), 100);
    }
  }

  // ---------- 저장 ----------
  function defaultDateValue() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }
  $("fDate").value = defaultDateValue();

  $("btnSave").addEventListener("click", async () => {
    if (!currentPhotoFile && !editingId) {
      $("saveStatus").textContent = "⚠️ 사진을 먼저 등록해주세요.";
      return;
    }
    const brand = $("fBrand").value.trim();
    const line = $("fLine").value.trim();
    const smokedAt = $("fDate").value || defaultDateValue();
    if (!brand && !line) {
      $("saveStatus").textContent = "⚠️ 브랜드 또는 라인을 입력해주세요.";
      return;
    }
    if (Number.isNaN(new Date(smokedAt).getTime())) {
      $("saveStatus").textContent = "⚠️ 날짜를 확인해주세요.";
      return;
    }
    const entry = {
      brand,
      line,
      origin: $("fOrigin").value.trim(),
      wrapper: $("fWrapper").value.trim(),
      strength: Number($("fStrength").value) || 0,
      rating: $("fRating").value.trim(),
      notes: $("fNotes").value.trim(),
      priceText: $("fPrice").value.trim(),
      smokedAt,
      locationText: $("fLocationText").value.trim(),
      lat: currentLat,
      lon: currentLon,
      memo: $("fMemo").value.trim()
    };
    if (currentPhotoFile) entry.photo = currentPhotoFile;

    try {
      if (editingId) {
        await CigarStore.updateEntry(editingId, entry);
        $("saveStatus").textContent = "✅ 수정되었습니다.";
      } else {
        await CigarStore.addEntry(entry);
        $("saveStatus").textContent = "✅ 저장되었습니다.";
      }
      const savedId = editingId;
      resetForm();
      setTimeout(() => {
        showScreen("screen-log");
        if (savedId) showDetail(savedId);
      }, 400);
    } catch (err) {
      console.error(err);
      $("saveStatus").textContent = "❌ 저장 실패: " + err.message;
    }
  });

  function resetForm() {
    editingId = null;
    currentPhotoFile = null;
    currentLat = null;
    currentLon = null;
    $("cameraInput").value = "";
    $("galleryInput").value = "";
    $("photoPreview").classList.add("hidden");
    $("photoPlaceholder").classList.remove("hidden");
    $("btnAnalyze").disabled = true;
    $("analyzeStatus").textContent = "";
    ["fBrand", "fLine", "fOrigin", "fWrapper", "fRating", "fNotes", "fPrice", "fLocationText", "fMemo"].forEach((id) => ($(id).value = ""));
    $("fStrength").value = "0";
    $("fDate").value = defaultDateValue();
    $("mapPreview").classList.add("hidden");
    $("saveStatus").textContent = "";
  }

  // ---------- 내 기록 목록 ----------
  function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  function dateKey(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
  }

  async function renderLogList() {
    const list = $("logList");
    const entries = await CigarStore.getAllEntries();
    $("logSummary").textContent = `총 ${entries.length}개의 기록`;
    if (entries.length === 0) {
      list.innerHTML = `<div class="empty-state">아직 기록이 없습니다.<br>➕ 기록 탭에서 첫 시가를 등록해보세요.</div>`;
      return;
    }
    const sortMode = $("sortMode").value;
    const groupMode = $("groupMode").value;
    entries.sort((a, b) => {
      const t = new Date(a.smokedAt) - new Date(b.smokedAt);
      return sortMode === "desc" ? -t : t;
    });

    let html = "";
    if (groupMode === "none") {
      html = entries.map(entryCardHtml).join("");
    } else {
      const groups = new Map();
      for (const e of entries) {
        const key = groupMode === "date" ? dateKey(e.smokedAt) : (e.brand || "브랜드 미상");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(e);
      }
      for (const [key, items] of groups) {
        html += `<div class="group-heading">${escapeHtml(key)} <span style="color:var(--text-dim);font-weight:400;">(${items.length})</span></div>`;
        html += items.map(entryCardHtml).join("");
      }
    }
    list.innerHTML = html;

    list.querySelectorAll("[data-entry-id]").forEach((card) => {
      card.addEventListener("click", () => showDetail(card.dataset.entryId));
    });
    // 썸네일 이미지 로드
    for (const e of entries) {
      if (e.photo) {
        const img = list.querySelector(`img[data-thumb-id="${e.id}"]`);
        if (img) img.src = URL.createObjectURL(e.photo);
      }
    }
  }

  function entryCardHtml(e) {
    const title = [e.brand, e.line].filter(Boolean).join(" ") || "이름 미상 시가";
    const strengthLabel = e.strength ? STRENGTH_LABELS[e.strength] : null;
    return `
      <div class="entry-card" data-entry-id="${e.id}">
        <img class="entry-thumb" data-thumb-id="${e.id}" />
        <div class="entry-info">
          <div class="entry-title">${escapeHtml(title)}</div>
          <div class="entry-sub">${fmtDate(e.smokedAt)}${e.locationText ? " · " + escapeHtml(truncate(e.locationText, 20)) : ""}</div>
          <div class="entry-badges">
            ${strengthLabel ? `<span class="badge">${strengthLabel}</span>` : ""}
            ${e.priceText ? `<span class="badge">${escapeHtml(e.priceText)}</span>` : ""}
          </div>
        </div>
      </div>`;
  }

  $("sortMode").addEventListener("change", renderLogList);
  $("groupMode").addEventListener("change", renderLogList);

  // ---------- 상세 보기 ----------
  let deleteArmed = false;
  async function showDetail(id) {
    const e = await CigarStore.getEntry(id);
    if (!e) return;
    showScreen("screen-detail");
    deleteArmed = false;
    const title = [e.brand, e.line].filter(Boolean).join(" ") || "이름 미상 시가";
    const photoUrl = e.photo ? URL.createObjectURL(e.photo) : "";

    $("detailContent").innerHTML = `
      ${photoUrl ? `<img class="detail-photo" src="${photoUrl}" />` : ""}
      <h2>${escapeHtml(title)}</h2>
      <div class="detail-row"><span class="detail-label">피운 날짜</span><span>${fmtDate(e.smokedAt)}</span></div>
      ${e.origin ? `<div class="detail-row"><span class="detail-label">원산지</span><span>${escapeHtml(e.origin)}</span></div>` : ""}
      ${e.wrapper ? `<div class="detail-row"><span class="detail-label">래퍼</span><span>${escapeHtml(e.wrapper)}</span></div>` : ""}
      ${e.strength ? `<div class="detail-row"><span class="detail-label">강도</span><span>${STRENGTH_LABELS[e.strength]}</span></div>` : ""}
      ${e.rating ? `<div class="detail-row"><span class="detail-label">전문가 평점</span><span>${escapeHtml(e.rating)}</span></div>` : ""}
      ${e.priceText ? `<div class="detail-row"><span class="detail-label">참고 가격</span><span>${escapeHtml(e.priceText)}</span></div>` : ""}
      ${e.locationText ? `<div class="detail-row"><span class="detail-label">장소</span><span>${escapeHtml(e.locationText)}</span></div>` : ""}
      ${e.notes ? `<div class="detail-notes"><strong>테이스팅 노트</strong><br>${escapeHtml(e.notes).replace(/\n/g, "<br>")}</div>` : ""}
      ${e.memo ? `<div class="detail-notes"><strong>메모</strong><br>${escapeHtml(e.memo).replace(/\n/g, "<br>")}</div>` : ""}
      <div id="detailMap" class="map-box ${e.lat ? "" : "hidden"}" style="margin-top:14px;"></div>
      <button id="btnEditEntry" class="btn btn-secondary" style="margin-top:14px;">✏️ 수정</button>
      <button id="btnDeleteEntry" class="btn btn-danger">🗑️ 삭제</button>
    `;

    if (e.lat && e.lon) showMap("detailMap", e.lat, e.lon, true);

    $("btnEditEntry").addEventListener("click", () => loadEntryIntoForm(e));
    $("btnDeleteEntry").addEventListener("click", async (ev) => {
      if (!deleteArmed) {
        deleteArmed = true;
        ev.target.textContent = "정말 삭제할까요? 한 번 더 탭하세요";
        setTimeout(() => { deleteArmed = false; if (ev.target) ev.target.textContent = "🗑️ 삭제"; }, 3000);
        return;
      }
      await CigarStore.deleteEntry(id);
      showScreen("screen-log");
    });
  }

  function loadEntryIntoForm(e) {
    editingId = e.id;
    currentPhotoFile = e.photo || null;
    currentLat = e.lat || null;
    currentLon = e.lon || null;
    $("fBrand").value = e.brand || "";
    $("fLine").value = e.line || "";
    $("fOrigin").value = e.origin || "";
    $("fWrapper").value = e.wrapper || "";
    $("fStrength").value = String(e.strength || 0);
    $("fRating").value = e.rating || "";
    $("fNotes").value = e.notes || "";
    $("fPrice").value = e.priceText || "";
    $("fDate").value = e.smokedAt || defaultDateValue();
    $("fLocationText").value = e.locationText || "";
    $("fMemo").value = e.memo || "";
    if (e.photo) {
      $("photoPreview").src = URL.createObjectURL(e.photo);
      $("photoPreview").classList.remove("hidden");
      $("photoPlaceholder").classList.add("hidden");
      $("btnAnalyze").disabled = false;
    }
    if (e.lat && e.lon) showMap("mapPreview", e.lat, e.lon, false);
    showScreen("screen-add");
  }

  // ---------- 설정 ----------
  $("fGeminiKey").value = localStorage.getItem(GEMINI_KEY_STORAGE) || "";
  $("btnSaveKey").addEventListener("click", () => {
    localStorage.setItem(GEMINI_KEY_STORAGE, $("fGeminiKey").value.trim());
    $("keyStatus").textContent = "✅ 저장되었습니다. 다음부터는 다시 입력할 필요 없이 자동으로 사용됩니다.";
    setTimeout(() => ($("keyStatus").textContent = ""), 3000);
  });

  let clearArmed = false;
  $("btnClearAll").addEventListener("click", async (ev) => {
    if (!clearArmed) {
      clearArmed = true;
      ev.target.textContent = "정말 전체 삭제할까요? 한 번 더 탭하세요";
      setTimeout(() => { clearArmed = false; ev.target.textContent = "전체 기록 삭제"; }, 3000);
      return;
    }
    const entries = await CigarStore.getAllEntries();
    for (const e of entries) await CigarStore.deleteEntry(e.id);
    ev.target.textContent = "전체 기록 삭제";
    refreshSettingsInfo();
  });

  async function refreshSettingsInfo() {
    const entries = await CigarStore.getAllEntries();
    $("entryCount").textContent = entries.length;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function truncate(s, n) {
    return s.length > n ? s.slice(0, n) + "…" : s;
  }

  refreshSettingsInfo();
})();
