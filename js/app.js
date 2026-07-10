/**
 * 善緣名片王 | 主應用程式模組
 * 頁面路由、UI 互動、名片 CRUD 整合
 */

import { initDB, addCard, updateCard, deleteCard, getCard, getAllCards,
         filterCards, getBirthdayThisMonth, saveMyCard, getMyCard,
         saveSetting, getSetting, exportCSV, exportVCards } from './db.js';
import { detectDominantColor, nlpSearch, generateCardSummary, ocrImage, parseOcrText } from './ai.js';

// ── 應用程式狀態 ──────────────────────────────────
const state = {
  cards:         [],
  filteredCards: [],
  currentCard:   null,
  currentPage:   'home',
  searchQuery:   '',
  filterIndustry:'all',
  apiKey:        '',
  visionApiKey:  '',
  editingCard:   null,
};

// ── 業種分類 ──────────────────────────────────────
export const INDUSTRIES = [
  { id: 'it',       name: 'IT科技', icon: '💻' },
  { id: 'finance',  name: '金融',   icon: '💰' },
  { id: 'medical',  name: '醫療',   icon: '🏥' },
  { id: 'food',     name: '餐飲',   icon: '🍽️' },
  { id: 'legal',    name: '法律',   icon: '⚖️' },
  { id: 'edu',      name: '教育',   icon: '🎓' },
  { id: 'retail',   name: '零售',   icon: '🛍️' },
  { id: 'real',     name: '不動產', icon: '🏢' },
  { id: 'media',    name: '媒體',   icon: '📺' },
  { id: 'mfg',      name: '製造',   icon: '🏭' },
  { id: 'travel',   name: '旅遊',   icon: '✈️' },
  { id: 'beauty',   name: '美容',   icon: '💄' },
  { id: 'other',    name: '其他',   icon: '📋' },
];

export const REGIONS_TW = [
  '台北市','新北市','桃園市','台中市','台南市','高雄市',
  '基隆市','新竹市','嘉義市','新竹縣','苗栗縣','彰化縣',
  '南投縣','雲林縣','嘉義縣','屏東縣','宜蘭縣','花蓮縣',
  '台東縣','澎湖縣','金門縣','連江縣','海外'
];

// ── 初始化 ────────────────────────────────────────
export async function init() {
  await initDB();
  state.apiKey       = await getSetting('geminiApiKey') || '';
  state.visionApiKey = await getSetting('visionApiKey') || '';

  await loadCards();
  await checkBirthdays();
  setupNavigation();
  setupSearch();
  renderFilterBar();

  // 預設顯示首頁
  navigateTo('home');
}

// ── 載入名片 ──────────────────────────────────────
async function loadCards() {
  state.cards = await getAllCards();
  state.filteredCards = [...state.cards];
  renderCardList(state.filteredCards);
  updateStats();
}

// ── 統計更新 ──────────────────────────────────────
function updateStats() {
  const total  = state.cards.length;
  const el     = document.getElementById('totalCount');
  if (el) el.textContent = total;

  // 今月生日
  const now   = new Date();
  const month = now.getMonth() + 1;
  const bdays = state.cards.filter(c => {
    if (!c.birthday) return false;
    return new Date(c.birthday).getMonth() + 1 === month;
  });
  const bdEl = document.getElementById('birthdayCount');
  if (bdEl) bdEl.textContent = bdays.length;
}

// ── 生日提醒 ──────────────────────────────────────
async function checkBirthdays() {
  const bdays = await getBirthdayThisMonth();
  const banner = document.getElementById('birthdayBanner');
  if (!banner) return;
  if (bdays.length > 0) {
    banner.style.display = 'flex';
    const nameList = bdays.slice(0, 3).map(c => c.name).join('、');
    banner.querySelector('.birthday-banner__title').textContent = `🎂 本月壽星`;
    banner.querySelector('.birthday-banner__sub').textContent =
      `${nameList}${bdays.length > 3 ? ` 等 ${bdays.length} 人` : ''}`;
  } else {
    banner.style.display = 'none';
  }
}

