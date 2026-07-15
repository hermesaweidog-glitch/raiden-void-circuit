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
- 5 個連續戰區與 5 隻獨立 Boss；擊破前一區 Boss 後會進入下一戰區
- 每區 8–12 波敵軍，使用路線進度條呈現，不再顯示 `1-1`～`1-5`
- 每區設有必須擊破才能繼續推進的中頭目檢查點
- 每隻 Boss 具有 3 個累積攻擊階段（1、1+2、1+2+3）；切換階段會保留場上既有彈幕
- 選擇戰機後立即提供 3 個隨機開局強化；Boss 擊破後立即獎勵一次升級且不提供 XP
- 主武器、3 格副武器與 6 格被動能力 build，包含重力井、稜鏡衛星與攔截蜂群
- 主武器滿級後依機型固定進化：Falcon 熔蝕彈、Lancer 連鎖電擊、Wasp 雷神之鎚
- Lancer 使用連續射線；大型敵人以平滑進場狀態銜接繞行，不再在定位後跳回軌道
- XP 隨戰場下捲並依關卡倍率拆成四色晶體；缺血或炸彈時敵人才有極低機率掉落可見補給
- 關卡進度採連續時間軸，包含中型 Boss 檢查點與關底 Boss 節點
- 每關以戰機從下方進場開始，通關後從目前位置向上飛離
- 追蹤飛彈固定鎖定初始目標；目標消失後不會任意重鎖
- Bomb 清除敵彈、秒殺一般敵人；Elite、中型 Boss 與 Boss 則計算有限傷害
- 暫停畫面可檢視完整主武器、副武器與被動 build，手機 HUD 會截斷摘要而不撐寬遊戲區
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

目前自動測試涵蓋：完整內容 roster、五戰區難度、8–12 波配置、中頭目檢查點、Boss 階段與跨區轉場、開局與升級選項、裝備槽、敵彈邊界回收、追蹤飛彈、粒子效能預算、手機操作、PWA 入口與 runtime budgets。

## 發布

`main` branch 每次 push 後會執行：

1. Secret scan 與 whitespace 檢查
2. GitHub Pages 靜態網站部署

本 repository 不應提交 `.env`、token、credentials、cookie、資料庫、runtime state 或 Hermes 本機計畫檔。
