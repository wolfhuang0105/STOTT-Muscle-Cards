// ====== Data load (async) ======
let RAW = null;
let ALL_ITEMS = [];
let SECTION_ORDER = [];

async function loadData() {
  // Try external data.json first (multi-file deployment)
  try {
    const res = await fetch('data.json', { cache: 'no-cache' });
    if (res.ok) {
      RAW = await res.json();
      if (RAW.items && RAW.items.length > 0) return RAW;
    }
  } catch (e) {
    console.warn('fetch data.json failed, fallback to inline:', e);
  }
  // Fallback: inline script tag (single-file deployment)
  const el = document.getElementById('muscleData');
  if (el) {
    try {
      RAW = JSON.parse(el.textContent);
    } catch (e) {
      console.error('Failed to parse inline muscleData:', e);
      RAW = { sections: [], items: [] };
    }
  } else {
    RAW = { sections: [], items: [] };
  }
  return RAW;
}

const SECTION_SHORT = {
  'Muscles of the Shoulder Girdle': '肩帶',
  'Muscles of the Shoulder': '肩部',
  'Muscles of the Arm': '上臂',
  'Deep Muscles of the Spine': '脊椎深層',
  'Posterior Muscles of the Spine': '脊椎後側',
  'Anterior Muscles of the Trunk & Neck': '軀幹頸前',
  'Muscles of Respiration': '呼吸肌',
  'Muscles of the Hip & Thigh': '髖大腿',
  'Muscles of the Hip & Thigh  Deep Lateral Rotators of Femur': '髖深層外旋',
  'Muscles of the Hip, Thigh, & Knee': '膝後肌群',
  'Muscles of the Hip, Thigh, & Knee    Quadriceps': '股四頭',
  'Muscles of the Leg & Feet': '小腿足'
};

const QTYPE_LABEL = {
  'img2en': '看圖選英文名',
  'img2zh': '看圖選中文名',
  'en2img': '看英文選圖',
  'zh2img': '看中文選圖',
  'action2muscle': '從動作辨肌肉',
  'origin2muscle': '從起點辨肌肉',
  'insertion2muscle': '從止點辨肌肉'
};

// ====== State ======
const STATE_KEY = 'stott_muscle_state_v2';
const STATS_KEY = 'stott_muscle_stats_v2';
const EXAM_KEY = 'stott_muscle_exam_v2';

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    mode: 'browse',
    selectedSections: SECTION_ORDER.slice(),
    img2nameDir: 'zh',
    name2imgDir: 'zh',
    theme: 'sun',
    examConfig: {
      questionCount: 25,
      qtypes: ['img2en', 'img2zh', 'en2img', 'zh2img', 'action2muscle']
    }
  };
}
function saveState() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {}
}
function loadStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY)) || { byItem: {}, total: { correct: 0, wrong: 0 } }; } catch (e) {}
  return { byItem: {}, total: { correct: 0, wrong: 0 } };
}
function saveStats() {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) {}
}
function loadExamHistory() {
  try { return JSON.parse(localStorage.getItem(EXAM_KEY)) || []; } catch (e) {}
  return [];
}
function saveExamHistory() {
  try { localStorage.setItem(EXAM_KEY, JSON.stringify(examHistory)); } catch (e) {}
}

let state = loadState();
let stats = loadStats();
let examHistory = loadExamHistory();

// Theme
document.documentElement.setAttribute('data-theme', state.theme);
document.getElementById('themeToggle').addEventListener('click', () => {
  state.theme = state.theme === 'sun' ? 'warm' : 'sun';
  document.documentElement.setAttribute('data-theme', state.theme);
  document.getElementById('themeToggle').textContent = state.theme === 'sun' ? 'Sunlight ☀' : 'Warm ☼';
  saveState();
});
document.getElementById('themeToggle').textContent = state.theme === 'sun' ? 'Sunlight ☀' : 'Warm ☼';

// ====== Util: shuffle ======
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function filteredItems() {
  return ALL_ITEMS.filter(it => state.selectedSections.includes(it.section));
}

// ====== Section chips ======
function renderSectionChips() {
  const box = document.getElementById('sectionChips');
  box.innerHTML = '';
  SECTION_ORDER.forEach(sec => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (state.selectedSections.includes(sec) ? ' active' : '');
    const short = SECTION_SHORT[sec] || sec;
    const count = ALL_ITEMS.filter(it => it.section === sec).length;
    chip.innerHTML = `${short} <span style="opacity:.6;font-family:'JetBrains Mono',monospace;font-size:10px;margin-left:2px">·${count}</span>`;
    chip.title = sec;
    chip.addEventListener('click', () => {
      if (state.selectedSections.includes(sec)) {
        state.selectedSections = state.selectedSections.filter(s => s !== sec);
      } else {
        state.selectedSections.push(sec);
      }
      saveState();
      quizSession = null;
      examSession = null;
      renderSectionChips();
      renderAll();
    });
    box.appendChild(chip);
  });
}

document.getElementById('selectAll').addEventListener('click', () => {
  state.selectedSections = SECTION_ORDER.slice();
  saveState(); quizSession = null; examSession = null; renderSectionChips(); renderAll();
});
document.getElementById('selectNone').addEventListener('click', () => {
  state.selectedSections = [];
  saveState(); quizSession = null; examSession = null; renderSectionChips(); renderAll();
});
document.getElementById('resetStats').addEventListener('click', () => {
  if (confirm('確定重置所有答題紀錄與考試歷史?')) {
    stats = { byItem: {}, total: { correct: 0, wrong: 0 } };
    examHistory = [];
    saveStats();
    saveExamHistory();
    renderAll();
  }
});

// ====== Mode tabs ======
document.querySelectorAll('.mode-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    state.mode = tab.dataset.mode;
    saveState();
    document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === state.mode));
    quizSession = null;
    examSession = null;
    renderAll();
  });
});
document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === state.mode));

