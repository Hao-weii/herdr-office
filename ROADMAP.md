# herdr-office 優化藍圖（Roadmap）

這份文件整理了 `herdr-office` 目前架構盤點後的優化方向與實作建議，供後續迭代參考。

## 核心設計原則（優化時需保留的專案特質）

- **零外部 npm 相依**：維持純 Node.js 20+ 內建標準庫與 `node --test`，不引入打包工具（bundler）或龐大的第三方依賴。
- **純邏輯與渲染分離**：幾何座標、座位分配、狀態計算維持純函式（如 [`mods/office/logic.js`](./mods/office/logic.js)），方便直接用單元測試驗證。
- **程式化像素美術**：維持由 [`mods/office/art/generate.mjs`](./mods/office/art/generate.mjs) 產生三種風格 SVG，確保美術風格一致且可由程式碼精確控制。

---

## P0：架構收斂與雙螢幕體驗對齊

目前 Herdr 內建面板（GPUI：[`mods/office/main.js`](./mods/office/main.js)）與獨立桌面視窗（Web DOM：[`mods/office/web/app.js`](./mods/office/web/app.js)）各自維護了一份場景合成與閒置行為邏輯，已經開始出現功能分叉。

### 1. 補齊桌面視窗（`web/`）的中庭場景與互動操作
- [ ] **同步中庭（Courtyard）與果樹澆水**
  - **現況**：[`main.js`](./mods/office/main.js) 已有中庭散步路線（`courtyardRoute`）、分頁切換與果樹澆水動畫／紀錄，但 [`web/app.js`](./mods/office/web/app.js) 的 `errandTick` 仍只包含 `["water", "window", "cat", "chat"]`，單一樓層時也會直接隱藏分頁列，無法切換至中庭。
  - **做法**：在 `web/app.js` 補上中庭分頁、果樹渲染與澆水狀態顯示。
- [ ] **讓桌面視窗支援雙向操作（不再只是唯讀看板）**
  - **現況**：[`mods/office/web/server.mjs`](./mods/office/web/server.mjs) 目前僅提供 `POST /api/focus`，副螢幕看到 Agent 閒置或做完時，仍需切回 Herdr 主視窗面板才能派工或澆水。
  - **做法**：
    1. `server.mjs` 啟動時產生隨機 Session Token 注入 `index.html`（防範跨站請求，比單純檢查 `Origin` 更穩健）。
    2. 新增本機 API：`POST /api/dispatch`（呼叫 `hc send` 並寫入 `talk.jsonl`）、`POST /api/water`（更新 `shared.json` 澆水時間）、`POST /api/start-agent`、`POST /api/rename`、`POST /api/interrupt`。

### 2. 將「場景狀態合成器」下沉至共用模組
- [ ] **抽離共用的 Scene Frame 計算**
  - **現況**：`STYLES`、`RUGS`、`errandTick`、以及角色座標／會議座位／對話泡泡／遠端桌牌（`farPlates`）的合成邏輯，在 `main.js`（`scene()`）與 `web/app.js`（`renderScene()`）重複實作。
  - **做法**：在 `mods/office/logic.js`（或拆分為 `mods/office/core/`）實作純函式 `buildSceneFrame(state)` 與 `stepErrands(state, now, rng)`，輸出標準化的渲染清單，讓 `main.js` 與 `web/app.js` 退化為單純的 Thin Renderer。

### 3. 模組化拆分 `mods/office/main.js`
- [ ] **依職責拆檔（目前約 1,480 行）**
  - **現況**：單一 `Office` 類別同時承載主場景、中庭、用量條、成員清單，以及 6 種 Overlay 彈窗（`rename`、`settings`、`meetingSetup`、`menu`、`send`、`confirm`）。
  - **做法**：拆分為：
    - `overlays.js`：右鍵選單、派工對話框、取名、確認喊停／收工、會議設定、齒輪設定
    - `usage-view.js`：上方額度圓環與計數器渲染
    - `courtyard-view.js`：中庭與果樹互動渲染
    - `main.js`：面板主骨架、計時器協調與房間渲染

---

## P1：效能、I/O 與跨環境穩健度

### 1. 消除 `web/server.mjs` 的 `N+1` 子程序風暴並改用 SSE
- [ ] **快取終端機資訊，減少 `hc get` 呼叫次數**
  - **現況**：`web/app.js` 每 1.5 秒輪詢 `/api/state`，[`server.mjs`](./mods/office/web/server.mjs) 的 `collect()` 每次都會執行 `herdr-app ls` + `hc ls --json`，再對**每一個** live terminal 並發 `execFile("hc", ["get", addr, "--json"])`。開啟 10 個以上終端機時，Windows 每秒需建立十多個短命子程序，容易造成 CPU 波動。
  - **做法**：以終端機 `address` + `status` / `updated` 為鍵快取 `hc get` 結果（標題、labels、`parent`、`created_ms` 很少每秒變動），僅在新終端機出現、狀態改變或低頻週期（如每 10~15 秒）時重新查詢。
