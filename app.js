// 시가 다이어리 메인 앱 로직
(() => {
  let currentPhotoFile = null;
  let currentMemoPhotos = []; // [{ blob: Blob, driveId: string|null }] - 같이 있던 사람/장소 사진 (여러 장)
  let currentLat = null;
  let currentLon = null;
  let currentWeather = null; // { max, min } (섭씨), 위치+날짜 확정 시 조회됨
  let weatherFetchToken = 0; // 위치/날짜가 빠르게 바뀔 때 오래된 응답이 최신 상태를 덮어쓰지 않도록 함
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

  // ---------- 안드로이드 하드웨어 뒤로가기 ----------
  // 기본 동작은 웹뷰 히스토리가 없으면 바로 앱을 종료시키는데, 대신 "내 기록" 화면으로 이동시키고
  // 이미 "내 기록"에 있을 때만 앱을 종료한다. capacitor-app.js는 www/(안드로이드 빌드)에만
  // 주입되므로 (build-android-www.sh), 웹 배포판에서는 window.capacitorApp이 없어 아무 동작도 하지 않는다.
  if (window.capacitorApp && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
    capacitorApp.App.addListener("backButton", () => {
      const active = document.querySelector(".screen.active");
      const activeId = active ? active.id : null;
      if (activeId === "screen-log") {
        capacitorApp.App.exitApp();
      } else {
        showScreen("screen-log");
      }
    });
  }

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
      // 사진 파일 자체의 촬영/생성 시각(EXIF, lastModified 등)이 아니라
      // 실제로 앱에서 사진을 찍거나 업로드한 지금 이 순간을 기록 시각으로 사용한다.
      // (편집 중인 기존 기록의 사진만 교체하는 경우는 원래 smokedAt을 건드리지 않는다.)
      if (!editingId) {
        $("fDate").value = defaultDateValue();
        refreshWeather();
      }
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

  // ---------- 사진 원본 크게 보기 (썸네일 탭 시) ----------
  function openLightbox(url) {
    $("lightboxImg").src = url;
    $("photoLightbox").classList.remove("hidden");
  }
  $("photoLightbox").addEventListener("click", () => {
    $("photoLightbox").classList.add("hidden");
    $("lightboxImg").src = "";
  });

  // ---------- 메모용 사진 (같이 있던 사람 / 장소, 여러 장) ----------
  function renderMemoPhotos() {
    const wrap = $("memoPhotosList");
    wrap.innerHTML = "";
    currentMemoPhotos.forEach((p, idx) => {
      const item = document.createElement("div");
      item.className = "memo-photo-item";
      const img = document.createElement("img");
      img.src = URL.createObjectURL(p.blob);
      img.addEventListener("click", () => openLightbox(img.src));
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "memo-photo-remove";
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => {
        currentMemoPhotos.splice(idx, 1);
        renderMemoPhotos();
      });
      item.appendChild(img);
      item.appendChild(removeBtn);
      wrap.appendChild(item);
    });
    wrap.classList.toggle("hidden", currentMemoPhotos.length === 0);
  }

  async function handleMemoPhotoFiles(fileList) {
    $("memoPhotoStatus").textContent = "";
    for (const file of Array.from(fileList || [])) {
      try {
        const blob = await preparePhotoFile(file);
        currentMemoPhotos.push({ blob, driveId: null });
      } catch (err) {
        console.error(err);
        $("memoPhotoStatus").textContent = "❌ " + err.message;
      }
    }
    renderMemoPhotos();
  }
  $("btnMemoTakePhoto").addEventListener("click", () => $("memoCameraInput").click());
  $("btnMemoPickPhoto").addEventListener("click", () => $("memoGalleryInput").click());
  $("memoCameraInput").addEventListener("change", (e) => {
    handleMemoPhotoFiles(e.target.files);
    e.target.value = "";
  });
  $("memoGalleryInput").addEventListener("change", (e) => {
    handleMemoPhotoFiles(e.target.files);
    e.target.value = "";
  });

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
    if (!currentPhotoFile) return;
    $("btnAnalyze").disabled = true;
    $("analyzeStatus").textContent = "AI가 사진을 분석하고 있습니다...";
    try {
      const result = await CigarAI.analyzeImage(currentPhotoFile);
      applyAiResult(result);
      if (result.isReceipt) {
        $("analyzeStatus").textContent = "✅ 영수증으로 인식했습니다. 내용을 확인해주세요.";
      } else {
        $("analyzeStatus").textContent = `✅ 분석 완료 (인식 확신도 ${result.confidence ?? "?"}%). 가격을 자동 검색하고 있습니다...`;
        await runPriceSearch({ silentIfMissing: true });
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

  // 가격 검색: 사진 분석 성공 후 자동으로만 호출됨 (해외 사이트 달러 가격을 간단히 표시)
  async function runPriceSearch({ silentIfMissing = false } = {}) {
    const brand = $("fBrand").value.trim();
    const line = $("fLine").value.trim();
    if (!brand && !line) {
      if (!silentIfMissing) $("priceSearchStatus").textContent = "⚠️ 브랜드나 라인을 먼저 입력해주세요.";
      return;
    }
    $("priceSearchStatus").textContent = "해외 판매가를 검색하고 있습니다...";
    try {
      const r = await CigarAI.searchPrice(brand, line);
      const priceText = r.text.trim();
      if (priceText && priceText !== "정보 없음") {
        $("fPrice").value = priceText + " (개당, 해외 사이트 기준)";
        $("priceSearchStatus").textContent = "✅ 가격을 찾았습니다.";
      } else {
        $("priceSearchStatus").textContent = "해외 판매가 정보를 찾지 못했습니다.";
      }
    } catch (err) {
      console.error(err);
      $("priceSearchStatus").textContent = "❌ 검색 실패: " + err.message;
    }
  }

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
        refreshWeather();
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
          refreshWeather();
        });
      } else {
        addMap.setView([lat, lon], 15);
        addMarker.setLatLng([lat, lon]);
      }
      setTimeout(() => addMap.invalidateSize(), 100);
    }
  }

  // ---------- 날씨 ----------
  // "datetime-local" 값(YYYY-MM-DDTHH:mm)에서 날짜 부분만 뽑는다.
  function dateOnly(datetimeLocalValue) {
    return (datetimeLocalValue || "").slice(0, 10);
  }

  async function refreshWeather() {
    const dateStr = dateOnly($("fDate").value);
    if (currentLat == null || currentLon == null || !dateStr) return;
    const token = ++weatherFetchToken;
    $("weatherStatus").textContent = "🌡️ 날씨 조회 중...";
    try {
      const w = await WeatherAPI.fetchDailyMinMax(currentLat, currentLon, dateStr);
      if (token !== weatherFetchToken) return; // 그 사이 위치/날짜가 바뀜
      currentWeather = w;
      renderWeatherStatus();
    } catch (err) {
      if (token !== weatherFetchToken) return;
      currentWeather = null;
      $("weatherStatus").textContent = "🌡️ 날씨 조회 실패";
    }
  }

  function renderWeatherStatus() {
    if (!currentWeather) {
      $("weatherStatus").textContent = "";
      return;
    }
    const cond = currentWeather.condition;
    const condText = cond ? `${cond.icon} ${cond.text} · ` : "";
    const sourceText = currentWeather.station ? ` (기상청 ${currentWeather.station} 관측소 실측)` : " (추정치)";
    $("weatherStatus").textContent =
      `${condText}🌡️ 최저 ${currentWeather.min}°C / 최고 ${currentWeather.max}°C${sourceText}`;
  }

  $("fDate").addEventListener("change", refreshWeather);

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
      weatherMax: currentWeather ? currentWeather.max : null,
      weatherMin: currentWeather ? currentWeather.min : null,
      weatherConditionText: currentWeather && currentWeather.condition ? currentWeather.condition.text : null,
      weatherConditionIcon: currentWeather && currentWeather.condition ? currentWeather.condition.icon : null,
      weatherStation: currentWeather ? currentWeather.station || null : null,
      memo: $("fMemo").value.trim(),
      memoPhotos: currentMemoPhotos
    };
    if (currentPhotoFile) entry.photo = currentPhotoFile;

    try {
      let savedId;
      if (editingId) {
        await CigarStore.updateEntry(editingId, entry);
        savedId = editingId;
        $("saveStatus").textContent = "✅ 수정되었습니다.";
      } else {
        savedId = await CigarStore.addEntry(entry);
        $("saveStatus").textContent = "✅ 저장되었습니다.";
      }
      if (DriveBackup.isSignedIn()) {
        $("saveStatus").textContent += " (드라이브에 백업 중...)";
        runFullDriveBackup().then((ok) => {
          $("saveStatus").textContent = $("saveStatus").textContent.replace(
            " (드라이브에 백업 중...)",
            ok ? " (드라이브 백업 완료)" : " (드라이브 백업 실패)"
          );
        });
      }
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
    currentMemoPhotos = [];
    renderMemoPhotos();
    $("memoCameraInput").value = "";
    $("memoGalleryInput").value = "";
    $("memoPhotoStatus").textContent = "";
    currentLat = null;
    currentLon = null;
    currentWeather = null;
    $("weatherStatus").textContent = "";
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
            ${e.weatherMax != null ? `<span class="badge">${e.weatherConditionIcon ? e.weatherConditionIcon + " " : "🌡️ "}${e.weatherMin}~${e.weatherMax}°C</span>` : ""}
          </div>
        </div>
      </div>`;
  }

  $("sortMode").addEventListener("change", renderLogList);
  $("groupMode").addEventListener("change", renderLogList);

  // ---------- 상세 보기 ----------
  function weatherRowText(e) {
    const condPart = e.weatherConditionText ? `${e.weatherConditionIcon || ""} ${e.weatherConditionText} · ` : "";
    const sourceText = e.weatherStation ? ` (기상청 ${e.weatherStation} 관측소 실측)` : " (추정치)";
    return `${condPart}최저 ${e.weatherMin}°C / 최고 ${e.weatherMax}°C${sourceText}`;
  }

  // 이 날씨 기능이 생기기 전에 저장된 기록(위치는 있지만 날씨가 없는 경우) 상세보기 시,
  // 그리고 기상청 ASOS 연동 이전에 Open-Meteo 추정치로만 저장되어 있던 기록(weatherStation이 없는 경우)도
  // 조용히 다시 조회해서 더 정확한 기상청 실측값으로 갱신하고 DB에도 저장해둔다.
  async function ensureDetailWeather(e) {
    if (e.weatherMax != null && e.weatherStation) return;
    if (e.lat == null || e.lon == null) return;
    const dateStr = dateOnly(e.smokedAt);
    if (!dateStr) return;
    try {
      const w = await WeatherAPI.fetchDailyMinMax(e.lat, e.lon, dateStr);
      if (!w) return;
      const updated = {
        weatherMax: w.max,
        weatherMin: w.min,
        weatherConditionText: w.condition ? w.condition.text : null,
        weatherConditionIcon: w.condition ? w.condition.icon : null,
        weatherStation: w.station || null,
      };
      await CigarStore.updateEntry(e.id, updated);
      const valueEl = $("detailWeatherValue");
      const rowEl = $("detailWeatherRow");
      if (valueEl && rowEl) {
        rowEl.style.display = "";
        valueEl.textContent = weatherRowText(Object.assign({}, e, updated));
      }
    } catch (err) {
      // 조용히 실패 (조회 실패 시 "조회 중..." 문구가 그대로 남되, 다음 상세보기 진입 시 다시 시도됨)
    }
  }

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
      <div class="detail-row" id="detailWeatherRow" style="${e.weatherMax != null || (e.lat && e.lon) ? "" : "display:none"}">
        <span class="detail-label">날씨</span>
        <span id="detailWeatherValue">${e.weatherMax != null ? weatherRowText(e) : "조회 중..."}</span>
      </div>
      ${e.notes ? `<div class="detail-notes"><strong>테이스팅 노트</strong><br>${escapeHtml(e.notes).replace(/\n/g, "<br>")}</div>` : ""}
      ${e.memo ? `<div class="detail-notes"><strong>메모</strong><br>${escapeHtml(e.memo).replace(/\n/g, "<br>")}</div>` : ""}
      ${e.memoPhotos && e.memoPhotos.length ? `<div class="detail-memo-photos">${e.memoPhotos.map((p) => `<img class="detail-memo-photo-thumb" src="${URL.createObjectURL(p.blob)}" />`).join("")}</div>` : ""}
      <div id="detailMap" class="map-box ${e.lat ? "" : "hidden"}" style="margin-top:14px;"></div>
      <button id="btnEditEntry" class="btn btn-secondary" style="margin-top:14px;">✏️ 수정</button>
      <button id="btnDeleteEntry" class="btn btn-danger">🗑️ 삭제</button>
    `;

    if (e.lat && e.lon) showMap("detailMap", e.lat, e.lon, true);
    ensureDetailWeather(e);
    $("detailContent").querySelectorAll(".detail-memo-photo-thumb").forEach((img) => {
      img.addEventListener("click", () => openLightbox(img.src));
    });

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
    currentMemoPhotos = (e.memoPhotos || []).map((p) => ({ blob: p.blob, driveId: p.driveId || null }));
    renderMemoPhotos();
    currentLat = e.lat || null;
    currentLon = e.lon || null;
    currentWeather = e.weatherMax != null && e.weatherStation
      ? {
          max: e.weatherMax,
          min: e.weatherMin,
          condition: e.weatherConditionText ? { text: e.weatherConditionText, icon: e.weatherConditionIcon } : null,
          station: e.weatherStation,
        }
      : null;
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
    if (currentWeather) {
      renderWeatherStatus();
    } else if (e.lat && e.lon) {
      refreshWeather(); // 이 기능 추가 이전에 저장된 기록이라 날씨가 없는 경우, 조용히 한 번 조회 시도
    } else {
      $("weatherStatus").textContent = "";
    }
    showScreen("screen-add");
  }

  // ---------- 설정 ----------
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

  // ---------- 업데이트 확인 ----------
  // 사이드로드 앱은 스스로를 조용히 덮어쓸 수 없으므로(설치는 항상 사용자 확인 필요),
  // 새 버전이 있으면 외부 브라우저로 APK 다운로드 URL을 열어 다운로드->설치를 대신 시작해준다.
  const APP_VERSION_CODE = 2;
  const APP_VERSION_NAME = "1.1";
  const UPDATE_MANIFEST_URL = "https://green3077.github.io/cigar-log/version.json";
  const IS_NATIVE_UPDATE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const UpdateBridge = IS_NATIVE_UPDATE ? window.Capacitor.registerPlugin("UpdateBridge") : null;
  let pendingApkUrl = null;

  $("appVersionText").textContent = "현재 버전: " + APP_VERSION_NAME;

  $("btnCheckUpdate").addEventListener("click", async () => {
    if (pendingApkUrl) {
      if (IS_NATIVE_UPDATE && UpdateBridge) {
        UpdateBridge.openExternal({ url: pendingApkUrl }).catch(() => {
          $("updateStatus").textContent = "업데이트 파일을 여는 데 실패했습니다.";
        });
      } else {
        window.open(pendingApkUrl, "_blank");
      }
      return;
    }
    $("updateStatus").textContent = "업데이트 확인 중...";
    try {
      const res = await fetch(UPDATE_MANIFEST_URL + "?t=" + Date.now());
      const info = await res.json();
      if (!info || typeof info.versionCode !== "number") {
        $("updateStatus").textContent = "업데이트 정보를 확인하지 못했습니다.";
        return;
      }
      if (info.versionCode <= APP_VERSION_CODE) {
        $("updateStatus").textContent = "이미 최신 버전입니다 (v" + APP_VERSION_NAME + ")";
        return;
      }
      pendingApkUrl = info.apkUrl;
      $("btnCheckUpdate").textContent = "새 버전(" + (info.versionName || info.versionCode) + ") 다운로드하기";
      $("updateStatus").textContent = "다시 눌러서 다운로드를 시작하세요.";
    } catch (e) {
      $("updateStatus").textContent = "업데이트 확인에 실패했습니다. 네트워크를 확인해주세요.";
    }
  });

  // ---------- 구글 드라이브 백업 ----------
  function refreshDriveUI() {
    if (DriveBackup.isSignedIn()) {
      const email = DriveBackup.getUserEmail();
      $("driveStatus").textContent = "✅ 로그인됨" + (email ? " (" + email + ")" : "");
      $("btnDriveSignIn").textContent = "🔑 다시 로그인";
      $("btnDriveBackupAll").classList.remove("hidden");
      $("btnDriveRestore").classList.remove("hidden");
    } else {
      $("driveStatus").textContent = "로그인되어 있지 않습니다.";
      $("btnDriveSignIn").textContent = "🔑 Google 계정으로 로그인";
      $("btnDriveBackupAll").classList.add("hidden");
      $("btnDriveRestore").classList.add("hidden");
    }
  }

  $("btnDriveSignIn").addEventListener("click", async () => {
    $("driveActionStatus").textContent = "로그인 중...";
    try {
      await DriveBackup.signIn();
      refreshDriveUI();
      $("driveActionStatus").textContent = "✅ 로그인되었습니다.";
    } catch (err) {
      console.error(err);
      $("driveActionStatus").textContent = "❌ 로그인 실패: " + err.message;
    }
  });

  // 전체 기록을 드라이브에 백업: 이미 올라간 사진은 다시 올리지 않고, 텍스트 정보 전체는
  // backup_YYYY-MM-DD.json 파일 하나로 모아서 저장한다. 저장 후 자동 백업과 수동 버튼 양쪽에서 재사용.
  async function runFullDriveBackup() {
    try {
      const entries = await CigarStore.getAllEntries();
      const result = await DriveBackup.backupAll(entries, (p) => {
        $("driveActionStatus").textContent = "백업 중... (" + p.done + "/" + p.total + ")";
      });
      for (const u of result.photoUpdates) {
        await CigarStore.updateEntry(u.id, { photoDriveId: u.photoDriveId, memoPhotos: u.memoPhotos });
      }
      $("driveActionStatus").textContent =
        "✅ " +
        entries.length +
        '개 기록을 "' +
        result.fileName +
        '"로 백업했습니다' +
        (result.uploadedPhotoCount > 0
          ? " (사진 " + result.uploadedPhotoCount + "장 새로 업로드)"
          : " (사진은 이미 백업되어 있어 건너뜀)") +
        ".";
      return true;
    } catch (err) {
      console.error(err);
      $("driveActionStatus").textContent = "❌ 백업 실패: " + err.message;
      return false;
    }
  }

  $("btnDriveBackupAll").addEventListener("click", async () => {
    $("driveActionStatus").textContent = "백업 준비 중...";
    await runFullDriveBackup();
  });

  $("btnDriveRestore").addEventListener("click", async () => {
    $("driveActionStatus").textContent = "드라이브에서 백업 파일을 확인하는 중...";
    try {
      const result = await DriveBackup.restoreLatest();
      if (!result.fileName) {
        $("driveActionStatus").textContent = "드라이브에 백업 파일이 없습니다.";
        return;
      }
      let restored = 0;
      for (const meta of result.entries) {
        if (!meta || !meta.id) continue;
        const existing = await CigarStore.getEntry(meta.id);
        if (existing) continue;
        const restoredEntry = Object.assign({}, meta);
        if (meta.photoDriveId) {
          restoredEntry.photo = await DriveBackup.downloadBlob(meta.photoDriveId);
        }
        if (meta.memoPhotoDriveIds && meta.memoPhotoDriveIds.length) {
          restoredEntry.memoPhotos = [];
          for (const driveId of meta.memoPhotoDriveIds) {
            if (!driveId) continue;
            const blob = await DriveBackup.downloadBlob(driveId);
            restoredEntry.memoPhotos.push({ blob, driveId });
          }
        }
        delete restoredEntry.memoPhotoDriveIds;
        await CigarStore.addEntry(restoredEntry);
        restored++;
        $("driveActionStatus").textContent = "복원 중... (" + restored + "개 추가됨)";
      }
      $("driveActionStatus").textContent =
        '✅ "' + result.fileName + '" 백업에서 ' + restored + "개 기록을 복원했습니다.";
      refreshSettingsInfo();
    } catch (err) {
      console.error(err);
      $("driveActionStatus").textContent = "❌ 복원 실패: " + err.message;
    }
  });

  refreshDriveUI();
  // 이전에 로그인한 적이 있으면, 사용자가 화면을 처음 터치/클릭하는 순간(브라우저가 팝업을 허용하는
  // "사용자 제스처" 타이밍)에 맞춰 팝업 없이 자동으로 재로그인을 시도한다. 페이지 로드 직후 곧바로
  // 시도하면 사용자 제스처가 아니라서 브라우저가 팝업을 차단해버리기 때문에 첫 상호작용까지 대기한다.
  (function attemptSilentDriveReauth() {
    let tried = false;
    const trigger = () => {
      if (tried) return;
      tried = true;
      document.removeEventListener("pointerdown", trigger, true);
      document.removeEventListener("keydown", trigger, true);
      DriveBackup.trySilentSignIn().then((ok) => { if (ok) refreshDriveUI(); });
    };
    document.addEventListener("pointerdown", trigger, true);
    document.addEventListener("keydown", trigger, true);
  })();

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function truncate(s, n) {
    return s.length > n ? s.slice(0, n) + "…" : s;
  }

  refreshSettingsInfo();
})();
