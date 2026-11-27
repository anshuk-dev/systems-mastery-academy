(() => {
  const DATA = window.COURSE_DATA;
  if (!DATA) {
    document.getElementById("main-content").innerHTML =
      "<div class='hero'><h1>Missing course bundle</h1><p>Run <code>python3 scripts/build_assets.py</code> to generate <code>data/course-bundle.js</code>.</p></div>";
    return;
  }

  const LETTERS = ["A", "B", "C", "D"];
  const STORAGE_KEY = "systems_mastery_state_v1";

  const defaultState = {
    view: "overview",
    theme: "dark",
    activePillarId: DATA.pillars[0].id,
    activeLessonId: DATA.pillars[0].lessons[0].id,
    completedLessons: [],
    answered: {},       // qid -> { selectedIndex, correct }
    bookmarks: [],
    quizFilterPillar: "all",
    quizFilterDifficulty: "all",
    quizSearch: "",
    quizMode: "practice", // practice | exam | missed
    quizIndex: 0,
    examSession: null
  };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return { ...defaultState, ...saved };
    } catch {
      return { ...defaultState };
    }
  }

  const state = loadState();

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
      // Ignore storage quota issues
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
    const escaped = escapeHtml(str);
    return escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  function totalLessons() {
    return DATA.pillars.reduce((acc, p) => acc + p.lessons.length, 0);
  }

  function getMasteryPercent() {
    const lessonWeight = state.completedLessons.length / totalLessons();
    const correctCount = Object.values(state.answered).filter((a) => a.correct).length;
    const quizWeight = correctCount / DATA.questions.length;
    return Math.round(((lessonWeight * 0.4) + (quizWeight * 0.6)) * 100);
  }

  function applyTheme() {
    document.body.classList.toggle("light", state.theme === "light");
    const btn = document.getElementById("theme-toggle");
    btn.textContent = state.theme === "light" ? "Dark Mode" : "Light Mode";
  }

  function updateHeader() {
    document.querySelectorAll(".nav-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === state.view);
    });
    document.getElementById("progress-summary-text").textContent = `${getMasteryPercent()}% Mastery`;
  }

  function getFilteredQuestions() {
    return DATA.questions.filter((q) => {
      if (state.quizFilterPillar !== "all" && q.pillar !== state.quizFilterPillar) return false;
      if (state.quizFilterDifficulty !== "all" && q.difficulty !== state.quizFilterDifficulty) return false;
      if (state.quizMode === "missed") {
        const rec = state.answered[q.id];
        const isBookmarked = state.bookmarks.includes(q.id);
        if (!isBookmarked && !(rec && !rec.correct)) return false;
      }
      if (state.quizSearch.trim()) {
        const needle = state.quizSearch.toLowerCase();
        const hay = `${q.id} ${q.concept} ${q.scenario} ${q.question}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
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
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderOverview() {
    const correctCount = Object.values(state.answered).filter((a) => a.correct).length;
    const answeredCount = Object.keys(state.answered).length;
    const distractorCount = DATA.questions.length * 3;

    const pillarCards = DATA.pillars.map((p) => {
      const pQuestions = DATA.questions.filter((q) => q.pillar === p.id);
      const pCorrect = pQuestions.filter((q) => state.answered[q.id]?.correct).length;
      const pDoneLessons = p.lessons.filter((l) => state.completedLessons.includes(l.id)).length;
      return `
        <article class="pillar-card">
          <div class="pillar-header">
            <span class="pillar-num" style="color:${p.color}">${p.number}</span>
            <span class="badge">${pDoneLessons}/${p.lessons.length} lessons &bull; ${pCorrect}/${pQuestions.length} Qs</span>
          </div>
          <h3>${escapeHtml(p.name)}</h3>
          <p class="pillar-tagline">${escapeHtml(p.tagline)}</p>
          <p style="font-size:0.88rem; margin:0;">${escapeHtml(p.summary)}</p>
          <div class="pillar-meta">
            <span>${p.lessons.length} lessons</span>
            <span>${pQuestions.length} scenario Q&amp;As</span>
          </div>
          <div class="pillar-actions">
            <button class="btn btn-primary" data-open-pillar="${p.id}">Study Module</button>
            <button class="btn" data-practice-pillar="${p.id}">Practice Q&amp;A</button>
          </div>
        </article>
      `;
    }).join("");

    return `
      <section class="hero">
        <span class="hero-kicker">Staff &amp; Principal Systems Engineering Curriculum</span>
        <h1>${escapeHtml(DATA.title)}</h1>
        <p>${escapeHtml(DATA.subtitle)}. Designed to build both <strong>Knowledge</strong> (first-principles mechanics, laws, patterns) and <strong>Wisdom</strong> (judgment under ambiguity, trade-offs, failure modes, and spotting plausible architectural traps).</p>
        <div class="hero-actions">
          <button class="btn btn-primary" id="hero-start-course">Start / Resume Course</button>
          <button class="btn" id="hero-start-quiz">Open Distractor Analysis Lab</button>
          <button class="btn btn-ghost" id="hero-open-tools">Calculators &amp; Laws</button>
        </div>
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-value">${DATA.pillars.length}</div><div class="stat-label">Core Pillars + Capstone</div></div>
          <div class="stat-card"><div class="stat-value">${state.completedLessons.length} / ${totalLessons()}</div><div class="stat-label">Lessons Completed</div></div>
          <div class="stat-card"><div class="stat-value">${correctCount} / ${DATA.questions.length}</div><div class="stat-label">Scenarios Mastered (${answeredCount} attempted)</div></div>
          <div class="stat-card"><div class="stat-value">${distractorCount}</div><div class="stat-label">Explicit Distractor Analyses</div></div>
        </div>
      </section>

      <h2 class="section-title">Mastery Pillars</h2>
      <section class="pillars-grid">${pillarCards}</section>

      <section class="diagram-box">
        <h3 style="margin:0 0 6px; color:var(--heading);">How the Four Pillars Interact in Production</h3>
        <p style="margin:0; font-size:0.9rem; color:var(--text-muted);">Every real incident crosses boundaries. Mastering systems means understanding the tension between all four axes simultaneously.</p>
        <div class="diagram-grid">
          <div class="diagram-node">
            <strong>1. System Integration</strong>
            <span>Outbox, Idempotency, Sagas, ACLs, Schema Evolution, Bulkheads &amp; Jittered Retries protect boundaries when networks lie.</span>
          </div>
          <div class="diagram-node">
            <strong>2. Modular Architecture</strong>
            <span>Bounded Contexts, Hexagonal Ports, Connascence &amp; Fitness Functions keep change cheap without building a Distributed Monolith.</span>
          </div>
          <div class="diagram-node">
            <strong>3. System Optimization</strong>
            <span>Little's Law, Flamegraphs, Pool Sizing, Keyset Pagination &amp; Stampede Shields eliminate bottlenecks with physics, not guesses.</span>
          </div>
          <div class="diagram-node">
            <strong>4. System Scalability</strong>
            <span>Gunther's USL, Consistent Hashing, Skew-Aware Sharding, Load Shedding &amp; Cellular Regions grow capacity 10x&ndash;100x cleanly.</span>
          </div>
        </div>
      </section>
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
    const curFlatIdx = flatLessons.findIndex((x) => x.lesson.id === activeLesson.id);
    const prevItem = curFlatIdx > 0 ? flatLessons[curFlatIdx - 1] : null;
    const nextItem = curFlatIdx < flatLessons.length - 1 ? flatLessons[curFlatIdx + 1] : null;
    const isCompleted = state.completedLessons.includes(activeLesson.id);

    const sidebarHtml = DATA.pillars.map((p) => {
      const doneCount = p.lessons.filter((l) => state.completedLessons.includes(l.id)).length;
      const buttons = p.lessons.map((l) => {
        const active = l.id === activeLesson.id ? "active" : "";
        const done = state.completedLessons.includes(l.id) ? '<span class="check-badge">✓</span>' : "";
        return `<button class="lesson-nav-btn ${active}" data-select-lesson="${l.id}" data-select-pillar="${p.id}">
          <span>${escapeHtml(l.title)}</span>${done}
        </button>`;
      }).join("");
      return `<div class="sidebar-group">
        <div class="sidebar-pillar"><span>${p.number} ${escapeHtml(p.name)}</span><span>${doneCount}/${p.lessons.length}</span></div>
        ${buttons}
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
      <div class="course-layout">
        <aside class="sidebar">${sidebarHtml}</aside>
        <article class="lesson-pane">
          <div class="badges" style="margin-bottom:10px;">
            <span class="badge badge-accent">Pillar ${activePillar.number}: ${escapeHtml(activePillar.name)}</span>
            <span class="badge">${escapeHtml(activeLesson.duration)}</span>
            ${isCompleted ? '<span class="badge" style="color:var(--good); border-color:var(--good);">Completed</span>' : ""}
          </div>
          <h1 style="margin:0 0 6px; color:var(--heading);">${escapeHtml(activeLesson.title)}</h1>
          <p style="margin:0; color:var(--text-muted);">${escapeHtml(activePillar.summary)}</p>

          <div class="mental-model-banner">
            <strong>Core Mental Model:</strong> ${formatInlineCode(activePillar.mentalModel)}
          </div>

          <div class="split-kw">
            <section class="kw-box">
              <h4>Knowledge &mdash; First Principles &amp; Mechanics</h4>
              <ul>${activeLesson.knowledge.map((k) => `<li>${formatInlineCode(k)}</li>`).join("")}</ul>
            </section>
            <section class="kw-box">
              <h4>Wisdom &mdash; Judgment &amp; Production Reality</h4>
              <ul>${activeLesson.wisdom.map((w) => `<li>${formatInlineCode(w)}</li>`).join("")}</ul>
            </section>
          </div>

          <h3 style="margin:20px 0 8px; color:var(--heading);">Architectural Trade-off Matrix</h3>
          <div class="tradeoff-table-wrap">
            <table>
              <thead>
                <tr><th>Approach</th><th>Pros</th><th>Cons</th><th>When to Use</th></tr>
              </thead>
              <tbody>${tradeRows}</tbody>
            </table>
          </div>

          <section class="anti-box">
            <h4 style="margin:0 0 8px; color:var(--bad);">Anti-Patterns &amp; Failure Traps</h4>
            <ul>${activeLesson.antiPatterns.map((a) => `<li>${formatInlineCode(a)}</li>`).join("")}</ul>
          </section>

          <div class="heuristic-box">
            <strong>Principal Rule of Thumb:</strong> ${formatInlineCode(activeLesson.heuristic)}
          </div>

          <div class="lesson-footer">
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${prevItem ? `<button class="btn" data-select-lesson="${prevItem.lesson.id}" data-select-pillar="${prevItem.pillar.id}">&larr; Previous</button>` : ""}
              ${nextItem ? `<button class="btn" data-select-lesson="${nextItem.lesson.id}" data-select-pillar="${nextItem.pillar.id}">Next Lesson &rarr;</button>` : ""}
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="btn btn-primary" id="toggle-lesson-complete" data-lesson-id="${activeLesson.id}">
                ${isCompleted ? "Completed ✓ (Undo)" : "Mark Lesson Complete"}
              </button>
              <button class="btn" data-practice-pillar="${activePillar.id}">Practice ${escapeHtml(activePillar.name)} Q&amp;A</button>
            </div>
          </div>
        </article>
      </div>
    `;
  }

  function renderDistractorBlock(q, selectedIndex) {
    const cidx = q.correctIndex;
    const cards = q.options.map((opt, idx) => {
      const da = q.distractorAnalysis[String(idx)];
      const isRight = idx === cidx;
      const picked = idx === selectedIndex;
      return `
        <div class="distractor-card ${isRight ? "is-right" : "is-trap"}">
          <div style="display:flex; justify-content:space-between; gap:8px; align-items:center; margin-bottom:6px;">
            <strong>Option ${LETTERS[idx]}${picked ? " (Your Pick)" : ""}</strong>
            <span class="trap-label ${isRight ? "right" : "trap"}">
              ${isRight ? "Correct Insight" : escapeHtml(da.trap)}
            </span>
          </div>
          <div style="margin:0;">${formatInlineCode(isRight ? da.keyInsight : da.whyWrong)}</div>
        </div>
      `;
    }).join("");

    return `
      <div class="analysis-panel">
        <div class="explanation-box">
          <strong style="color:var(--good); display:block; margin-bottom:6px;">
            Answer ${LETTERS[cidx]} is Correct &mdash; Architectural Explanation
          </strong>
          <div>${formatInlineCode(q.explanation)}</div>
        </div>
        <h4 style="margin:0 0 6px; color:var(--heading);">Option-by-Option Distractor Analysis</h4>
        <div class="distractor-grid">${cards}</div>
        <div class="heuristic-box" style="margin-top:16px; margin-bottom:0;">
          <strong>Wisdom Takeaway:</strong> ${formatInlineCode(q.wisdomTakeaway)}
        </div>
      </div>
    `;
  }

  function renderQuiz() {
    const list = getFilteredQuestions();
    if (state.quizIndex >= list.length) state.quizIndex = Math.max(0, list.length - 1);
    const pillarOptions = DATA.pillars.map((p) =>
      `<option value="${p.id}" ${state.quizFilterPillar === p.id ? "selected" : ""}>${p.number} ${escapeHtml(p.name)}</option>`
    ).join("");

    const toolbar = `
      <div class="quiz-toolbar">
        <div class="filter-row">
          <select id="filter-pillar" aria-label="Filter by pillar">
            <option value="all" ${state.quizFilterPillar === "all" ? "selected" : ""}>All Pillars (50)</option>
            ${pillarOptions}
          </select>
          <select id="filter-difficulty" aria-label="Filter by difficulty">
            <option value="all" ${state.quizFilterDifficulty === "all" ? "selected" : ""}>All Levels</option>
            <option value="Intermediate" ${state.quizFilterDifficulty === "Intermediate" ? "selected" : ""}>Intermediate</option>
            <option value="Senior" ${state.quizFilterDifficulty === "Senior" ? "selected" : ""}>Senior</option>
            <option value="Staff / Principal" ${state.quizFilterDifficulty === "Staff / Principal" ? "selected" : ""}>Staff / Principal</option>
          </select>
          <select id="filter-mode" aria-label="Quiz mode">
            <option value="practice" ${state.quizMode === "practice" ? "selected" : ""}>Practice (Instant Analysis)</option>
            <option value="exam" ${state.quizMode === "exam" ? "selected" : ""}>Exam Mode (Batch Score)</option>
            <option value="missed" ${state.quizMode === "missed" ? "selected" : ""}>Missed &amp; Bookmarked</option>
          </select>
          <input type="search" id="quiz-search" value="${escapeHtml(state.quizSearch)}" placeholder="Search concept or keyword..." />
        </div>
        <div class="filter-row">
          <span class="badge">${list.length} matching questions</span>
          ${state.quizMode === "exam" ? `<button class="btn btn-primary" id="finish-exam-btn">Score Exam (${Object.keys(state.examSession?.picks || {}).length}/${list.length})</button>` : ""}
          <button class="btn btn-ghost" id="reset-progress-btn">Reset Answers</button>
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
      const breakdown = Object.entries(byPillar).map(([pid, s]) => {
        const pName = DATA.pillars.find((p) => p.id === pid)?.name || pid;
        return `<div class="stat-card"><div class="stat-value">${s.right}/${s.total}</div><div class="stat-label">${escapeHtml(pName)}</div></div>`;
      }).join("");
      const reviewCards = list.map((q) => `
        <div class="question-card" style="margin-top:16px;">
          <div class="badges" style="margin-bottom:8px;">
            <span class="badge badge-accent">${q.id}</span>
            <span class="badge">${escapeHtml(q.concept)}</span>
            <span class="badge" style="color:${picks[q.id] === q.correctIndex ? "var(--good)" : "var(--bad)"}">
              ${picks[q.id] === q.correctIndex ? "Correct" : picks[q.id] === undefined ? "Unanswered" : `Picked ${LETTERS[picks[q.id]]}`}
            </span>
          </div>
          <p style="margin:0 0 8px;">${formatInlineCode(q.scenario)}</p>
          <p class="q-prompt">${formatInlineCode(q.question)}</p>
          ${renderDistractorBlock(q, picks[q.id])}
        </div>
      `).join("");

      return `
        ${toolbar}
        <section class="hero">
          <span class="hero-kicker">Exam Diagnostic Report</span>
          <h1>Score: ${correct} / ${list.length} (${pct}%)</h1>
          <div class="stats-grid">${breakdown}</div>
          <div style="margin-top:18px; display:flex; gap:10px;">
            <button class="btn btn-primary" id="retake-exam-btn">Start New Exam</button>
            <button class="btn" id="switch-practice-btn">Return to Practice Mode</button>
          </div>
        </section>
        ${reviewCards}
      `;
    }

    if (!list.length) {
      return `
        ${toolbar}
        <div class="question-card">
          <h3 style="margin-top:0; color:var(--heading);">No questions match your current filters</h3>
          <p style="color:var(--text-muted);">Try switching back to Practice mode or clearing the search filter.</p>
        </div>
      `;
    }

    const q = list[state.quizIndex];
    const pillar = DATA.pillars.find((p) => p.id === q.pillar);
    const isBookmarked = state.bookmarks.includes(q.id);
    const rec = state.quizMode === "exam"
      ? (state.examSession?.picks?.[q.id] !== undefined ? { selectedIndex: state.examSession.picks[q.id] } : null)
      : state.answered[q.id];
    const showAnalysis = state.quizMode !== "exam" && Boolean(rec);

    const optionsHtml = q.options.map((opt, idx) => {
      let cls = "option-btn";
      if (rec) {
        if (state.quizMode === "exam") {
          if (rec.selectedIndex === idx) cls += " selected";
        } else {
          if (idx === q.correctIndex) cls += " correct";
          else if (rec.selectedIndex === idx) cls += " wrong";
        }
      }
      return `
        <button class="${cls}" data-pick-option="${idx}" data-qid="${q.id}">
          <span class="opt-letter">${LETTERS[idx]}</span>
          <span>${formatInlineCode(opt)}</span>
        </button>
      `;
    }).join("");

    return `
      ${toolbar}
      <section class="question-card">
        <div class="q-meta">
          <div class="badges">
            <span class="badge badge-accent">${q.id} (${state.quizIndex + 1} of ${list.length})</span>
            <span class="badge">${escapeHtml(pillar?.name || q.pillar)}</span>
            <span class="badge badge-warn">${escapeHtml(q.difficulty)}</span>
            <span class="badge">${escapeHtml(q.concept)}</span>
          </div>
          <button class="btn" id="bookmark-q-btn" data-qid="${q.id}">${isBookmarked ? "Bookmarked ★" : "Bookmark ☆"}</button>
        </div>

        <div class="scenario-box">
          <strong>Production Scenario:</strong> ${formatInlineCode(q.scenario)}
        </div>
        <p class="q-prompt">${formatInlineCode(q.question)}</p>
        <div class="options-list">${optionsHtml}</div>

        ${showAnalysis ? renderDistractorBlock(q, rec.selectedIndex) : ""}

        <div class="lesson-footer">
          <div style="display:flex; gap:8px;">
            <button class="btn" id="prev-q-btn" ${state.quizIndex === 0 ? "disabled" : ""}>&larr; Previous</button>
            <button class="btn btn-primary" id="next-q-btn" ${state.quizIndex >= list.length - 1 ? "disabled" : ""}>Next Question &rarr;</button>
          </div>
          ${rec && state.quizMode !== "exam" ? `<button class="btn btn-ghost" id="retry-q-btn" data-qid="${q.id}">Clear This Answer</button>` : ""}
        </div>
      </section>
    `;
  }

  function renderTools() {
    return `
      <section class="hero" style="padding:24px;">
        <span class="hero-kicker">Interactive Quantitative Intuition</span>
        <h1>Systems Physics Calculators &amp; Wisdom Matrices</h1>
        <p style="margin-bottom:0;">Principal engineers verify intuition with back-of-the-envelope math before proposing architecture changes.</p>
      </section>

      <div class="tools-grid">
        <section class="tool-card">
          <h3>1. Little's Law Concurrency (<code>L = λ · W</code>)</h3>
          <p style="font-size:0.88rem; color:var(--text-muted);">Model how downstream latency spikes consume worker threads and connection pools.</p>
          <div class="calc-inputs">
            <label>Arrival Rate λ (req/sec)
              <input type="number" id="calc-lambda" value="400" min="1" />
            </label>
            <label>Avg Latency W (ms)
              <input type="number" id="calc-w" value="50" min="1" />
            </label>
          </div>
          <div class="calc-output" id="calc-littles-out"></div>
        </section>

        <section class="tool-card">
          <h3>2. Tail Latency Amplification (<code>1 - p^N</code>)</h3>
          <p style="font-size:0.88rem; color:var(--text-muted);">Probability that a parallel fan-out request hits at least one slow backend.</p>
          <div class="calc-inputs">
            <label>Per-Call Fast Prob (%)
              <input type="number" id="calc-p" value="99" min="50" max="99.99" step="0.1" />
            </label>
            <label>Parallel Fan-Out N
              <input type="number" id="calc-n" value="25" min="1" max="500" />
            </label>
          </div>
          <div class="calc-output" id="calc-tail-out"></div>
        </section>

        <section class="tool-card">
          <h3>3. Gunther's Universal Scalability Law</h3>
          <p style="font-size:0.88rem; color:var(--text-muted);"><code>C(N) = N / (1 + α(N-1) + βN(N-1))</code> &mdash; find when adding nodes hurts throughput.</p>
          <div class="calc-inputs">
            <label>Contention α (0–0.5)
              <input type="number" id="calc-alpha" value="0.04" min="0" max="0.5" step="0.01" />
            </label>
            <label>Coherency β (0–0.05)
              <input type="number" id="calc-beta" value="0.005" min="0" max="0.1" step="0.001" />
            </label>
          </div>
          <div class="calc-output" id="calc-usl-out"></div>
        </section>

        <section class="tool-card">
          <h3>4. DB Pool &amp; Headroom Heuristics</h3>
          <ul style="padding-left:18px; margin:8px 0 0; font-size:0.9rem;">
            <li><strong>Active DB Connections:</strong> <code>(CPU_cores * 2) + effective_spindles</code> (typically 20&ndash;64, multiplexed via PgBouncer).</li>
            <li><strong>Steady-State Utilization Cap:</strong> Target &le;50% per AZ so losing 1 of 2 AZs doesn't push remaining nodes past the queueing knee (~80%+).</li>
            <li><strong>Cache Stampede Guard:</strong> Singleflight + jittered TTL + negative caching (30&ndash;120s).</li>
            <li><strong>Retry Rule:</strong> Max 1 retry layer + Full Jitter + &le;10% retry budget + idempotency key.</li>
          </ul>
        </section>
      </div>
    `;
  }

  function updateCalculators() {
    const lEl = document.getElementById("calc-littles-out");
    if (!lEl) return;
    const lambda = Math.max(0, Number(document.getElementById("calc-lambda").value) || 0);
    const wMs = Math.max(0, Number(document.getElementById("calc-w").value) || 0);
    const L = lambda * (wMs / 1000);
    const L10x = lambda * ((wMs * 10) / 1000);
    lEl.textContent = `Active Concurrency L = ${L.toFixed(1)} threads\nIf latency spikes 10x (${wMs * 10}ms): L = ${L10x.toFixed(0)} threads needed!`;

    const pPct = Math.min(99.999, Math.max(1, Number(document.getElementById("calc-p").value) || 99));
    const n = Math.max(1, Number(document.getElementById("calc-n").value) || 1);
    const allFast = Math.pow(pPct / 100, n) * 100;
    const hitTail = 100 - allFast;
    document.getElementById("calc-tail-out").textContent =
      `All ${n} fast: ${allFast.toFixed(1)}%\nAt least 1 tail hit: ${hitTail.toFixed(1)}% (consider hedged reads!)`;

    const alpha = Math.max(0, Number(document.getElementById("calc-alpha").value) || 0);
    const beta = Math.max(0, Number(document.getElementById("calc-beta").value) || 0);
    const usl = (N) => N / (1 + alpha * (N - 1) + beta * N * (N - 1));
    const nPeak = beta > 0 ? Math.sqrt((1 - alpha) / beta) : Infinity;
    const samples = [1, 4, 8, 16, 32, 64].map((k) => `${k}n->${usl(k).toFixed(1)}x`).join("  ");
    document.getElementById("calc-usl-out").textContent =
      `${samples}\nPeak N_max ≈ ${Number.isFinite(nPeak) ? nPeak.toFixed(1) + " nodes" : "∞ (Amdahl ceiling " + (alpha > 0 ? (1 / alpha).toFixed(1) : "∞") + "x)"}`;
  }

  function render() {
    applyTheme();
    updateHeader();
    const main = document.getElementById("main-content");
    if (state.view === "overview") main.innerHTML = renderOverview();
    else if (state.view === "course") main.innerHTML = renderCourse();
    else if (state.view === "quiz") main.innerHTML = renderQuiz();
    else main.innerHTML = renderTools();

    bindEvents();
    updateCalculators();
  }

  function bindEvents() {
    document.getElementById("hero-start-course")?.addEventListener("click", () => setView("course"));
    document.getElementById("hero-start-quiz")?.addEventListener("click", () => setView("quiz"));
    document.getElementById("hero-open-tools")?.addEventListener("click", () => setView("tools"));

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
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
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
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.pickOption);
        const qid = btn.dataset.qid;
        const q = DATA.questions.find((x) => x.id === qid);
        if (!q) return;
        if (state.quizMode === "exam") {
          if (!state.examSession) state.examSession = { picks: {}, submitted: false };
          state.examSession.picks[qid] = idx;
          render();
        } else {
          state.answered[qid] = { selectedIndex: idx, correct: idx === q.correctIndex };
          saveState();
          render();
        }
      })
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
    document.getElementById("reset-progress-btn")?.addEventListener("click", () => {
      state.answered = {};
      state.examSession = null;
      saveState();
      render();
    });

    ["calc-lambda", "calc-w", "calc-p", "calc-n", "calc-alpha", "calc-beta"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", updateCalculators);
    });
  }

  // Topbar persistent listeners
  document.querySelectorAll(".nav-tab").forEach((btn) =>
    btn.addEventListener("click", () => setView(btn.dataset.view))
  );
  document.getElementById("brand-home").addEventListener("click", () => setView("overview"));
  document.getElementById("theme-toggle").addEventListener("click", () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    saveState();
    applyTheme();
  });

  render();
})();