// ====== Mode options ======
function renderModeOptions() {
  const row = document.getElementById('modeOptionsRow');
  const labelEl = document.getElementById('modeOptionsLabel');
  const box = document.getElementById('modeOptions');
  box.innerHTML = '';
  
  if (state.mode === 'img2name') {
    row.style.display = '';
    labelEl.textContent = '作答方向';
    [{val:'zh',label:'答中文名'},{val:'en',label:'答英文名'}].forEach(o => {
      const c = document.createElement('button');
      c.className = 'chip' + (state.img2nameDir === o.val ? ' active' : '');
      c.textContent = o.label;
      c.addEventListener('click', () => { state.img2nameDir = o.val; saveState(); renderModeOptions(); renderAll(); });
      box.appendChild(c);
    });
  } else if (state.mode === 'name2img') {
    row.style.display = '';
    labelEl.textContent = '顯示語言';
    [{val:'zh',label:'顯示中文名'},{val:'en',label:'顯示英文名'}].forEach(o => {
      const c = document.createElement('button');
      c.className = 'chip' + (state.name2imgDir === o.val ? ' active' : '');
      c.textContent = o.label;
      c.addEventListener('click', () => { state.name2imgDir = o.val; saveState(); renderModeOptions(); renderAll(); });
      box.appendChild(c);
    });
  } else {
    row.style.display = 'none';
  }
}

function renderSummary() {
  const items = filteredItems();
  document.getElementById('summaryText').textContent = `${state.selectedSections.length}/${SECTION_ORDER.length} 章 · ${items.length}/${ALL_ITEMS.length} 項`;
}

// ====== Main dispatcher ======
function renderAll() {
  renderModeOptions();
  renderSummary();
  const c = document.getElementById('content');
  c.innerHTML = '';
  const items = filteredItems();
  
  if (state.mode !== 'stats' && items.length === 0) {
    c.innerHTML = `<div class="empty"><div class="empty-title">No section selected</div><div>請選擇至少一個章節以開始</div></div>`;
    return;
  }
  
  switch (state.mode) {
    case 'browse': renderBrowse(c, items); break;
    case 'img2name': renderImg2Name(c, items); break;
    case 'name2img': renderName2Img(c, items); break;
    case 'recall': renderRecall(c, items); break;
    case 'exam': renderExam(c, items); break;
    case 'stats': renderStats(c); break;
  }
}

// ====== Browse mode ======
function renderBrowse(container, items) {
  const grid = document.createElement('div');
  grid.className = 'grid';
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'card';
    const shortSec = SECTION_SHORT[item.section] || item.section;
    const noteHtml = item.note
      ? `<div class="card-note"><span class="note-label">校註</span>${item.note}</div>`
      : '';
    card.innerHTML = `
      <div class="card-img-wrap"><img src="${item.img}" alt="${item.en}" loading="lazy"></div>
      <div class="card-body">
        <div class="card-section">${shortSec}${item.image_label ? ` · <span class="card-label-tag" style="margin-left:6px">${item.image_label}</span>` : ''}</div>
        <div class="card-en">${item.en}</div>
        <div class="card-zh">${item.zh}</div>
        <div class="field"><span class="field-label">A</span><span class="field-text">${item.action || '—'}</span></div>
        <div class="field"><span class="field-label">起</span><span class="field-text">${item.origin || '—'}</span></div>
        <div class="field"><span class="field-label">止</span><span class="field-text">${item.insertion || '—'}</span></div>
        ${noteHtml}
      </div>
    `;
    grid.appendChild(card);
  });
  container.appendChild(grid);
}

// ====== Quiz session (img2name / name2img / recall) ======
let quizSession = null;

function startQuizSession(items) {
  quizSession = {
    queue: shuffle(items),
    index: 0,
    correct: 0,
    wrong: 0,
    judged: false
  };
}

function recordResult(item, correct) {
  if (!stats.byItem[item.id]) stats.byItem[item.id] = { correct: 0, wrong: 0 };
  if (correct) {
    stats.byItem[item.id].correct++;
    stats.total.correct++;
    if (quizSession) quizSession.correct++;
  } else {
    stats.byItem[item.id].wrong++;
    stats.total.wrong++;
    if (quizSession) quizSession.wrong++;
  }
  saveStats();
}

function progressHeaderHTML() {
  return `
    <div class="quiz-progress">
      <span>第 <strong>${quizSession.index + 1}</strong> / ${quizSession.queue.length} 題</span>
      <span><span class="score-pos">✓ ${quizSession.correct}</span> &nbsp; <span class="score-neg">✗ ${quizSession.wrong}</span></span>
    </div>
  `;
}

// ----- Img2Name -----
function renderImg2Name(container, items) {
  if (!quizSession || quizSession.sourceMode !== 'img2name') {
    startQuizSession(items);
    quizSession.sourceMode = 'img2name';
  }
  if (quizSession.index >= quizSession.queue.length) {
    renderSessionComplete(container);
    return;
  }
  const item = quizSession.queue[quizSession.index];
  const dir = state.img2nameDir;
  const shortSec = SECTION_SHORT[item.section] || item.section;
  
  const stage = document.createElement('div');
  stage.className = 'quiz-stage';
  stage.innerHTML = `
    ${progressHeaderHTML()}
    <div class="quiz-img-frame"><img src="${item.img}" alt="muscle"></div>
    <div class="quiz-question">這塊肌肉的${dir === 'zh' ? '中文' : '英文'}名稱是?</div>
    <input class="answer-input" type="text" id="answerInput" placeholder="${dir === 'zh' ? '請輸入中文名' : 'Type the English name'}" autocomplete="off" autofocus>
    <div class="btn-row">
      <button class="btn" id="revealBtn">顯示答案</button>
      <button class="btn secondary" id="skipBtn">跳過</button>
    </div>
    <div class="quiz-feedback" id="feedback"></div>
  `;
  container.appendChild(stage);
  
  const input = document.getElementById('answerInput');
  const reveal = document.getElementById('revealBtn');
  const skip = document.getElementById('skipBtn');
  const fb = document.getElementById('feedback');
  
  function normalize(s) {
    return (s || '').toLowerCase().replace(/[\s\-,.\(\)（），。、]/g, '');
  }
  function detailHtml() {
    return `
      <div><span class="field-label">EN</span><span class="qf-en">${item.en}</span></div>
      <div><span class="field-label">中文</span><span class="qf-zh">${item.zh}</span></div>
      <div style="margin-top:8px"><span class="field-label">A</span>${item.action}</div>
      <div><span class="field-label">起</span>${item.origin}</div>
      <div><span class="field-label">止</span>${item.insertion}</div>
      <div style="margin-top:6px;color:var(--ink-soft);font-size:12px">${shortSec}</div>
      ${item.note ? `<div class="qf-note"><span class="qf-note-label">校註</span>${item.note}</div>` : ''}
    `;
  }
  function showFeedback(isCorrect) {
    fb.classList.add('show');
    quizSession.judged = true;
    recordResult(item, isCorrect);
    fb.innerHTML = `
      <div class="qf-status ${isCorrect ? 'correct' : 'wrong'}">${isCorrect ? '✓ 答對' : '✗ 再記一次'}</div>
      <div class="qf-details">${detailHtml()}</div>
      <div class="btn-row"><button class="btn" id="nextBtn">下一題 →</button></div>
    `;
    reveal.disabled = true; skip.disabled = true; input.disabled = true;
    document.getElementById('nextBtn').addEventListener('click', nextQ);
    document.getElementById('nextBtn').focus();
  }
  function showRevealOnly() {
    fb.classList.add('show');
    fb.innerHTML = `
      <div class="qf-status review">答案</div>
      <div class="qf-details">${detailHtml()}</div>
      <div class="quiz-question" style="margin-top:14px;font-size:13px">自我評分</div>
      <div class="btn-row">
        <button class="btn judge-correct" id="judgeRight">我記得 ✓</button>
        <button class="btn judge-wrong" id="judgeWrong">沒記住 ✗</button>
      </div>
    `;
    reveal.disabled = true; skip.disabled = true; input.disabled = true;
    document.getElementById('judgeRight').addEventListener('click', () => { recordResult(item, true); nextQ(); });
    document.getElementById('judgeWrong').addEventListener('click', () => { recordResult(item, false); nextQ(); });
  }
  function checkAnswer() {
    const ans = input.value.trim();
    if (!ans) return;
    const correctAns = dir === 'zh' ? item.zh : item.en;
    showFeedback(normalize(ans) === normalize(correctAns));
  }
  function nextQ() { quizSession.index++; quizSession.judged = false; renderAll(); }
  
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (quizSession.judged) return;
      if (!input.value.trim()) showRevealOnly();
      else checkAnswer();
    }
  });
  reveal.addEventListener('click', showRevealOnly);
  skip.addEventListener('click', () => { recordResult(item, false); nextQ(); });
}

