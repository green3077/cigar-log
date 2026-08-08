// 시가를 피운 날짜/장소의 그날 최저·최고 기온 + 날씨 상태(맑음/흐림/비 등) 조회
// (Open-Meteo, 무료·API 키 불필요)
const WeatherAPI = (() => {
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
    return { max, min, code, condition: code != null ? describeWeatherCode(code) : null };
  }

  // lat/lon과 날짜(YYYY-MM-DD)에 해당하는 그날의 최저/최고 기온(섭씨)을 반환.
  // 최근 ~3개월 이내(및 향후 예보 범위)는 forecast API로, 그보다 오래된 과거는 archive API로 조회하고,
  // 하나가 실패하면 다른 쪽도 한 번 시도한다 (경계일 근처 오차 대비).
  async function fetchDailyMinMax(lat, lon, dateStr) {
    if (lat == null || lon == null || !dateStr) return null;
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

  return { fetchDailyMinMax };
})();
