# 善緣名片王 - 專案核心開發守則與歷史經驗鎖定 (API & Model Rules)

本文件儲存了本專案在開發過程中，花費巨大時間與算力所換來的核心 API 經驗與模型限制。所有 AI 協同開發助手必須嚴格遵守，絕對不可重蹈覆轍！

## 1. API 端點與參數格式 (絕對鎖死，不可更動)
* **API 端點：** 必須且只能使用標準生產版 `/v1/` 端點（例如 `https://generativelanguage.googleapis.com/v1/...`）。
* **參數命名規範：** 必須使用 `snake_case`（蛇形命名法，如 `inline_data`、`mime_type`、`generation_config`、`max_output_tokens`）。
* **不相容欄位：** 絕對不可在 `generation_config` 中傳入 `response_mime_type` (或 `responseMimeType`)！這在 `/v1/` 端點下會導致致命的 `400 Bad Request` 格式錯誤。

## 2. 金鑰支援模型限制 (LTS 與新金鑰特性)
* 本專案使用的 Google API Key 屬於新版免費層級：
  * **❌ 不支援模型：** `gemini-1.5-pro` (會報錯不支援，請勿推薦或在載入時預設使用)。
  * **✅ 支援模型：** `gemini-2.5-flash`、`gemini-2.5-pro`、`gemini-1.5-flash`。
* **模型選擇與切換原則：**
  * 使用者可以使用 **`gemini-2.5-flash`** 作為極速版，或選擇 **`gemini-2.5-pro`** 獲得更穩定的長文本辨識。所有模型調用必須嚴格遵循第 1 條的 `/v1/` 參數規範。

## 3. 防超切裁切保護 (JavaScript 物理防線)
* AI 定位點因為側拍、角度等原因偶爾會收縮，導致名片底部文字被超切。
* 程式碼中已寫入 `Smart Corners Protection` 定位防呆。若 AI 座標的底邊 y 值低於 0.78，則程式碼會物理性地強制將底邊拉回 0.98，以確保完美裁切。

## 4. 停用 PWA 離線快取
* 為了防止 iOS Safari 產生嚴重的 PWA 靜態資源快取鎖死，導致最新代碼無法更新，已經完全註銷並移除了 Service Worker 攔截。