// ----- Name2Img -----
function renderName2Img(container, items) {
  if (items.length < 4) {
    container.innerHTML = `<div class="empty"><div class="empty-title">章節項數太少</div><div>看名選圖至少需要 4 項以提供誘餌選項</div></div>`;
    return;
  }
  if (!quizSession || quizSession.sourceMode !== 'name2img') {
    startQuizSession(items);
    quizSession.sourceMode = 'name2img';
  }
  if (quizSession.index >= quizSession.queue.length) { renderSessionComplete(container); return; }
  
  const item = quizSession.queue[quizSession.index];
  const dir = state.name2imgDir;
  const shortSec = SECTION_SHORT[item.section] || item.section;
  
  const sameSection = items.filter(x => x.section === item.section && x.id !== item.id);
  const pool = sameSection.length >= 3 ? sameSection : items.filter(x => x.id !== item.id);
  const distractors = shuffle(pool).slice(0, 3);
  const choices = shuffle([item, ...distractors]);
  
  const stage = document.createElement('div');
  stage.className = 'quiz-stage';
  const nameDisplay = dir === 'zh'
    ? `<div style="text-align:center;margin-bottom:6px"><span style="font-family:'Noto Serif TC',serif;font-size:36px;font-weight:700;letter-spacing:3px">${item.zh}</span></div>
       <div style="text-align:center;color:var(--ink-soft);font-style:italic;font-family:'Fraunces',serif;font-size:17px;margin-bottom:16px">${item.en}</div>`
    : `<div style="text-align:center;margin-bottom:6px"><span style="font-family:'Fraunces',serif;font-size:34px;font-style:italic;color:var(--tangerine-deep);font-weight:600;font-variation-settings:'opsz' 100">${item.en}</span></div>
       <div style="text-align:center;color:var(--ink-soft);font-size:15px;margin-bottom:16px">${item.zh}</div>`;
  
  stage.innerHTML = `
    ${progressHeaderHTML()}
    ${nameDisplay}
    <div class="quiz-question">下面哪張圖對應這條肌肉?</div>
    <div class="img-choice-grid" id="imgChoices"></div>
    <div class="quiz-feedback" id="feedback"></div>
  `;
  container.appendChild(stage);
  
  const grid = document.getElementById('imgChoices');
  const fb = document.getElementById('feedback');
  
  choices.forEach((c, idx) => {
    const btn = document.createElement('div');
    btn.className = 'img-choice';
    btn.innerHTML = `
      <div class="ic-imgbox"><img src="${c.img}" alt="choice ${idx+1}"></div>
      <div class="ic-label">${String.fromCharCode(65 + idx)}</div>
    `;
    btn.addEventListener('click', () => {
      if (quizSession.judged) return;
      quizSession.judged = true;
      const correct = c.id === item.id;
      recordResult(item, correct);
      grid.querySelectorAll('.img-choice').forEach((el, i) => {
        if (choices[i].id === item.id) el.classList.add('correct');
        else if (i === idx) el.classList.add('incorrect');
      });
      fb.classList.add('show');
      fb.innerHTML = `
        <div class="qf-status ${correct ? 'correct' : 'wrong'}">${correct ? '✓ 答對' : '✗ 看仔細'}</div>
        <div class="qf-details">
          <div><span class="field-label">A</span>${item.action}</div>
          <div><span class="field-label">起</span>${item.origin}</div>
          <div><span class="field-label">止</span>${item.insertion}</div>
          <div style="margin-top:6px;color:var(--ink-soft);font-size:12px">${shortSec}</div>
          ${item.note ? `<div class="qf-note"><span class="qf-note-label">校註</span>${item.note}</div>` : ''}
        </div>
        <div class="btn-row"><button class="btn" id="nextBtn">下一題 →</button></div>
      `;
      const next = document.getElementById('nextBtn');
      next.addEventListener('click', () => { quizSession.index++; quizSession.judged = false; renderAll(); });
      next.focus();
    });
    grid.appendChild(btn);
  });
}

