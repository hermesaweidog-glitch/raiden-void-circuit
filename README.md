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
- 每區設有必須擊破才能繼續推進的中頭目檢查點；中頭目會借用該區 Boss 的第一階段武器
- 每隻 Boss 具有 3 個累積攻擊階段（1、1+2、1+2+3）；切換階段會保留場上既有彈幕
- 選擇戰機後立即提供 3 個隨機開局強化；Boss 擊破後立即獎勵一次升級且不提供 XP
- 主武器、3 格副武器與 6 格被動能力 build；12 種被動可形成不同路線，包含電容、聚能彈頭、相位穩流與經驗收割器
- 主武器滿級後依機型固定進化：Falcon 熔蝕彈、Lancer 連鎖電擊、Wasp 雷神之鎚
- Lancer 使用全線貫通連續射線；稜鏡衛星改為繞機持續射擊，與瞬間跳電的連鎖電弧明確區隔
- XP 隨戰場下捲並依關卡倍率拆成四色晶體；五關總量足以升滿裝備，滿裝後每次升級可無限累加 10% 攻擊
- 血量、炸彈與一次性相位護盾皆會以可吸附的場地補給掉落；護盾破裂後提供短暫無敵
- 關卡進度採連續時間軸，包含中型 Boss 檢查點與關底 Boss 節點
- 每關以戰機從下方進場開始，通關後從目前位置向上飛離
- 追蹤飛彈固定鎖定初始目標；目標消失後不會任意重鎖
- Bomb 清除敵彈、秒殺一般敵人；Elite、中型 Boss 與 Boss 則計算有限傷害
- 戰鬥底欄以獨立生成式美術 icon 與數字等級顯示完整 build；超載加成顯示於主武器欄，暫停畫面可檢視完整名稱
- 五隻 Boss 使用各自的程序化向量輪廓、裝甲結構與發光核心，維持手機效能與清晰辨識度
- 明確限制敵人、子彈、粒子與特效數量，降低手機效能壓力
- 內建場景音樂：主選單、宇宙探索、Boss 警告與 Boss 戰；支援淡入淡出、暫停、靜音與離線快取
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
│   ├── audio.js
│   ├── config.js
│   └── systems.js
├── assets/audio/
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


## v37 audio fixes
- Menu music is queued before the first user gesture and retries on pointer, touch, click, or keyboard input.
- Other music elements are silently primed during the first gesture for more reliable mobile playback.
- Stage music now uses an approximately 108-second extension made directly from the preferred original exploration recording with a 4-second equal-power loop crossfade.
- Menu and stage music use a 0.6-second entrance fade; final results use a 3.2-second fade-out.


## v38 帝國兵經濟被動調整
- 帝國兵「戰場清理」不再提高經驗值、治療量或其他戰鬥資源。
- 滿裝後每次超頻使源晶礦結算獲取量 +1%，無上限。
- 加成套用於本次收集的源晶礦，以及一般模式的通關獎勵。
- 結算畫面會分別列出本次收集、通關獎勵、戰場清理加成與最終入帳量。


## v39 音樂、無限 Boss 與傷害回顧
- 探索音樂改回舊版原曲，開頭短淡入、尾端五秒淡出，不再做頭尾重疊。
- 無限模式 Boss 警告不中斷玩家、敵人、子彈與波次運作；Boss 於警告播放約一秒後登場。
- Boss 警告音改用原始音檔的 0.2 秒雙軌重疊版本。
- 結算畫面新增「回顧 · 傷害統計」，依主武器、追加效果、副武器、融合武器與駕駛員被動顯示實際傷害及占比。
