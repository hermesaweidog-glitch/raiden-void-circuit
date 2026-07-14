# RAIDEN: VOID CIRCUIT

手機與桌面瀏覽器皆可遊玩的 Roguelite 垂直射擊遊戲，使用純 HTML、CSS 與原生 JavaScript 製作，無外部 runtime 依賴。

## 立即遊玩

- GitHub Pages：<https://hermesaweidog-glitch.github.io/raiden-void-circuit/>
- Repository：<https://github.com/hermesaweidog-glitch/raiden-void-circuit>

手機開啟 Pages 網址即可測試；遊戲採直向版面，支援觸控拖曳、自動射擊與畫面 Bomb 按鈕。

## 本機啟動

```bash
cd /Users/vinson/ai-lab/projects/raiden
python3 -m http.server 8765 --bind 127.0.0.1
```

瀏覽器開啟：

```text
http://127.0.0.1:8765/
```

同一個 Wi-Fi 的手機測試時，改用：

```bash
python3 -m http.server 8765 --bind 0.0.0.0
```

再於手機開啟 `http://<Mac區網IP>:8765/`。

## 操作

| 平台 | 操作 |
|---|---|
| 桌面 | WASD／方向鍵移動，Space 射擊 |
| 桌面 | X／B／Shift 使用 Bomb |
| 桌面 | P／Esc 暫停，M 靜音 |
| 手機 | 相對拖曳移動，自動射擊 |
| 手機 | 右下方 Bomb 按鈕使用炸彈 |

## Roguelite 系統

- 3 架戰機：Falcon、Lancer、Wasp
- 5 個離散關卡與 5 隻獨立 Boss
- 每隻 Boss 具有 3 個攻擊階段
- 擊破敵人取得 XP，升級時暫停並提供 3 個不重複選項
- 主武器、2 格副武器與 4 格被動能力 build
- 追蹤飛彈固定鎖定初始目標；目標消失後不會任意重鎖
- Bomb 清除敵彈、提供短暫無敵並對 Boss 造成有限比例傷害
- 明確限制敵人、子彈、粒子與特效數量，降低手機效能壓力
- PWA manifest 與 service worker，支援離線快取

## 專案結構

```text
raiden/
├── index.html
├── styles.css
├── manifest.webmanifest
├── service-worker.js
├── src/
│   ├── main.js
│   ├── game.js
│   ├── config.js
│   └── systems.js
├── tests/
├── scripts/
└── .github/workflows/
```

## 驗證

```bash
npm test
npm run check
python3 scripts/secret-scan.py
git diff --check
```

目前自動測試涵蓋：完整內容 roster、五關難度、Boss 階段、升級選項、裝備槽、追蹤飛彈、手機操作、PWA 入口與 runtime budgets。

## 發布

`main` branch 每次 push 後會執行：

1. Secret scan 與 whitespace 檢查
2. GitHub Pages 靜態網站部署

本 repository 不應提交 `.env`、token、credentials、cookie、資料庫、runtime state 或 Hermes 本機計畫檔。
