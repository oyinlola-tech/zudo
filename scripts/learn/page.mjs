/**
 * Page templates for /learn: one page per lesson plus the course index.
 * Shares the docs shell (header, sidebar, TOC, footer) so docs.js and
 * components.js work unchanged.
 */

import { themeBlock } from "../site-theme.mjs";
import { escapeAttr, escapeHtml } from "./source.mjs";

function tierBadge(course, tier, extra = "") {
  const t = course.tiers && course.tiers[tier];
  if (!t) return "";
  return `<span class="lx-tier lx-tier-${tier}${extra}" title="${escapeAttr(t.label + ": " + t.summary)}">${escapeHtml(t.label)}</span>`;
}

function head({ title, description, path, keywords }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#1A1A2E">
${themeBlock()}
  <title>${escapeHtml(title)}</title>
  <link rel="alternate" type="text/markdown" href="${path === "/learn" ? "/learn/index" : path}.md" title="Markdown version">
  <meta name="description" content="${escapeAttr(description)}">
  <!-- seo:start -->
  <!-- seo:end -->
  <meta name="keywords" content="${escapeAttr(keywords || "zudo, learn, javascript, typescript, node.js, backend, tutorial")}">
  <meta name="author" content="Oluwayemi Oyinlola Michael">

  <link rel="icon" type="image/svg+xml" href="/assets/zudo-favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png">

  <link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/css/site.css">
  <link rel="stylesheet" href="/css/docs.css">
  <link rel="stylesheet" href="/css/playground.css">
  <link rel="stylesheet" href="/css/learn.css">
  <link rel="stylesheet" href="/css/ide.css">
  <link rel="stylesheet" href="/css/tailwind.css">
</head>
<body class="bg-zudo-white text-zudo-black">

  <!-- NAVBAR -->
  <div id="zudo-nav"></div>
`;
}

function minutesOf(lessons) {
  return lessons.reduce((t, l) => t + (Number.parseInt(l.meta.minutes, 10) || 15), 0);
}

function hours(min) {
  return min < 90 ? `${min} min` : `${Math.round(min / 60)} h`;
}

/* The lessons a course actually has on disk, grouped by module. */
function modulesOf(c) {
  return c.modules.map((m) => ({ ...m, written: c.lessons.filter((l) => l.module === m) })).filter((m) => m.written.length);
}

function sidebar(course, active, activeSlug) {
  let html = `    <aside class="doc-sidebar lx-sidebar" id="docSidebar" aria-label="Academy">\n`;
  html += `      <a href="/learn" class="sidebar-item${!active ? " sidebar-item-active" : ""}">Academy home</a>\n`;
  if (active) {
    html += `      <a href="/learn/${active.id}" class="sidebar-item lx-side-course${activeSlug === null ? " sidebar-item-active" : ""}"><span class="lx-side-level">Level ${active.level}</span>${escapeHtml(active.title)}</a>\n`;
    for (const m of modulesOf(active)) {
      html += `      <div class="sidebar-section mt-4">${escapeHtml(m.title)}</div>\n`;
      for (const l of m.written) {
        const cls = l.slug === activeSlug ? " sidebar-item-active" : "";
        html += `      <a href="/learn/${l.slug}" class="sidebar-item lx-side-item${cls}" data-lesson="${l.slug}"><span class="lx-side-num">${l.number}</span>${escapeHtml(l.meta.title)}</a>\n`;
      }
    }
  }
  html += `      <div class="sidebar-section mt-4">${active ? "Other courses" : "Courses"}</div>\n`;
  for (const c of course.courses) {
    if (!c.lessons.length || c === active) continue;
    html += `      <a href="/learn/${c.id}" class="sidebar-item lx-side-item" data-course="${c.id}"><span class="lx-side-num">${c.level}</span>${escapeHtml(c.title)}</a>\n`;
  }
  html += `      <div class="sidebar-section mt-4">Reference</div>\n`;
  html += `      <a href="/docs/getting-started" class="sidebar-item">Docs</a>\n`;
  html += `      <a href="/docs/packages" class="sidebar-item">All packages</a>\n`;
  html += `    </aside>\n`;
  return html;
}

function crumbs(items) {
  return `      <nav class="lx-crumbs" aria-label="Breadcrumb">${items
    .map(([label, href], i) => (href ? `<a href="${href}">${escapeHtml(label)}</a>` : `<span aria-current="page">${escapeHtml(label)}</span>`) + (i < items.length - 1 ? `<span class="lx-crumb-sep" aria-hidden="true">/</span>` : ""))
    .join("")}</nav>\n`;
}

/* A progress bar that learn.js fills in from the lessons this browser has finished. */
function progress(slugs, label) {
  return `<div class="lx-progress" data-progress="${slugs.join(" ")}"><div class="lx-progress-bar"><span style="width:0%"></span></div><p class="lx-progress-text">${escapeHtml(label)}</p></div>`;
}

function lessonList(course, lessons, parentTier) {
  return `          <ol class="lx-map-list">
${lessons
  .map(
    (l) => `            <li><a href="/learn/${l.slug}" data-lesson="${l.slug}"><span class="lx-map-num">${l.number}</span><span class="lx-map-text"><strong>${escapeHtml(l.meta.title)}</strong><span>${escapeHtml(l.meta.description)}</span></span><span class="lx-map-min">${l.tier !== parentTier ? tierBadge(course, l.tier, " lx-tier-sm") : ""}${escapeHtml(l.meta.minutes || "15")} min</span></a></li>`,
  )
  .join("\n")}
          </ol>`;
}

function foot() {
  return `
  <script src="/js/docs.js" defer></script>
  <script src="/js/components.js" defer></script>
  <script src="/js/playground.js" defer></script>
  <script src="/js/learn.js" defer></script>
  <script src="/js/quiz.js" defer></script>
  <script src="/js/ide.js" defer></script>
  <script src="/js/exercise.js" defer></script>

  <div id="zudo-footer"></div>
</body>
</html>
`;
}

/* "objectives: a | b | c" in a lesson's front matter. */
function objectives(meta) {
  const list = (meta.objectives || "").split("|").map((x) => x.trim()).filter(Boolean);
  if (!list.length) return "";
  return `      <section class="lx-goals" aria-label="What you will be able to do">
        <p class="lx-goals-label">BY THE END OF THIS LESSON YOU CAN</p>
        <ul>
${list.map((o) => `          <li>${escapeHtml(o)}</li>`).join("\n")}
        </ul>
      </section>
`;
}

function pagerLink(l, dir) {
  if (!l) return dir === "prev" ? `<a href="/learn" class="lx-pager-link"><span>← Academy</span>Home</a>` : `<a href="/docs/getting-started" class="lx-pager-link lx-pager-next"><span>Keep going →</span>The docs</a>`;
  const label = dir === "prev" ? `← ${l.course.title}, lesson ${l.number}` : `${l.course.title}, lesson ${l.number} →`;
  return `<a href="/learn/${l.slug}" class="lx-pager-link${dir === "next" ? " lx-pager-next" : ""}"><span>${escapeHtml(label)}</span>${escapeHtml(l.meta.title)}</a>`;
}

export function lessonPage({ course, lessons, lesson, bodyHtml, toc }) {
  const c = lesson.course;
  const i = lessons.indexOf(lesson);
  const prev = lessons[i - 1];
  const next = lessons[i + 1];
  const m = lesson.meta;
  const path = `/learn/${lesson.slug}`;
  const title = `${m.title} — ZudoJS Academy`;
  let html = head({ title, description: m.description, path, keywords: m.keywords });
  html += `
  <!-- ==================== LAYOUT ==================== -->
  <div class="flex max-w-screen-2xl mx-auto">

    <!-- learn:sidebar (generated by scripts/site-learn.mjs) -->
${sidebar(course, c, lesson.slug)}
    <main id="main" class="flex-1 min-w-0 px-8 py-10 max-w-4xl lx-main" data-lesson="${lesson.slug}" data-course="${c.id}">
${crumbs([["Academy", "/learn"], [c.track.title, `/learn#${c.track.id}`], [c.title, `/learn/${c.id}`], [m.title, null]])}
      <header class="lx-hero">
        <div class="lx-hero-tag">LEVEL ${c.level} · LESSON ${lesson.number} OF ${c.lessons.length}</div>
        <p class="lx-hero-part">${escapeHtml(lesson.module.title)} ${tierBadge(course, lesson.tier)}</p>
        <h1>${escapeHtml(m.title)}</h1>
        <p class="lx-hero-lead">${escapeHtml(m.description)}</p>
        <ul class="lx-hero-meta">
          <li><strong>${escapeHtml(m.minutes || "15")} min</strong> to read and try</li>
          ${m.youNeed ? `<li><strong>You need:</strong> ${escapeHtml(m.youNeed)}</li>` : ""}
          ${m.youBuild ? `<li><strong>You build:</strong> ${escapeHtml(m.youBuild)}</li>` : ""}
        </ul>
        <div class="lx-hero-actions">
          <button type="button" class="lx-open-ide">Open the editor</button>
          ${lesson.hasQuiz ? `<a class="lx-hero-test" href="#test">Test yourself</a>` : ""}
        </div>
      </header>

${objectives(m)}      <div class="lx-body">
${bodyHtml.trim()}
      </div>

${lesson.hasQuiz ? `      <section class="lx-quiz" data-quiz="/learn/quiz/${lesson.slug}.json" data-lesson="${lesson.slug}" aria-labelledby="test">
        <h2 id="test">Test yourself</h2>
        <p class="lx-quiz-lead">Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.</p>
        <div class="lx-quiz-body"><noscript><p>The test needs JavaScript.</p></noscript></div>
      </section>
` : ""}      <div class="lx-finish">
        <button type="button" class="lx-done" data-lesson="${lesson.slug}">Mark this lesson as done</button>
      </div>

      <nav class="lx-pager" aria-label="Lessons">
        ${pagerLink(prev, "prev")}
        ${pagerLink(next, "next")}
      </nav>
    </main>

    <aside class="doc-toc" aria-label="On this page">
      <div class="p-4 text-xs font-bold uppercase text-black/60 tracking-wider">On this page</div>
${toc.map((h) => `      <a href="#${h.id}" class="toc-link">${h.text}</a>`).join("\n")}${lesson.hasQuiz ? `\n      <a href="#test" class="toc-link">Test yourself</a>` : ""}
    </aside>

  </div>
`;
  return html + foot();
}

export const EXAM_SIZE = 20;
export const EXAM_PASS = 16;

export function coursePage({ course, c }) {
  const path = `/learn/${c.id}`;
  const lessons = c.lessons;
  const slugs = lessons.map((l) => l.slug);
  const prereq = c.prerequisites.map((id) => course.courses.find((x) => x.id === id)).filter((x) => x && x.lessons.length);
  const tested = lessons.filter((l) => l.hasQuiz);
  const others = course.courses.filter((x) => x.lessons.length);
  const nextCourse = others[others.indexOf(c) + 1];
  let html = head({ title: `${c.title} — ZudoJS Academy`, description: c.summary, path, keywords: `zudojs academy, ${c.title.toLowerCase()}, course, free, tutorial` });
  html += `
  <div class="flex max-w-screen-2xl mx-auto">

    <!-- learn:sidebar (generated by scripts/site-learn.mjs) -->
${sidebar(course, c, null)}
    <main id="main" class="flex-1 min-w-0 px-8 py-10 max-w-4xl lx-main" data-course="${c.id}">
${crumbs([["Academy", "/learn"], [c.track.title, `/learn#${c.track.id}`], [c.title, null]])}
      <header class="lx-hero lx-hero-course">
        <div class="lx-hero-tag">LEVEL ${c.level} · ${escapeHtml(c.track.title.toUpperCase())}</div>
        <p class="lx-hero-part">Course ${tierBadge(course, c.tier)}</p>
        <h1>${escapeHtml(c.title)}</h1>
        <p class="lx-hero-lead">${escapeHtml(c.summary)}</p>
        <ul class="lx-hero-meta">
          <li><strong>${lessons.length} lessons</strong></li>
          <li><strong>${hours(minutesOf(lessons))}</strong> to read and try</li>
          ${prereq.length ? `<li><strong>Before this:</strong> ${prereq.map((p) => `<a href="/learn/${p.id}">${escapeHtml(p.title)}</a>`).join(", ")}</li>` : `<li><strong>Before this:</strong> nothing, start here</li>`}
        </ul>
        ${progress(slugs, `0 of ${lessons.length} lessons done`)}
        <a class="lx-start" href="/learn/${lessons[0].slug}" data-continue="${slugs.join(" ")}">Start lesson 1 →</a>
      </header>

      <section class="lx-outcomes" aria-labelledby="outcomes">
        <h2 id="outcomes">When you finish, you can</h2>
        <ul>
${c.outcomes.map((o) => `          <li>${escapeHtml(o)}</li>`).join("\n")}
        </ul>
        <p class="lx-outcomes-project"><strong>You build:</strong> ${escapeHtml(c.project)}</p>
      </section>

      <section class="lx-map" aria-label="Lessons">
${modulesOf(c)
  .map(
    (m, mi) => `        <div class="lx-map-part">
          <p class="lx-map-kicker">MODULE ${mi + 1}</p>
          <h2 id="module-${mi + 1}">${escapeHtml(m.title)}</h2>
${lessonList(course, m.written, c.tier)}
        </div>`,
  )
  .join("\n")}
      </section>

${tested.length ? `      <section class="lx-quiz lx-exam" data-exam="${tested.map((l) => `/learn/quiz/${l.slug}.json`).join(" ")}" data-course="${c.id}" data-size="${Math.min(EXAM_SIZE, tested.length * 5)}" aria-labelledby="exam">
        <h2 id="exam">Course checkpoint</h2>
        <p class="lx-quiz-lead">Prove you can move on. The checkpoint picks ${Math.min(EXAM_SIZE, tested.length * 5)} questions at random from every lesson in this course. Get ${Math.round((Math.min(EXAM_SIZE, tested.length * 5) * EXAM_PASS) / EXAM_SIZE)} right to pass. Your result is saved in this browser only.</p>
        <div class="lx-quiz-body"><noscript><p>The checkpoint needs JavaScript.</p></noscript></div>
      </section>
` : ""}
      <nav class="lx-pager" aria-label="Courses">
        <a href="/learn" class="lx-pager-link"><span>← Academy</span>All courses</a>
        ${nextCourse ? `<a href="/learn/${nextCourse.id}" class="lx-pager-link lx-pager-next"><span>Next course →</span>${escapeHtml(nextCourse.title)}</a>` : ""}
      </nav>
    </main>

    <aside class="doc-toc" aria-label="On this page">
      <div class="p-4 text-xs font-bold uppercase text-black/60 tracking-wider">On this page</div>
      <a href="#outcomes" class="toc-link">When you finish</a>
${modulesOf(c).map((m, mi) => `      <a href="#module-${mi + 1}" class="toc-link">${escapeHtml(m.title)}</a>`).join("\n")}${tested.length ? `\n      <a href="#exam" class="toc-link">Course checkpoint</a>` : ""}
    </aside>
  </div>
`;
  return html + foot();
}

export function indexPage({ course, lessons }) {
  const m = course.index;
  const live = course.courses.filter((c) => c.lessons.length);
  let html = head({ title: m.title, description: m.description, path: "/learn" });
  html += `
  <div class="flex max-w-screen-2xl mx-auto">

    <!-- learn:sidebar (generated by scripts/site-learn.mjs) -->
${sidebar(course, null, null)}
    <main id="main" class="flex-1 min-w-0 px-8 py-10 max-w-4xl lx-main">
      <header class="lx-hero lx-hero-index">
        <div class="lx-hero-tag">FREE · ${live.length} COURSES · ${lessons.length} LESSONS</div>
        <h1>${escapeHtml(m.heading)}</h1>
        <p class="lx-hero-lead">${escapeHtml(m.lead)}</p>
        ${progress(lessons.map((l) => l.slug), `0 of ${lessons.length} lessons done`)}
        <a class="lx-start" href="/learn/${lessons[0].slug}" data-continue="${lessons.map((l) => l.slug).join(" ")}">Start lesson 1 →</a>
      </header>

      <div class="lx-body">
${m.bodyHtml}
      </div>

      <section class="lx-tiers" aria-labelledby="tiers">
        <h2 id="tiers">Where to start</h2>
        <p>A complete beginner follows every level in order. If you already program in another language, start with <a href="/learn/javascript">JavaScript fundamentals</a>; if you already know JavaScript, start with <a href="/learn/typescript">TypeScript</a>; if you already build TypeScript backends, go straight to <a href="/learn/zudo-fundamentals">ZudoJS fundamentals</a>. Every course and lesson carries one of four labels:</p>
        <ul class="lx-tier-list">
${Object.keys(course.tiers || {})
  .map((k) => `          <li>${tierBadge(course, k)}<span>${escapeHtml(course.tiers[k].summary)}</span></li>`)
  .join("\n")}
        </ul>
      </section>

      <section class="lx-tracks" aria-label="Courses">
${course.tracks
  .map((t) => {
    const cs = t.courses.map((id) => course.courses.find((c) => c.id === id)).filter((c) => c.lessons.length);
    if (!cs.length) return "";
    return `        <div class="lx-track">
          <p class="lx-map-kicker">TRACK</p>
          <h2 id="${t.id}">${escapeHtml(t.title)}</h2>
          <p class="lx-map-lead">${escapeHtml(t.summary)}</p>
          <div class="lx-course-grid">
${cs
  .map(
    (c) => `            <a class="lx-course-card" href="/learn/${c.id}" data-course="${c.id}">
              <span class="lx-course-level">Level ${c.level}</span>
              <strong>${escapeHtml(c.title)}</strong>
              <span class="lx-course-sum">${escapeHtml(c.summary)}</span>
              <span class="lx-course-meta">${tierBadge(course, c.tier, " lx-tier-sm")}${c.lessons.length} lessons · ${hours(minutesOf(c.lessons))}</span>
              ${progress(c.lessons.map((l) => l.slug), `0 of ${c.lessons.length} done`)}
            </a>`,
  )
  .join("\n")}
          </div>
        </div>`;
  })
  .filter(Boolean)
  .join("\n")}
      </section>
    </main>

    <aside class="doc-toc" aria-label="On this page">
      <div class="p-4 text-xs font-bold uppercase text-black/60 tracking-wider">On this page</div>
      <a href="#tiers" class="toc-link">Where to start</a>
${course.tracks.filter((t) => t.courses.some((id) => live.some((c) => c.id === id))).map((t) => `      <a href="#${t.id}" class="toc-link">${escapeHtml(t.title)}</a>`).join("\n")}
    </aside>
  </div>
`;
  return html + foot();
}
