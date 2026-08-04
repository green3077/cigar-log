// 시가 참고 데이터베이스 (브랜드/라인별 특징, 전문가 평점, 참고 판매가)
// 가격은 국내외 온라인 판매가를 참고한 "대략적인 1개비 기준 참고가"이며 실제 판매가와 다를 수 있음.
// 강도(strength): 1(순함) ~ 5(매우 강함)
// rating: 전문가 평점 참고치 (100점 만점, Cigar Aficionado 등 업계 평가 참고)

const CIGAR_DB = [
  {
    id: "cohiba-behike",
    brand: "Cohiba", brandKo: "코히바", line: "Behike",
    aliases: ["cohiba behike", "코히바 베이케", "behike 52", "behike 56"],
    origin: "쿠바", wrapper: "메두로 (쿠바산 특수 발효 잎)",
    strength: 4, rating: 97,
    notes: "코히바 최상급 라인. 메두로 티트 발효 잎을 사용해 크리미하고 달콤한 목재·커피·향신료 향이 층layer을 이루는 매우 복합적인 맛. 쿠바 시가 중 최고가 라인 중 하나.",
    priceKRW: [250000, 600000]
  },
  {
    id: "cohiba-siglo",
    brand: "Cohiba", brandKo: "코히바", line: "Siglo VI",
    aliases: ["cohiba siglo", "코히바 시글로"],
    origin: "쿠바", wrapper: "쿠바산 클라로/콜로라도",
    strength: 3, rating: 93,
    notes: "균형 잡힌 중강도. 크리미한 견과류, 코코아, 은은한 스파이스. 코히바 특유의 세련된 향.",
    priceKRW: [80000, 150000]
  },
  {
    id: "cohiba-robusto",
    brand: "Cohiba", brandKo: "코히바", line: "Robustos",
    aliases: ["cohiba robusto", "코히바 로부스토"],
    origin: "쿠바", wrapper: "쿠바산",
    strength: 3, rating: 92,
    notes: "코히바 대표 로부스토. 크리미하고 우디한 풍미에 은은한 단맛, 중강도.",
    priceKRW: [60000, 120000]
  },
  {
    id: "montecristo-no2",
    brand: "Montecristo", brandKo: "몬테크리스토", line: "No.2",
    aliases: ["montecristo no 2", "몬테크리스토 넘버2", "몬테크리스토 2번"],
    origin: "쿠바", wrapper: "쿠바산 콜로라도",
    strength: 3, rating: 94,
    notes: "피라미드(토르페도) 형태의 대표작. 코코아, 견과류, 우디함이 조화로운 클래식 프로파일. 쿠바 시가 중 가장 유명한 라인 중 하나.",
    priceKRW: [45000, 90000]
  },
  {
    id: "montecristo-no4",
    brand: "Montecristo", brandKo: "몬테크리스토", line: "No.4",
    aliases: ["montecristo no 4", "몬테크리스토 넘버4"],
    origin: "쿠바", wrapper: "쿠바산 콜로라도",
    strength: 2, rating: 90,
    notes: "전 세계에서 가장 많이 팔리는 쿠바 시가 중 하나. 순한~중강도, 견과류와 크리미한 단맛.",
    priceKRW: [30000, 60000]
  },
  {
    id: "montecristo-especial",
    brand: "Montecristo", brandKo: "몬테크리스토", line: "Especial",
    aliases: ["montecristo especial", "몬테크리스토 에스페셜"],
    origin: "쿠바", wrapper: "쿠바산",
    strength: 2, rating: 89,
    notes: "가늘고 긴 파나텔라 형태. 가볍고 우아한 풍미, 초보자도 접근하기 좋은 순한 편.",
    priceKRW: [35000, 70000]
  },
  {
    id: "romeo-churchill",
    brand: "Romeo y Julieta", brandKo: "로미오 이 줄리에타", line: "Churchill",
    aliases: ["romeo y julieta churchill", "로미오이줄리에타 처칠"],
    origin: "쿠바", wrapper: "쿠바산 콜로라도 클라로",
    strength: 3, rating: 91,
    notes: "윈스턴 처칠이 즐겼던 것으로 유명한 롱 사이즈 클래식. 우디·가죽 향에 은은한 스파이스, 중강도.",
    priceKRW: [40000, 80000]
  },
  {
    id: "romeo-wide-churchill",
    brand: "Romeo y Julieta", brandKo: "로미오 이 줄리에타", line: "Wide Churchill",
    aliases: ["wide churchill", "로미오 와이드처칠"],
    origin: "쿠바", wrapper: "쿠바산",
    strength: 3, rating: 90,
    notes: "클래식 처칠보다 링게이지가 굵어 더 진하고 풍부한 풍미. 코코아·목재 향.",
    priceKRW: [45000, 85000]
  },
  {
    id: "partagas-serie-d4",
    brand: "Partagás", brandKo: "파르타가스", line: "Serie D No.4",
    aliases: ["partagas serie d4", "파르타가스 시리즈D4", "파르타가스 D4"],
    origin: "쿠바", wrapper: "쿠바산 콜로라도 마두로",
    strength: 4, rating: 93,
    notes: "쿠바 로부스토의 대명사. 진한 흙내음, 가죽, 후추향의 강렬하고 풀바디한 프로파일.",
    priceKRW: [40000, 75000]
  },
  {
    id: "h-upmann-magnum46",
    brand: "H. Upmann", brandKo: "H. 업만", line: "Magnum 46",
    aliases: ["h upmann magnum 46", "업만 매그넘46"],
    origin: "쿠바", wrapper: "쿠바산",
    strength: 3, rating: 90,
    notes: "부드러운 우디함과 크리미한 질감, 중강도의 균형 잡힌 클래식.",
    priceKRW: [35000, 65000]
  },
  {
    id: "hoyo-epicure2",
    brand: "Hoyo de Monterrey", brandKo: "오요 데 몬테레이", line: "Épicure No.2",
    aliases: ["hoyo epicure 2", "오요 에피큐어2"],
    origin: "쿠바", wrapper: "쿠바산",
    strength: 2, rating: 92,
    notes: "쿠바 로부스토 중 가장 사랑받는 라인 중 하나. 꿀 같은 단맛과 크리미함, 순한~중강도.",
    priceKRW: [40000, 75000]
  },
  {
    id: "trinidad-fundadores",
    brand: "Trinidad", brandKo: "트리니다드", line: "Fundadores",
    aliases: ["trinidad fundadores", "트리니다드 푼다도레스"],
    origin: "쿠바", wrapper: "쿠바산",
    strength: 3, rating: 94,
    notes: "원래 외교선물용으로 만들어진 희귀 라인. 라운 렉토르 형태, 스파이시하고 우아한 풍미.",
    priceKRW: [90000, 180000]
  },
  {
    id: "bolivar-royal-corona",
    brand: "Bolívar", brandKo: "볼리바르", line: "Royal Corona",
    aliases: ["bolivar royal corona", "볼리바르 로얄코로나"],
    origin: "쿠바", wrapper: "쿠바산 마두로",
    strength: 5, rating: 91,
    notes: "쿠바 시가 중 가장 강한 축. 진한 흙내음, 커피, 강한 스파이스. 애호가용 풀바디.",
    priceKRW: [35000, 65000]
  },
  {
    id: "padron-1926",
    brand: "Padrón", brandKo: "파드론", line: "1926 Serie",
    aliases: ["padron 1926", "파드론 1926 시리즈"],
    origin: "니카라과", wrapper: "니카라과산 마두로",
    strength: 4, rating: 95,
    notes: "니카라과 프리미엄 시가의 정점으로 평가받는 라인. 초콜릿, 에스프레소, 스파이스의 진하고 풍부한 풀바디.",
    priceKRW: [40000, 80000]
  },
  {
    id: "padron-1964-anniversary",
    brand: "Padrón", brandKo: "파드론", line: "1964 Anniversary",
    aliases: ["padron 1964", "파드론 1964 애니버서리"],
    origin: "니카라과", wrapper: "니카라과산",
    strength: 3, rating: 94,
    notes: "크리미하고 균형 잡힌 중강도. 코코아, 견과류, 은은한 스파이스.",
    priceKRW: [30000, 60000]
  },
  {
    id: "fuente-hemingway",
    brand: "Arturo Fuente", brandKo: "아르투로 푸엔테", line: "Hemingway",
    aliases: ["arturo fuente hemingway", "푸엔테 헤밍웨이"],
    origin: "도미니카공화국", wrapper: "카메룬",
    strength: 2, rating: 92,
    notes: "독특한 피구라도(figurado) 모양. 부드럽고 견과류·삼나무 풍미, 순한~중강도.",
    priceKRW: [25000, 50000]
  },
  {
    id: "fuente-opusx",
    brand: "Arturo Fuente", brandKo: "아르투로 푸엔테", line: "Opus X",
    aliases: ["arturo fuente opus x", "푸엔테 오퍼스엑스", "opusx"],
    origin: "도미니카공화국", wrapper: "도미니카산 (자체 재배 로사도 시드)",
    strength: 4, rating: 96,
    notes: "도미니카산 잎으로만 만든 최초의 풀바디 프리미엄 시가로 유명. 스파이시하고 강렬하며 희소성이 높아 고가에 거래됨.",
    priceKRW: [70000, 200000]
  },
  {
    id: "davidoff-nicaragua",
    brand: "Davidoff", brandKo: "다비도프", line: "Nicaragua",
    aliases: ["davidoff nicaragua", "다비도프 니카라과"],
    origin: "니카라과", wrapper: "니카라과산 하바노",
    strength: 4, rating: 93,
    notes: "다비도프의 강도 있는 라인. 스파이스, 흑후추, 진한 목재향의 풀바디.",
    priceKRW: [50000, 100000]
  },
  {
    id: "davidoff-yamasa",
    brand: "Davidoff", brandKo: "다비도프", line: "Yamasa",
    aliases: ["davidoff yamasa", "다비도프 야마사"],
    origin: "도미니카공화국", wrapper: "도미니카산 야마사",
    strength: 4, rating: 94,
    notes: "다비도프 최상급 라인 중 하나. 진한 코코아, 가죽, 스파이스의 풍부한 풀바디.",
    priceKRW: [60000, 120000]
  },
  {
    id: "davidoff-signature",
    brand: "Davidoff", brandKo: "다비도프", line: "Signature",
    aliases: ["davidoff signature", "다비도프 시그니처"],
    origin: "도미니카공화국", wrapper: "도미니카산 코네티컷/에콰도르",
    strength: 2, rating: 90,
    notes: "다비도프의 순한~중강도 클래식. 크리미하고 우아한 풍미.",
    priceKRW: [40000, 80000]
  },
  {
    id: "my-father",
    brand: "My Father", brandKo: "마이 파더", line: "Le Bijou 1922",
    aliases: ["my father le bijou", "마이파더 시가"],
    origin: "니카라과", wrapper: "니카라과산 하바노 마두로",
    strength: 4, rating: 93,
    notes: "호세 '페페' 가르시아 부자가 만드는 인기 부티크 라인. 진한 스파이스, 커피, 코코아의 풀바디.",
    priceKRW: [20000, 45000]
  },
  {
    id: "oliva-serie-v",
    brand: "Oliva", brandKo: "올리바", line: "Serie V",
    aliases: ["oliva serie v", "올리바 시리즈V"],
    origin: "니카라과", wrapper: "니카라과산 하바노 로시토",
    strength: 4, rating: 92,
    notes: "가성비 좋은 풀바디 라인으로 인기. 페퍼, 다크초콜릿, 오크향.",
    priceKRW: [15000, 30000]
  },
  {
    id: "rocky-patel-decade",
    brand: "Rocky Patel", brandKo: "로키 파텔", line: "Decade",
    aliases: ["rocky patel decade", "로키파텔 디케이드"],
    origin: "온두라스", wrapper: "에콰도르산 하바노",
    strength: 3, rating: 91,
    notes: "숙성된 잎을 사용한 중강도 라인. 크리미, 스파이스, 은은한 단맛의 균형.",
    priceKRW: [18000, 35000]
  },
  {
    id: "ashton-vsg",
    brand: "Ashton", brandKo: "애쉬튼", line: "VSG",
    aliases: ["ashton vsg"],
    origin: "도미니카공화국", wrapper: "에콰도르산 하바노",
    strength: 3, rating: 93,
    notes: "복합적이고 진한 풍미로 마니아층이 두터운 라인. 스파이스, 견과류, 우디함.",
    priceKRW: [25000, 50000]
  },
  {
    id: "punch-punch",
    brand: "Punch", brandKo: "펀치", line: "Punch",
    aliases: ["punch cigars", "펀치 시가"],
    origin: "쿠바 / 온두라스", wrapper: "지역에 따라 상이",
    strength: 2, rating: 88,
    notes: "가성비 좋은 클래식 라인. 순한~중강도, 우디하고 견과류 향.",
    priceKRW: [15000, 35000]
  },
  {
    id: "diplomaticos-no2",
    brand: "Diplomáticos", brandKo: "디플로마티코스", line: "No.2",
    aliases: ["diplomaticos no 2", "디플로마티코스 2번"],
    origin: "쿠바", wrapper: "쿠바산",
    strength: 3, rating: 89,
    notes: "몬테크리스토와 같은 공장에서 생산되어 비슷한 프로파일을 가진 가성비 라인.",
    priceKRW: [25000, 50000]
  }
];

