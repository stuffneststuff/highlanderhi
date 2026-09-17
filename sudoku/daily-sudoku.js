/* ===========================================================
   Daily Sudoku — logic
   Runs inside an <svg><foreignObject> wrapper. All DOM lookups
   use the sdk- prefixed ids/classes defined in daily-sudoku.svg
   and daily-sudoku.css.
=========================================================== */
(function(){
  "use strict";

  /* =========================================================
     1. SEEDED RANDOM + PUZZLE GENERATION
     (deterministic: same date + difficulty always produces
     the same puzzle for every reader)
  ========================================================= */

  function hashStringToSeed(str){
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++){
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }

  function mulberry32(a){
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(arr, rng){
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--){
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Generates a complete, valid, randomized 9x9 solution grid.
  // Uses the classic band/stack shuffle of a base Latin square,
  // which is always valid by construction (no backtracking needed).
  function generateSolvedGrid(rng){
    const base = 3;
    const pattern = (r, c) => (base * (r % base) + Math.floor(r / base) + c) % 9;
    const bandOrder = shuffled([0,1,2], rng);
    const stackOrder = shuffled([0,1,2], rng);
    const rows = [].concat(...bandOrder.map(g => shuffled([0,1,2], rng).map(r => g*base + r)));
    const cols = [].concat(...stackOrder.map(g => shuffled([0,1,2], rng).map(c => g*base + c)));
    const nums = shuffled([1,2,3,4,5,6,7,8,9], rng);
    const board = new Array(81);
    for (let r = 0; r < 9; r++){
      for (let c = 0; c < 9; c++){
        board[r*9+c] = nums[pattern(rows[r], cols[c])];
      }
    }
    return board;
  }

  // Counts solutions of a flat 81-cell board up to `limit` (early exit).
  function countSolutions(flatBoard, limit){
    const b = flatBoard.slice();
    let count = 0;
    function valid(r, c, v){
      const rBase = r*9, br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
      for (let i = 0; i < 9; i++){
        if (b[rBase+i] === v) return false;
        if (b[i*9+c] === v) return false;
      }
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++){
        if (b[(br+i)*9 + (bc+j)] === v) return false;
      }
      return true;
    }
    function backtrack(){
      if (count >= limit) return;
      let pos = -1;
      for (let i = 0; i < 81; i++){ if (b[i] === 0){ pos = i; break; } }
      if (pos === -1){ count++; return; }
      const r = Math.floor(pos/9), c = pos % 9;
      for (let v = 1; v <= 9; v++){
        if (valid(r, c, v)){
          b[pos] = v;
          backtrack();
          b[pos] = 0;
          if (count >= limit) return;
        }
      }
    }
    backtrack();
    return count;
  }

  const DIFFICULTY_CLUES = { easy: 44, medium: 34, hard: 28 };

  // Carves clues out of a full solution, checking after every removal
  // that the puzzle still has exactly one solution. Removes symmetric
  // pairs where possible for a classic look.
  function makePuzzle(solvedFlat, targetClues, rng){
    const puzzle = solvedFlat.slice();
    const cells = [];
    for (let i = 0; i < 81; i++) cells.push(i);
    const order = shuffled(cells, rng);
    let clueCount = 81;
    for (const idx of order){
      if (clueCount <= targetClues) break;
      if (puzzle[idx] === 0) continue;
      const r = Math.floor(idx/9), c = idx % 9;
      const symIdx = (8-r)*9 + (8-c);
      const backupA = puzzle[idx];
      const backupB = puzzle[symIdx];
      puzzle[idx] = 0;
      let removedSym = false;
      if (symIdx !== idx && backupB !== 0){
        puzzle[symIdx] = 0;
        removedSym = true;
      }
      const solCount = countSolutions(puzzle, 2);
      if (solCount !== 1){
        puzzle[idx] = backupA;
        if (removedSym) puzzle[symIdx] = backupB;
      } else {
        clueCount = puzzle.filter(v => v !== 0).length;
      }
    }
    return puzzle;
  }

  function buildPuzzle(dateStr, difficulty){
    const rng = mulberry32(hashStringToSeed(dateStr + "-" + difficulty));
    const solution = generateSolvedGrid(rng);
    const puzzle = makePuzzle(solution, DIFFICULTY_CLUES[difficulty] || 34, rng);
    return { solution, puzzle };
  }

  /* =========================================================
     2. DATE HELPERS
  ========================================================= */

  function pad2(n){ return String(n).padStart(2,"0"); }

  function todayStr(){
    const d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth()+1) + "-" + pad2(d.getDate());
  }

  function parseDateStr(s){
    const [y,m,d] = s.split("-").map(Number);
    return new Date(y, m-1, d);
  }

  function formatDateLine(dateStr){
    const d = parseDateStr(dateStr);
    return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  // Adjust this to your publication's actual puzzle-launch date.
  const ISSUE_EPOCH = parseDateStr("2024-01-01");
  function issueNumber(dateStr){
    const d = parseDateStr(dateStr);
    const days = Math.round((d - ISSUE_EPOCH) / 86400000) + 1;
    return days.toLocaleString("en-US");
  }

  // Default difficulty by day of week — tune to taste.
  // index: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  const WEEKDAY_DIFFICULTY = ["medium","easy","easy","medium","medium","hard","hard"];
  function defaultDifficultyFor(dateStr){
    return WEEKDAY_DIFFICULTY[parseDateStr(dateStr).getDay()];
  }

  function formatTime(totalSeconds){
    const m = Math.floor(totalSeconds/60), s = totalSeconds % 60;
    return m + ":" + pad2(s);
  }

  /* =========================================================
     3. SEASONAL / HOLIDAY THEMES
     Each theme's match(date) decides whether it's active for a
     given JS Date. Order matters if ranges could ever overlap —
     first match wins. Add a new theme by pushing another entry
     here and a matching ".sdk-root[data-theme=\"id\"]" block in
     daily-sudoku.css — nothing else needs to change.
  ========================================================= */

  // weekday: 0=Sun..6=Sat. Returns the day-of-month for the nth
  // such weekday in a given month (used for floating holidays
  // like Thanksgiving = 4th Thursday of November).
  function nthWeekdayOfMonth(year, monthIndex, weekday, n){
    const first = new Date(year, monthIndex, 1);
    const offset = (weekday - first.getDay() + 7) % 7;
    return 1 + offset + (n - 1) * 7;
  }

  function inMonthDayRange(date, monthIndex, dayStart, dayEnd){
    return date.getMonth() === monthIndex && date.getDate() >= dayStart && date.getDate() <= dayEnd;
  }

  const THEMES = [
    { id: "new-year",         match: (d) => d.getMonth() === 0 && d.getDate() === 1 },
    { id: "valentines",       match: (d) => inMonthDayRange(d, 1, 10, 14) },
    { id: "st-patricks",      match: (d) => d.getMonth() === 2 && d.getDate() === 17 },
    { id: "independence-day", match: (d) => inMonthDayRange(d, 6, 1, 4) },
    { id: "halloween",        match: (d) => inMonthDayRange(d, 9, 25, 31) },
    { id: "thanksgiving",     match: (d) => {
        const fourthThu = nthWeekdayOfMonth(d.getFullYear(), 10, 4, 4);
        return d.getMonth() === 10 && d.getDate() >= fourthThu - 2 && d.getDate() <= fourthThu;
      } },
    { id: "winter-holidays",  match: (d) => d.getMonth() === 11 },
  ];

  function getThemeId(dateStr){
    const d = parseDateStr(dateStr);
    for (const theme of THEMES){
      if (theme.match(d)) return theme.id;
    }
    return null;
  }

  function applyTheme(dateStr){
    const themeId = getThemeId(dateStr);
    if (themeId) els.root.setAttribute("data-theme", themeId);
    else els.root.removeAttribute("data-theme");
  }

  /* =========================================================
     4. APP STATE
  ========================================================= */

  const els = {
    root: document.getElementById("sdk-root"),
    grid: document.getElementById("sdk-grid"),
    numpad: document.getElementById("sdk-numpad"),
    dateline: document.getElementById("sdk-dateline"),
    timer: document.getElementById("sdk-timer"),
    bestTime: document.getElementById("sdk-bestTime"),
    toast: document.getElementById("sdk-toast"),
    tabs: Array.from(document.querySelectorAll(".sdk-tab")),
    notesBtn: document.getElementById("sdk-notesBtn"),
    undoBtn: document.getElementById("sdk-undoBtn"),
    eraseBtn: document.getElementById("sdk-eraseBtn"),
    checkBtn: document.getElementById("sdk-checkBtn"),
    revealBtn: document.getElementById("sdk-revealBtn"),
    stamp: document.getElementById("sdk-stamp"),
    stampText: document.getElementById("sdk-stampText"),
    countdown: document.getElementById("sdk-countdown"),
    refreshBanner: document.getElementById("sdk-refreshBanner"),
    refreshBtn: document.getElementById("sdk-refreshBtn"),
    previewDate: document.getElementById("sdk-previewDate"),
    previewBtn: document.getElementById("sdk-previewBtn"),
    previewToday: document.getElementById("sdk-previewToday"),
  };

  const state = {
    viewingToday: true,
    date: todayStr(),
    difficulty: null,
    solution: null,
    puzzle: null,
    given: null,
    values: null,
    notes: null,          // array of 81 Sets
    selected: null,
    notesMode: false,
    history: [],
    markedWrong: new Set(),
    solved: false,
    revealed: false,
    startedAt: null,
    elapsed: 0,
    timerId: null,
  };

  function storageKey(dateStr, diff){ return "sudoku:progress:" + dateStr + ":" + diff; }
  function bestKey(diff){ return "sudoku:best:" + diff; }

  /* =========================================================
     5. LOAD / SAVE
  ========================================================= */

  function loadOrCreate(dateStr, difficulty){
    stopTimer();
    applyTheme(dateStr);
    const { solution, puzzle } = buildPuzzle(dateStr, difficulty);
    state.date = dateStr;
    state.difficulty = difficulty;
    state.solution = solution;
    state.puzzle = puzzle;
    state.given = puzzle.map(v => v !== 0);
    state.values = puzzle.slice();
    state.notes = Array.from({length:81}, () => new Set());
    state.history = [];
    state.markedWrong = new Set();
    state.solved = false;
    state.revealed = false;
    state.elapsed = 0;

    const saved = readSaved(dateStr, difficulty);
    if (saved){
      state.values = saved.values;
      state.notes = saved.notes.map(arr => new Set(arr));
      state.elapsed = saved.elapsed || 0;
      state.solved = !!saved.solved;
      state.revealed = !!saved.revealed;
    }

    state.selected = null;
    if (!state.solved){
      const firstEmpty = state.values.findIndex(v => v === 0);
      if (firstEmpty !== -1) state.selected = firstEmpty;
    }

    renderAll();
    updateBestTimeDisplay();
    if (!state.solved) startTimer();
    else showStamp(state.revealed ? "revealed" : "solved");
  }

  function readSaved(dateStr, difficulty){
    try{
      const raw = localStorage.getItem(storageKey(dateStr, difficulty));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch(e){ return null; }
  }

  function saveProgress(){
    try{
      localStorage.setItem(storageKey(state.date, state.difficulty), JSON.stringify({
        values: state.values,
        notes: state.notes.map(s => Array.from(s)),
        elapsed: state.elapsed,
        solved: state.solved,
        revealed: state.revealed,
      }));
    } catch(e){ /* storage unavailable — ignore */ }
  }

  function updateBestTimeDisplay(){
    try{
      const raw = localStorage.getItem(bestKey(state.difficulty));
      els.bestTime.textContent = raw ? ("Best " + formatTime(parseInt(raw,10))) : "";
    } catch(e){ els.bestTime.textContent = ""; }
  }

  function maybeSaveBestTime(){
    if (state.revealed) return;
    try{
      const raw = localStorage.getItem(bestKey(state.difficulty));
      const prev = raw ? parseInt(raw,10) : null;
      if (prev === null || state.elapsed < prev){
        localStorage.setItem(bestKey(state.difficulty), String(state.elapsed));
      }
    } catch(e){ /* ignore */ }
    updateBestTimeDisplay();
  }

  /* =========================================================
     6. TIMER
  ========================================================= */

  function startTimer(){
    stopTimer();
    state.startedAt = Date.now() - state.elapsed*1000;
    state.timerId = setInterval(() => {
      state.elapsed = Math.floor((Date.now() - state.startedAt)/1000);
      els.timer.textContent = formatTime(state.elapsed);
    }, 1000);
    els.timer.textContent = formatTime(state.elapsed);
  }
  function stopTimer(){
    if (state.timerId){ clearInterval(state.timerId); state.timerId = null; }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopTimer();
    else if (!state.solved) startTimer();
  });

  /* =========================================================
     7. GRID BUILD + RENDER
  ========================================================= */

  const cellEls = [];

  function buildGridDOM(){
    els.grid.innerHTML = "";
    cellEls.length = 0;
    for (let r = 0; r < 9; r++){
      for (let c = 0; c < 9; c++){
        const idx = r*9+c;
        const cell = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
        cell.className = "sdk-cell";
        cell.setAttribute("tabindex", "-1");
        cell.setAttribute("role", "button");
        if (c % 3 === 0 && c !== 0) cell.classList.add("sdk-box-left");
        if (r % 3 === 0 && r !== 0) cell.classList.add("sdk-box-top");
        if (c === 8) cell.classList.add("sdk-no-border-right");
        if (r === 8) cell.classList.add("sdk-no-border-bottom");

        const valueEl = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
        valueEl.className = "sdk-cell-value";
        cell.appendChild(valueEl);

        const notesEl = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
        notesEl.className = "sdk-cell-notes";
        for (let n = 1; n <= 9; n++){
          const noteSpan = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
          noteSpan.className = "sdk-note";
          noteSpan.textContent = n;
          notesEl.appendChild(noteSpan);
        }
        cell.appendChild(notesEl);

        cell.addEventListener("click", () => selectCell(idx));
        els.grid.appendChild(cell);
        cellEls.push(cell);
      }
    }
  }

  function buildNumpadDOM(){
    els.numpad.innerHTML = "";
    for (let n = 1; n <= 9; n++){
      const btn = document.createElementNS("http://www.w3.org/1999/xhtml", "button");
      btn.className = "sdk-num-btn";
      btn.type = "button";
      btn.textContent = n;
      btn.addEventListener("click", () => handleDigit(n));
      els.numpad.appendChild(btn);
      btn.dataset.n = n;
    }
  }

  function peersOf(idx){
    const r = Math.floor(idx/9), c = idx % 9;
    const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
    const set = new Set();
    for (let i = 0; i < 9; i++){ set.add(r*9+i); set.add(i*9+c); }
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) set.add((br+i)*9+(bc+j));
    set.delete(idx);
    return set;
  }

  function computeConflicts(){
    const conflicts = new Set();
    function scan(indices){
      const seen = {};
      for (const idx of indices){
        const v = state.values[idx];
        if (!v) continue;
        if (seen[v] !== undefined){ conflicts.add(seen[v]); conflicts.add(idx); }
        else seen[v] = idx;
      }
    }
    for (let r = 0; r < 9; r++){ const row = []; for (let c=0;c<9;c++) row.push(r*9+c); scan(row); }
    for (let c = 0; c < 9; c++){ const col = []; for (let r=0;r<9;r++) col.push(r*9+c); scan(col); }
    for (let br = 0; br < 9; br += 3) for (let bc = 0; bc < 9; bc += 3){
      const box = [];
      for (let i=0;i<3;i++) for (let j=0;j<3;j++) box.push((br+i)*9+(bc+j));
      scan(box);
    }
    return conflicts;
  }

  function renderAll(){
    const conflicts = computeConflicts();
    const peers = state.selected !== null ? peersOf(state.selected) : new Set();
    const selVal = state.selected !== null ? state.values[state.selected] : 0;

    for (let idx = 0; idx < 81; idx++){
      const cell = cellEls[idx];
      const valueEl = cell.querySelector(".sdk-cell-value");
      const v = state.values[idx];
      const given = state.given[idx];

      cell.classList.toggle("sdk-given", given);
      cell.classList.toggle("sdk-has-value", v !== 0);
      cell.classList.toggle("sdk-selected", idx === state.selected);
      cell.classList.toggle("sdk-peer", peers.has(idx) && idx !== state.selected);
      cell.classList.toggle("sdk-same-value", v !== 0 && selVal !== 0 && v === selVal && idx !== state.selected);
      cell.classList.toggle("sdk-conflict", conflicts.has(idx) && !given);
      cell.classList.toggle("sdk-marked-wrong", state.markedWrong.has(idx) && !given);

      valueEl.textContent = v !== 0 ? v : "";

      const noteSpans = cell.querySelectorAll(".sdk-note");
      const cellNotes = state.notes[idx];
      noteSpans.forEach((span, i) => {
        span.classList.toggle("sdk-active", v === 0 && cellNotes.has(i+1));
      });

      cell.setAttribute("aria-label",
        "Row " + (Math.floor(idx/9)+1) + " column " + (idx%9+1) +
        (v ? (", " + v + (given ? " (given)" : "")) : ", empty"));
    }

    // number pad: disable digits that are fully & correctly placed
    const padButtons = els.numpad.querySelectorAll(".sdk-num-btn");
    padButtons.forEach(btn => {
      const n = parseInt(btn.dataset.n, 10);
      let correctCount = 0;
      for (let i = 0; i < 81; i++){ if (state.values[i] === n && state.solution[i] === n) correctCount++; }
      btn.disabled = correctCount >= 9;
    });

    els.notesBtn.setAttribute("aria-pressed", String(state.notesMode));
    els.notesBtn.disabled = state.solved;
    els.undoBtn.disabled = state.solved || state.history.length === 0;
    els.eraseBtn.disabled = state.solved;
    els.checkBtn.disabled = state.solved;
    els.revealBtn.disabled = state.solved;
  }

  /* =========================================================
     8. INTERACTION
  ========================================================= */

  function selectCell(idx){
    state.selected = idx;
    renderAll();
  }

  function pushHistory(action){
    state.history.push(action);
    if (state.history.length > 300) state.history.shift();
  }

  function handleDigit(n){
    if (state.solved) return;
    if (state.selected === null) return;
    const idx = state.selected;
    if (state.given[idx]) return;

    if (state.notesMode){
      const noteSet = state.notes[idx];
      const had = noteSet.has(n);
      const prevNotes = new Set(noteSet);
      if (had) noteSet.delete(n); else noteSet.add(n);
      pushHistory({ type:"notes", idx, prev: prevNotes, next: new Set(noteSet) });
    } else {
      const prevValue = state.values[idx];
      const prevNotes = new Set(state.notes[idx]);
      const newValue = prevValue === n ? 0 : n; // tap same digit again to clear
      state.values[idx] = newValue;
      if (newValue !== 0) state.notes[idx].clear();
      state.markedWrong.delete(idx);
      pushHistory({ type:"value", idx, prevValue, newValue, prevNotes, newNotes: new Set(state.notes[idx]) });
      checkForWin();
    }
    saveProgress();
    renderAll();
  }

  function eraseSelected(){
    if (state.solved) return;
    if (state.selected === null) return;
    const idx = state.selected;
    if (state.given[idx]) return;
    const prevValue = state.values[idx];
    const prevNotes = new Set(state.notes[idx]);
    if (prevValue === 0 && prevNotes.size === 0) return;
    state.values[idx] = 0;
    state.notes[idx].clear();
    state.markedWrong.delete(idx);
    pushHistory({ type:"value", idx, prevValue, newValue:0, prevNotes, newNotes:new Set() });
    saveProgress();
    renderAll();
  }

  function undo(){
    if (state.solved) return;
    const action = state.history.pop();
    if (!action) return;
    if (action.type === "value"){
      state.values[action.idx] = action.prevValue;
      state.notes[action.idx] = new Set(action.prevNotes);
    } else if (action.type === "notes"){
      state.notes[action.idx] = new Set(action.prev);
    }
    state.markedWrong.delete(action.idx);
    saveProgress();
    renderAll();
  }

  function checkPuzzle(){
    let wrong = 0;
    for (let i = 0; i < 81; i++){
      if (state.given[i]) continue;
      if (state.values[i] !== 0 && state.values[i] !== state.solution[i]){
        wrong++;
        state.markedWrong.add(i);
      }
    }
    renderAll();
    showToast(wrong === 0 ? "Everything checks out so far." : (wrong + (wrong===1?" square needs":" squares need") + " another look."));
  }

  function checkForWin(){
    if (state.values.includes(0)) return;
    for (let i = 0; i < 81; i++){ if (state.values[i] !== state.solution[i]) return; }
    state.solved = true;
    stopTimer();
    saveProgress();
    maybeSaveBestTime();
    showStamp("solved");
  }

  function revealSolution(){
    if (state.solved) return;
    const ok = window.confirm("Reveal the full solution? This ends today's timer for this difficulty.");
    if (!ok) return;
    state.values = state.solution.slice();
    state.notes.forEach(s => s.clear());
    state.solved = true;
    state.revealed = true;
    state.markedWrong.clear();
    stopTimer();
    saveProgress();
    renderAll();
    showStamp("revealed");
  }

  function showStamp(kind){
    els.stampText.innerHTML = "";
    const mainLine = kind === "solved" ? "Solved" : "Revealed";
    const subLine = kind === "solved" ? formatTime(state.elapsed) : "solution shown";
    els.stampText.appendChild(document.createTextNode(mainLine));
    const small = document.createElementNS("http://www.w3.org/1999/xhtml", "small");
    small.textContent = subLine;
    els.stampText.appendChild(small);
    els.stamp.classList.add("sdk-show");
  }
  function hideStamp(){ els.stamp.classList.remove("sdk-show"); }

  let toastTimer = null;
  function showToast(msg){
    els.toast.textContent = msg;
    els.toast.classList.add("sdk-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("sdk-show"), 2600);
  }

  /* =========================================================
     9. KEYBOARD
  ========================================================= */

  document.addEventListener("keydown", (e) => {
    if (state.selected === null){
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) selectCell(0);
      return;
    }
    if (e.key >= "1" && e.key <= "9"){ handleDigit(parseInt(e.key,10)); e.preventDefault(); return; }
    if (e.key === "0" || e.key === "Backspace" || e.key === "Delete"){ eraseSelected(); e.preventDefault(); return; }
    const r = Math.floor(state.selected/9), c = state.selected % 9;
    if (e.key === "ArrowUp"){ selectCell(((r+8)%9)*9+c); e.preventDefault(); }
    else if (e.key === "ArrowDown"){ selectCell(((r+1)%9)*9+c); e.preventDefault(); }
    else if (e.key === "ArrowLeft"){ selectCell(r*9+((c+8)%9)); e.preventDefault(); }
    else if (e.key === "ArrowRight"){ selectCell(r*9+((c+1)%9)); e.preventDefault(); }
    else if (e.key.toLowerCase() === "n"){ toggleNotesMode(); }
  });

  function toggleNotesMode(){
    state.notesMode = !state.notesMode;
    renderAll();
  }

  /* =========================================================
     10. TABS + CONTROLS WIRE-UP
  ========================================================= */

  function selectDifficulty(diff, dateStr){
    els.tabs.forEach(t => t.setAttribute("aria-selected", String(t.dataset.diff === diff)));
    try{ localStorage.setItem("sudoku:lastDifficulty", diff); } catch(e){}
    hideStamp();
    loadOrCreate(dateStr || state.date, diff);
  }

  els.tabs.forEach(tab => {
    tab.addEventListener("click", () => selectDifficulty(tab.dataset.diff, state.date));
  });

  els.notesBtn.addEventListener("click", toggleNotesMode);
  els.undoBtn.addEventListener("click", undo);
  els.eraseBtn.addEventListener("click", eraseSelected);
  els.checkBtn.addEventListener("click", checkPuzzle);
  els.revealBtn.addEventListener("click", revealSolution);

  els.previewBtn.addEventListener("click", () => {
    const val = els.previewDate.value;
    if (!val) return;
    state.viewingToday = (val === todayStr());
    updateDateline(val);
    selectDifficulty(state.difficulty || defaultDifficultyFor(val), val);
  });
  els.previewToday.addEventListener("click", () => {
    els.previewDate.value = todayStr();
    state.viewingToday = true;
    updateDateline(todayStr());
    selectDifficulty(state.difficulty || defaultDifficultyFor(todayStr()), todayStr());
  });

  els.refreshBtn.addEventListener("click", () => {
    els.refreshBanner.classList.remove("sdk-show");
    const d = todayStr();
    updateDateline(d);
    selectDifficulty(state.difficulty, d);
  });

  function updateDateline(dateStr){
    els.dateline.textContent = formatDateLine(dateStr) + "  ·  No. " + issueNumber(dateStr);
  }

  /* =========================================================
     11. MIDNIGHT ROLLOVER COUNTDOWN
  ========================================================= */

  function tickCountdown(){
    if (!state.viewingToday){
      els.countdown.textContent = "Previewing " + formatDateLine(state.date);
      return;
    }
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 0,0,0);
    const diff = Math.max(0, midnight - now);
    const hh = Math.floor(diff/3600000);
    const mm = Math.floor((diff%3600000)/60000);
    const ss = Math.floor((diff%60000)/1000);
    els.countdown.textContent = "Next puzzle in " + pad2(hh) + ":" + pad2(mm) + ":" + pad2(ss);

    if (state.viewingToday && todayStr() !== state.date){
      els.refreshBanner.classList.add("sdk-show");
    }
  }
  setInterval(tickCountdown, 1000);
  tickCountdown();

  /* =========================================================
     12. INIT
  ========================================================= */

  buildGridDOM();
  buildNumpadDOM();

  const initialDate = todayStr();
  els.previewDate.value = initialDate;
  updateDateline(initialDate);

  let startDiff = defaultDifficultyFor(initialDate);
  try{
    const last = localStorage.getItem("sudoku:lastDifficulty");
    if (last && DIFFICULTY_CLUES[last]) startDiff = last;
  } catch(e){}

  selectDifficulty(startDiff, initialDate);

})();
