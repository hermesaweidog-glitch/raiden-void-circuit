const LOCALES = [
  {code:"zh-Hant", native:"繁體中文", dir:"ltr"},
  {code:"zh-Hans", native:"简体中文", dir:"ltr"},
  {code:"en",      native:"English",  dir:"ltr"},
  {code:"ja",      native:"日本語",    dir:"ltr"},
  {code:"ko",      native:"한국어",    dir:"ltr"},
  {code:"es",      native:"Español",  dir:"ltr"},
  {code:"pt-BR",   native:"Português",dir:"ltr"},
  {code:"fr",      native:"Français", dir:"ltr"},
  {code:"de",      native:"Deutsch",  dir:"ltr"},
  {code:"ru",      native:"Русский",  dir:"ltr"},
  {code:"th",      native:"ไทย",       dir:"ltr"},
  {code:"ar",      native:"العربية",   dir:"rtl"}
];

const I18N = {
"zh-Hant":{start:"點擊開始",build:"建置 2026.08",link:"相位鏈路 穩定",oreLabel:"源晶礦",hangarName:"前往機庫",hangarDesc:"消耗源晶礦強化機體、解鎖新機體與駕駛員。",secMode:"選擇遊戲模式",progress:"進度 戰區 3 / 5",threat:"威脅",m1:"一般模式",d1:"五個戰區，逐步建立裝備並完成任務。",v1:"遞增 · 有終點",m2:"無限模式",d2:"通過第五戰區後循環，敵人逐輪強化。",v2:"無上限",m3:"測試模式",d3:"自訂機體、駕駛、滿級武器與不死條件。",v3:"不計入進度",m4:"圖鑑",d4:"檢視所有機體、駕駛、副武器、被動與合成配方。",maxName:"MAX 模式",maxSub:"全數值上限開放",reset:"重置進度",langLabel:"語言"},
"zh-Hans":{start:"点击开始",build:"构建 2026.08",link:"相位链路 稳定",oreLabel:"源晶矿",hangarName:"前往机库",hangarDesc:"消耗源晶矿强化机体、解锁新机体与驾驶员。",secMode:"选择游戏模式",progress:"进度 战区 3 / 5",threat:"威胁",m1:"普通模式",d1:"五个战区，逐步建立装备并完成任务。",v1:"递增 · 有终点",m2:"无限模式",d2:"通过第五战区后循环，敌人逐轮强化。",v2:"无上限",m3:"测试模式",d3:"自定义机体、驾驶、满级武器与不死条件。",v3:"不计入进度",m4:"图鉴",d4:"查看所有机体、驾驶、副武器、被动与合成配方。",maxName:"MAX 模式",maxSub:"全数值上限开放",reset:"重置进度",langLabel:"语言"},
"en":{start:"PRESS TO START",build:"BUILD 2026.08",link:"PHASE LINK STABLE",oreLabel:"SOURCE ORE",hangarName:"Enter Hangar",hangarDesc:"Spend source ore to upgrade mechs and unlock new units and pilots.",secMode:"SELECT MODE",progress:"SECTOR 3 / 5",threat:"THREAT",m1:"Campaign",d1:"Five sectors. Build your loadout and clear each mission.",v1:"SCALING · HAS END",m2:"Endless",d2:"Loops after sector five. Enemies grow stronger each round.",v2:"NO CAP",m3:"Lab",d3:"Custom mechs, pilots, max-level weapons and invincibility.",v3:"NOT TRACKED",m4:"Archive",d4:"Browse every mech, pilot, sub-weapon, passive and recipe.",maxName:"MAX Mode",maxSub:"ALL CAPS UNLOCKED",reset:"Reset Progress",langLabel:"Language"},
"ja":{start:"タッチしてスタート",build:"ビルド 2026.08",link:"位相リンク 安定",oreLabel:"源晶鉱",hangarName:"ハンガーへ",hangarDesc:"源晶鉱を消費して機体を強化し、新機体とパイロットを解放。",secMode:"モード選択",progress:"進行度 セクター 3 / 5",threat:"脅威",m1:"ノーマル",d1:"5つの戦区を進み、装備を整えて任務を達成。",v1:"上昇 · 終わりあり",m2:"エンドレス",d2:"第5戦区の後は循環し、敵が周回ごとに強化。",v2:"上限なし",m3:"テスト",d3:"機体・パイロット・最大強化武器・不死条件を自由設定。",v3:"記録対象外",m4:"図鑑",d4:"全機体・パイロット・サブ武器・パッシブ・合成レシピを閲覧。",maxName:"MAXモード",maxSub:"全数値上限解放",reset:"進行状況をリセット",langLabel:"言語"},
"ko":{start:"탭하여 시작",build:"빌드 2026.08",link:"위상 링크 안정",oreLabel:"원정광",hangarName:"격납고로",hangarDesc:"원정광을 사용해 기체를 강화하고 새 기체와 파일럿을 해금합니다.",secMode:"모드 선택",progress:"진행도 구역 3 / 5",threat:"위협",m1:"일반 모드",d1:"다섯 개 구역을 진행하며 장비를 갖추고 임무를 완료합니다.",v1:"증가 · 종료 있음",m2:"무한 모드",d2:"5구역 이후 반복되며 적이 회차마다 강해집니다.",v2:"상한 없음",m3:"테스트 모드",d3:"기체·파일럿·최대 강화 무기·무적 조건을 직접 설정.",v3:"기록 제외",m4:"도감",d4:"모든 기체, 파일럿, 보조 무기, 패시브, 조합법 열람.",maxName:"MAX 모드",maxSub:"모든 수치 상한 해제",reset:"진행도 초기화",langLabel:"언어"},
"es":{start:"PULSA PARA EMPEZAR",build:"COMPILACIÓN 2026.08",link:"ENLACE DE FASE ESTABLE",oreLabel:"MINERAL FUENTE",hangarName:"Ir al hangar",hangarDesc:"Gasta mineral fuente para mejorar mechas y desbloquear unidades y pilotos.",secMode:"SELECCIONA MODO",progress:"SECTOR 3 / 5",threat:"AMENAZA",m1:"Campaña",d1:"Cinco sectores. Arma tu equipo y completa cada misión.",v1:"CRECIENTE · CON FINAL",m2:"Sin fin",d2:"Se repite tras el sector cinco; los enemigos se refuerzan cada ronda.",v2:"SIN LÍMITE",m3:"Laboratorio",d3:"Mechas, pilotos, armas al máximo y condiciones de invencibilidad.",v3:"NO SE REGISTRA",m4:"Archivo",d4:"Consulta mechas, pilotos, armas secundarias, pasivas y recetas.",maxName:"Modo MAX",maxSub:"LÍMITES DESBLOQUEADOS",reset:"Reiniciar progreso",langLabel:"Idioma"},
"pt-BR":{start:"TOQUE PARA COMEÇAR",build:"BUILD 2026.08",link:"ELO DE FASE ESTÁVEL",oreLabel:"MINÉRIO FONTE",hangarName:"Ir ao hangar",hangarDesc:"Gaste minério fonte para melhorar mechas e desbloquear novas unidades e pilotos.",secMode:"ESCOLHER MODO",progress:"SETOR 3 / 5",threat:"AMEAÇA",m1:"Campanha",d1:"Cinco setores. Monte seu equipamento e conclua cada missão.",v1:"CRESCENTE · COM FIM",m2:"Infinito",d2:"Repete após o quinto setor; inimigos ficam mais fortes a cada rodada.",v2:"SEM LIMITE",m3:"Laboratório",d3:"Mechas, pilotos, armas no nível máximo e invencibilidade personalizáveis.",v3:"NÃO CONTABILIZADO",m4:"Arquivo",d4:"Veja todos os mechas, pilotos, armas secundárias, passivas e receitas.",maxName:"Modo MAX",maxSub:"LIMITES LIBERADOS",reset:"Redefinir progresso",langLabel:"Idioma"},
"fr":{start:"APPUYEZ POUR COMMENCER",build:"BUILD 2026.08",link:"LIAISON DE PHASE STABLE",oreLabel:"MINERAI SOURCE",hangarName:"Aller au hangar",hangarDesc:"Dépensez du minerai source pour améliorer vos mechas et débloquer unités et pilotes.",secMode:"CHOISIR UN MODE",progress:"SECTEUR 3 / 5",threat:"MENACE",m1:"Campagne",d1:"Cinq secteurs. Constituez votre équipement et remplissez chaque mission.",v1:"CROISSANT · AVEC FIN",m2:"Sans fin",d2:"Boucle après le cinquième secteur ; les ennemis se renforcent à chaque tour.",v2:"SANS LIMITE",m3:"Labo",d3:"Mechas, pilotes, armes au niveau max et invincibilité personnalisables.",v3:"NON COMPTABILISÉ",m4:"Archives",d4:"Consultez mechas, pilotes, armes secondaires, passifs et recettes.",maxName:"Mode MAX",maxSub:"PLAFONDS DÉBLOQUÉS",reset:"Réinitialiser",langLabel:"Langue"},
"de":{start:"ZUM STARTEN TIPPEN",build:"BUILD 2026.08",link:"PHASENVERBINDUNG STABIL",oreLabel:"QUELLERZ",hangarName:"Zum Hangar",hangarDesc:"Quellerz ausgeben, um Mechs zu verstärken und neue Einheiten und Piloten freizuschalten.",secMode:"MODUS WÄHLEN",progress:"SEKTOR 3 / 5",threat:"BEDROHUNG",m1:"Kampagne",d1:"Fünf Sektoren. Rüste dich Schritt für Schritt aus und erfülle jeden Auftrag.",v1:"STEIGEND · MIT ENDE",m2:"Endlos",d2:"Wiederholt sich nach Sektor fünf; Gegner werden jede Runde stärker.",v2:"OHNE OBERGRENZE",m3:"Labor",d3:"Mechs, Piloten, Waffen auf Maximalstufe und Unverwundbarkeit frei einstellen.",v3:"NICHT GEWERTET",m4:"Archiv",d4:"Alle Mechs, Piloten, Zweitwaffen, Passivs und Rezepte ansehen.",maxName:"MAX-Modus",maxSub:"ALLE GRENZEN OFFEN",reset:"Fortschritt zurücksetzen",langLabel:"Sprache"},
"ru":{start:"НАЖМИТЕ, ЧТОБЫ НАЧАТЬ",build:"СБОРКА 2026.08",link:"ФАЗОВЫЙ КАНАЛ СТАБИЛЕН",oreLabel:"ИСХОДНАЯ РУДА",hangarName:"В ангар",hangarDesc:"Тратьте исходную руду на улучшение мехов и открытие новых машин и пилотов.",secMode:"ВЫБОР РЕЖИМА",progress:"СЕКТОР 3 / 5",threat:"УГРОЗА",m1:"Кампания",d1:"Пять секторов: собирайте снаряжение и выполняйте задания.",v1:"РАСТЁТ · ЕСТЬ ФИНАЛ",m2:"Бесконечный",d2:"После пятого сектора цикл повторяется, враги усиливаются каждый круг.",v2:"БЕЗ ПРЕДЕЛА",m3:"Лаборатория",d3:"Свои мехи, пилоты, оружие максимального уровня и бессмертие.",v3:"НЕ УЧИТЫВАЕТСЯ",m4:"Архив",d4:"Просмотр всех мехов, пилотов, доп. оружия, пассивок и рецептов.",maxName:"Режим MAX",maxSub:"ВСЕ ЛИМИТЫ СНЯТЫ",reset:"Сбросить прогресс",langLabel:"Язык"},
"th":{start:"แตะเพื่อเริ่ม",build:"บิลด์ 2026.08",link:"การเชื่อมเฟสเสถียร",oreLabel:"แร่ต้นกำเนิด",hangarName:"ไปที่โรงเก็บ",hangarDesc:"ใช้แร่ต้นกำเนิดเพื่ออัปเกรดเมคและปลดล็อกเครื่องและนักบินใหม่",secMode:"เลือกโหมด",progress:"เขต 3 / 5",threat:"ภัยคุกคาม",m1:"โหมดปกติ",d1:"ห้าเขตสงคราม ค่อย ๆ สร้างอุปกรณ์และทำภารกิจให้สำเร็จ",v1:"เพิ่มขึ้น · มีจุดจบ",m2:"โหมดไม่สิ้นสุด",d2:"วนซ้ำหลังเขตที่ห้า ศัตรูแข็งแกร่งขึ้นทุกรอบ",v2:"ไม่มีขีดจำกัด",m3:"โหมดทดสอบ",d3:"กำหนดเมค นักบิน อาวุธเลเวลสูงสุด และเงื่อนไขอมตะเอง",v3:"ไม่นับความคืบหน้า",m4:"สารานุกรม",d4:"ดูเมค นักบิน อาวุธรอง พาสซีฟ และสูตรผสมทั้งหมด",maxName:"โหมด MAX",maxSub:"ปลดขีดจำกัดทั้งหมด",reset:"รีเซ็ตความคืบหน้า",langLabel:"ภาษา"},
"ar":{start:"اضغط للبدء",build:"إصدار 2026.08",link:"رابط الطور مستقر",oreLabel:"خام المصدر",hangarName:"الدخول إلى الحظيرة",hangarDesc:"أنفق خام المصدر لتطوير الآليات وفتح وحدات وطيارين جدد.",secMode:"اختر الوضع",progress:"القطاع 3 / 5",threat:"التهديد",m1:"الحملة",d1:"خمسة قطاعات. جهّز عتادك وأكمل كل مهمة.",v1:"متصاعد · له نهاية",m2:"بلا نهاية",d2:"يتكرر بعد القطاع الخامس، ويقوى الأعداء كل جولة.",v2:"بلا حد",m3:"المختبر",d3:"آليات وطيارون وأسلحة بأقصى مستوى وشروط الخلود.",v3:"غير محتسب",m4:"الفهرس",d4:"تصفح كل الآليات والطيارين والأسلحة الثانوية والقدرات والوصفات.",maxName:"وضع MAX",maxSub:"كل الحدود مفتوحة",reset:"إعادة ضبط التقدم",langLabel:"اللغة"}
};

