/**
 * 善緣名片王 | AI 助理模組
 * 透過 Gemini API 後端代理進行自然語言名片搜尋
 */

// ── 顏色辨識（本地端執行，不需 API）─────────────
export function detectDominantColor(imageDataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = Math.min(img.width,  80);
      canvas.height = Math.min(img.height, 54);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      // 計算平均色
      let r=0, g=0, b=0, count=0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i+1]; b += data[i+2]; count++;
      }
      r = Math.round(r/count); g = Math.round(g/count); b = Math.round(b/count);

      const hex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
      const name = colorName(r, g, b);
      resolve({ hex, name, rgb: { r, g, b } });
    };
    img.onerror = () => resolve({ hex: '#888888', name: '未知', rgb: { r:136, g:136, b:136 } });
    img.src = imageDataUrl;
  });
}

function colorName(r, g, b) {
  const colors = [
    { name: '紅色',   r:220, g:50,  b:50  },
    { name: '橙色',   r:230, g:130, b:50  },
    { name: '黃色',   r:220, g:200, b:50  },
    { name: '綠色',   r:50,  g:180, b:80  },
    { name: '藍色',   r:50,  g:100, b:220 },
    { name: '深藍色', r:30,  g:50,  b:140 },
    { name: '紫色',   r:140, g:60,  b:200 },
    { name: '粉色',   r:230, g:130, b:160 },
    { name: '灰色',   r:140, g:140, b:140 },
    { name: '黑色',   r:30,  g:30,  b:30  },
    { name: '白色',   r:240, g:240, b:240 },
    { name: '棕色',   r:160, g:90,  b:40  },
    { name: '金色',   r:200, g:168, b:60  },
  ];
  let min = Infinity, best = '彩色';
  for (const c of colors) {
    const dist = Math.sqrt((r-c.r)**2 + (g-c.g)**2 + (b-c.b)**2);
    if (dist < min) { min = dist; best = c.name; }
  }
  return best;
}

// ── 自然語言解析（用 Gemini API 後端代理）────────
export async function nlpSearch(query, cards, apiKey) {
  if (!apiKey) {
    // 無 API Key → 使用本地關鍵字搜尋作為降級
    return localFallbackSearch(query, cards);
  }

  try {
    const cardsSummary = cards.map((c, i) =>
      `[${i}] ${c.name}｜${c.company||''}｜${c.title||''}｜${c.industry||''}｜${c.region||''}｜底色:${c.bgColor||'未知'}｜備註:${c.note||''}`
    ).join('\n');

    const prompt = `
你是善緣名片王的 AI 搜尋助理，請根據使用者的查詢語句，從以下名片資料中找出最符合的名片索引（可複數）。
回覆格式：只回傳 JSON 陣列，例如 [0, 2, 5]，若無符合則回傳 []。
不要加任何解釋文字。

使用者查詢：「${query}」

名片資料（索引｜姓名｜公司｜職稱｜業種｜區域｜名片底色｜特色備註）：
${cardsSummary}
`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 256 }
        })
      }
    );

    if (!res.ok) throw new Error(`API 回應 ${res.status}`);

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[]';
    const match = text.match(/\[[\d,\s]*\]/);
    const indices = match ? JSON.parse(match[0]) : [];
    return indices.map(i => cards[i]).filter(Boolean);

  } catch (err) {
    console.warn('Gemini API 失敗，降級本地搜尋', err);
    return localFallbackSearch(query, cards);
  }
}

// ── 本地降級搜尋（關鍵字匹配）────────────────────
function localFallbackSearch(query, cards) {
  const keywords = query.toLowerCase().split(/[\s、，,]+/).filter(Boolean);
  const colorKeywords = { '藍': '藍色', '紅': '紅色', '綠': '綠色', '黃': '黃色',
    '紫': '紫色', '白': '白色', '黑': '黑色', '橙': '橙色', '金': '金色', '灰': '灰色' };

  return cards.filter(c => {
    const haystack = [c.name, c.company, c.title, c.industry, c.region, c.note, c.bgColor]
      .join(' ').toLowerCase();

    return keywords.every(kw => {
      // 顏色語意
      for (const [zh, name] of Object.entries(colorKeywords)) {
        if (kw.includes(zh) && c.bgColor?.includes(name)) return true;
      }
      return haystack.includes(kw);
    });
  });
}

// ── AI 產生摘要 ──────────────────────────────────
export async function generateCardSummary(card, apiKey) {
  if (!apiKey) return null;

  try {
    const info = [
      card.name && `姓名：${card.name}`,
      card.company && `公司：${card.company}`,
      card.title && `職稱：${card.title}`,
      card.industry && `業種：${card.industry}`,
      card.region && `地區：${card.region}`,
      card.note && `備註：${card.note}`,
    ].filter(Boolean).join('、');

    const prompt = `根據以下名片資料，用一到兩句話（繁體中文）描述這個人的職業背景，語氣簡潔專業：\n${info}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 128 }
        })
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch {
    return null;
  }
}

// ── 簡單 OCR 前處理（呼叫 Google Vision API）────────
export async function ocrImage(imageBase64, apiKey) {
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: imageBase64 },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
            imageContext: { languageHints: ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'] }
          }]
        })
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.responses?.[0]?.fullTextAnnotation?.text || null;
  } catch {
    return null;
  }
}

// ── OCR 結果解析 ──────────────────────────────────
export function parseOcrText(text) {
  if (!text) return {};
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const result = {};

  // 電話
  const phoneMatch = text.match(/(?:\+?886|0)?[-\s]?[2-9]\d{1,3}[-\s]?\d{3,4}[-\s]?\d{3,4}/);
  if (phoneMatch) result.phone = phoneMatch[0].replace(/[\s-]/g, '');

  // Email
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
  if (emailMatch) result.email = emailMatch[0];

  // 網址
  const urlMatch = text.match(/(?:https?:\/\/|www\.)[\w./%-]+/);
  if (urlMatch) result.website = urlMatch[0];

  // 姓名（通常在第一行或最長的中文詞組）
  const chLines = lines.filter(l => /[\u4e00-\u9fff]/.test(l) && l.length <= 8);
  if (chLines.length > 0) result.name = chLines[0];

  // 公司（含「公司」「企業」「集團」「有限」的行）
  const compLine = lines.find(l => /公司|企業|集團|有限|stock|corp|inc|ltd/i.test(l));
  if (compLine) result.company = compLine;

  // 職稱（含「總」「經」「長」「師」「員」的行）
  const titleLine = lines.find(l => /總|經理|長|師|員|主任|專員|顧問|工程|設計|行銷|業務|負責|執行/i.test(l) && l.length <= 20);
  if (titleLine) result.title = titleLine;

  return result;
}
