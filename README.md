# herdr-office

Herdr 桌面 App 的像素辦公室面板。每個在 Herdr 裡跑的 coding agent（Claude Code、Codex、agy）都是辦公室裡的一個人：工作中的坐在位子上打字，等你回覆或做完的走到你的桌子排隊，閒置的去休息區。面板上方顯示各工具的剩餘額度，也可以讓 Agent 互相傳話、開會。

## 功能

| 功能 | 說明 |
|---|---|
| 辦公室場景 | 開放式辦公區、你的桌子、休息區，開會時多一間會議室。狀態一變，人會走到對應的區域 |
| 島型桌 | 每張島桌 4 個座位，兩人背對、兩人面向你。新的 Agent 從門口走進來，自己挑位子：先坐自己專案的島桌，沒空位就占一張空島桌。坐下就不換，別人進出不會讓大家重新洗牌 |
| 專案分組 | 每張島桌屬於一個 Space（專案），鋪上那個專案的顏色；牆上的色牌標出顏色對應哪個專案，滑過島桌也看得到 |
| 多間辦公室 | 一間坐滿（以看得清楚的大小為準）就開下一間，上方出現「1F · 2F」標籤；有人等你回覆的樓層會亮紅點。同一個專案盡量待在同一間 |
| 操作 Agent | 左鍵前往；右鍵開選單，項目依狀態變：等你回覆的「前往回覆／偷看」，工作中的「偷看／補充交代／喊停」，閒置的「派工」，做完的「前往驗收／交代下一件事」，另有釘選、取名、收工。喊停和收工會先確認 |
| 派工 | 從選單送一句話給 Agent（貼進它的輸入框並按 Enter），你的桌子上會冒出「你 → 誰：內容」的泡泡 |
| 開新 Agent | 點空位就在那個專案開一個你最常用的 Agent，它會走進來坐到你點的位子；右鍵空位可以選要開哪一個，或帶著第一件任務開 |
| 你的桌子 | 點「你的桌子」標籤，前往等最久的那一位（等你回覆優先） |
| 閒置走動 | 閒置一陣子的 Agent 會起身去倒水、看窗外、摸貓，或走到工作中的同事旁邊聊天，過一會兒再回沙發 |
| 日夜 | 牆上掛著現在的時間；窗外白天是藍天，17 點起是黃昏，19 點起入夜，燈和螢幕會亮。設定裡可改成固定白天 |
| 實習生 | Agent 開的子代理畫成小一號的人，跟在它旁邊。支援 Claude Code 內建的子代理和 `hc run` 開的子 Agent |
| 用量 | 自動偵測最近一週用過的工具。Claude Code、Codex 顯示剩餘額度圓環，agy 顯示今天的提問次數 |
| 傳話 | 裝了 `herdr-team` Skill 的 Agent 可以互相派工、回報，辦公室畫出誰在跟誰說話 |
| 會議 | 給一個題目，選幾位 Agent 輪流發言，最後整理結論，紀錄存成 Markdown |
| 取名 | 右鍵選單的「取名…」或成員清單的鉛筆，幫 Agent 取名字 |
| 風格與佈局 | 現代明亮、溫暖木質、夜間三種風格；佈局可自動、上下或左右 |

## 需求

- Herdr 桌面 App（`herdr-app`），已在 Windows 上測過
- Node.js 20 以上（讀用量、主持會議、產圖、測試都用到）
- 要顯示 Claude Code 的方案額度，需要另外設定狀態列（見下方）

## 在新電腦建起來

需求：Windows、Git（已設定 GitHub SSH 金鑰並有此儲存庫權限）、Node.js 20 以上、Herdr Desktop。先開啟 Herdr；確認 `node --version` 與 `herdr-app --help` 可以執行。缺少工具或版本太舊時，安裝腳本會印出提示並停止。

```powershell
git clone git@github.com:Hao-weii/herdr-office.git
cd herdr-office
npm test
npm run check
.\install.ps1 -StatusLine -Sidebar
herdr-app do mod.open --name office
```

專案使用 Node.js 內建功能，沒有需要另外安裝的 npm 相依套件。GitHub SSH 權限、模型登入與個人設定需在新電腦各自準備。

## 安裝

```powershell
git clone git@github.com:Hao-weii/herdr-office.git $HOME\Documents\GitHub\herdr-office
cd $HOME\Documents\GitHub\herdr-office
.\install.ps1
```

`install.ps1` 會做以下動作：

1. 把 `mods/office` 複製到 `~/.config/herdr-app/mods/office`
2. 用目錄連結把 `skills/herdr-team` 接到 Claude Code、Codex、agy 的 Skill 資料夾
3. 有指定 `-StatusLine` 時，備份並設定 Claude Code 狀態列
4. 有指定 `-Sidebar` 時，從 Herdr 原生的 `main` 版面與 `tabs` Mod 各自 clone 出 `office` 與 `tabs-office`，在右上角加入與 `Files`、`Changes` 並列的「辦公室」右側邊欄切換按鈕並切到該版面（因為 Herdr 原生版面與 Mod 在啟動／更新時會被覆蓋，必須使用 clone 才會保留）