const byId = id => document.getElementById(id);

export function initTitleShell({ onMode, onHangar, onCodex, onMaxMode, onReset, onSoundToggle, onScreenChange }) {
  const shellRoot = byId('phase-shell');
  const title = byId('phase-title-screen');
  const menu = byId('phase-menu-screen');
  const sheet = byId('phase-lang-sheet');
  const maxToggle = byId('phase-max-toggle');
  const reset = byId('phase-reset');
  const legacyReset = byId('reset-meta');
  let current = 'zh-Hant';
  try { current = localStorage.getItem('phase-incursion-language') || current; } catch { /* storage unavailable */ }
  let animationFrame = 0;
  let titleTime = 0;

  const show = id => {
    title.classList.toggle('on', id === 'title');
    menu.classList.toggle('on', id === 'menu');
    if (id === 'title') startAnimation(); else stopAnimation();
    byId('title-overlay')?.scrollTo?.(0, 0);
    onScreenChange?.(id);
  };

  const setLang = code => {
    const loc = LOCALES.find(item => item.code === code) || LOCALES[0];
    current = loc.code;
    try { localStorage.setItem('phase-incursion-language', current); } catch { /* storage unavailable */ }
    shellRoot.dataset.lang = loc.code;
    shellRoot.setAttribute('lang', loc.code);
    shellRoot.setAttribute('dir', loc.dir);
    document.querySelectorAll('[data-phase-i18n]').forEach(element => {
      const value = I18N[loc.code]?.[element.dataset.phaseI18n];
      if (value) element.textContent = value;
    });
    document.querySelectorAll('.phase-lang-btn .now').forEach(element => { element.textContent = loc.native; });
    document.querySelectorAll('#phase-lang-list button').forEach(button => button.setAttribute('aria-current', button.dataset.code === loc.code ? 'true' : 'false'));
  };

  for (const locale of LOCALES) {
    const button = document.createElement('button');
    button.dataset.code = locale.code;
    button.innerHTML = `${locale.native}<span class="code">${locale.code.toUpperCase()}</span>`;
    button.addEventListener('click', () => { setLang(locale.code); sheet.classList.remove('on'); });
    byId('phase-lang-list').append(button);
  }

  const openSheet = () => sheet.classList.add('on');
  byId('phase-title-lang').addEventListener('click', openSheet);
  byId('phase-menu-lang').addEventListener('click', openSheet);
  byId('phase-sheet-close').addEventListener('click', () => sheet.classList.remove('on'));
  sheet.addEventListener('click', event => { if (event.target === sheet) sheet.classList.remove('on'); });
  addEventListener('keydown', event => { if (event.key === 'Escape') sheet.classList.remove('on'); });

  byId('phase-start').addEventListener('click', () => show('menu'));
  byId('phase-back').addEventListener('click', () => show('title'));
  document.querySelectorAll('[data-phase-mode]').forEach(button => button.addEventListener('click', () => { if (!button.disabled) onMode(button.dataset.phaseMode); }));
  byId('phase-hangar').addEventListener('click', onHangar);
  byId('phase-codex').addEventListener('click', onCodex);
  maxToggle.addEventListener('click', () => onMaxMode(maxToggle.getAttribute('aria-pressed') !== 'true'));
  reset.addEventListener('click', onReset);


  const soundButtons = [byId('phase-title-sound'), byId('phase-menu-sound')].filter(Boolean);
  const setMuted = muted => {
    for (const button of soundButtons) {
      button.textContent = muted ? '✕' : '♪';
      button.setAttribute('aria-pressed', muted ? 'true' : 'false');
      button.setAttribute('aria-label', muted ? '開啟聲音' : '關閉聲音');
    }
  };
  for (const button of soundButtons) button.addEventListener('click', () => {
    const result = onSoundToggle?.();
    if (typeof result === 'boolean') setMuted(result);
  });

  if (legacyReset && globalThis.MutationObserver) {
    const syncReset = () => { reset.textContent = legacyReset.textContent; reset.classList.toggle('confirming', legacyReset.classList.contains('confirming')); };
    new MutationObserver(syncReset).observe(legacyReset, { childList:true, characterData:true, subtree:true, attributes:true, attributeFilter:['class'] });
    syncReset();
  }

  const canvas = byId('titleCanvas');
  const context = canvas.getContext('2d');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  let width = 0, height = 0, dpr = 1;
  const resize = () => {
    dpr = coarse ? 1 : Math.min(devicePixelRatio || 1, 1.25);
    width = canvas.clientWidth; height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(width * dpr)); canvas.height = Math.max(1, Math.round(height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const wave = (phase, amplitude, y0, color, alpha, lineWidth) => {
    context.beginPath();
    for (let x=0; x<=width; x+=3) {
      const k=x/Math.max(1,width), envelope=Math.sin(Math.PI*k);
      const y=y0+Math.sin(k*11+phase)*amplitude*envelope;
      x ? context.lineTo(x,y) : context.moveTo(x,y);
    }
    context.strokeStyle=color; context.globalAlpha=alpha; context.lineWidth=lineWidth; context.stroke(); context.globalAlpha=1;
  };
  const drawTitle = () => {
    animationFrame = 0;
    if (!title.classList.contains('on') || document.hidden) return;
    context.clearRect(0,0,width,height);
    const mid=height*.42, drift=Math.sin(titleTime*.26)*2, align=1-Math.min(Math.abs(drift)/2,1);
    document.documentElement.style.setProperty('--phase-align', align.toFixed(3));
    for (let i=1;i<=4;i++) { const offset=i*46, alpha=.07-i*.012; wave(titleTime*.6-i*.5,16+i*4,mid-offset,'#4C7DFF',alpha,1); wave(titleTime*.6-i*.5+drift,16+i*4,mid+offset,'#FF3D57',alpha,1); }
    wave(titleTime,30,mid,'#4C7DFF',.85,1.6); wave(titleTime+drift,30,mid,'#FF3D57',.5+align*.45,1.6);
    context.beginPath(); context.moveTo(0,mid); context.lineTo(width,mid); context.strokeStyle='#16223A'; context.lineWidth=1; context.stroke();
    if (!reducedMotion) { titleTime += coarse ? .011 : .015; animationFrame=requestAnimationFrame(drawTitle); }
  };
  const startAnimation = () => { if (animationFrame || !title.classList.contains('on')) return; resize(); drawTitle(); };
  const stopAnimation = () => { if (animationFrame) cancelAnimationFrame(animationFrame); animationFrame=0; };
  addEventListener('resize', resize, { passive:true });
  document.addEventListener('visibilitychange', () => document.hidden ? stopAnimation() : startAnimation());

  setLang(current);
  startAnimation();

  return {
    showEntry: () => show('title'),
    showMenu: () => show('menu'),
    setMuted,
    refresh({ ore=0, endlessUnlocked=false, maxMode=false, cleared=false, muted=false }) {
      setMuted(muted);
      byId('phase-menu-ore').textContent = Number(ore || 0).toLocaleString();
      byId('phase-campaign-progress').textContent = cleared ? 'CLEAR' : 'NEW';
      const endless = document.querySelector('[data-phase-mode="endless"]');
      endless.disabled = !endlessUnlocked;
      endless.classList.toggle('locked', !endlessUnlocked);
      byId('phase-endless-chip').textContent = endlessUnlocked ? 'OPEN' : 'LOCKED';
      maxToggle.setAttribute('aria-pressed', maxMode ? 'true' : 'false');
    },
  };
}