const STRENGTH_LABELS = { 1: "매우 순함", 2: "순함", 3: "중강도", 4: "강함", 5: "매우 강함" };

function formatPriceRange(priceKRW) {
  if (!priceKRW) return "가격 정보 없음";
  const [lo, hi] = priceKRW;
  const fmt = (n) => n.toLocaleString("ko-KR");
  return `약 ${fmt(lo)}원 ~ ${fmt(hi)}원`;
}

// 브랜드/라인 텍스트로 DB에서 가장 근접한 항목 찾기 (AI 분석 결과나 사용자 입력 매칭용)
function findCigarInDB(brandText, lineText) {
  if (!brandText && !lineText) return null;
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  const query = norm((brandText || "") + " " + (lineText || ""));
  const brandQuery = norm(brandText);

  let best = null;
  let bestScore = 0;
  for (const c of CIGAR_DB) {
    const haystacks = [c.brand, c.brandKo, c.line, `${c.brand} ${c.line}`, `${c.brandKo} ${c.line}`, ...(c.aliases || [])]
      .map(norm);
    let score = 0;
    for (const h of haystacks) {
      if (!h) continue;
      if (h === query) score = Math.max(score, 100);
      else if (query.includes(h) || h.includes(query)) score = Math.max(score, 70);
      else if (brandQuery && h.includes(brandQuery)) score = Math.max(score, 40);
    }
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore >= 40 ? best : null;
}