- [ ] **以 SSE（Server-Sent Events）取代前端輪詢**
  - **做法**：新增 `GET /api/events` 長連線，當狀態簽章（signature）有變化時才推送給瀏覽器，閒置時網路與序列化開銷趨近於零，且關掉視窗時可透過連線中斷更精準地判斷伺服器自動退場時機。

### 2. 將面板的 `300ms` 常駐計時器改為按需排程
- [ ] **靜止時零喚醒**
  - **現況**：[`main.js`](./mods/office/main.js) 在 `init()` 註冊了 `cx.timer.every(300, ...)`，即使沒有人正在走路（`walking` 為空）、沒有新進人員（`entering` 為空）、也沒有中庭散步行程，仍每秒觸發 3.3 次檢查與 `saveSeats()`。
  - **做法**：改用單次排程輔助函式 `scheduleNextTick(cx)`，計算 `walking`、`entering` 與 `courtyardNext` 的最近到期時間，只在需要時排程 `cx.timer.after(delay, ...)`；`saveSeats()` 改在 `pendingSeats` 產生或 `reserved` 有未過期項目時才執行。

### 3. 像素 SVG 橫向合併（Run-Length Merging）
- [ ] **縮減 60%–75% SVG 體積與節點數**
  - **現況**：[`mods/office/art/generate.mjs`](./mods/office/art/generate.mjs) 的 `Canvas.map()` 對字元畫的每個像素都輸出一筆 `1x1` 的 `<rect>`，導致每張 `16x21` 角色圖約 10~13 KB，`mods/office/img/` 累積大量重複節點。
  - **做法**：在 `Canvas.map()` 掃描每一列時，將連續相同顏色的像素合併為單一 `<rect x="..." y="..." width="k" height="1" fill="..."/>`。視覺像素 100% 一致，但檔案大小、Git 儲存庫體積與渲染解析速度都會顯著提升。

### 4. 環境變數一致性、原子寫入與 macOS PATH 問題
- [ ] **統一支援 `HERDR_APP_HOME`**
  - **現況**：`meeting.mjs` 與 `web/server.mjs` 會讀取 `process.env.HERDR_APP_HOME`，但 [`usage.mjs`](./mods/office/usage.mjs)、[`statusline.mjs`](./mods/office/statusline.mjs) 與 [`skills/herdr-team/scripts/tell.mjs`](./skills/herdr-team/scripts/tell.mjs) 寫死了 `join(homedir(), ".config", "herdr-app")`。
  - **做法**：統一以 `process.env.HERDR_APP_HOME ?? join(homedir(), ".config", "herdr-app")` 解析資料目錄。
- [ ] **`talk.jsonl` 併發寫入保護**
  - **現況**：`main.js` 的 `logTalk()` 與 `tell.mjs` 的 `log()` 在截斷保留最後 100 行時直接覆寫原檔，若多個 Agent 同時傳話可能發生競態遺失紀錄。
  - **做法**：平時僅做 `appendFile`，截斷整理時改用 `.tmp` 寫入後 `rename` 原子替換。
- [ ] **解決 macOS 從 Dock 啟動找不到 `node` / `hc` 的問題**
  - **現況**：macOS GUI App 不一定繼承 shell（nvm / Homebrew / Volta）的 `PATH`，導致面板 `exec("node", ...)` 或 `exec("hc", ...)` 可能失敗。
  - **做法**：在 `install.sh` / `install.ps1` 安裝時將當下偵測到的 `node` 與 `hc` 絕對路徑寫入 `~/.config/herdr-app/data/office/env.json`（並加入常見路徑 `/opt/homebrew/bin`、`~/.local/bin` fallback），供 `main.js` 與 `server.mjs` 優先呼叫。

---

## P2：多 Agent 協作與觀測功能進化

### 1. 會議系統（`meeting.mjs`）體驗升級
- [ ] **第 1 輪平行獨立發言 → 後續輪次交叉討論**
  - **現況**：[`mods/office/meeting.mjs`](./mods/office/meeting.mjs) 全程序列執行（A 講完才換 B），人數多時等待時間長，且第 1 輪容易受第一位發言者錨定。
  - **做法**：第 1 輪同時發送給所有與會者平行撰寫各自觀點，全部完成後彙整進 `transcript.md`，第 2 輪起再針對彼此意見補充或反駁。
