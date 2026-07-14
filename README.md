# 雷電 Raiden - HTML 版

經典垂直捲軸射擊遊戲（Vertical Scrolling Shooter），使用 **純 HTML + CSS + JavaScript** 實作。直接打開 `index.html` 即可遊玩，不需要安裝套件。

## 🚀 啟動方式

```bash
cd /Users/vinson/ai-lab/projects/raiden
open index.html
```

若要用本機伺服器測試：

```bash
cd /Users/vinson/ai-lab/projects/raiden
python3 -m http.server 8765 --bind 127.0.0.1
# 瀏覽器開啟 http://127.0.0.1:8765/index.html
```

## 🕹️ 操作方式

| 操作 | 說明 |
|---|---|
| 方向鍵 / WASD | 移動飛機 |
| 滑鼠拖曳 | 移動飛機 |
| SPACE / 滑鼠長按 | 射擊 |
| X / B / SHIFT | 使用炸彈，清除敵彈並重創敵人 |
| P | 暫停 / 繼續 |
| M | 靜音 / 開聲音 |
| R | 重新開始 |

> 小提醒：玩家飛機中央的**白色小亮點**才是被彈判定核心，比整台飛機小，手感更接近彈幕射擊。

## ✅ 這次已實作的優化

### 1. 遊戲手感

- 新增 **Screen Shake 畫面震動**：爆炸、受傷、炸彈都會有明顯衝擊感。
- 新增 **Hitstop 短暫停頓**：擊毀敵人或被擊中時有更重的打擊感。
- 新增玩家受傷閃爍與短暫無敵時間。
- 開局加入保護時間，避免一開始太快暴斃。

### 2. 武器與道具

- 參考《雷電》系列的顏色武器概念：**Vulcan / Laser / Homing** 三種主武器。
- HUD 從單純 POWER 改為 **WEAPON V/L/H + 等級**。
- POWER 等級保留 **1～5 級**；撿同色武器升級，撿不同色武器切換型態。
- Vulcan 是紅色散射彈、Laser 是藍色貫通光束、Homing 是黃色追蹤飛彈。
- 炸彈改為可庫存，使用後清除敵彈並傷害敵人。
- 新增低機率補命道具。

### 3. 敵人與難度

- 敵人種類更明確：普通機、快速機、砲台、重型機、Boss。
- 新增多種敵人波次：直線、V 字、混合、重型、Boss Warning。
- 整體節奏放慢：敵人下降、敵彈速度、背景捲動與波次間隔都降低，讓玩家有更多預判時間。
- 難度會依照時間與分數漸進提升，但提升曲線比舊版平緩。
- 修正初版敵人密度過高、開局太快死亡的問題。

### 4. 視覺與音效

- 新增發光子彈、爆炸粒子、衝擊波、浮動分數文字。
- 玩家機、敵機與道具的向量貼圖增加外框、裝甲面板、座艙與武器顏色提示。
- 將部分高成本 `shadowBlur` 改為半透明疊層光暈，畫面仍有發光感但更省效能。
- 新增復古 CRT 掃描線、動態背景、星點與地形卷軸。
- 使用 Web Audio API 製作射擊、爆炸、升級、炸彈音效。
- 移除外部字型依賴，讓檔案更接近離線可用。

### 5. 穩定性

- 重構成單一主循環，避免重複 `requestAnimationFrame` 導致速度異常。
- 新增 `window.raidenGame` debug API，方便瀏覽器 console 測試：

```js
window.raidenGame.start()
window.raidenGame.bomb()
window.raidenGame.setWeapon('laser', 4)
window.raidenGame.getState()
```

## 📁 專案結構

```text
raiden/
├── index.html    # 單一檔案完整遊戲
└── README.md     # 操作與修改說明
```

## 🔐 安全與發布流程

這個 repository 已內建推送前安全檢查：

```bash
./scripts/install-hooks.sh
```

之後每次 `git push` 前會自動執行：

- `scripts/secret-scan.py`：檢查常見 API key、token、private key、password assignment
- `git diff --check`：檢查 whitespace 錯誤

GitHub Actions 也會在每次 push / pull request 執行相同檢查。若掃描失敗，先移除秘密，再重新 push；若秘密曾經進入 Git history，必須撤銷並重新產生該 credential。

### 不應提交的內容

- `.env`、credentials、token、cookies
- API keys、private keys、SSH keys
- 真實使用者資料或 production database
- 任何放進 frontend 後會公開給瀏覽器的秘密

### GitHub Pages

本專案已部署到：

```text
https://hermesaweidog-glitch.github.io/web-playground/
```

`main` branch 每次更新後，GitHub Pages workflow 會自動重新部署。

## ✅ 已驗證

- `node --check` 驗證 inline JavaScript 語法通過。
- 使用本機 HTTP server 開啟頁面成功。
- Browser console 無 JavaScript error。
- GitHub Actions Security scan：成功。
- GitHub Pages Deploy workflow：成功。