// ----- Recall -----
function renderRecall(container, items) {
  if (!quizSession || quizSession.sourceMode !== 'recall') {
    startQuizSession(items);
    quizSession.sourceMode = 'recall';
  }
  if (quizSession.index >= quizSession.queue.length) { renderSessionComplete(container); return; }
  
  const item = quizSession.queue[quizSession.index];
  const shortSec = SECTION_SHORT[item.section] || item.section;
  
  const stage = document.createElement('div');
  stage.className = 'quiz-stage';
  const fieldsConfig = [
    { f: 'en', label: 'EN · English Name', cls: 'en-style', val: item.en },
    { f: 'zh', label: 'ZH · 中文名', cls: 'zh-style', val: item.zh },
    { f: 'action', label: 'A · Action 動作', cls: '', val: item.action },
    { f: 'origin', label: 'O · Origin 起點', cls: '', val: item.origin },
    { f: 'insertion', label: 'I · Insertion 止點', cls: '', val: item.insertion }
  ];
  let fieldsHtml = '';
  fieldsConfig.forEach(fc => {
    fieldsHtml += `
      <div class="recall-field">
        <div class="recall-field-head">
          <span class="recall-field-label">${fc.label}</span>
          <button class="recall-field-reveal" data-field="${fc.f}">顯示</button>
        </div>
        <div class="recall-field-body">
          <div class="recall-placeholder">想到了嗎?點右上「顯示」核對</div>
          <div class="recall-answer ${fc.cls}" data-answer="${fc.f}">${fc.val}</div>
        </div>
      </div>
    `;
  });
  
  stage.innerHTML = `
    ${progressHeaderHTML()}
    <div class="quiz-img-frame"><img src="${item.img}" alt="muscle"></div>
    <div class="quiz-question">在心中回想以下五項,逐一翻牌核對</div>
    <div class="recall-fields">${fieldsHtml}</div>
    ${item.note ? `<div class="qf-note" style="margin-top:14px"><span class="qf-note-label">校註</span>${item.note}</div>` : ''}
    <div style="text-align:center;margin-top:14px;color:var(--ink-soft);font-size:12px;font-family:'JetBrains Mono',monospace;letter-spacing:1px">${shortSec}${item.image_label ? ' · ' + item.image_label : ''}</div>
    <div class="quiz-question" style="margin-top:22px;font-size:13px">回想完成,自評本題:</div>
    <div class="btn-row" style="justify-content:center">
      <button class="btn judge-correct" id="recallRight">全記得 ✓</button>
      <button class="btn" id="recallPartial" style="background:var(--sun-deep);border-color:var(--sun-deep)">部分記得</button>
      <button class="btn judge-wrong" id="recallWrong">沒記住 ✗</button>
      <button class="btn secondary" id="revealAll">一鍵全顯示</button>
    </div>
  `;
  container.appendChild(stage);
  
  stage.querySelectorAll('.recall-field-reveal').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = btn.dataset.field;
      const ans = stage.querySelector(`.recall-answer[data-answer="${f}"]`);
      const ph = ans.parentElement.querySelector('.recall-placeholder');
      ans.classList.add('show');
      if (ph) ph.style.display = 'none';
      btn.style.display = 'none';
    });
  });
  document.getElementById('revealAll').addEventListener('click', () => {
    stage.querySelectorAll('.recall-field-reveal').forEach(b => { if (b.style.display !== 'none') b.click(); });
  });
  function advance(correct) {
    if (quizSession.judged) return;
    quizSession.judged = true;
    recordResult(item, correct);
    quizSession.index++; quizSession.judged = false;
    renderAll();
  }
  document.getElementById('recallRight').addEventListener('click', () => advance(true));
  document.getElementById('recallPartial').addEventListener('click', () => advance(false));
  document.getElementById('recallWrong').addEventListener('click', () => advance(false));
}

// ====== Session complete (non-exam) ======
function renderSessionComplete(container) {
  const total = quizSession.queue.length;
  const c = quizSession.correct;
  const w = quizSession.wrong;
  const pct = total > 0 ? Math.round((c / total) * 100) : 0;
  container.innerHTML = `
    <div class="quiz-stage" style="text-align:center;padding:50px 30px">
      <div style="font-family:'Fraunces',serif;font-style:italic;font-size:44px;color:var(--tangerine-deep);margin-bottom:8px;font-weight:600">Session Complete</div>
      <div style="font-size:16px;color:var(--ink-soft);letter-spacing:2px;margin-bottom:28px">本回合結束</div>
      <div style="display:flex;justify-content:center;gap:36px;margin-bottom:28px;flex-wrap:wrap">
        <div><div class="stat-label">總題數</div><div class="stat-value" style="color:var(--ink)">${total}</div></div>
        <div><div class="stat-label">答對</div><div class="stat-value" style="color:var(--leaf-deep)">${c}</div></div>
        <div><div class="stat-label">需再記</div><div class="stat-value" style="color:var(--rose)">${w}</div></div>
        <div><div class="stat-label">準確率</div><div class="stat-value" style="color:var(--sun-deep)">${pct}<span style="font-size:24px">%</span></div></div>
      </div>
      <div class="btn-row" style="justify-content:center">
        <button class="btn primary-cta" id="restartSession">再來一輪</button>
        <button class="btn secondary" id="backToBrowse">回到瀏覽</button>
      </div>
    </div>
  `;
  document.getElementById('restartSession').addEventListener('click', () => { quizSession = null; renderAll(); });
  document.getElementById('backToBrowse').addEventListener('click', () => {
    state.mode = 'browse'; quizSession = null; saveState();
    document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === state.mode));
    renderAll();
  });
}

// ====== Exam mode (模擬考) ======
let examSession = null;

function generateExamQuestion(item, qtype, allItems) {
  // Build pool of distractors from same section first, then anywhere
  const same = allItems.filter(x => x.section === item.section && x.id !== item.id);
  const other = allItems.filter(x => x.id !== item.id);
  const pool = same.length >= 3 ? same : other;
  
  if (qtype === 'img2en' || qtype === 'img2zh') {
    const distractors = shuffle(pool).slice(0, 3);
    const choices = shuffle([item, ...distractors]);
    return { qtype, item, choices, correctId: item.id };
  }
  if (qtype === 'en2img' || qtype === 'zh2img') {
    const distractors = shuffle(pool).slice(0, 3);
    const choices = shuffle([item, ...distractors]);
    return { qtype, item, choices, correctId: item.id };
  }
  if (qtype === 'action2muscle' || qtype === 'origin2muscle' || qtype === 'insertion2muscle') {
    const distractors = shuffle(pool).slice(0, 3);
    const choices = shuffle([item, ...distractors]);
    return { qtype, item, choices, correctId: item.id };
  }
  return null;
}

function buildExamQuestions(items, count, qtypes) {
  const usable = items.length >= 4 ? items : items;
  if (usable.length < 4) return [];
  const pickedItems = shuffle(usable).slice(0, Math.min(count, usable.length));
  // If count > items, allow repeats
  while (pickedItems.length < count) {
    pickedItems.push(usable[Math.floor(Math.random() * usable.length)]);
  }
  const questions = [];
  pickedItems.forEach(it => {
    const t = qtypes[Math.floor(Math.random() * qtypes.length)];
    const q = generateExamQuestion(it, t, usable);
    if (q) questions.push(q);
  });
  return questions;
}

