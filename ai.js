// Gemini Vision API를 이용한 시가 사진/영수증 분석
const CigarAI = (() => {
  // gemini-3.6-flash를 우선 사용하고, 만약 이 모델명이 유효하지 않은 계정/환경이면
  // (400/404 응답 시) 구형 모델로 자동 폴백한다.
  const GEMINI_MODELS = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.0-flash"];
  const geminiUrl = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const SYSTEM_PROMPT = `당신은 시가(cigar) 전문가입니다. 사용자가 올린 사진은 시가 밴드(라벨), 시가 박스, 또는 구매 영수증 중 하나입니다.
사진을 분석해서 아래 JSON 형식으로만 답변하세요. 다른 설명 텍스트는 절대 추가하지 마세요.

{
  "isReceipt": boolean, // 영수증 사진이면 true
  "brand": string, // 브랜드명 (영문, 예: "Cohiba"). 알 수 없으면 ""
  "line": string, // 라인/시리즈명 (예: "Robustos"). 알 수 없으면 ""
  "origin": string, // 추정 원산지 (예: "쿠바"). 알 수 없으면 ""
  "wrapper": string, // 추정 래퍼 종류/색상. 알 수 없으면 ""
  "strength": number, // 추정 강도 1(순함)~5(매우강함). 모르면 0
  "tastingNotes": string, // 한국어로 예상되는 맛/향 특징 2~3문장
  "expertOpinion": string, // 한국어로 전문가 관점의 간단 평가/코멘트 1~2문장
  "confidence": number, // 브랜드/라인 인식 확신도 0~100
  "receiptStoreName": string, // 영수증인 경우 판매처명. 아니면 ""
  "receiptPrice": string, // 영수증인 경우 표시된 가격(통화 포함 텍스트 그대로). 아니면 ""
  "rawObservation": string // 사진에서 실제로 읽은 텍스트/특징 요약 (한국어)
}

브랜드를 확신할 수 없으면 confidence를 낮게 주고 brand/line은 최선의 추정치를 넣으세요. 절대 JSON 외의 텍스트를 출력하지 마세요.`;

  const USER_PROMPT = "이 시가 사진 또는 영수증을 분석해서 JSON으로 알려주세요.";

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const commaIdx = result.indexOf(",");
        resolve(result.slice(commaIdx + 1));
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function extractJson(text) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("AI 응답에서 JSON을 찾을 수 없습니다.");
    return JSON.parse(text.slice(start, end + 1));
  }

  function friendlyError(body) {
    try {
      const j = JSON.parse(body);
      return j?.error?.message || body.slice(0, 240);
    } catch {
      return body.slice(0, 240);
    }
  }

  // 여러 모델을 순서대로 시도. 모델명이 잘못됐거나(400) 지원되지 않는 경우(404)에만 다음 모델로 넘어간다.
  async function requestWithModelFallback(apiKey, body) {
    let last = null;
    for (const model of GEMINI_MODELS) {
      const res = await fetch(geminiUrl(model), {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body)
      });
      last = { res, model };
      if (![400, 404].includes(res.status)) return last;
    }
    return last;
  }

  function normalizeAnalysis(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const text = (value, max = 1000) => (typeof value === "string" ? value.trim().slice(0, max) : "");
    const strength = Number(r.strength);
    const confidence = Number(r.confidence);
    return {
      isReceipt: Boolean(r.isReceipt),
      brand: text(r.brand, 100),
      line: text(r.line, 100),
      origin: text(r.origin, 100),
      wrapper: text(r.wrapper, 100),
      strength: Number.isInteger(strength) && strength >= 0 && strength <= 5 ? strength : 0,
      tastingNotes: text(r.tastingNotes, 1500),
      expertOpinion: text(r.expertOpinion, 1000),
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 0,
      receiptStoreName: text(r.receiptStoreName, 200),
      receiptPrice: text(r.receiptPrice, 200),
      rawObservation: text(r.rawObservation, 1500)
    };
  }

  async function analyzeImage(apiKey, file) {
    if (!apiKey) throw new Error("설정 탭에서 Google Gemini API 키를 먼저 입력해주세요.");
    const base64 = await fileToBase64(file);
    const mimeType = file.type || "image/jpeg";

    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: "user",
          parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: USER_PROMPT }]
        }
      ],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
    };
    const { res, model } = await requestWithModelFallback(apiKey, body);

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Gemini 분석 요청 실패 (${res.status}, ${model}): ${friendlyError(errBody)}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    if (!text) throw new Error("Gemini 응답에 텍스트가 없습니다.");
    return normalizeAnalysis(extractJson(text));
  }

  async function callGemini(apiKey, prompt, useSearchGrounding) {
    const body = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
    if (useSearchGrounding) body.tools = [{ google_search: {} }];

    const { res, model } = await requestWithModelFallback(apiKey, body);
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      const err = new Error(`요청 실패 (${res.status}, ${model}): ${friendlyError(errBody)}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text || "").join("") || "";
    if (!text) throw new Error("응답에 텍스트가 없습니다.");
    const chunks = candidate?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.map((c) => c.web && { title: c.web.title, uri: c.web.uri }).filter(Boolean);
    return { text: text.trim(), sources };
  }

  // Gemini의 Google Search grounding으로 실시간 판매가를 검색. 무료 API 키는 검색 그라운딩 할당량이
  // 없어 429가 나는 경우가 많아, 그 경우 검색 없이 AI 자체 지식 기반 추정치로 자동 대체한다.
  async function searchPrice(apiKey, brand, line) {
    if (!apiKey) throw new Error("설정 탭에서 Google Gemini API 키를 먼저 입력해주세요.");
    const query = [brand, line].filter(Boolean).join(" ");
    if (!query) throw new Error("브랜드나 라인을 먼저 입력해주세요.");

    const searchPrompt = `"${query}" 시가(cigar)의 현재 온라인 판매가를 검색해서 알려주세요.
개비(1개비) 기준 가격을 우선으로, 여러 판매처의 가격대를 조사해서 아래 형식으로 한국어로 간결하게 답변하세요:

- 개당 가격대(달러 또는 원화, 조사된 그대로):
- 참고한 판매처 이름 1~3곳:

반드시 실제 검색 결과에 기반해서 답하고, 확실하지 않으면 그렇다고 밝히세요. 3~4줄 이내로 간결하게 답변하세요.`;

    try {
      const r = await callGemini(apiKey, searchPrompt, true);
      return { ...r, wasSearched: true };
    } catch (err) {
      // 검색 그라운딩이 막혀있는 API 키(무료 티어 등)는 항상 429가 나므로, 검색 없이 재시도
      if (err.status !== 429) throw err;
      const fallbackPrompt = `"${query}" 시가(cigar)의 일반적인 온라인 판매가를 알고 있는 지식 범위 내에서 알려주세요.
개비(1개비) 기준 대략적인 가격대(달러 또는 원화)를 2~3줄 이내로 간결하게 답변하고, 실시간 검색이 아닌 추정치임을 밝혀주세요.`;
      const r = await callGemini(apiKey, fallbackPrompt, false);
      return { ...r, wasSearched: false };
    }
  }

  return { analyzeImage, searchPrice };
})();
