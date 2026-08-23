// 시가를 피운 날짜/장소의 그날 최저·최고 기온 + 날씨 상태(맑음/흐림/비 등) 조회
// 한국 내 지역+과거 날짜는 기상청 공공데이터포털의 지상(종관, ASOS) 일자료 조회서비스(실측값)를 우선 사용하고,
// (해외 지역이거나 ASOS 조회가 실패하는 경우 - 예: 아직 관측이 끝나지 않은 오늘/미래 날짜) Open-Meteo(추정치, API 키 불필요)로 대체한다.
const WeatherAPI = (() => {
  // data.go.kr에서 발급받은 "기상청_지상(종관, ASOS) 일자료 조회서비스" 인증키 (Encoding 형식, 이미 URL 인코딩되어 있어 그대로 쓰면 됨)
  const KMA_SERVICE_KEY =
    "CxvoWctkbRsFSxR8Z%2Bpx876r5%2B07L4UY5%2F2VNLFt%2B01QBQwSjGcVqWe1onEs7H06tFLMp3tgh06U%2BZT0hFhNtw%3D%3D";
  const KMA_ASOS_URL = "https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList";

  // 대한민국(제주 포함) 대략적인 위경도 범위 - 이 안이면 ASOS를, 밖이면 바로 Open-Meteo를 사용한다.
  function isInKorea(lat, lon) {
    return lat >= 33 && lat <= 39 && lon >= 124 && lon <= 132;
  }

  // 기상청 종관기상관측(ASOS) 지점 중 data.go.kr API로 실제 조회 확인된 주요 지점들.
  // 전국 ~102개 지점 전체가 아니라 확인된 지점만 담았으므로, 도서 산간 등 일부 지역은
  // 다소 떨어진 지점이 "가장 가까운 지점"으로 선택될 수 있다.
  const ASOS_STATIONS = [
    { id: 90, name: "속초", lat: 38.207, lon: 128.591 },
    { id: 95, name: "철원", lat: 38.147, lon: 127.304 },
    { id: 98, name: "동두천", lat: 37.902, lon: 127.06 },
    { id: 100, name: "대관령", lat: 37.677, lon: 128.718 },
    { id: 101, name: "춘천", lat: 37.902, lon: 127.735 },
    { id: 102, name: "백령도", lat: 37.967, lon: 124.631 },
    { id: 104, name: "북강릉", lat: 37.805, lon: 128.855 },
    { id: 105, name: "강릉", lat: 37.751, lon: 128.876 },
    { id: 106, name: "동해", lat: 37.507, lon: 129.124 },
    { id: 108, name: "서울", lat: 37.5714, lon: 126.9658 },
    { id: 112, name: "인천", lat: 37.4776, lon: 126.6249 },
    { id: 114, name: "원주", lat: 37.338, lon: 127.947 },
    { id: 115, name: "울릉도", lat: 37.481, lon: 130.899 },
    { id: 119, name: "수원", lat: 37.2565, lon: 126.983 },
    { id: 121, name: "영월", lat: 37.183, lon: 128.457 },
    { id: 127, name: "충주", lat: 36.97, lon: 127.952 },
    { id: 129, name: "서산", lat: 36.777, lon: 126.494 },
    { id: 130, name: "울진", lat: 36.993, lon: 129.413 },
    { id: 131, name: "청주", lat: 36.6392, lon: 127.4407 },
    { id: 133, name: "대전", lat: 36.3722, lon: 127.372 },
    { id: 135, name: "추풍령", lat: 36.222, lon: 127.995 },
    { id: 136, name: "안동", lat: 36.573, lon: 128.791 },
    { id: 137, name: "상주", lat: 36.411, lon: 128.157 },
    { id: 138, name: "포항", lat: 36.032, lon: 129.38 },
    { id: 140, name: "군산", lat: 36.006, lon: 126.761 },
    { id: 143, name: "대구", lat: 35.8781, lon: 128.6529 },
    { id: 146, name: "전주", lat: 35.841, lon: 127.118 },
    { id: 152, name: "울산", lat: 35.5828, lon: 129.3306 },
    { id: 155, name: "창원", lat: 35.17, lon: 128.574 },
    { id: 156, name: "광주", lat: 35.1729, lon: 126.8916 },
    { id: 159, name: "부산", lat: 35.1047, lon: 129.032 },
    { id: 162, name: "통영", lat: 34.846, lon: 128.435 },
    { id: 165, name: "목포", lat: 34.8173, lon: 126.3806 },
    { id: 168, name: "여수", lat: 34.7394, lon: 127.7407 },
    { id: 169, name: "흑산도", lat: 34.687, lon: 125.453 },
    { id: 170, name: "완도", lat: 34.396, lon: 126.704 },
    { id: 172, name: "고창", lat: 35.433, lon: 126.699 },
    { id: 174, name: "순천", lat: 34.9506, lon: 127.4872 },
    { id: 177, name: "홍성", lat: 36.656, lon: 126.661 },
    { id: 184, name: "제주", lat: 33.5141, lon: 126.5297 },
    { id: 185, name: "고산", lat: 33.294, lon: 126.163 },
    { id: 188, name: "성산", lat: 33.387, lon: 126.88 },
    { id: 189, name: "서귀포", lat: 33.2461, lon: 126.5653 },
    { id: 192, name: "진주", lat: 35.163, lon: 128.041 },
    { id: 201, name: "강화", lat: 37.707, lon: 126.446 },
    { id: 202, name: "양평", lat: 37.489, lon: 127.494 },
    { id: 203, name: "이천", lat: 37.264, lon: 127.484 },
    { id: 211, name: "인제", lat: 38.06, lon: 128.17 },
    { id: 212, name: "홍천", lat: 37.688, lon: 127.881 },
    { id: 221, name: "제천", lat: 37.132, lon: 128.191 },
    { id: 226, name: "보은", lat: 36.491, lon: 127.73 },
    { id: 232, name: "천안", lat: 36.765, lon: 127.289 },
    { id: 235, name: "보령", lat: 36.331, lon: 126.561 },
    { id: 236, name: "부여", lat: 36.273, lon: 126.921 },
    { id: 238, name: "금산", lat: 36.106, lon: 127.488 },
    { id: 239, name: "세종", lat: 36.48, lon: 127.29 },
    { id: 243, name: "부안", lat: 35.731, lon: 126.716 },
    { id: 245, name: "정읍", lat: 35.563, lon: 126.856 },
    { id: 247, name: "남원", lat: 35.407, lon: 127.385 },
    { id: 248, name: "장수", lat: 35.657, lon: 127.521 },
    { id: 260, name: "장흥", lat: 34.681, lon: 126.921 },
    { id: 261, name: "해남", lat: 34.552, lon: 126.599 },
    { id: 262, name: "고흥", lat: 34.601, lon: 127.285 },
    { id: 271, name: "봉화", lat: 36.919, lon: 128.732 },
    { id: 272, name: "영주", lat: 36.805, lon: 128.624 },
    { id: 273, name: "문경", lat: 36.627, lon: 128.147 },
    { id: 277, name: "영덕", lat: 36.415, lon: 129.365 },
    { id: 278, name: "의성", lat: 36.353, lon: 128.697 },
    { id: 279, name: "구미", lat: 36.13, lon: 128.32 },
    { id: 281, name: "영천", lat: 35.973, lon: 128.939 },
    { id: 283, name: "경주", lat: 35.856, lon: 129.225 },
    { id: 284, name: "거창", lat: 35.686, lon: 127.91 },
    { id: 285, name: "합천", lat: 35.567, lon: 128.166 },
    { id: 288, name: "밀양", lat: 35.491, lon: 128.746 },
    { id: 289, name: "산청", lat: 35.414, lon: 127.879 },
    { id: 294, name: "거제", lat: 34.881, lon: 128.621 },
  ];

  function nearestStation(lat, lon) {
    let best = null;
    let bestDist = Infinity;
    for (const s of ASOS_STATIONS) {
      const d = (s.lat - lat) ** 2 + (s.lon - lon) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best;
  }

  // ASOS 일자료의 강수량(sumRn)/특성현상(iscs)/평균운량(avgTca)으로부터 대략적인 날씨 상태를 만든다.
  // (Open-Meteo처럼 표준 코드를 직접 주지 않기 때문에, 실측 필드를 조합해 근사한다.)
  function deriveKmaCondition(item) {
    const iscs = item.iscs || "";
    const rainSum = parseFloat(item.sumRn);
    const cloud = parseFloat(item.avgTca); // 평균운량 0~10
    if (iscs.includes("눈")) return { text: "눈", icon: "❄️" };
    if (iscs.includes("뇌")) return { text: "뇌우", icon: "⛈️" };
    if (!isNaN(rainSum) && rainSum > 0) return { text: "비", icon: "🌧️" };
    if (iscs.includes("소나기")) return { text: "소나기", icon: "🌦️" };
    if (!isNaN(cloud)) {
      if (cloud <= 2) return { text: "맑음", icon: "☀️" };
      if (cloud <= 5) return { text: "대체로 맑음", icon: "🌤️" };
      if (cloud <= 8) return { text: "구름 많음", icon: "⛅" };
      return { text: "흐림", icon: "☁️" };
    }
    return null;
  }

  async function fetchKmaAsosDaily(lat, lon, dateStr) {
    const station = nearestStation(lat, lon);
    if (!station) throw new Error("가까운 관측소를 찾을 수 없습니다.");
    const ymd = dateStr.replace(/-/g, "");
    const url =
      `${KMA_ASOS_URL}?serviceKey=${KMA_SERVICE_KEY}&numOfRows=1&pageNo=1&dataType=JSON` +
      `&dataCd=ASOS&dateCd=DAY&startDt=${ymd}&endDt=${ymd}&stnIds=${station.id}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("기상청 API 호출 실패");
    const data = await res.json();
    const header = data && data.response && data.response.header;
    if (!header || header.resultCode !== "00") {
      throw new Error((header && header.resultMsg) || "기상청 API 오류");
    }
    const items = data.response.body && data.response.body.items;
    const item = items && items.item ? (Array.isArray(items.item) ? items.item[0] : items.item) : null;
    if (!item || item.maxTa === "" || item.minTa === "" || item.maxTa == null || item.minTa == null) {
      throw new Error("해당 날짜의 관측 데이터가 아직 없습니다.");
    }
    const max = parseFloat(item.maxTa);
    const min = parseFloat(item.minTa);
    if (isNaN(max) || isNaN(min)) throw new Error("기온 데이터 파싱 실패");
    return { max, min, code: null, condition: deriveKmaCondition(item), source: "kma", station: station.name };
  }

  // WMO Weather interpretation code (Open-Meteo가 쓰는 표준 날씨 코드) -> 한글 표시
  const WEATHER_CODE_LABELS = {
    0: { text: "맑음", icon: "☀️" },
    1: { text: "대체로 맑음", icon: "🌤️" },
    2: { text: "구름 조금", icon: "⛅" },
    3: { text: "흐림", icon: "☁️" },
    45: { text: "안개", icon: "🌫️" },
    48: { text: "안개", icon: "🌫️" },
    51: { text: "이슬비", icon: "🌦️" },
    53: { text: "이슬비", icon: "🌦️" },
    55: { text: "이슬비", icon: "🌦️" },
    56: { text: "어는 이슬비", icon: "🌦️" },
    57: { text: "어는 이슬비", icon: "🌦️" },
    61: { text: "비", icon: "🌧️" },
    63: { text: "비", icon: "🌧️" },
    65: { text: "비", icon: "🌧️" },
    66: { text: "어는 비", icon: "🌧️" },
    67: { text: "어는 비", icon: "🌧️" },
    71: { text: "눈", icon: "❄️" },
    73: { text: "눈", icon: "❄️" },
    75: { text: "눈", icon: "❄️" },
    77: { text: "진눈깨비", icon: "❄️" },
    80: { text: "소나기", icon: "🌦️" },
    81: { text: "소나기", icon: "🌦️" },
    82: { text: "소나기", icon: "🌦️" },
    85: { text: "눈 소나기", icon: "🌨️" },
    86: { text: "눈 소나기", icon: "🌨️" },
    95: { text: "뇌우", icon: "⛈️" },
    96: { text: "뇌우 (우박)", icon: "⛈️" },
    99: { text: "뇌우 (우박)", icon: "⛈️" },
  };

  function describeWeatherCode(code) {
    return WEATHER_CODE_LABELS[code] || null;
  }

  function daysBetween(a, b) {
    return Math.round((a - b) / 86400000);
  }

  async function fetchRange(baseUrl, lat, lon, dateStr) {
    const url = `${baseUrl}?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("날씨 조회 실패");
    const data = await res.json();
    const daily = data.daily;
    if (!daily || !daily.time || daily.time.length === 0) throw new Error("해당 날짜의 날씨 데이터가 없습니다.");
    const idx = daily.time.indexOf(dateStr);
    const i = idx >= 0 ? idx : 0;
    const max = daily.temperature_2m_max[i];
    const min = daily.temperature_2m_min[i];
    if (max == null || min == null) throw new Error("해당 날짜의 기온 데이터가 없습니다.");
    const code = daily.weather_code ? daily.weather_code[i] : null;
    return { max, min, code, condition: code != null ? describeWeatherCode(code) : null, source: "open-meteo" };
  }

  // Open-Meteo 조회 (해외 지역, 또는 한국이지만 ASOS 실측이 아직 없는/실패한 날짜용 대체 경로).
  // 최근 ~3개월 이내(및 향후 예보 범위)는 forecast API로, 그보다 오래된 과거는 archive API로 조회하고,
  // 하나가 실패하면 다른 쪽도 한 번 시도한다 (경계일 근처 오차 대비).
  async function fetchOpenMeteoDailyMinMax(lat, lon, dateStr) {
    const target = new Date(dateStr + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = daysBetween(target, today); // 양수면 과거

    const useForecastFirst = diffDays <= 92 && diffDays >= -15;
    const primary = useForecastFirst
      ? "https://api.open-meteo.com/v1/forecast"
      : "https://archive-api.open-meteo.com/v1/archive";
    const secondary = useForecastFirst
      ? "https://archive-api.open-meteo.com/v1/archive"
      : "https://api.open-meteo.com/v1/forecast";

    try {
      return await fetchRange(primary, lat, lon, dateStr);
    } catch (e) {
      return await fetchRange(secondary, lat, lon, dateStr);
    }
  }

  // lat/lon과 날짜(YYYY-MM-DD)에 해당하는 그날의 최저/최고 기온(섭씨) + 날씨 상태를 반환.
  // 한국 내 지역이면 기상청 ASOS 실측 데이터를 먼저 시도하고(더 정확함 - Open-Meteo의 모델 추정치보다
  // 실제 폭염/한파를 더 잘 반영한다), 실패하면(해외 지역, 혹은 아직 관측이 끝나지 않은 오늘/미래 날짜 등)
  // Open-Meteo로 대체한다.
  async function fetchDailyMinMax(lat, lon, dateStr) {
    if (lat == null || lon == null || !dateStr) return null;
    if (isInKorea(lat, lon)) {
      try {
        return await fetchKmaAsosDaily(lat, lon, dateStr);
      } catch (e) {
        // ASOS 실패 시 Open-Meteo로 대체
      }
    }
    return await fetchOpenMeteoDailyMinMax(lat, lon, dateStr);
  }

  return { fetchDailyMinMax };
})();