function startExam(items) {
  const cfg = state.examConfig;
  const qs = buildExamQuestions(items, cfg.questionCount, cfg.qtypes);
  examSession = {
    questions: qs,
    index: 0,
    answers: new Array(qs.length).fill(null),  // index into choices
    finished: false,
    startTime: Date.now()
  };
}

function renderExam(container, items) {
  if (!examSession) {
    renderExamIntro(container, items);
    return;
  }
  if (examSession.finished) {
    renderExamResult(container);
    return;
  }
  renderExamQuestion(container);
}

function renderExamIntro(container, items) {
  const cfg = state.examConfig;
  const maxQs = Math.max(items.length, 10);
  
  const wrap = document.createElement('div');
  wrap.className = 'exam-intro';
  wrap.innerHTML = `
    <h2>Mock Exam</h2>
    <div class="zh-sub">肌 ☀ 學 模 擬 考</div>
    <p>從目前選定的章節中,隨機抽取題目並生成 4 選 1 選擇題;考完之後才看結果與詳解,模擬實際考試節奏。</p>
    <div class="exam-setting">
      <div class="exam-setting-row">
        <span class="exam-setting-label">題數</span>
        <div id="examCountChips" style="display:contents"></div>
      </div>
      <div class="exam-setting-row">
        <span class="exam-setting-label">題型</span>
        <div id="examTypeChips" style="display:contents"></div>
      </div>
    </div>
    <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink-soft);margin-bottom:18px;letter-spacing:1px">
      已選章節:${state.selectedSections.length} 章 · 可抽取題庫:${items.length} 條肌肉
    </div>
    <div class="btn-row" style="justify-content:center">
      <button class="btn primary-cta" id="startExamBtn">開始考試 →</button>
    </div>
  `;
  container.appendChild(wrap);
  
  const countBox = document.getElementById('examCountChips');
  // Build distinct count options: [10, 25, 50, 100, all] capped at items.length
  const rawOpts = [10, 25, 50, 100, items.length];
  const countOpts = [];
  rawOpts.forEach(n => {
    if (n > items.length) return;
    if (!countOpts.includes(n)) countOpts.push(n);
  });
  // If items.length wasn't already in there, add it
  if (!countOpts.includes(items.length)) countOpts.push(items.length);
  
  // Auto-cap saved questionCount to available items
  if (cfg.questionCount > items.length) {
    cfg.questionCount = items.length;
    saveState();
  }
  
  countOpts.forEach(n => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (cfg.questionCount === n ? ' active' : '');
    chip.textContent = n === items.length ? `全部 ${n}` : `${n} 題`;
    chip.addEventListener('click', () => {
      state.examConfig.questionCount = n;
      saveState();
      renderAll();
    });
    countBox.appendChild(chip);
  });
  
  const typeBox = document.getElementById('examTypeChips');
  Object.entries(QTYPE_LABEL).forEach(([key, label]) => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (cfg.qtypes.includes(key) ? ' active' : '');
    chip.textContent = label;
    chip.addEventListener('click', () => {
      if (cfg.qtypes.includes(key)) {
        if (cfg.qtypes.length === 1) return;
        cfg.qtypes = cfg.qtypes.filter(t => t !== key);
      } else {
        cfg.qtypes.push(key);
      }
      saveState();
      renderAll();
    });
    typeBox.appendChild(chip);
  });
  
  document.getElementById('startExamBtn').addEventListener('click', () => {
    if (cfg.qtypes.length === 0) {
      alert('請至少選一種題型');
      return;
    }
    if (items.length < 4) {
      alert('題庫至少需要 4 條肌肉才能出選擇題');
      return;
    }
    startExam(items);
    renderAll();
  });
}

