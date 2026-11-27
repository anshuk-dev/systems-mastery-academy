(() => {
  const DATA = window.COURSE_DATA;
  if (!DATA) {
    document.getElementById("main-content").innerHTML =
      "<section class='monograph-sheet'><h1>Missing course bundle</h1><p>Run <code>python3 scripts/build_assets.py</code> to build <code>data/course-bundle.js</code>.</p></section>";
    return;
  }

  const LETTERS = ["A", "B", "C", "D"];
  const STORAGE_KEY = "systems_mastery_editorial_v2";

  const defaultState = {
    view: "overview",
    theme: "paper", // paper | slate
    activePillarId: DATA.pillars[0].id,
    activeLessonId: DATA.pillars[0].lessons[0].id,
    completedLessons: [],
    answered: {},
    bookmarks: [],
    quizFilterPillar: "all",
    quizFilterDifficulty: "all",
    quizSearch: "",
    quizMode: "practice",
    quizIndex: 0,
    examSession: null
  };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const merged = { ...defaultState, ...saved };
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const v = hashParams.get("view");
      if (v && ["overview", "course", "quiz", "tools", "sources"].includes(v)) merged.view = v;
      if (hashParams.get("pillar")) merged.activePillarId = hashParams.get("pillar");
      if (hashParams.get("lesson")) merged.activeLessonId = hashParams.get("lesson");
      if (hashParams.get("qpillar")) merged.quizFilterPillar = hashParams.get("qpillar");
      return merged;
    } catch {
      return { ...defaultState };
    }
  }

  const state = loadState();

  function syncHash() {
    const p = new URLSearchParams();
    p.set("view", state.view);
    if (state.view === "course") {
      p.set("pillar", state.activePillarId);
      p.set("lesson", state.activeLessonId);
    } else if (state.view === "quiz" && state.quizFilterPillar !== "all") {
      p.set("qpillar", state.quizFilterPillar);
    }
    const nextHash = `#${p.toString()}`;
    if (window.location.hash !== nextHash) {
      history.replaceState(null, "", nextHash);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        theme: state.theme,
        completedLessons: state.completedLessons,
        answered: state.answered,
        bookmarks: state.bookmarks,
        activePillarId: state.activePillarId,
        activeLessonId: state.activeLessonId
      }));
    } catch {
      // Ignore storage quota restrictions
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatInlineCode(str) {
    return escapeHtml(str).replace(/`([^`]+)`/g, '<code translate="no">$1</code>');
  }

  function totalLessons() {
    return DATA.pillars.reduce((acc, p) => acc + p.lessons.length, 0);
  }

  function getUniqueSources() {
    const map = new Map();
    DATA.pillars.forEach((p) => p.lessons.forEach((l) => (l.sources || []).forEach((s) => map.set(s.url, s))));
    DATA.questions.forEach((q) => (q.sources || []).forEach((s) => map.set(s.url, s)));
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  }

  function getMasteryPercent() {
    const lessonRatio = state.completedLessons.length / totalLessons();
    const correctCount = Object.values(state.answered).filter((a) => a.correct).length;
    const quizRatio = correctCount / DATA.questions.length;
    return Math.round((lessonRatio * 0.4 + quizRatio * 0.6) * 100);
  }

  function applyTheme() {
    const isSlate = state.theme === "slate";
    document.body.classList.toggle("slate", isSlate);
    const meta = document.getElementById("meta-theme-color");
    if (meta) meta.setAttribute("content", isSlate ? "#101419" : "#F7F6F2");
    const btn = document.getElementById("theme-toggle");
    btn.textContent = isSlate ? "Paper theme" : "Slate theme";
    btn.setAttribute("aria-label", isSlate ? "Switch to warm paper theme" : "Switch to dark slate theme");
  }

  function updateHeader() {
    document.querySelectorAll(".nav-link").forEach((btn) => {
      const active = btn.dataset.view === state.view;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-current", active ? "page" : "false");
    });
    document.getElementById("progress-summary-text").textContent = `${getMasteryPercent()}% mastery`;
  }

  function setView(view, opts = {}) {
    state.view = view;
    if (opts.pillarId) {
      state.activePillarId = opts.pillarId;
      const p = DATA.pillars.find((x) => x.id === opts.pillarId);
      if (p && p.lessons.length) state.activeLessonId = p.lessons[0].id;
    }
    if (opts.quizPillar) {
      state.quizFilterPillar = opts.quizPillar;
      state.quizIndex = 0;
    }
    saveState();
    syncHash();
    render();
    window.scrollTo({ top: 0 });
  }

  function renderSourcesBlock(sources, heading = "Verified Primary Sources") {
    if (!sources || !sources.length) return "";
    const items = sources.map((s) => `
      <li>
        <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)}</a>
        <span style="color:var(--ink-muted);"> &mdash; ${escapeHtml(s.author)}</span>
      </li>
    `).join("");
    return `
      <aside class="sources-box">
        <h3>${escapeHtml(heading)}</h3>
        <ul class="sources-list">${items}</ul>
      </aside>
    `;
  }

  function renderOverview() {
    const uniqueSources = getUniqueSources();
    const correctCount = Object.values(state.answered).filter((a) => a.correct).length;
    const distractorCount = DATA.questions.length * 3;

    const folioRows = DATA.pillars.map((p) => {
      const pQuestions = DATA.questions.filter((q) => q.pillar === p.id);
      const pCorrect = pQuestions.filter((q) => state.answered[q.id]?.correct).length;
      const pDone = p.lessons.filter((l) => state.completedLessons.includes(l.id)).length;
      return `
        <article class="folio-item">
          <div class="folio-num">§ ${escapeHtml(p.number)}</div>
          <div>
            <h3>${escapeHtml(p.name)}</h3>
            <p class="folio-tagline">${escapeHtml(p.tagline)}</p>
            <div class="folio-progress">${pDone}/${p.lessons.length} lessons completed &bull; ${pCorrect}/${pQuestions.length} scenarios solved</div>
          </div>
          <p class="folio-summary">${escapeHtml(p.summary)}</p>
          <div class="folio-actions">
            <button type="button" class="btn btn-primary" data-open-pillar="${p.id}">Open module</button>
            <button type="button" class="btn" data-practice-pillar="${p.id}">Practice Q&amp;A</button>
          </div>
        </article>
      `;
    }).join("");

    return `
      <section class="monograph-hero">
        <div>
          <h1 class="monograph-title">Knowledge tells you how systems work. Wisdom tells you what breaks first.</h1>
          <p class="monograph-lead">
            A source-verified engineering monograph and distractor-analysis trainer across <strong>System Integration</strong>, <strong>Modular Architecture</strong>, <strong>System Optimization</strong>, and <strong>System Scalability</strong>. Every concept and scenario traces back to original papers, engineering postmortems, and architecture canon.
          </p>
          <div class="action-row">
            <button type="button" class="btn btn-primary" id="hero-start-course">Open curriculum</button>
            <button type="button" class="btn" id="hero-start-quiz">Enter distractor lab</button>
            <button type="button" class="btn" id="hero-open-sources">Inspect ${uniqueSources.length} verified sources</button>
          </div>
        </div>

        <aside class="ledger-panel" aria-label="Curriculum specification">
          <h2>Field Manual Ledger</h2>
          <div class="ledger-row"><span>Core pillars + synthesis</span><span class="ledger-val">${DATA.pillars.length}</span></div>
          <div class="ledger-row"><span>Deep engineering lessons</span><span class="ledger-val">${state.completedLessons.length} / ${totalLessons()}</span></div>
          <div class="ledger-row"><span>Production scenario Q&amp;As</span><span class="ledger-val">${correctCount} / ${DATA.questions.length}</span></div>
          <div class="ledger-row"><span>Option-level distractor traps</span><span class="ledger-val">${distractorCount}</span></div>
          <div class="ledger-row"><span>Live verified primary citations</span><span class="ledger-val">${uniqueSources.length}</span></div>
        </aside>
      </section>

      <h2 class="section-heading">Curriculum Index</h2>
      <p class="section-sub">Study each pillar to learn the underlying invariants and trade-offs, then test your architectural judgment against plausible production traps in the Distractor Lab.</p>
      <section class="folio-list">${folioRows}</section>
    `;
  }

  function renderCourse() {
    let activePillar = DATA.pillars.find((p) => p.id === state.activePillarId) || DATA.pillars[0];
    let activeLesson = activePillar.lessons.find((l) => l.id === state.activeLessonId);
    if (!activeLesson) {
      for (const p of DATA.pillars) {
        const found = p.lessons.find((l) => l.id === state.activeLessonId);
        if (found) {
          activePillar = p;
          activeLesson = found;
          break;
        }
      }
      if (!activeLesson) activeLesson = activePillar.lessons[0];
    }

    const flatLessons = DATA.pillars.flatMap((p) => p.lessons.map((l) => ({ pillar: p, lesson: l })));
    const curIdx = flatLessons.findIndex((x) => x.lesson.id === activeLesson.id);
    const prevItem = curIdx > 0 ? flatLessons[curIdx - 1] : null;
    const nextItem = curIdx < flatLessons.length - 1 ? flatLessons[curIdx + 1] : null;
    const isCompleted = state.completedLessons.includes(activeLesson.id);

    const railHtml = DATA.pillars.map((p) => {
      const done = p.lessons.filter((l) => state.completedLessons.includes(l.id)).length;
      const items = p.lessons.map((l) => {
        const active = l.id === activeLesson.id ? "active" : "";
        const mark = state.completedLessons.includes(l.id) ? '<span class="done-mark" aria-label="Completed">✓</span>' : "";
        return `<button type="button" class="toc-btn ${active}" data-select-lesson="${l.id}" data-select-pillar="${p.id}">
          <span>${escapeHtml(l.title)}</span>${mark}
        </button>`;
      }).join("");
      return `<div class="toc-group">
        <div class="toc-pillar-label"><span>§${p.number} ${escapeHtml(p.name)}</span><span>${done}/${p.lessons.length}</span></div>
        ${items}
      </div>`;
    }).join("");

    const tradeRows = activeLesson.tradeoffs.map((t) => `
      <tr>
        <td><strong>${formatInlineCode(t.option)}</strong></td>
        <td>${formatInlineCode(t.pros)}</td>
        <td>${formatInlineCode(t.cons)}</td>
        <td>${formatInlineCode(t.whenToUse)}</td>
      </tr>
    `).join("");

    return `
      <div class="curriculum-grid">
        <aside class="toc-rail" aria-label="Module table of contents">${railHtml}</aside>
        <article class="monograph-sheet">
          <div class="sheet-meta">
            <span class="tag tag-accent">§${activePillar.number} ${escapeHtml(activePillar.name)}</span>
            <span class="tag">${escapeHtml(activeLesson.duration)}</span>
            ${isCompleted ? '<span class="tag tag-verified">Completed</span>' : ""}
          </div>
          <h1 class="lesson-title">${escapeHtml(activeLesson.title)}</h1>
          <p style="margin:0; color:var(--ink-muted); max-width:72ch;">${escapeHtml(activePillar.summary)}</p>

          <div class="mental-model-callout">
            <strong>Core Mental Model:</strong> ${formatInlineCode(activePillar.mentalModel)}
          </div>

          <div class="kw-columns">
            <section class="kw-panel">
              <h3>Knowledge — Mechanics &amp; Laws</h3>
              <ul>${activeLesson.knowledge.map((k) => `<li>${formatInlineCode(k)}</li>`).join("")}</ul>
            </section>
            <section class="kw-panel">
              <h3>Wisdom — Judgment &amp; Failure Modes</h3>
              <ul>${activeLesson.wisdom.map((w) => `<li>${formatInlineCode(w)}</li>`).join("")}</ul>
            </section>
          </div>

          <h2 style="font-family:var(--serif); font-size:1.3rem; font-weight:500; margin:24px 0 6px;">Architectural Trade-off Matrix</h2>
          <div class="table-scroll">
            <table>
              <thead>
                <tr><th>Approach</th><th>Strengths</th><th>Costs &amp; Risks</th><th>When to Choose</th></tr>
              </thead>
              <tbody>${tradeRows}</tbody>
            </table>
          </div>

          <section class="antipattern-panel">
            <h3>Common Anti-Patterns</h3>
            <ul>${activeLesson.antiPatterns.map((a) => `<li>${formatInlineCode(a)}</li>`).join("")}</ul>
          </section>

          <div class="heuristic-callout">
            <strong>Rule of Thumb:</strong> ${formatInlineCode(activeLesson.heuristic)}
          </div>

          ${renderSourcesBlock(activeLesson.sources, "Verified Original Sources for This Lesson")}

          <div class="lesson-nav-bar">
            <div class="action-row">
              ${prevItem ? `<button type="button" class="btn" data-select-lesson="${prevItem.lesson.id}" data-select-pillar="${prevItem.pillar.id}">&larr; Previous lesson</button>` : ""}
              ${nextItem ? `<button type="button" class="btn" data-select-lesson="${nextItem.lesson.id}" data-select-pillar="${nextItem.pillar.id}">Next lesson &rarr;</button>` : ""}
            </div>
            <div class="action-row">
              <button type="button" class="btn btn-primary" id="toggle-lesson-complete" data-lesson-id="${activeLesson.id}">
                ${isCompleted ? "Mark incomplete" : "Mark lesson complete"}
              </button>
              <button type="button" class="btn" data-practice-pillar="${activePillar.id}">Practice ${escapeHtml(activePillar.name)} Q&amp;A</button>
            </div>
          </div>
        </article>
      </div>
    `;
  }

  function getFilteredQuestions() {
    return DATA.questions.filter((q) => {
      if (state.quizFilterPillar !== "all" && q.pillar !== state.quizFilterPillar) return false;
      if (state.quizFilterDifficulty !== "all" && q.difficulty !== state.quizFilterDifficulty) return false;
      if (state.quizMode === "missed") {
        const rec = state.answered[q.id];
        const bookmarked = state.bookmarks.includes(q.id);
        if (!bookmarked && !(rec && !rec.correct)) return false;
      }
      if (state.quizSearch.trim()) {
        const needle = state.quizSearch.toLowerCase();
        const hay = `${q.id} ${q.concept} ${q.scenario} ${q.question}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }

  function renderDistractorAnalysis(q, selectedIndex) {
    const cidx = q.correctIndex;
    const cards = q.options.map((_, idx) => {
      const da = q.distractorAnalysis[String(idx)];
      const isRight = idx === cidx;
      const picked = idx === selectedIndex;
      return `
        <div class="d-card ${isRight ? "right" : "trap"}">
          <div style="display:flex; justify-content:space-between; gap:8px; align-items:center; margin-bottom:6px; flex-wrap:wrap;">
            <strong>Option ${LETTERS[idx]}${picked ? " (Your choice)" : ""}</strong>
            <span class="tag ${isRight ? "tag-verified" : "tag-trap"}">
              ${isRight ? "Correct insight" : escapeHtml(da.trap)}
            </span>
          </div>
          <p style="margin:0;">${formatInlineCode(isRight ? da.keyInsight : da.whyWrong)}</p>
        </div>
      `;
    }).join("");

    return `
      <div class="distractor-section" aria-live="polite">
        <div class="heuristic-callout" style="margin-top:0;">
          <strong>Answer ${LETTERS[cidx]} is correct — Explanation:</strong> ${formatInlineCode(q.explanation)}
        </div>
        <h3 style="font-family:var(--serif); font-size:1.2rem; font-weight:500; margin:16px 0 6px;">Option &amp; Distractor Analysis</h3>
        <div class="distractor-cards">${cards}</div>
        <div class="mental-model-callout" style="margin-bottom:0;">
          <strong>Wisdom takeaway:</strong> ${formatInlineCode(q.wisdomTakeaway)}
        </div>
        ${renderSourcesBlock(q.sources, "Verified Sources")}
      </div>
    `;
  }

  function renderQuiz() {
    const list = getFilteredQuestions();
    if (state.quizIndex >= list.length) state.quizIndex = Math.max(0, list.length - 1);

    const pillarOpts = DATA.pillars.map((p) =>
      `<option value="${p.id}" ${state.quizFilterPillar === p.id ? "selected" : ""}>§${p.number} ${escapeHtml(p.name)}</option>`
    ).join("");

    const toolbar = `
      <div class="lab-controls">
        <div class="control-group">
          <label for="filter-pillar" class="skip-link">Filter by pillar</label>
          <select id="filter-pillar" aria-label="Filter questions by pillar">
            <option value="all" ${state.quizFilterPillar === "all" ? "selected" : ""}>All pillars (50)</option>
            ${pillarOpts}
          </select>
          <select id="filter-difficulty" aria-label="Filter questions by difficulty">
            <option value="all" ${state.quizFilterDifficulty === "all" ? "selected" : ""}>All levels</option>
            <option value="Intermediate" ${state.quizFilterDifficulty === "Intermediate" ? "selected" : ""}>Intermediate</option>
            <option value="Senior" ${state.quizFilterDifficulty === "Senior" ? "selected" : ""}>Senior</option>
            <option value="Staff / Principal" ${state.quizFilterDifficulty === "Staff / Principal" ? "selected" : ""}>Staff / Principal</option>
          </select>
          <select id="filter-mode" aria-label="Lab mode">
            <option value="practice" ${state.quizMode === "practice" ? "selected" : ""}>Practice mode</option>
            <option value="exam" ${state.quizMode === "exam" ? "selected" : ""}>Exam mode</option>
            <option value="missed" ${state.quizMode === "missed" ? "selected" : ""}>Missed &amp; bookmarked</option>
          </select>
          <input type="search" id="quiz-search" aria-label="Search questions" autocomplete="off" spellcheck="false" value="${escapeHtml(state.quizSearch)}" placeholder="Search concept or keyword…" />
        </div>
        <div class="control-group">
          <span class="tag">${list.length} questions</span>
          ${state.quizMode === "exam" ? `<button type="button" class="btn btn-primary" id="finish-exam-btn">Score exam (${Object.keys(state.examSession?.picks || {}).length}/${list.length})</button>` : ""}
          <button type="button" class="btn" id="reset-progress-btn">Reset answers</button>
        </div>
      </div>
    `;

    if (state.quizMode === "exam" && state.examSession?.submitted) {
      const picks = state.examSession.picks || {};
      let correct = 0;
      const byPillar = {};
      list.forEach((q) => {
        if (!byPillar[q.pillar]) byPillar[q.pillar] = { total: 0, right: 0 };
        byPillar[q.pillar].total += 1;
        if (picks[q.id] === q.correctIndex) {
          correct += 1;
          byPillar[q.pillar].right += 1;
        }
      });
      const pct = list.length ? Math.round((correct / list.length) * 100) : 0;
      const rows = Object.entries(byPillar).map(([pid, s]) => {
        const name = DATA.pillars.find((p) => p.id === pid)?.name || pid;
        return `<div class="ledger-row"><span>${escapeHtml(name)}</span><span class="ledger-val">${s.right} / ${s.total}</span></div>`;
      }).join("");
      const review = list.map((q) => `
        <article class="question-sheet" style="margin-top:16px;">
          <div class="sheet-meta">
            <span class="tag tag-accent">${q.id}</span>
            <span class="tag">${escapeHtml(q.concept)}</span>
            <span class="tag ${picks[q.id] === q.correctIndex ? "tag-verified" : "tag-trap"}">
              ${picks[q.id] === q.correctIndex ? "Correct" : picks[q.id] === undefined ? "Unanswered" : `Picked ${LETTERS[picks[q.id]]}`}
            </span>
          </div>
          <p class="scenario-block">${formatInlineCode(q.scenario)}</p>
          <p class="question-prompt">${formatInlineCode(q.question)}</p>
          ${renderDistractorAnalysis(q, picks[q.id])}
        </article>
      `).join("");

      return `
        ${toolbar}
        <section class="monograph-sheet">
          <h1 class="lesson-title">Exam Diagnostic: ${correct} / ${list.length} (${pct}%)</h1>
          <div class="ledger-panel" style="max-width:520px; margin:16px 0;">
            <h2>Breakdown by Pillar</h2>
            ${rows}
          </div>
          <div class="action-row">
            <button type="button" class="btn btn-primary" id="retake-exam-btn">Start new exam</button>
            <button type="button" class="btn" id="switch-practice-btn">Return to practice mode</button>
          </div>
        </section>
        ${review}
      `;
    }

    if (!list.length) {
      return `
        ${toolbar}
        <section class="question-sheet">
          <h2 style="margin-top:0; font-family:var(--serif);">No scenarios match those filters</h2>
          <p style="color:var(--ink-muted);">Clear your search query or switch back to Practice mode to inspect all 50 scenarios.</p>
          <button type="button" class="btn btn-primary" id="clear-filters-btn">Show all questions</button>
        </section>
      `;
    }

    const q = list[state.quizIndex];
    const pillar = DATA.pillars.find((p) => p.id === q.pillar);
    const isBookmarked = state.bookmarks.includes(q.id);
    const rec = state.quizMode === "exam"
      ? (state.examSession?.picks?.[q.id] !== undefined ? { selectedIndex: state.examSession.picks[q.id] } : null)
      : state.answered[q.id];
    const showAnalysis = state.quizMode !== "exam" && Boolean(rec);

    const choicesHtml = q.options.map((opt, idx) => {
      let cls = "choice-btn";
      if (rec) {
        if (state.quizMode === "exam") {
          if (rec.selectedIndex === idx) cls += " selected";
        } else {
          if (idx === q.correctIndex) cls += " is-correct";
          else if (rec.selectedIndex === idx) cls += " is-wrong";
        }
      }
      return `
        <button type="button" class="${cls}" data-pick-option="${idx}" data-qid="${q.id}">
          <span class="choice-key">${LETTERS[idx]}</span>
          <span>${formatInlineCode(opt)}</span>
        </button>
      `;
    }).join("");

    return `
      ${toolbar}
      <article class="question-sheet">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start; flex-wrap:wrap;">
          <div class="sheet-meta">
            <span class="tag tag-accent">${q.id} &bull; ${state.quizIndex + 1} of ${list.length}</span>
            <span class="tag">${escapeHtml(pillar?.name || q.pillar)}</span>
            <span class="tag">${escapeHtml(q.difficulty)}</span>
            <span class="tag">${escapeHtml(q.concept)}</span>
          </div>
          <button type="button" class="btn" id="bookmark-q-btn" data-qid="${q.id}">${isBookmarked ? "Bookmarked ★" : "Bookmark ☆"}</button>
        </div>

        <div class="scenario-block">
          <strong>Scenario:</strong> ${formatInlineCode(q.scenario)}
        </div>
        <h2 class="question-prompt">${formatInlineCode(q.question)}</h2>
        <div class="choices-stack" role="group" aria-label="Answer options">${choicesHtml}</div>

        ${showAnalysis ? renderDistractorAnalysis(q, rec.selectedIndex) : ""}

        <div class="lesson-nav-bar">
          <div class="action-row">
            <button type="button" class="btn" id="prev-q-btn" ${state.quizIndex === 0 ? "disabled" : ""}>&larr; Previous</button>
            <button type="button" class="btn btn-primary" id="next-q-btn" ${state.quizIndex >= list.length - 1 ? "disabled" : ""}>Next scenario &rarr;</button>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <span style="font-size:0.82rem; color:var(--ink-muted);">Shortcuts: keys A–D or 1–4, ← / →</span>
            ${rec && state.quizMode !== "exam" ? `<button type="button" class="btn" id="retry-q-btn" data-qid="${q.id}">Clear answer</button>` : ""}
          </div>
        </div>
      </article>
    `;
  }

  function renderTools() {
    return `
      <h1 class="monograph-title" style="font-size:2.2rem;">Quantitative Laws &amp; Back-of-the-Envelope Models</h1>
      <p class="section-sub">Verify architecture intuition with mathematical models grounded in Little's Law (1961), Dean &amp; Barroso (2013), Gunther's USL (2008), and Wooldridge's HikariCP pool sizing analysis.</p>

      <div class="calc-grid">
        <section class="calc-card">
          <h3>1. Little's Law (<code translate="no">L = λ · W</code>)</h3>
          <p style="font-size:0.9rem; color:var(--ink-muted); margin-top:0;">Average concurrent work in flight equals arrival rate multiplied by mean residence time.</p>
          <div class="calc-fields">
            <label for="calc-lambda">Arrival rate λ (req/s)
              <input type="number" id="calc-lambda" value="400" min="1" />
            </label>
            <label for="calc-w">Mean latency W (ms)
              <input type="number" id="calc-w" value="50" min="1" />
            </label>
          </div>
          <div class="calc-result" id="calc-littles-out"></div>
        </section>

        <section class="calc-card">
          <h3>2. Parallel Tail Amplification (<code translate="no">1 - p^N</code>)</h3>
          <p style="font-size:0.9rem; color:var(--ink-muted); margin-top:0;">From <em>The Tail at Scale</em>: probability a fan-out request hits at least one slow leaf.</p>
          <div class="calc-fields">
            <label for="calc-p">Per-leaf fast prob (%)
              <input type="number" id="calc-p" value="99" min="50" max="99.99" step="0.1" />
            </label>
            <label for="calc-n">Fan-out count N
              <input type="number" id="calc-n" value="25" min="1" max="500" />
            </label>
          </div>
          <div class="calc-result" id="calc-tail-out"></div>
        </section>

        <section class="calc-card">
          <h3>3. Gunther's Universal Scalability Law</h3>
          <p style="font-size:0.9rem; color:var(--ink-muted); margin-top:0;"><code translate="no">C(N) = N / (1 + α(N-1) + βN(N-1))</code> predicts retrograde scaling past peak <code translate="no">N_max</code>.</p>
          <div class="calc-fields">
            <label for="calc-alpha">Contention α
              <input type="number" id="calc-alpha" value="0.04" min="0" max="0.5" step="0.01" />
            </label>
            <label for="calc-beta">Coherency β
              <input type="number" id="calc-beta" value="0.005" min="0" max="0.1" step="0.001" />
            </label>
          </div>
          <div class="calc-result" id="calc-usl-out"></div>
        </section>

        <section class="calc-card">
          <h3>4. HikariCP Pool Sizing</h3>
          <p style="font-size:0.9rem; color:var(--ink-muted); margin-top:0;">Formula: <code translate="no">(core_count * 2) + effective_spindle_count</code> (multiplexed via PgBouncer).</p>
          <div class="calc-fields">
            <label for="calc-cores">DB Physical Cores
              <input type="number" id="calc-cores" value="16" min="1" max="256" />
            </label>
            <label for="calc-spindles">Effective Spindles
              <input type="number" id="calc-spindles" value="1" min="0" max="64" />
            </label>
          </div>
          <div class="calc-result" id="calc-pool-out"></div>
        </section>
      </div>
    `;
  }

  function renderSourcesPage() {
    const sources = getUniqueSources();
    const cards = sources.map((s) => `
      <article class="source-item">
        <strong><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)}</a></strong>
        <span>${escapeHtml(s.author)}</span>
        <code translate="no" style="font-size:0.78rem; word-break:break-all;">${escapeHtml(s.url)}</code>
      </article>
    `).join("");

    return `
      <h1 class="monograph-title" style="font-size:2.2rem;">Verified Primary Literature &amp; References (${sources.length})</h1>
      <p class="section-sub">Every technical claim, mathematical model, and architectural pattern in this academy links back to an authoritative primary source verified live on the web.</p>
      <section class="source-registry-grid">${cards}</section>
    `;
  }

  function updateCalculators() {
    const lEl = document.getElementById("calc-littles-out");
    if (!lEl) return;

    const lambda = Math.max(0, Number(document.getElementById("calc-lambda").value) || 0);
    const wMs = Math.max(0, Number(document.getElementById("calc-w").value) || 0);
    const L = lambda * (wMs / 1000);
    const L10x = lambda * ((wMs * 10) / 1000);
    lEl.textContent = `Steady-state concurrency L = ${L.toFixed(1)} in-flight\nAt 10× latency (${wMs * 10} ms): L = ${L10x.toFixed(0)} threads required`;

    const pPct = Math.min(99.999, Math.max(1, Number(document.getElementById("calc-p").value) || 99));
    const n = Math.max(1, Number(document.getElementById("calc-n").value) || 1);
    const allFast = Math.pow(pPct / 100, n) * 100;
    document.getElementById("calc-tail-out").textContent =
      `All ${n} leaves fast: ${allFast.toFixed(1)}%\nRequests hitting ≥1 tail leaf: ${(100 - allFast).toFixed(1)}%`;

    const alpha = Math.max(0, Number(document.getElementById("calc-alpha").value) || 0);
    const beta = Math.max(0, Number(document.getElementById("calc-beta").value) || 0);
    const usl = (N) => N / (1 + alpha * (N - 1) + beta * N * (N - 1));
    const nPeak = beta > 0 ? Math.sqrt((1 - alpha) / beta) : Infinity;
    const samples = [1, 4, 8, 16, 32, 64].map((k) => `${k}n→${usl(k).toFixed(1)}×`).join("  ");
    document.getElementById("calc-usl-out").textContent =
      `${samples}\nPeak N_max ≈ ${Number.isFinite(nPeak) ? nPeak.toFixed(1) + " nodes" : "∞ (Amdahl ceiling " + (alpha > 0 ? (1 / alpha).toFixed(1) : "∞") + "×)"}`;

    const cores = Math.max(1, Number(document.getElementById("calc-cores").value) || 1);
    const spindles = Math.max(0, Number(document.getElementById("calc-spindles").value) || 0);
    const pool = cores * 2 + spindles;
    document.getElementById("calc-pool-out").textContent =
      `Recommended active DB connections ≈ ${pool}\nKeep excess app pods behind a transaction pooler (e.g., PgBouncer).`;
  }

  function render() {
    applyTheme();
    updateHeader();
    const main = document.getElementById("main-content");
    if (state.view === "overview") main.innerHTML = renderOverview();
    else if (state.view === "course") main.innerHTML = renderCourse();
    else if (state.view === "quiz") main.innerHTML = renderQuiz();
    else if (state.view === "tools") main.innerHTML = renderTools();
    else main.innerHTML = renderSourcesPage();

    bindEvents();
    updateCalculators();
  }

  function pickOptionByIndex(idx) {
    const list = getFilteredQuestions();
    const q = list[state.quizIndex];
    if (!q) return;
    if (state.quizMode === "exam") {
      if (!state.examSession) state.examSession = { picks: {}, submitted: false };
      state.examSession.picks[q.id] = idx;
    } else {
      state.answered[q.id] = { selectedIndex: idx, correct: idx === q.correctIndex };
      saveState();
    }
    render();
  }

  function bindEvents() {
    document.getElementById("hero-start-course")?.addEventListener("click", () => setView("course"));
    document.getElementById("hero-start-quiz")?.addEventListener("click", () => setView("quiz"));
    document.getElementById("hero-open-sources")?.addEventListener("click", () => setView("sources"));

    document.querySelectorAll("[data-open-pillar]").forEach((btn) =>
      btn.addEventListener("click", () => setView("course", { pillarId: btn.dataset.openPillar }))
    );
    document.querySelectorAll("[data-practice-pillar]").forEach((btn) =>
      btn.addEventListener("click", () => setView("quiz", { quizPillar: btn.dataset.practicePillar }))
    );

    document.querySelectorAll("[data-select-lesson]").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.activePillarId = btn.dataset.selectPillar;
        state.activeLessonId = btn.dataset.selectLesson;
        saveState();
        syncHash();
        render();
        window.scrollTo({ top: 0 });
      })
    );

    document.getElementById("toggle-lesson-complete")?.addEventListener("click", (e) => {
      const lid = e.currentTarget.dataset.lessonId;
      const idx = state.completedLessons.indexOf(lid);
      if (idx >= 0) state.completedLessons.splice(idx, 1);
      else state.completedLessons.push(lid);
      saveState();
      render();
    });

    document.getElementById("filter-pillar")?.addEventListener("change", (e) => {
      state.quizFilterPillar = e.target.value;
      state.quizIndex = 0;
      syncHash();
      render();
    });
    document.getElementById("filter-difficulty")?.addEventListener("change", (e) => {
      state.quizFilterDifficulty = e.target.value;
      state.quizIndex = 0;
      render();
    });
    document.getElementById("filter-mode")?.addEventListener("change", (e) => {
      state.quizMode = e.target.value;
      state.quizIndex = 0;
      if (state.quizMode === "exam") state.examSession = { picks: {}, submitted: false };
      render();
    });
    document.getElementById("quiz-search")?.addEventListener("input", (e) => {
      state.quizSearch = e.target.value;
      state.quizIndex = 0;
      render();
      const input = document.getElementById("quiz-search");
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });

    document.querySelectorAll("[data-pick-option]").forEach((btn) =>
      btn.addEventListener("click", () => pickOptionByIndex(Number(btn.dataset.pickOption)))
    );

    document.getElementById("bookmark-q-btn")?.addEventListener("click", (e) => {
      const qid = e.currentTarget.dataset.qid;
      const idx = state.bookmarks.indexOf(qid);
      if (idx >= 0) state.bookmarks.splice(idx, 1);
      else state.bookmarks.push(qid);
      saveState();
      render();
    });

    document.getElementById("retry-q-btn")?.addEventListener("click", (e) => {
      delete state.answered[e.currentTarget.dataset.qid];
      saveState();
      render();
    });

    document.getElementById("prev-q-btn")?.addEventListener("click", () => {
      if (state.quizIndex > 0) {
        state.quizIndex -= 1;
        render();
      }
    });
    document.getElementById("next-q-btn")?.addEventListener("click", () => {
      const list = getFilteredQuestions();
      if (state.quizIndex < list.length - 1) {
        state.quizIndex += 1;
        render();
      }
    });

    document.getElementById("finish-exam-btn")?.addEventListener("click", () => {
      if (!state.examSession) state.examSession = { picks: {}, submitted: true };
      else state.examSession.submitted = true;
      render();
    });
    document.getElementById("retake-exam-btn")?.addEventListener("click", () => {
      state.examSession = { picks: {}, submitted: false };
      state.quizIndex = 0;
      render();
    });
    document.getElementById("switch-practice-btn")?.addEventListener("click", () => {
      state.quizMode = "practice";
      state.quizIndex = 0;
      render();
    });
    document.getElementById("clear-filters-btn")?.addEventListener("click", () => {
      state.quizFilterPillar = "all";
      state.quizFilterDifficulty = "all";
      state.quizMode = "practice";
      state.quizSearch = "";
      state.quizIndex = 0;
      render();
    });
    document.getElementById("reset-progress-btn")?.addEventListener("click", () => {
      if (!Object.keys(state.answered).length) return;
      if (window.confirm("Clear all saved question answers?")) {
        state.answered = {};
        state.examSession = null;
        saveState();
        render();
      }
    });

    ["calc-lambda", "calc-w", "calc-p", "calc-n", "calc-alpha", "calc-beta", "calc-cores", "calc-spindles"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", updateCalculators);
    });
  }

  // Persistent navigation & keyboard shortcuts
  document.querySelectorAll(".nav-link").forEach((btn) =>
    btn.addEventListener("click", () => setView(btn.dataset.view))
  );
  document.getElementById("brand-home").addEventListener("click", (e) => {
    e.preventDefault();
    setView("overview");
  });
  document.getElementById("theme-toggle").addEventListener("click", () => {
    state.theme = state.theme === "slate" ? "paper" : "slate";
    saveState();
    applyTheme();
  });

  document.addEventListener("keydown", (e) => {
    if (state.view !== "quiz") return;
    if (e.target && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
    const key = e.key.toLowerCase();
    if (["1", "2", "3", "4"].includes(key)) pickOptionByIndex(Number(key) - 1);
    else if (["a", "b", "c", "d"].includes(key)) pickOptionByIndex(["a", "b", "c", "d"].indexOf(key));
    else if (e.key === "ArrowLeft") document.getElementById("prev-q-btn")?.click();
    else if (e.key === "ArrowRight") document.getElementById("next-q-btn")?.click();
  });

  syncHash();
  render();
})();