// ── 篩選列 ────────────────────────────────────────
function renderFilterBar() {
  const bar = document.getElementById('filterBar');
  if (!bar) return;
  bar.innerHTML = `<button class="filter-btn active" data-industry="all" id="filter-all">全部</button>` +
    INDUSTRIES.map(i =>
      `<button class="filter-btn" data-industry="${i.id}" id="filter-${i.id}">${i.icon} ${i.name}</button>`
    ).join('');

  bar.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    bar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filterIndustry = btn.dataset.industry;
    applyFilters();
  });
}

// ── 套用篩選 ──────────────────────────────────────
async function applyFilters() {
  const opts = {};
  if (state.searchQuery) opts.keyword = state.searchQuery;
  if (state.filterIndustry !== 'all') opts.industry = state.filterIndustry;
  state.filteredCards = await filterCards(opts);
  renderCardList(state.filteredCards);
}

// ── 搜尋設定 ──────────────────────────────────────
function setupSearch() {
  const input = document.getElementById('searchInput');
  if (!input) return;
  let timer;
  input.addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.searchQuery = e.target.value.trim();
      applyFilters();
    }, 300);
  });
}

// ── 渲染名片列表 ──────────────────────────────────
function renderCardList(cards) {
  const grid = document.getElementById('cardsGrid');
  const count = document.getElementById('cardCount');
  if (!grid) return;

  if (count) count.textContent = `${cards.length} 張`;

  if (cards.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📭</div>
        <div class="empty-state__title">尚無名片</div>
        <p class="empty-state__text">點擊下方掃描按鈕<br>新增您的第一張名片</p>
      </div>`;
    return;
  }

  grid.innerHTML = cards.map(c => cardHTML(c)).join('');
  grid.querySelectorAll('.biz-card').forEach(el => {
    el.addEventListener('click', () => openCardDetail(parseInt(el.dataset.id)));
  });
}

function cardHTML(c) {
  const initials = (c.name || '?').charAt(0);
  const industry = INDUSTRIES.find(i => i.id === c.industry);
  const colorDot = c.bgColor
    ? `<span class="color-dot" style="background:${c.bgColorHex || '#888'}" title="${c.bgColor}"></span>`
    : '';

  return `
  <div class="biz-card" data-id="${c.id}" id="card-item-${c.id}">
    <div class="biz-card__avatar">${initials}</div>
    <div class="biz-card__info">
      <div class="biz-card__name">${esc(c.name || '（無姓名）')}</div>
      <div class="biz-card__title">${esc(c.company || '')}${c.title ? ' · ' + esc(c.title) : ''}</div>
      <div class="biz-card__tags">
        ${industry ? `<span class="tag tag--industry">${industry.icon} ${industry.name}</span>` : ''}
        ${c.region  ? `<span class="tag tag--region">📍 ${esc(c.region)}</span>` : ''}
        ${c.bgColor ? `<span class="tag tag--custom">${colorDot} ${esc(c.bgColor)}</span>` : ''}
      </div>
    </div>
    <svg class="biz-card__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
  </div>`;
}

// ── 開啟名片詳細 ──────────────────────────────────
async function openCardDetail(id) {
  state.currentCard = await getCard(id);
  const c = state.currentCard;
  if (!c) return;

  const industry = INDUSTRIES.find(i => i.id === c.industry);

  document.getElementById('detailName').textContent    = c.name || '（無姓名）';
  document.getElementById('detailTitle').textContent   = [c.company, c.title].filter(Boolean).join(' · ') || '';
  document.getElementById('detailPhone').textContent   = c.phone   || '—';
  document.getElementById('detailEmail').innerHTML     = c.email   ? `<a href="mailto:${c.email}">${esc(c.email)}</a>` : '—';
  document.getElementById('detailAddress').textContent = c.address || '—';
  document.getElementById('detailIndustry').textContent= industry ? `${industry.icon} ${industry.name}` : (c.industry || '—');
  document.getElementById('detailRegion').textContent  = c.region  || '—';
  document.getElementById('detailBirthday').textContent= c.birthday ? new Date(c.birthday).toLocaleDateString('zh-TW') : '—';
  document.getElementById('detailBgColor').textContent = c.bgColor  || '—';
  document.getElementById('detailCreated').textContent = c.createdAt ? new Date(c.createdAt).toLocaleDateString('zh-TW') : '—';

  const noteSection = document.getElementById('detailNoteSection');
  if (c.note) {
    noteSection.style.display = 'block';
    document.getElementById('detailNote').textContent = c.note;
  } else {
    noteSection.style.display = 'none';
  }

  // 名片縮圖
  const thumbEl = document.getElementById('detailThumb');
  if (c.imageData) {
    thumbEl.innerHTML = `<img src="${c.imageData}" alt="名片圖片">`;
  } else {
    thumbEl.innerHTML = `<span style="font-size:36px;opacity:.3">🪪</span>`;
  }

  // AI 摘要
  if (state.apiKey) {
    const summaryEl = document.getElementById('detailSummary');
    summaryEl.textContent = '✨ 正在生成 AI 摘要…';
    generateCardSummary(c, state.apiKey).then(summary => {
      summaryEl.textContent = summary || '';
    });
  }

  navigateTo('detail');
}

// ── 頁面導航 ──────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.nav));
  });
}

export function navigateTo(page) {
  state.currentPage = page;
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.id === `page-${page}`);
  });
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.nav === page);
  });

  if (page === 'home') loadCards();
  if (page === 'scan') resetScanForm();
  if (page === 'mycard') loadMyCard();
  if (page === 'settings') loadSettings();
}

// ── 掃描 / 新增名片 ───────────────────────────────
function resetScanForm() {
  const form = document.getElementById('scanForm');
  if (form) form.reset();
  state.editingCard = null;
  const preview = document.getElementById('scanPreview');
  if (preview) preview.style.display = 'none';
  document.getElementById('scanFormTitle').textContent = '✏️ 名片資料';
}

window.handleImageUpload = async function(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    const dataUrl = e.target.result;
    const preview = document.getElementById('scanPreview');
    preview.src = dataUrl;
    preview.style.display = 'block';

    // 顏色辨識
    showToast('🎨 分析名片底色中…', 'info');
    const color = await detectDominantColor(dataUrl);
    document.getElementById('fieldBgColor').value = color.name;
    document.getElementById('fieldBgColorHex').value = color.hex;
    showToast(`🎨 名片底色：${color.name}`, 'success');

    // OCR（若有 Vision API Key）
    if (state.visionApiKey) {
      showToast('🔍 OCR 辨識中（中/英/日/韓）…', 'info');
      const base64 = dataUrl.split(',')[1];
      const text = await ocrImage(base64, state.visionApiKey);
      if (text) {
        const parsed = parseOcrText(text);
        if (parsed.name    && !document.getElementById('fieldName').value)    document.getElementById('fieldName').value    = parsed.name;
        if (parsed.company && !document.getElementById('fieldCompany').value) document.getElementById('fieldCompany').value = parsed.company;
        if (parsed.title   && !document.getElementById('fieldTitle').value)   document.getElementById('fieldTitle').value   = parsed.title;
        if (parsed.phone   && !document.getElementById('fieldPhone').value)   document.getElementById('fieldPhone').value   = parsed.phone;
        if (parsed.email   && !document.getElementById('fieldEmail').value)   document.getElementById('fieldEmail').value   = parsed.email;
        showToast('✅ OCR 辨識完成，請確認欄位', 'success');
      } else {
        showToast('⚠️ OCR 辨識失敗，請手動填寫', 'warning');
      }
    }
  };
  reader.readAsDataURL(file);
};

window.submitScanForm = async function(e) {
  e.preventDefault();
  const fd = new FormData(document.getElementById('scanForm'));
  const preview = document.getElementById('scanPreview');

  const card = {
    name:        fd.get('name')?.trim() || '',
    company:     fd.get('company')?.trim() || '',
    title:       fd.get('title')?.trim() || '',
    phone:       fd.get('phone')?.trim() || '',
    email:       fd.get('email')?.trim() || '',
    address:     fd.get('address')?.trim() || '',
    industry:    fd.get('industry') || '',
    region:      fd.get('region') || '',
    birthday:    fd.get('birthday') || '',
    note:        fd.get('note')?.trim() || '',
    bgColor:     fd.get('bgColor')?.trim() || '',
    bgColorHex:  fd.get('bgColorHex')?.trim() || '',
    imageData:   preview.style.display !== 'none' ? preview.src : '',
  };

  if (!card.name) { showToast('❗ 請輸入姓名', 'error'); return; }

  const btn = document.getElementById('scanSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 儲存中…';

  try {
    if (state.editingCard) {
      card.id = state.editingCard.id;
      card.createdAt = state.editingCard.createdAt;
      await updateCard(card);
      showToast('✅ 名片已更新', 'success');
    } else {
      await addCard(card);
      showToast('✅ 名片已新增', 'success');
    }
    navigateTo('home');
  } catch (err) {
    showToast('❌ 儲存失敗：' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '💾 儲存名片';
  }
};

// ── 編輯名片 ──────────────────────────────────────
window.editCurrentCard = function() {
  const c = state.currentCard;
  if (!c) return;
  state.editingCard = c;

  document.getElementById('scanFormTitle').textContent = '✏️ 編輯名片';
  document.getElementById('fieldName').value    = c.name    || '';
  document.getElementById('fieldCompany').value = c.company || '';
  document.getElementById('fieldTitle').value   = c.title   || '';
  document.getElementById('fieldPhone').value   = c.phone   || '';
  document.getElementById('fieldEmail').value   = c.email   || '';
  document.getElementById('fieldAddress').value = c.address || '';
  document.getElementById('fieldIndustry').value= c.industry|| '';
  document.getElementById('fieldRegion').value  = c.region  || '';
  document.getElementById('fieldBirthday').value= c.birthday|| '';
  document.getElementById('fieldNote').value    = c.note    || '';
  document.getElementById('fieldBgColor').value = c.bgColor || '';

  if (c.imageData) {
    const preview = document.getElementById('scanPreview');
    preview.src = c.imageData;
    preview.style.display = 'block';
  }

  navigateTo('scan');
};

// ── 刪除名片 ──────────────────────────────────────
window.deleteCurrentCard = async function() {
  if (!state.currentCard) return;
  if (!confirm(`確定要刪除「${state.currentCard.name}」的名片嗎？`)) return;
  await deleteCard(state.currentCard.id);
  showToast('🗑️ 名片已刪除', 'success');
  navigateTo('home');
};

// ── AI 搜尋 ───────────────────────────────────────
window.runAISearch = async function() {
  const input = document.querySelector('#page-ai .ai-input');
  const query = input?.value?.trim();
  if (!query) { showToast('請輸入搜尋內容', 'error'); return; }

  const resultBox = document.getElementById('aiResultBox');
  const resultText = document.getElementById('aiResultText');
  const resultCards = document.getElementById('aiResultCards');

  resultBox.classList.add('show');
  resultText.innerHTML = '<span class="spinner"></span> AI 搜尋中…';
  resultCards.innerHTML = '';

  const results = await nlpSearch(query, state.cards, state.apiKey);
  resultText.innerHTML = results.length > 0
    ? `🔍 找到 <strong>${results.length}</strong> 張符合的名片`
    : '❌ 未找到符合的名片，試試其他描述';

  resultCards.innerHTML = results.map(c => cardHTML(c)).join('');
  resultCards.querySelectorAll('.biz-card').forEach(el => {
    el.addEventListener('click', () => openCardDetail(parseInt(el.dataset.id)));
  });
};

window.setSuggestion = function(text) {
  const input = document.querySelector('#page-ai .ai-input');
  if (input) input.value = text;
};

// ── 個人數位名片 ──────────────────────────────────
async function loadMyCard() {
  const data = await getMyCard();
  if (!data) return;

  const fields = ['mcName','mcTitle','mcCompany','mcPhone','mcEmail','mcAddress','mcWebsite'];
  fields.forEach(f => {
    const el = document.getElementById(f);
    if (el) el.value = data[f.replace('mc','')] || '';
  });
  renderMyCardPreview(data);
  generateQR(data);
}

window.saveMyCardForm = async function(e) {
  e.preventDefault();
  const fd = new FormData(document.getElementById('myCardForm'));
  const data = {};
  for (const [k, v] of fd.entries()) data[k] = v.trim();

  await saveMyCard(data);
  renderMyCardPreview(data);
  generateQR(data);
  showToast('✅ 數位名片已更新', 'success');
};

function renderMyCardPreview(data) {
  const el = document.getElementById('myCardPreview');
  if (!el) return;
  el.innerHTML = `
    <div class="mycard-preview__name">${esc(data.Name || '您的姓名')}</div>
    <div class="mycard-preview__title">${esc(data.Title || '職稱')} · ${esc(data.Company || '公司')}</div>
    <div class="mycard-preview__divider"></div>
    <div class="mycard-preview__contact">
      ${data.Phone ? '📞 ' + esc(data.Phone) + '<br>' : ''}
      ${data.Email ? '✉️ ' + esc(data.Email) + '<br>' : ''}
      ${data.Address ? '📍 ' + esc(data.Address) : ''}
    </div>
    <div class="mycard-preview__logo">🪪</div>
  `;
}

function generateQR(data) {
  const box = document.getElementById('qrBox');
  if (!box) return;
  box.innerHTML = '';

  // 使用 vCard 格式的 QR 內容
  const vcard = [
    'BEGIN:VCARD', 'VERSION:3.0',
    `FN:${data.Name || ''}`,
    `TITLE:${data.Title || ''}`,
    `ORG:${data.Company || ''}`,
    `TEL:${data.Phone || ''}`,
    `EMAIL:${data.Email || ''}`,
    `ADR:;;${data.Address || ''};;;;`,
    `URL:${data.Website || ''}`,
    'END:VCARD'
  ].join('\n');

  // 使用 QRCode 函式庫產生
  if (window.QRCode) {
    new QRCode(box, { text: vcard, width: 88, height: 88, colorDark: '#0D1B2A', colorLight: '#FFFFFF' });
  } else {
    box.textContent = 'QR';
  }
}

window.shareMyCard = async function() {
  const data = await getMyCard();
  if (!data) { showToast('請先填寫個人名片', 'error'); return; }

  const text = `${data.Name} | ${data.Company} | ${data.Phone || data.Email}`;
  if (navigator.share) {
    navigator.share({ title: '善緣名片王 - 我的數位名片', text });
  } else {
    navigator.clipboard.writeText(text).then(() => showToast('📋 已複製到剪貼簿', 'success'));
  }
};

// ── 設定頁 ───────────────────────────────────────
function loadSettings() {
  const apiInput = document.getElementById('geminiApiKeyInput');
  const visionInput = document.getElementById('visionApiKeyInput');
  if (apiInput) apiInput.value = state.apiKey;
  if (visionInput) visionInput.value = state.visionApiKey;
}

window.saveApiKey = async function() {
  const val = document.getElementById('geminiApiKeyInput')?.value?.trim();
  state.apiKey = val || '';
  await saveSetting('geminiApiKey', state.apiKey);
  showToast('✅ Gemini API Key 已儲存', 'success');
};

window.saveVisionApiKey = async function() {
  const val = document.getElementById('visionApiKeyInput')?.value?.trim();
  state.visionApiKey = val || '';
  await saveSetting('visionApiKey', state.visionApiKey);
  showToast('✅ Vision API Key 已儲存', 'success');
};

window.toggleApiKeyVisibility = function(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
};

window.doExportCSV = async function() {
  const csv = await exportCSV();
  downloadFile(csv, '善緣名片王_名片匯出.csv', 'text/csv;charset=utf-8;');
  showToast('📤 CSV 匯出完成', 'success');
};

window.doExportVCard = async function() {
  const vcf = await exportVCards();
  downloadFile(vcf, '善緣名片王_名片匯出.vcf', 'text/vcard;charset=utf-8;');
  showToast('📤 vCard 匯出完成', 'success');
};

function downloadFile(content, filename, type) {
  const blob = new Blob(['\ufeff' + content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Toast 通知 ────────────────────────────────────
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast toast--${type === 'warning' ? 'info' : type}`;
  toast.innerHTML = `${icons[type] || ''} ${esc(message)}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── HTML 轉義 ────────────────────────────────────
function esc(str) {
  return (str || '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