function renderExamQuestion(container) {
  const sess = examSession;
  const q = sess.questions[sess.index];
  const total = sess.questions.length;
  const pct = ((sess.index) / total) * 100;
  const answeredCount = sess.answers.filter(a => a !== null).length;
  
  const stage = document.createElement('div');
  stage.className = 'quiz-stage';
  
  // Build prompt area based on qtype
  let promptHtml = '';
  let mainArea = '';
  
  if (q.qtype === 'img2en') {
    mainArea = `<div class="exam-img-frame"><img src="${q.item.img}" alt="muscle"></div>`;
    promptHtml = `<div class="exam-prompt">這塊肌肉的<span class="prompt-highlight">英文名稱</span>是?</div>`;
  } else if (q.qtype === 'img2zh') {
    mainArea = `<div class="exam-img-frame"><img src="${q.item.img}" alt="muscle"></div>`;
    promptHtml = `<div class="exam-prompt">這塊肌肉的<span class="prompt-highlight">中文名稱</span>是?</div>`;
  } else if (q.qtype === 'en2img') {
    promptHtml = `<div class="exam-prompt">下列哪一張圖對應 <span class="prompt-en">${q.item.en}</span> ?</div>`;
  } else if (q.qtype === 'zh2img') {
    promptHtml = `<div class="exam-prompt">下列哪一張圖對應 <span class="prompt-zh">${q.item.zh}</span> ?</div>`;
  } else if (q.qtype === 'action2muscle') {
    promptHtml = `<div class="exam-prompt">具有以下動作的肌肉是?<span class="prompt-detail">「${escapeHtml(q.item.action)}」</span></div>`;
  } else if (q.qtype === 'origin2muscle') {
    promptHtml = `<div class="exam-prompt">起點為下列敘述的肌肉是?<span class="prompt-detail">「${escapeHtml(q.item.origin)}」</span></div>`;
  } else if (q.qtype === 'insertion2muscle') {
    promptHtml = `<div class="exam-prompt">止點為下列敘述的肌肉是?<span class="prompt-detail">「${escapeHtml(q.item.insertion)}」</span></div>`;
  }
  
  // Build choices area
  let choicesHtml = '';
  if (q.qtype === 'en2img' || q.qtype === 'zh2img') {
    choicesHtml = `<div class="img-choice-grid">` + q.choices.map((c, idx) => `
      <div class="img-choice" data-idx="${idx}">
        <div class="ic-imgbox"><img src="${c.img}" alt="choice ${idx+1}"></div>
        <div class="ic-label">${String.fromCharCode(65 + idx)}</div>
      </div>
    `).join('') + `</div>`;
  } else if (q.qtype === 'img2en') {
    choicesHtml = `<div class="choice-grid">` + q.choices.map((c, idx) => `
      <button class="choice" data-idx="${idx}">
        <span class="choice-letter">${String.fromCharCode(65 + idx)}</span>
        <span class="choice-en">${c.en}</span>
      </button>
    `).join('') + `</div>`;
  } else if (q.qtype === 'img2zh') {
    choicesHtml = `<div class="choice-grid">` + q.choices.map((c, idx) => `
      <button class="choice" data-idx="${idx}">
        <span class="choice-letter">${String.fromCharCode(65 + idx)}</span>
        <span class="choice-zh">${c.zh}</span>
      </button>
    `).join('') + `</div>`;
  } else {
    // action/origin/insertion -> show both en + zh
    choicesHtml = `<div class="choice-grid">` + q.choices.map((c, idx) => `
      <button class="choice" data-idx="${idx}">
        <span class="choice-letter">${String.fromCharCode(65 + idx)}</span>
        <span class="choice-en">${c.en}</span>
        <span class="choice-zh">${c.zh}</span>
      </button>
    `).join('') + `</div>`;
  }
  
  stage.innerHTML = `
    <div class="exam-progress-bar"><div class="exam-progress-fill" style="width:${pct}%"></div></div>
    <div class="exam-question-meta">
      <span>第 <strong>${sess.index + 1}</strong> / ${total} 題 &nbsp;·&nbsp; 已作答 ${answeredCount}</span>
      <span class="exam-q-type-badge">${QTYPE_LABEL[q.qtype]}</span>
    </div>
    ${promptHtml}
    ${mainArea}
    ${choicesHtml}
    <div class="exam-controls">
      <button class="btn secondary" id="examPrev" ${sess.index === 0 ? 'disabled' : ''}>← 上一題</button>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${sess.index < total - 1
          ? `<button class="btn" id="examNext">下一題 →</button>`
          : `<button class="btn primary-cta" id="examSubmit">交卷 (${answeredCount}/${total})</button>`}
      </div>
    </div>
  `;
  container.appendChild(stage);
  
  // Mark currently selected
  const currentAns = sess.answers[sess.index];
  if (currentAns !== null) {
    const sel = stage.querySelector(`[data-idx="${currentAns}"]`);
    if (sel) sel.classList.add('selected');
  }
  
  // Wire choice clicks
  stage.querySelectorAll('[data-idx]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      const wasAnswered = sess.answers[sess.index] !== null;
      sess.answers[sess.index] = idx;
      // Auto-advance only on first answer & not the last question; otherwise just update selection
      if (!wasAnswered && sess.index < total - 1) {
        sess.index++;
        renderAll();
      } else {
        renderAll();
      }
    });
  });
  
  document.getElementById('examPrev')?.addEventListener('click', () => { sess.index--; renderAll(); });
  document.getElementById('examNext')?.addEventListener('click', () => { sess.index++; renderAll(); });
  document.getElementById('examSubmit')?.addEventListener('click', () => {
    const unanswered = sess.answers.filter(a => a === null).length;
    if (unanswered > 0) {
      if (!confirm(`還有 ${unanswered} 題未作答,確定要交卷?`)) return;
    }
    finalizeExam();
    renderAll();
  });
}

function finalizeExam() {
  const sess = examSession;
  let correct = 0;
  sess.questions.forEach((q, i) => {
    const ansIdx = sess.answers[i];
    const isCorrect = ansIdx !== null && q.choices[ansIdx].id === q.correctId;
    if (isCorrect) correct++;
    // Also record into overall stats
    recordResult(q.item, isCorrect);
  });
  sess.finished = true;
  sess.correct = correct;
  sess.endTime = Date.now();
  
  // Save to exam history
  examHistory.unshift({
    date: new Date().toISOString(),
    total: sess.questions.length,
    correct: correct,
    durationSec: Math.round((sess.endTime - sess.startTime) / 1000),
    qtypes: state.examConfig.qtypes.slice()
  });
  if (examHistory.length > 50) examHistory = examHistory.slice(0, 50);
  saveExamHistory();
}

