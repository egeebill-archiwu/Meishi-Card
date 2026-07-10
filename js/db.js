/**
 * 善緣名片王 | 資料庫模組（IndexedDB）
 * 負責本地資料的儲存、查詢、更新、刪除
 */

const DB_NAME    = 'ShanyuanDB';
const DB_VERSION = 1;

let db = null;

// ── 初始化資料庫 ──────────────────────────────
export function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;

      // 名片 Store
      if (!db.objectStoreNames.contains('cards')) {
        const store = db.createObjectStore('cards', { keyPath: 'id', autoIncrement: true });
        store.createIndex('name',       'name',       { unique: false });
        store.createIndex('company',    'company',    { unique: false });
        store.createIndex('industry',   'industry',   { unique: false });
        store.createIndex('region',     'region',     { unique: false });
        store.createIndex('birthday',   'birthday',   { unique: false });
        store.createIndex('createdAt',  'createdAt',  { unique: false });
        store.createIndex('bgColor',    'bgColor',    { unique: false });
      }

      // 個人名片 Store
      if (!db.objectStoreNames.contains('mycard')) {
        db.createObjectStore('mycard', { keyPath: 'id' });
      }

      // 設定 Store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror   = e => reject(e.target.error);
  });
}

// ── 輔助：取得 Transaction ───────────────────
function getTx(storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName);
}

// ── 新增名片 ─────────────────────────────────
export function addCard(card) {
  return new Promise((resolve, reject) => {
    card.createdAt = Date.now();
    card.updatedAt = Date.now();
    const req = getTx('cards', 'readwrite').add(card);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

// ── 更新名片 ─────────────────────────────────
export function updateCard(card) {
  return new Promise((resolve, reject) => {
    card.updatedAt = Date.now();
    const req = getTx('cards', 'readwrite').put(card);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

// ── 刪除名片 ─────────────────────────────────
export function deleteCard(id) {
  return new Promise((resolve, reject) => {
    const req = getTx('cards', 'readwrite').delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror   = e => reject(e.target.error);
  });
}

// ── 取得單張名片 ─────────────────────────────
export function getCard(id) {
  return new Promise((resolve, reject) => {
    const req = getTx('cards').get(id);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

// ── 取得所有名片 ─────────────────────────────
export function getAllCards() {
  return new Promise((resolve, reject) => {
    const req = getTx('cards').getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

// ── 依條件篩選 ───────────────────────────────
export async function filterCards({ keyword, industry, region, birthdayMonth, emailDomain } = {}) {
  const all = await getAllCards();
  return all.filter(c => {
    if (keyword) {
      const kw = keyword.toLowerCase();
      const hay = [c.name, c.company, c.title, c.phone, c.email, c.address, c.note].join(' ').toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    if (industry && industry !== 'all' && c.industry !== industry) return false;
    if (region   && region   !== 'all' && c.region   !== region)   return false;
    if (birthdayMonth) {
      if (!c.birthday) return false;
      const m = new Date(c.birthday).getMonth() + 1;
      if (m !== parseInt(birthdayMonth)) return false;
    }
    if (emailDomain && c.email) {
      if (!c.email.toLowerCase().endsWith(emailDomain.toLowerCase())) return false;
    }
    return true;
  });
}

// ── 搜尋（關鍵字 + 備註） ─────────────────────
export async function searchCards(keyword) {
  return filterCards({ keyword });
}

// ── 取得本月生日 ─────────────────────────────
export async function getBirthdayThisMonth() {
  const all = await getAllCards();
  const month = new Date().getMonth() + 1;
  return all.filter(c => {
    if (!c.birthday) return false;
    return new Date(c.birthday).getMonth() + 1 === month;
  });
}

// ── 個人名片 ─────────────────────────────────
export function saveMyCard(data) {
  return new Promise((resolve, reject) => {
    data.id = 'main';
    data.updatedAt = Date.now();
    const req = getTx('mycard', 'readwrite').put(data);
    req.onsuccess = () => resolve(true);
    req.onerror   = e => reject(e.target.error);
  });
}

export function getMyCard() {
  return new Promise((resolve, reject) => {
    const req = getTx('mycard').get('main');
    req.onsuccess = e => resolve(e.target.result || null);
    req.onerror   = e => reject(e.target.error);
  });
}

// ── 設定值 ───────────────────────────────────
export function saveSetting(key, value) {
  return new Promise((resolve, reject) => {
    const req = getTx('settings', 'readwrite').put({ key, value });
    req.onsuccess = () => resolve(true);
    req.onerror   = e => reject(e.target.error);
  });
}

export function getSetting(key) {
  return new Promise((resolve, reject) => {
    const req = getTx('settings').get(key);
    req.onsuccess = e => resolve(e.target.result?.value ?? null);
    req.onerror   = e => reject(e.target.error);
  });
}

// ── 匯出 CSV ─────────────────────────────────
export async function exportCSV() {
  const cards = await getAllCards();
  const headers = ['姓名','公司','職稱','電話','Email','地址','業種','區域','生日','信箱網域','名片底色','特色備註','建立時間'];
  const rows = cards.map(c => [
    c.name, c.company, c.title, c.phone, c.email, c.address,
    c.industry, c.region, c.birthday, c.emailDomain, c.bgColor,
    (c.note || '').replace(/\n/g, '｜'),
    new Date(c.createdAt).toLocaleDateString('zh-TW')
  ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(','));
  return [headers.join(','), ...rows].join('\n');
}

// ── 匯出 vCard ────────────────────────────────
export async function exportVCards() {
  const cards = await getAllCards();
  return cards.map(c => {
    const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
    if (c.name)    lines.push(`FN:${c.name}`);
    if (c.company) lines.push(`ORG:${c.company}`);
    if (c.title)   lines.push(`TITLE:${c.title}`);
    if (c.phone)   lines.push(`TEL:${c.phone}`);
    if (c.email)   lines.push(`EMAIL:${c.email}`);
    if (c.address) lines.push(`ADR:;;${c.address};;;;`);
    if (c.note)    lines.push(`NOTE:${c.note.replace(/\n/g, '\\n')}`);
    lines.push('END:VCARD');
    return lines.join('\r\n');
  }).join('\r\n\r\n');
}