- [ ] **會議結論「一鍵轉派工」**
  - **現況**：會議結束後產生 `summary.md` 與 `transcript.md`，使用者需自行打開檔案複製任務再逐一派工。
  - **做法**：請總結者在產出 `summary.md` 的同時輸出一份結構化 `actions.json`（包含建議負責的 Agent 與任務描述）；面板點擊「會議紀錄／結論」時可直接顯示勾選清單，按一下即透過 `hc send` 分派給各與會 Agent。
- [ ] **會議室即時發言摘要泡泡**
  - **做法**：當某位參與者完成該輪發言檔寫入時，`meeting.mjs` 將發言前 40 字寫入 `meeting.json` 的 `last_speech`，讓會議室畫面上方浮現剛剛講的重點，不必等整場結束才看得到內容。

### 2. 茶水間「傳話與派工歷史抽屜」
- [ ] **保留可回溯的協作時間軸**
  - **現況**：Agent 透過 `tell.mjs` 傳話或使用者派工的泡泡只顯示 10 秒（`TALK_MS = 10000`），視線離開一下就會錯過誰找誰幫忙。
  - **做法**：直接讀取現有的 `data/office/talk.jsonl`（已保留最近 100 筆），在標題列新增「對話紀錄」小按鈕，展開最近傳話時間軸（發話者 → 收話者、時間、內容摘要），點擊即可跳轉至該 Agent。

### 3. 額度燃燒速率預警（Burn Rate）與「沒精神」恢復倒數
- [ ] **額度消耗配速（Pacing）提示**
  - **現況**：額度圓環只看絕對剩餘比例（`>40%` 顯示綠色），若 5 小時視窗剛開始 30 分鐘就用掉 50%，雖然仍是綠色但其實即將觸頂。
  - **做法**：比對「視窗已經過時間比例」與「已消耗額度比例」，當消耗速度明顯超前時，在圓環樣式或 Tooltip 提示預估觸頂時間（例如：`依目前速度約 45 分鐘後達上限`）。
- [ ] **`tired`（額度耗盡趴桌）狀態顯示恢復時間與重置提醒**
  - **做法**：結合 `status_msg` 解析或 `usage` 的 `resets_at`，在趴桌角色的 Hover 卡片顯示「預計 HH:MM 恢復」，並可選擇在額度重置時發送 `notify()` 提醒。

### 4. 補齊 `agy` 與 `Codex` 內建子代理（實習生）偵測
- [ ] **解析本機對話紀錄繪製子代理**
  - **現況**：目前僅支援 `hc run` 子終端機與 Claude Code 的 `subagents/*.meta.json`（且 Claude 需等狀態列回覆過一次才有對應表）。
  - **做法**：
    - **agy（Antigravity CLI）**：可讀取 `~/.gemini/antigravity-cli/brain/<conversation-id>/.system_generated/logs/transcript.jsonl` 中的 `invoke_subagent` 紀錄，追蹤執行中的子代理。
    - **Claude Code fallback**：除了依賴 `statusline.mjs`，也可由終端機 `cwd` 比對 `~/.claude/projects/` 下最新活躍的 `.jsonl`，讓剛啟動第一輪就派發子代理的對話也能即時顯示實習生。

---

## P3：測試防禦與開源發佈準備

- [ ] **強化 [`scripts/sidebar.mjs`](./scripts/sidebar.mjs) 的錨點檢查**
  - 目前 `patchTabsSource()` 依賴固定字串替換 Herdr 的 `tabs` Mod；若未來 Herdr 改動原始碼格式找不到 anchor，目前會回傳 `changed: false` 並印出 `already configured` 靜默跳過。應改為「既未包含 `office` 按鈕、又找不到替換錨點時明確拋錯提示」。
- [ ] **GitHub Actions 加入 Windows 測試矩陣**
  - 在 [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) 將 `runs-on` 擴充為 `ubuntu-latest` 與 `windows-latest` matrix，自動驗證 `install.ps1`、Windows 路徑處理與目錄連結邏輯。
- [ ] **自動產生無敏感資訊的 `preview.png`**
  - 寫一支開發腳本啟動 `demo` 模式與 `web/server.mjs`，透過無頭瀏覽器固定視窗尺寸自動截取乾淨的辦公室預覽圖，方便發佈至 `herdr.dev/mods`。
- [ ] **補齊 `LICENSE` 授權條款檔案**