function renderExamResult(container) {
  const sess = examSession;
  const total = sess.questions.length;
  const correct = sess.correct;
  const wrong = total - correct;
  const pct = Math.round((correct / total) * 100);
  const mins = Math.floor(sess.durationSec ? (sess.endTime - sess.startTime) / 60000 : 0);
  const secs = Math.round((sess.endTime - sess.startTime) / 1000) % 60;
  
  let grade = 'D';
  let gradeLabel = '需加強';
  if (pct >= 90) { grade = 'A'; gradeLabel = '優秀'; }
  else if (pct >= 75) { grade = 'B'; gradeLabel = '良好'; }
  else if (pct >= 60) { grade = 'C'; gradeLabel = '及格'; }
  
  const summary = document.createElement('div');
  summary.className = 'exam-result-summary';
  summary.innerHTML = `
    <h2 class="grade-${grade}">Grade ${grade}</h2>
    <div class="zh-sub">${gradeLabel}</div>
    <div class="exam-score-circle">${pct}<span class="score-pct-mark">%</span></div>
    <div class="exam-result-stats">
      <div class="exam-result-stat"><div class="l">總題數</div><div class="v" style="color:var(--ink)">${total}</div></div>
      <div class="exam-result-stat"><div class="l">答對</div><div class="v" style="color:var(--leaf-deep)">${correct}</div></div>
      <div class="exam-result-stat"><div class="l">答錯</div><div class="v" style="color:var(--rose)">${wrong}</div></div>
      <div class="exam-result-stat"><div class="l">耗時</div><div class="v" style="color:var(--sun-deep)">${mins}:${String(secs).padStart(2,'0')}</div></div>
    </div>
    <div class="btn-row" style="justify-content:center">
      <button class="btn primary-cta" id="newExamBtn">再考一次</button>
      <button class="btn secondary" id="retryWrongBtn" ${wrong === 0 ? 'disabled' : ''}>只考錯題 (${wrong})</button>
      <button class="btn secondary" id="backToBrowse2">回到瀏覽</button>
    </div>
  `;
  container.appendChild(summary);
  
  // Review list
  const review = document.createElement('div');
  review.className = 'exam-review';
  let reviewHtml = `<h3>詳解 Review</h3>`;
  sess.questions.forEach((q, i) => {
    const ansIdx = sess.answers[i];
    const isCorrect = ansIdx !== null && q.choices[ansIdx].id === q.correctId;
    const userAns = ansIdx !== null ? q.choices[ansIdx] : null;
    const correctAns = q.choices.find(c => c.id === q.correctId);
    const promptText = examPromptText(q);
    
    let lines = '';
    if (q.qtype === 'en2img' || q.qtype === 'zh2img') {
      // Correct answer is "the muscle whose image is correct"; show item name
      lines = `
        <div class="rb-ans-line">
          <span><span class="rb-label">正解</span><span class="rb-correct-ans">${correctAns.en} / ${correctAns.zh}</span></span>
          ${userAns && !isCorrect ? `<span><span class="rb-label">你選</span><span class="rb-user-ans">${userAns.en} / ${userAns.zh}</span></span>` : ''}
          ${userAns === null ? `<span><span class="rb-label">你選</span><span class="rb-user-ans">未作答</span></span>` : ''}
        </div>
      `;
    } else if (q.qtype === 'img2en') {
      lines = `
        <div class="rb-ans-line">
          <span><span class="rb-label">正解</span><span class="rb-correct-ans">${correctAns.en}</span></span>
          ${userAns && !isCorrect ? `<span><span class="rb-label">你選</span><span class="rb-user-ans">${userAns.en}</span></span>` : ''}
          ${userAns === null ? `<span><span class="rb-label">你選</span><span class="rb-user-ans">未作答</span></span>` : ''}
        </div>
      `;
    } else if (q.qtype === 'img2zh') {
      lines = `
        <div class="rb-ans-line">
          <span><span class="rb-label">正解</span><span class="rb-correct-ans">${correctAns.zh}</span></span>
          ${userAns && !isCorrect ? `<span><span class="rb-label">你選</span><span class="rb-user-ans">${userAns.zh}</span></span>` : ''}
          ${userAns === null ? `<span><span class="rb-label">你選</span><span class="rb-user-ans">未作答</span></span>` : ''}
        </div>
      `;
    } else {
      lines = `
        <div class="rb-ans-line">
          <span><span class="rb-label">正解</span><span class="rb-correct-ans">${correctAns.en} / ${correctAns.zh}</span></span>
          ${userAns && !isCorrect ? `<span><span class="rb-label">你選</span><span class="rb-user-ans">${userAns.en} / ${userAns.zh}</span></span>` : ''}
          ${userAns === null ? `<span><span class="rb-label">你選</span><span class="rb-user-ans">未作答</span></span>` : ''}
        </div>
      `;
    }
    
    const noteHtml = q.item.note ? `<div class="qf-note" style="margin-top:6px;font-size:11.5px"><span class="qf-note-label">校註</span>${q.item.note}</div>` : '';
    
    reviewHtml += `
      <div class="review-item">
        <div class="review-icon ${isCorrect ? 'correct' : 'wrong'}">${isCorrect ? '✓' : '✗'}</div>
        <div class="rb-thumb"><img src="${q.item.img}" alt=""></div>
        <div class="review-body">
          <div class="rb-num">Q${i + 1} · ${QTYPE_LABEL[q.qtype]}</div>
          <div class="rb-q">${promptText}</div>
          ${lines}
          ${noteHtml}
        </div>
      </div>
    `;
  });
  review.innerHTML = reviewHtml;
  container.appendChild(review);
  
  document.getElementById('newExamBtn').addEventListener('click', () => { examSession = null; renderAll(); });
  document.getElementById('retryWrongBtn').addEventListener('click', () => {
    if (wrong === 0) return;
    // Build new exam from wrong items
    const wrongItems = [];
    sess.questions.forEach((q, i) => {
      const ansIdx = sess.answers[i];
      const isCorrect = ansIdx !== null && q.choices[ansIdx].id === q.correctId;
      if (!isCorrect) wrongItems.push(q.item);
    });
    // Dedupe
    const uniq = [];
    const seen = new Set();
    wrongItems.forEach(it => { if (!seen.has(it.id)) { seen.add(it.id); uniq.push(it); } });
    if (uniq.length < 4) {
      alert('錯題不足 4 題,無法生成新測驗。已將你的錯題加入 stats 統計。');
      return;
    }
    const cfg = state.examConfig;
    examSession = {
      questions: buildExamQuestions(uniq, uniq.length, cfg.qtypes),
      index: 0,
      answers: [],
      finished: false,
      startTime: Date.now()
    };
    examSession.answers = new Array(examSession.questions.length).fill(null);
    renderAll();
  });
  document.getElementById('backToBrowse2').addEventListener('click', () => {
    state.mode = 'browse'; examSession = null; saveState();
    document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === state.mode));
    renderAll();
  });
}