### 打開辦公室

- **右側邊欄（推薦單螢幕）**：安裝時加上 `.\install.ps1 -Sidebar`，右上角會多出「辦公室」按鈕，點一下即可像 `Changes` 一樣展開／收合；在面板右上角齒輪選單裡也可隨時點「以獨立視窗開啟」。
- **獨立浮動視窗（適合雙螢幕）**：直接執行 `mod.open`：

```powershell
herdr-app do mod.open --name office
```

如果要放進自己既有的客製版面（`~/.config/herdr-app/layouts/<名稱>.json`），可加一個 block：

```json
{ "id": "office", "type": "block", "content": { "mod": "office" } }
```

### Claude Code 的方案額度

執行 `.\install.ps1 -StatusLine`，會將 Claude Code 的 `statusLine` 指向本機安裝的 `office/statusline.mjs`。家目錄使用正斜線，路徑有空格時會加引號。

修改前會將 `~/.claude/settings.json` 備份為 `settings.json.bak-<時間>`，並保留其他設定。已有不同的狀態列時只警告；確定要替換才使用 `.\install.ps1 -StatusLine -Force`。加上 `-DryRun` 只印出計畫，不複製 Mod、建立連結、備份或寫入設定。

狀態列提供 Claude Code 的 5 小時和每週額度，也記錄 Herdr 終端機與 Claude 對話的對應，讓辦公室找到 Claude 的子代理。

## 開發

repo 是唯一的原始碼，Herdr 裡那份是複製過去的。不用目錄連結的原因是：Windows 上，經過目錄連結的存檔不會觸發 Herdr 的熱重載。

```powershell
npm run dev     # 監看 mods/office，存檔就同步到 Herdr，Herdr 會自動重載
npm test        # 單元測試
npm run check   # 每支程式的語法檢查
npm run art     # 重新產生 mods/office/img 的像素圖
herdr-app check $HOME\.config\herdr-app\mods\office   # 在 Herdr 裡實際載入一次，只能在本機跑
```

改了 `mods/office/art/generate.mjs` 之後要跑 `npm run art`，並把產生的圖一起提交。Herdr 安裝 Mod 是直接複製資料夾，不會幫你產圖。

預覽模式：在 `~/.config/herdr-app/data/office/` 建一個名為 `demo` 的檔案，面板會改畫一間有三個專案、九位 Agent 的假辦公室，方便檢查分組、走動和日夜。刪掉檔案就回到真實狀態。`herdr-app check` 也是用這間假辦公室畫一次。檔案內容可以寫（用空白分開）：

- `hour=18`：固定時間，例如看黃昏
- `agents=30`：假辦公室的人數，用來看多間辦公室
- `floor=2`：切到第二間辦公室
- `show=menu-working`：打開某個選單或對話框來看（`menu-blocked`、`menu-idle`、`menu-done`、`dispatch`、`confirm-kill`、`confirm-interrupt`、`seat`、`task`）

預覽模式裡的同事是假的：派工、喊停、收工、點空位開 Agent 都不會真的執行。

## 檔案

```
mods/office/
  main.js          面板：場景、用量、成員清單、對話框
  logic.js         不依賴 Herdr 的計算：位置、佈局、格式化（測試用這個）
  usage.mjs        讀各工具的用量，每分鐘由面板執行一次
  statusline.mjs   Claude Code 狀態列：存額度、記錄對話對應
  meeting.mjs      會議主持，在背景的 hc 終端機裡跑
  art/generate.mjs 用程式畫所有像素圖
  img/             產生出來的圖（三種風格的房間、角色、圓環）
skills/herdr-team/ 讓 Agent 學會互相傳話的 Skill，scripts/tell.mjs 負責送訊息和記錄
scripts/           sync.mjs（同步到 Herdr）、check.mjs（語法檢查）
tests/             單元測試，usage 的測試用假的家目錄
```

## 執行時的資料

都放在 `~/.config/herdr-app/data/office/`，不在 repo 裡：用量快取、Claude 額度、對話對應、傳話紀錄（`talk.jsonl`）、會議進度和會議紀錄（`meetings/`）。

## CI

GitHub Actions（`.github/workflows/ci.yml`）每次推送都會跑：語法檢查、單元測試，並重新產圖確認 `img/` 跟產圖程式一致。`herdr-app check` 需要 Herdr 桌面 App 和畫面，沒辦法在 CI 裡跑，發布前在本機跑。

## 已知限制

- agy 的額度只存在 Google 的伺服器，本機讀不到，所以只顯示提問次數
- Codex、agy 內建的子代理還看不到；用 `hc run` 開的看得到
- Claude 的子代理要等該對話回覆過一次才看得到（對應關係由狀態列記錄）
- 只在 Windows 上測過

## 待補

- `preview.png`：分享到 herdr.dev/mods 需要。要用不含公司專案名稱的畫面重截
- 授權條款（LICENSE）