function examPromptText(q) {
  if (q.qtype === 'img2en') return '看圖選出英文名稱';
  if (q.qtype === 'img2zh') return '看圖選出中文名稱';
  if (q.qtype === 'en2img') return `<em style="font-family:'Fraunces',serif;color:var(--tangerine-deep);font-weight:600">${q.item.en}</em> 對應哪張圖?`;
  if (q.qtype === 'zh2img') return `<strong>${q.item.zh}</strong> 對應哪張圖?`;
  if (q.qtype === 'action2muscle') return `動作為「${escapeHtml(q.item.action)}」的肌肉?`;
  if (q.qtype === 'origin2muscle') return `起點為「${escapeHtml(q.item.origin)}」的肌肉?`;
  if (q.qtype === 'insertion2muscle') return `止點為「${escapeHtml(q.item.insertion)}」的肌肉?`;
  return '';
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ====== Stats ======
function renderStats(container) {
  const totalAttempts = stats.total.correct + stats.total.wrong;
  const accuracy = totalAttempts > 0 ? Math.round((stats.total.correct / totalAttempts) * 100) : 0;
  const studiedItems = Object.keys(stats.byItem).length;
  const studiedPct = Math.round((studiedItems / ALL_ITEMS.length) * 100);
  
  const weakItems = [];
  Object.entries(stats.byItem).forEach(([id, s]) => {
    const item = ALL_ITEMS.find(it => it.id === id);
    if (!item) return;
    const t = s.correct + s.wrong;
    if (t >= 2) {
      const acc = s.correct / t;
      if (acc < 0.5) weakItems.push({ item, ...s, total: t, acc });
    }
  });
  weakItems.sort((a, b) => a.acc - b.acc);
  
  const sectionProgress = SECTION_ORDER.map(sec => {
    const sectionItems = ALL_ITEMS.filter(it => it.section === sec);
    let totalCorrect = 0, totalAttempts = 0, studied = 0;
    sectionItems.forEach(it => {
      const s = stats.byItem[it.id];
      if (s) { studied++; totalCorrect += s.correct; totalAttempts += s.correct + s.wrong; }
    });
    const acc = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;
    return { sec, total: sectionItems.length, studied, attempts: totalAttempts, correct: totalCorrect, acc };
  });
  
  let html = `
    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-label">總答題次數</div>
        <div class="stat-value">${totalAttempts}</div>
        <div class="stat-sub">cumulative attempts</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">總準確率</div>
        <div class="stat-value">${accuracy}<span style="font-size:22px">%</span></div>
        <div class="stat-sub">${stats.total.correct} / ${totalAttempts}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">已練習肌肉</div>
        <div class="stat-value">${studiedItems}<span style="font-size:22px">/${ALL_ITEMS.length}</span></div>
        <div class="stat-sub">${studiedPct}% covered</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">需加強項數</div>
        <div class="stat-value" style="color:var(--rose)">${weakItems.length}</div>
        <div class="stat-sub">accuracy &lt; 50%</div>
      </div>
    </div>
    
    <div class="section-progress" style="margin-bottom:22px">
      <h3>各章節進度</h3>
  `;
  
  sectionProgress.forEach(p => {
    const accPct = p.attempts > 0 ? Math.round(p.acc * 100) : 0;
    const studiedPct = Math.round((p.studied / p.total) * 100);
    const short = SECTION_SHORT[p.sec] || p.sec;
    const barColor = accPct >= 70 ? 'var(--leaf)' : accPct >= 50 ? 'var(--sun)' : accPct > 0 ? 'var(--tangerine)' : 'var(--rule)';
    html += `
      <div class="sp-row">
        <div class="sp-name">
          <strong>${short}</strong>
          <span style="color:var(--ink-soft);font-size:11.5px;margin-left:8px">${p.sec}</span>
        </div>
        <div class="sp-count">${p.studied}/${p.total} · ${p.attempts > 0 ? accPct + '%' : '—'}</div>
        <div class="sp-bar"><div class="sp-bar-fill" style="width:${studiedPct}%;background:${barColor}"></div></div>
      </div>
    `;
  });
  html += `</div>`;
  
  // Exam history
  if (examHistory.length > 0) {
    html += `<div class="section-progress" style="margin-bottom:22px"><h3>模擬考歷史 <small>最近 ${Math.min(10, examHistory.length)} 場</small></h3>`;
    examHistory.slice(0, 10).forEach(h => {
      const dt = new Date(h.date);
      const dtStr = `${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
      const pct = Math.round((h.correct / h.total) * 100);
      const color = pct >= 90 ? 'var(--leaf-deep)' : pct >= 75 ? 'var(--sun-deep)' : pct >= 60 ? 'var(--tangerine-deep)' : 'var(--rose)';
      const mins = Math.floor(h.durationSec / 60);
      const secs = h.durationSec % 60;
      html += `
        <div class="sp-row" style="grid-template-columns:90px 1fr 100px 80px">
          <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink-soft);letter-spacing:0.5px">${dtStr}</div>
          <div class="sp-name">
            <strong style="color:${color}">${h.correct} / ${h.total}</strong>
            <span style="color:var(--ink-soft);font-size:11.5px;margin-left:8px">${mins}:${String(secs).padStart(2,'0')}</span>
          </div>
          <div class="sp-count">${pct}%</div>
          <div class="sp-bar"><div class="sp-bar-fill" style="width:${pct}%;background:${color}"></div></div>
        </div>
      `;
    });
    html += `</div>`;
  }
  
  if (weakItems.length > 0) {
    html += `<div class="section-progress"><h3>需加強的肌肉</h3>
      <div style="font-size:12px;color:var(--ink-soft);margin-bottom:14px;font-family:'JetBrains Mono',monospace;letter-spacing:0.5px">已答 ≥ 2 次且準確率 &lt; 50%</div>`;
    weakItems.slice(0, 20).forEach(w => {
      const short = SECTION_SHORT[w.item.section] || w.item.section;
      html += `
        <div class="sp-row" style="grid-template-columns:60px 1fr 80px 60px">
          <div style="width:50px;height:50px;background:var(--bg-warm);border:1px solid var(--rule);display:flex;align-items:center;justify-content:center;padding:3px;border-radius:3px">
            <img src="${w.item.img}" style="max-width:100%;max-height:100%;object-fit:contain" alt="">
          </div>
          <div class="sp-name">
            <em style="font-family:'Fraunces',serif;color:var(--tangerine-deep);font-weight:600">${w.item.en}</em>
            <strong style="margin-left:8px">${w.item.zh}</strong>
            <div style="color:var(--ink-soft);font-size:11px;font-family:'JetBrains Mono',monospace;letter-spacing:0.5px;margin-top:2px">${short}</div>
          </div>
          <div class="sp-count">${w.correct}/${w.total}</div>
          <div style="font-family:'Fraunces',serif;font-size:24px;font-weight:600;color:var(--rose);text-align:right">${Math.round(w.acc * 100)}%</div>
        </div>
      `;
    });
    html += `</div>`;
  }
  
  container.innerHTML = html;
}

// ====== Boot ======
(async function boot() {
  const content = document.getElementById('content');
  if (content) {
    content.innerHTML = '<div class="empty"><div class="empty-title">Loading…</div><div>正在載入 110 條肌肉資料</div></div>';
  }
  await loadData();
  ALL_ITEMS = RAW.items || [];
  SECTION_ORDER = RAW.sections || [];
  
  if (ALL_ITEMS.length === 0) {
    if (content) {
      content.innerHTML = `
        <div class="empty">
          <div class="empty-title">無法載入資料</div>
          <div style="margin-top: 12px; line-height: 1.8">
            找不到 <code>data.json</code> 或資料是空的<br>
            <span style="color: var(--ink-soft); font-size: 13px">
              若是用 file:// 直接開啟,瀏覽器會擋 fetch 請求;<br>
              請改用本機 server,例如:<code>python3 -m http.server</code><br>
              或部署到 GitHub Pages 等 HTTP 環境
            </span>
          </div>
        </div>
      `;
    }
    return;
  }
  
  if (!state.selectedSections || state.selectedSections.length === 0 || !state.selectedSections.every(s => SECTION_ORDER.includes(s))) {
    state.selectedSections = SECTION_ORDER.slice();
    saveState();
  }
  renderSectionChips();
  renderAll();
})();
