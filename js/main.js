/*
 * CV site renderer. Everything on the page comes from data/cv.json.
 *
 * Text fields in cv.json are either a plain string or {en, pt, pt_status}.
 * Values starting with "TODO" are hidden on the live site and shown as
 * highlighted markers in preview mode (localhost, or ?todo=1). Use ?todo=0
 * locally to see exactly what the live site will show.
 */
(() => {
  'use strict';

  const store = {
    get(key) {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
    },
  };

  const params = new URLSearchParams(location.search);
  const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0', ''];
  const PREVIEW = params.has('todo') ? params.get('todo') !== '0' : LOCAL_HOSTS.includes(location.hostname);
  const MONTHS = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  };
  const wideQuery = matchMedia('(min-width: 48rem)');
  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');

  const state = {
    cv: null,
    lang: 'en',
    skill: null,     // active skill filter id
    step: 0,         // selected pipeline step
    open: new Set(), // ids of expanded panels, kept across re-renders
    pipelineSeen: false,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Text helpers ---------- */

  const isTodo = (v) => typeof v === 'string' && /^\s*TODO/i.test(v);

  function t(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    return v[state.lang] ?? v.en ?? '';
  }

  // True when a value should appear on the page.
  const shown = (v) => {
    const s = t(v);
    return s !== '' && (PREVIEW || !isTodo(s));
  };

  // A text value as a DOM child: TODOs become markers in preview and vanish on the live site.
  function txt(v) {
    const s = t(v);
    if (!s) return null;
    if (isTodo(s)) return PREVIEW ? h('mark', { class: 'todo' }, s) : null;
    return s;
  }

  function ui(key, vars = {}) {
    const dict = state.cv.ui;
    let s = (dict[state.lang] && dict[state.lang][key]) ?? dict.en[key] ?? key;
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
    return s;
  }

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    append(el, kids);
    return el;
  }

  function append(el, kids) {
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false || kid === '') continue;
      el.append(kid instanceof Node ? kid : String(kid));
    }
    return el;
  }

  /* ---------- Dates ---------- */

  function datePoint(d) {
    if (d === 'present') return ui('present');
    if (isTodo(d)) return txt(d);
    const [y, m] = String(d).split('-');
    return m ? `${MONTHS[state.lang][Number(m) - 1]} ${y}` : y;
  }

  // Returns a node/string for an item's dates, or null when nothing should show.
  function dateRange(item) {
    if (item.date_text) return txt(item.date_text);
    const { start, end } = item;
    if (!start) return null;
    if (!PREVIEW) {
      const sTodo = isTodo(start);
      const eTodo = !end || isTodo(end);
      if (sTodo && eTodo) return null;
      if (sTodo) return end === 'present' ? ui('ongoing') : datePoint(end);
      if (eTodo || start === end) return datePoint(start);
    }
    if (!end || start === end) return datePoint(start);
    return h('span', null, datePoint(start), ' – ', datePoint(end));
  }

  // Plain-text version of a range for print lines.
  const dateText = (item) => {
    const r = dateRange(item);
    return r == null ? '' : (r instanceof Node ? r.textContent : r);
  };

  /* ---------- Skills ---------- */

  let skillIndex = new Map();

  function indexSkills() {
    skillIndex = new Map();
    for (const group of state.cv.skills) {
      for (const item of group.items) {
        if (item.confirmed === false && !PREVIEW) continue;
        skillIndex.set(item.id, item);
      }
    }
  }

  // Skills referenced by at least one entry are clickable filters; the rest are plain labels.
  function linkedSkills() {
    const cv = state.cv;
    const lists = [
      cv.research.tools,
      cv.research.skills,
      ...cv.education.map((e) => e.skills),
      ...cv.experience.map((e) => e.skills),
      ...cv.projects.map((p) => p.skills),
    ];
    return new Set(lists.flat().filter(Boolean));
  }

  // Entry tags use a skill's short label when it has one; the Skills section passes full = true.
  function skillTag(id, linked, full = false) {
    const skill = skillIndex.get(id);
    if (!skill) return null;
    const label = t(full ? skill.label : (skill.short ?? skill.label));
    const unconfirmed = skill.confirmed === false;
    const cls = 'tag mono' + (unconfirmed ? ' tag--todo' : '');
    const title = unconfirmed ? t(skill.todo) : null;
    if (!linked) return h('span', { class: cls, title }, label);
    return h('button', {
      type: 'button',
      class: cls + ' tag--filter',
      'data-skill': id,
      'aria-pressed': String(state.skill === id),
      title,
      onclick: () => setFilter(state.skill === id ? null : id),
    }, label);
  }

  function tagList(ids, extra = []) {
    const tags = (ids || []).map((id) => skillTag(id, true)).filter(Boolean);
    const extras = extra.filter(shown).map((x) => h('span', { class: 'tag mono tag--plain' }, txt(x)));
    if (!tags.length && !extras.length) return null;
    return h('ul', { class: 'tags', role: 'list' }, [...tags, ...extras].map((el) => h('li', null, el)));
  }

  /* ---------- Shared building blocks ---------- */

  // titleKey may be [screenKey, printKey] when the printed heading differs.
  function section(id, titleKey, ...content) {
    const [screenKey, printKey] = Array.isArray(titleKey) ? titleKey : [titleKey];
    const title = printKey
      ? [h('span', { class: 'screen-only' }, ui(screenKey)), h('span', { class: 'print-only' }, ui(printKey))]
      : ui(screenKey);
    return h('section', { id, class: 'section', 'aria-labelledby': `${id}-title` },
      h('h2', { id: `${id}-title`, class: 'section-title' }, title),
      ...content);
  }

  // An expand/collapse button + panel pair whose state survives re-renders.
  function disclosure(id, buttonClass, buttonContent, panelClass, panelContent) {
    const panelId = `panel-${id}`;
    const isOpen = state.open.has(id);
    const panel = h('div', { id: panelId, class: panelClass, hidden: !isOpen }, panelContent);
    const button = h('button', {
      type: 'button',
      class: buttonClass,
      'aria-expanded': String(isOpen),
      'aria-controls': panelId,
      onclick: () => {
        const open = button.getAttribute('aria-expanded') !== 'true';
        button.setAttribute('aria-expanded', String(open));
        panel.hidden = !open;
        if (open) state.open.add(id); else state.open.delete(id);
      },
    }, buttonContent, chevron());
    return { button, panel };
  }

  const chevron = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icon chevron');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<path d="m6 9 6 6 6-6"/>';
    return svg;
  };

  const ICONS = {
    github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
    linkedin: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7"/>',
    orcid: '<circle cx="12" cy="12" r="9"/><path d="M9 8v.01M9 11v6M12.5 8h1.5a4.5 4.5 0 0 1 0 9h-1.5Z"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    download: '<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/>',
    arrow: '<path d="M7 17 17 7M9 7h8v8"/>',
  };

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[name];
    return svg;
  }

  /* ---------- Sections ---------- */

  function renderNav() {
    const items = [
      ['about', 'nav_about'], ['research', 'nav_research'], ['skills', 'nav_skills'],
      ['projects', 'nav_projects'], ['timeline', 'nav_timeline'], ['activities', 'nav_activities'],
    ];
    $('#nav-list').replaceChildren(...items.map(([id, key]) =>
      h('li', null, h('a', { href: `#${id}` }, ui(key)))));
  }

  function renderHero() {
    const { profile, links } = state.cv;
    const avatar = h('div', { class: 'avatar', 'aria-hidden': 'true' },
      h('span', { class: 'mono' }, profile.monogram));
    if (profile.photo && !isTodo(profile.photo)) {
      const img = new Image();
      img.alt = '';
      img.decoding = 'async';
      img.width = 112;
      img.height = 112;
      img.onload = () => avatar.replaceChildren(img);
      img.src = profile.photo;
    }

    const actions = [];
    const linkBtn = (href, label, iconName, extra = {}) => {
      if (!shown(href)) return;
      if (isTodo(href)) {
        actions.push(h('span', { class: 'btn btn--todo' }, icon(iconName), label, ' ', txt(href)));
        return;
      }
      actions.push(h('a', { class: 'btn', href, ...extra }, icon(iconName), label));
    };
    linkBtn(links.github, 'GitHub', 'github', { rel: 'me' });
    linkBtn(links.linkedin, 'LinkedIn', 'linkedin', { rel: 'me' });
    linkBtn(links.orcid, 'ORCID', 'orcid', { rel: 'me' });
    linkBtn(isTodo(links.email) ? links.email : `mailto:${links.email}`, ui('email'), 'email');
    actions.push(h('button', { type: 'button', class: 'btn btn--primary', onclick: () => window.print() },
      icon('download'), ui('download_pdf')));

    // Print header contact line: plain text so URLs survive on paper.
    const contact = [
      profile.location,
      !isTodo(links.email) && links.email,
      links.github.replace(/^https?:\/\//, ''),
      !isTodo(links.linkedin) && links.linkedin.replace(/^https?:\/\/(www\.)?/, ''),
      !isTodo(links.orcid) && links.orcid.replace(/^https?:\/\//, ''),
    ].filter(Boolean).join('  ·  ');

    return h('section', { id: 'top', class: 'hero', 'aria-labelledby': 'hero-name' },
      avatar,
      h('div', { class: 'hero-body' },
        h('p', { class: 'eyebrow mono screen-only' }, profile.location),
        h('h1', { id: 'hero-name' }, profile.name),
        h('p', { class: 'hero-title' }, txt(profile.title)),
        h('p', { class: 'hero-tagline screen-only' }, txt(profile.tagline)),
        h('p', { class: 'print-only print-contact' }, contact),
        h('div', { class: 'hero-actions screen-only' }, actions)));
  }

  function renderAbout() {
    const { profile, languages } = state.cv;
    const langList = h('ul', { class: 'lang-list', role: 'list' }, languages.map((l) =>
      h('li', null, h('span', { class: 'lang-name' }, txt(l.name)), h('span', { class: 'lang-level mono' }, txt(l.level)))));
    return section('about', 'about',
      h('div', { class: 'about-grid' },
        h('p', { class: 'lead' }, txt(profile.summary)),
        h('div', { class: 'about-facts screen-only' },
          h('h3', { class: 'label mono' }, ui('languages')),
          langList)));
  }

  function renderResearch() {
    const r = state.cv.research;
    const dates = dateRange(r);
    const steps = r.pipeline;

    const panel = h('div', { class: 'pipe-panel', id: 'pipe-panel', 'aria-live': 'polite' });
    const figure = h('figure', { class: 'pipeline screen-only' },
      h('div', { class: 'pipe-canvas', id: 'pipe-canvas' }),
      h('figcaption', { class: 'visually-hidden' }, ui('pipeline_label')),
      panel);

    const fact = (label, value) => (value ? [h('dt', { class: 'label mono' }, label), h('dd', null, value)] : null);
    const points = (r.points || []).filter(shown);
    const inProgress = (step) => (step.status === 'in_progress' ? ` (${ui('in_progress').toLowerCase()})` : '');

    const article = h('article', { class: 'feature card', 'data-skills': [...(r.tools || []), ...(r.skills || [])].join(' ') },
      h('p', { class: 'kicker mono' }, txt(r.kicker), dates && [' · ', dates]),
      h('h3', { class: 'feature-title' }, txt(r.title)),
      h('p', { class: 'feature-context' }, txt(r.context)),
      figure,
      h('p', { class: 'print-only print-chain' }, steps.map((s) => t(s.label) + inProgress(s)).join('  ›  ')),
      h('dl', { class: 'facts' },
        fact(ui('overview'), shown(r.summary) && txt(r.summary)),
        points.length > 0 && fact(txt(r.points_label), h('ul', { class: 'bullets' }, points.map((x) => h('li', null, txt(x))))),
        fact(ui('next'), shown(r.next) && txt(r.next)),
        fact(ui('supervisor'), shown(r.supervisor) && txt(r.supervisor)),
        fact(ui('tools'), tagList(r.tools)),
        fact(ui('skills'), tagList(r.skills))));

    return section('research', 'research', article);
  }

  function drawPipeline() {
    const canvas = $('#pipe-canvas');
    if (!canvas) return;
    const steps = state.cv.research.pipeline;
    const NS = 'http://www.w3.org/2000/svg';
    const s = (tag, attrs, text) => {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      if (text != null) el.textContent = text;
      return el;
    };

    // Three columns (wrapping onto a second row) on wide screens, one column on phones.
    const cols = wideQuery.matches ? 3 : 1;
    const vertical = cols === 1;
    const n = steps.length;
    const rows = Math.ceil(n / cols);
    const pad = 6;
    const W = vertical ? 300 : 220;
    const H = vertical ? 58 : 78;
    const GAPX = 40;
    const GAPY = vertical ? 24 : 44;
    const width = cols * W + (cols - 1) * GAPX + pad * 2;
    const height = rows * H + (rows - 1) * GAPY + pad * 2;
    const pos = (i) => ({
      x: pad + (i % cols) * (W + GAPX),
      y: pad + Math.floor(i / cols) * (H + GAPY),
    });

    const animate = !state.pipelineSeen && !motionQuery.matches;
    const svg = s('svg', {
      viewBox: `0 0 ${width} ${height}`,
      width,
      class: 'pipe-svg' + (vertical ? ' is-vertical' : '') + (animate ? ' will-animate' : ''),
      role: 'group',
      'aria-label': ui('pipeline_label'),
    });

    // Connectors first so nodes sit on top of them.
    for (let i = 0; i < n - 1; i += 1) {
      const a = pos(i);
      const b = pos(i + 1);
      let d;
      let head;
      if (a.y === b.y) {
        const y = a.y + H / 2;
        d = `M${a.x + W} ${y} H${b.x - 6}`;
        head = `${b.x},${y} ${b.x - 7},${y - 4.5} ${b.x - 7},${y + 4.5}`;
      } else {
        // Drop down, run across to the next node's centre, drop into it.
        const x1 = a.x + W / 2;
        const x2 = b.x + W / 2;
        const mid = a.y + H + GAPY / 2;
        d = `M${x1} ${a.y + H} V${mid} H${x2} V${b.y - 6}`;
        head = `${x2},${b.y} ${x2 - 4.5},${b.y - 7} ${x2 + 4.5},${b.y - 7}`;
      }
      svg.append(s('path', { class: 'pipe-flow', d }));
      svg.append(s('polygon', { class: 'pipe-head', points: head }));
    }

    steps.forEach((step, i) => {
      const { x, y } = pos(i);
      const num = String(i + 1).padStart(2, '0');
      const label = t(step.label);
      const progress = step.status === 'in_progress';
      const g = s('g', {
        class: 'pipe-node' + (progress ? ' is-progress' : ''),
        role: 'button',
        tabindex: '0',
        'data-step': i,
        'aria-pressed': String(i === state.step),
        'aria-label': `${num}. ${label}` + (progress ? ` (${ui('in_progress')})` : ''),
        style: `--i:${i}`,
      });
      g.append(s('rect', { x, y, width: W, height: H, rx: 10 }));
      if (progress) {
        g.append(s('text', { class: 'pipe-badge', x: x + W - 12, y: vertical ? y + 43 : y + 20, 'text-anchor': 'end' },
          ui('in_progress').toUpperCase()));
      }
      if (vertical) {
        g.append(s('text', { class: 'pipe-num', x: x + 16, y: y + H / 2 + 4 }, num));
        g.append(s('text', { class: 'pipe-label', x: x + 52, y: y + 25 }, label));
        g.append(s('text', { class: 'pipe-sub', x: x + 52, y: y + 43 }, t(step.sub)));
      } else {
        g.append(s('text', { class: 'pipe-num', x: x + 12, y: y + 20 }, num));
        g.append(s('text', { class: 'pipe-label', x: x + W / 2, y: y + 44, 'text-anchor': 'middle' }, label));
        g.append(s('text', { class: 'pipe-sub', x: x + W / 2, y: y + 62, 'text-anchor': 'middle' }, t(step.sub)));
      }
      g.addEventListener('click', () => selectStep(i));
      g.addEventListener('keydown', (e) => {
        const next = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectStep(i);
        } else if (next) {
          e.preventDefault();
          const j = (i + next + n) % n;
          selectStep(j);
          $(`.pipe-node[data-step="${j}"]`, svg).focus();
        }
      });
      svg.append(g);
    });

    canvas.replaceChildren(svg);
    selectStep(state.step);

    if (animate && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          svg.classList.add('is-visible');
          state.pipelineSeen = true;
          io.disconnect();
        }
      }, { threshold: 0.3 });
      io.observe(svg);
    } else {
      svg.classList.remove('will-animate');
    }
  }

  function selectStep(i) {
    const steps = state.cv.research.pipeline;
    state.step = i;
    $$('.pipe-node').forEach((node) => {
      const on = Number(node.dataset.step) === i;
      node.setAttribute('aria-pressed', String(on));
      node.classList.toggle('is-active', on);
    });
    const step = steps[i];
    const panel = $('#pipe-panel');
    panel.replaceChildren();
    append(panel, [
      h('p', { class: 'pipe-step mono' }, ui('step', { n: i + 1, total: steps.length }), ' · ', t(step.label),
        step.status === 'in_progress' && h('span', { class: 'pipe-badge-text' }, ui('in_progress'))),
      h('p', null, txt(step.text)),
      PREVIEW && step.todo ? h('p', null, txt(step.todo)) : null,
    ]);
  }

  function renderSkills() {
    const linked = linkedSkills();
    const groups = state.cv.skills.filter((group) => group.show_in_skills !== false).map((group) => {
      const tags = group.items
        .filter((item) => skillIndex.has(item.id))
        .map((item) => h('li', null, skillTag(item.id, linked.has(item.id), true)));
      if (!tags.length) return null;
      return h('div', { class: 'skill-group' },
        h('h3', { class: 'label mono' }, txt(group.label)),
        h('ul', { class: 'tags', role: 'list' }, tags),
        h('p', { class: 'print-only print-skill-line' },
          h('strong', null, t(group.label), ': '),
          group.items.filter((item) => skillIndex.has(item.id) && item.confirmed !== false).map((item) => t(item.label)).join(', ')));
    });
    return section('skills', 'skills',
      h('p', { class: 'muted screen-only' }, ui('skills_hint')),
      h('div', { class: 'skill-groups' }, groups),
      h('p', { class: 'filter-status mono screen-only', id: 'filter-status' }));
  }

  function renderProjects() {
    const cards = state.cv.projects.map((p) => {
      const dates = dateRange(p);
      const did = (p.did || []).filter(shown);
      const repoOk = p.repo && !isTodo(p.repo);
      const detailRows = [
        shown(p.problem) && [h('dt', { class: 'label mono' }, ui('problem')), h('dd', null, txt(p.problem))],
        did.length > 0 && [h('dt', { class: 'label mono' }, ui('did')), h('dd', null, h('ul', { class: 'bullets' }, did.map((d) => h('li', null, txt(d)))))],
        [h('dt', { class: 'label mono' }, ui('tools')), h('dd', null, tagList(p.skills))],
        shown(p.result) && [h('dt', { class: 'label mono' }, ui('result')), h('dd', null, txt(p.result))],
      ];
      const { button, panel } = disclosure(`project-${p.id}`, 'disclosure-btn mono', ui('details'), 'project-detail',
        h('dl', { class: 'facts facts--stack' }, detailRows));

      return h('article', { class: 'card project', 'data-skills': (p.skills || []).join(' ') },
        h('header', { class: 'project-head' },
          h('h3', { class: 'project-title' }, txt(p.title)),
          dates && h('p', { class: 'date mono' }, dates)),
        PREVIEW && p.todo ? h('p', null, txt(p.todo)) : null,
        h('p', { class: 'project-summary' }, txt(p.summary)),
        h('div', { class: 'screen-only' }, tagList(p.skills)),
        h('p', { class: 'print-only print-tools' }, h('strong', null, ui('tools'), ': '),
          (p.skills || []).filter((id) => skillIndex.has(id)).map((id) => t(skillIndex.get(id).label)).join(', ')),
        h('div', { class: 'project-actions screen-only' },
          button,
          repoOk && h('a', { class: 'link-arrow mono', href: p.repo }, ui('repo'), icon('arrow'))),
        panel);
    });
    return section('projects', 'projects', h('div', { class: 'project-grid' }, cards));
  }

  function renderTimeline() {
    const { education, experience } = state.cv;
    const sortKey = (item) => {
      const y = (d) => (d === 'present' ? 9999 : parseInt(d, 10) || 9999);
      return y(item.end) * 10000 + y(item.start);
    };
    const entries = [
      ...experience.map((e) => ({ kind: 'experience', item: e, title: e.role, org: e.organisation })),
      ...education.map((e) => ({ kind: 'education', item: e, title: e.degree, org: e.institution })),
    ].sort((a, b) => sortKey(b.item) - sortKey(a.item));

    const list = h('ol', { class: 'timeline', role: 'list' }, entries.map(({ kind, item, title, org }) => {
      const dates = dateRange(item);
      const highlights = (item.highlights || []).filter(shown);
      const body = [
        item.summary && h('p', null, txt(item.summary)),
        highlights.length > 0 && [
          item.highlights_label && h('p', { class: 'label mono' }, txt(item.highlights_label)),
          h('ul', { class: 'bullets' }, highlights.map((x) => h('li', null, txt(x)))),
        ],
        h('p', { class: 'print-only print-highlights' },
          item.highlights_label && h('em', null, t(item.highlights_label), ': '),
          highlights.map((x) => t(x)).join('; ')),
        h('div', { class: 'screen-only' }, tagList(item.skills)),
        item.link && h('a', { class: 'link-arrow mono screen-only', href: item.link }, ui('see_research'), icon('arrow')),
      ];
      const { button, panel } = disclosure(`tl-${item.id}`, 'tl-toggle',
        h('span', { class: 'tl-heading' },
          h('span', { class: 'tl-title' }, txt(title)),
          h('span', { class: 'tl-org' }, txt(org))),
        'tl-detail', body);
      return h('li', { class: `tl-item tl-item--${kind}`, 'data-skills': (item.skills || []).join(' ') },
        h('p', { class: 'tl-meta mono' },
          h('span', { class: 'tl-kind' }, ui(`kind_${kind}`)),
          dates && h('span', { class: 'date' }, dates)),
        h('h3', { class: 'tl-h' }, button),
        panel);
    }));
    return section('timeline', ['timeline', 'education'], list);
  }

  function renderActivities() {
    const { activities, activities_print_merge: merges = [] } = state.cv;
    const merged = new Set(merges.flatMap((m) => m.replaces));

    const items = activities.map((a) => {
      const dates = dateRange(a);
      const points = (a.points || []).filter(shown);
      return h('li', { class: 'activity' + (merged.has(a.id) ? ' print-hide' : '') + (a.print_line ? ' has-print-line' : '') },
        h('div', { class: 'activity-head' },
          h('h3', { class: 'activity-title' }, txt(a.title)),
          dates && h('p', { class: 'date mono' }, dates)),
        h('div', { class: 'activity-body' },
          shown(a.role) && h('p', { class: 'activity-role' }, txt(a.role)),
          shown(a.organisation) && h('p', { class: 'muted' }, txt(a.organisation)),
          shown(a.description) && h('p', null, txt(a.description)),
          points.length > 0 && h('ul', { class: 'bullets' }, points.map((p) => h('li', null, txt(p))))),
        a.print_line && h('p', { class: 'print-only print-line' }, t(a.print_line)));
    });
    const mergedLines = merges.map((m) => h('li', { class: 'print-only print-line' }, t(m.text)));
    return section('activities', 'activities', h('ul', { class: 'activities', role: 'list' }, items, mergedLines));
  }

  function renderOther() {
    const jobs = state.cv.other_experience;
    const list = h('ul', { class: 'other-list', role: 'list' }, jobs.map((j) => {
      const dates = dateRange(j);
      const datesTxt = dateText(j);
      return h('li', { class: 'other-item' },
        h('p', { class: 'screen-only' },
          h('strong', null, txt(j.role)), ' — ', txt(j.organisation),
          dates && h('span', { class: 'date mono' }, dates)),
        h('p', { class: 'muted screen-only' }, txt(j.summary)),
        h('p', { class: 'print-only print-line' },
          h('strong', null, t(j.role), ' — ', t(j.organisation)),
          datesTxt && !isTodo(datesTxt) ? ` (${datesTxt})` : '', ': ', t(j.summary)));
    }));
    const { button, panel } = disclosure('other', 'section-toggle',
      h('span', { class: 'section-title', id: 'other-title' }, ui('other')),
      'other-body', list);
    return h('section', { id: 'other', class: 'section section--collapsible', 'aria-labelledby': 'other-title' },
      h('h2', { class: 'section-toggle-h' }, button),
      panel);
  }

  // Languages get their own block in print (on screen they sit inside About).
  function renderPrintLanguages() {
    return h('section', { id: 'languages', class: 'section print-only' },
      h('h2', { class: 'section-title' }, ui('languages')),
      h('p', null, state.cv.languages.map((l) => `${t(l.name)} (${t(l.level)})`).join(' · ')));
  }

  function renderFooter() {
    const { meta } = state.cv;
    const [y, m] = meta.last_updated.split('-');
    $('#footer-inner').replaceChildren(
      h('p', { class: 'mono' },
        `${ui('updated')}: ${m ? MONTHS[state.lang][Number(m) - 1] + ' ' : ''}${y}`,
        ' · ',
        h('a', { href: meta.source_url }, ui('source'))));
  }

  /* ---------- Skill filter ---------- */

  function setFilter(id) {
    state.skill = id;
    applyFilter(true);
  }

  function applyFilter(announce = false) {
    const id = state.skill;
    let count = 0;
    $$('[data-skills]').forEach((el) => {
      const match = id && el.dataset.skills.split(' ').includes(id);
      if (match) count += 1;
      el.classList.toggle('is-match', Boolean(match));
      el.classList.toggle('is-dim', Boolean(id) && !match);
    });
    $$('.tag--filter').forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.skill === id)));

    const chip = $('#filter-chip');
    const status = $('#filter-status');
    if (!id) {
      chip.hidden = true;
      chip.replaceChildren();
      if (status) status.textContent = '';
      if (announce) $('#live').textContent = ui('filter_none');
      return;
    }
    const label = t(skillIndex.get(id).label);
    const msg = ui(count === 1 ? 'filter_status_one' : 'filter_status', { skill: label, n: count });
    if (status) status.textContent = msg;
    if (announce) $('#live').textContent = msg;
    chip.replaceChildren(
      h('span', { class: 'mono' }, msg),
      h('button', { type: 'button', class: 'chip-clear', onclick: () => setFilter(null) },
        ui('clear_filter'), h('span', { 'aria-hidden': 'true' }, ' ×')));
    chip.hidden = false;
  }

  /* ---------- Theme & language ---------- */

  const currentTheme = () => document.documentElement.dataset.theme || (darkQuery.matches ? 'dark' : 'light');

  function updateThemeButton() {
    const btn = $('#theme-toggle');
    const dark = currentTheme() === 'dark';
    btn.setAttribute('aria-label', state.cv ? ui(dark ? 'theme_to_light' : 'theme_to_dark') : 'Switch theme');
  }

  function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('theme', next);
    updateThemeButton();
  }

  function setLang(lang) {
    state.lang = lang;
    store.set('lang', lang);
    render();
  }

  function updateLangButton() {
    const btn = $('#lang-toggle');
    const other = state.lang === 'en' ? 'pt' : 'en';
    btn.textContent = other.toUpperCase();
    btn.setAttribute('lang', other === 'pt' ? 'pt-PT' : 'en');
    btn.setAttribute('aria-label', ui('lang_switch'));
  }

  /* ---------- Preview helper: list TODOs ---------- */

  function collectTodos(node, path = '', out = []) {
    if (typeof node === 'string') {
      if (isTodo(node)) out.push(`${path}: ${node}`);
    } else if (Array.isArray(node)) {
      node.forEach((x, i) => collectTodos(x, `${path}[${i}]`, out));
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        collectTodos(v, path ? `${path}.${k}` : k, out);
      }
    }
    return out;
  }

  function countReview(node) {
    if (Array.isArray(node)) return node.reduce((n, x) => n + countReview(x), 0);
    if (node && typeof node === 'object') {
      return (node.pt_status === 'review' ? 1 : 0) +
        Object.values(node).reduce((n, x) => n + countReview(x), 0);
    }
    return 0;
  }

  function renderPreviewPanel() {
    $('#preview-panel')?.remove();
    if (!PREVIEW) return;
    const todos = collectTodos(state.cv);
    const review = countReview(state.cv);
    const { button, panel } = disclosure('preview', 'preview-btn mono',
      `Preview · ${todos.length} TODO · ${review} PT to review`, 'preview-list',
      [
        h('p', null, 'TODO values are hidden on the live site. Add ?todo=0 to the URL to preview the live version.'),
        h('ol', null, todos.map((x) => h('li', { class: 'mono' }, x))),
      ]);
    document.body.append(h('aside', { id: 'preview-panel', class: 'preview', 'aria-label': 'Preview notes' }, button, panel));
  }

  /* ---------- Render ---------- */

  function render() {
    const lang = state.lang;
    document.documentElement.lang = lang === 'pt' ? 'pt-PT' : 'en';
    document.title = `${state.cv.profile.name} — ${t(state.cv.profile.title)}`;
    $('.skip-link').textContent = ui('skip');
    indexSkills();
    if (state.skill && !skillIndex.has(state.skill)) state.skill = null;

    renderNav();
    $('#main').replaceChildren(
      renderHero(),
      renderAbout(),
      renderResearch(),
      renderSkills(),
      renderProjects(),
      renderTimeline(),
      renderActivities(),
      renderOther(),
      renderPrintLanguages());
    renderFooter();
    drawPipeline();
    applyFilter();
    updateLangButton();
    updateThemeButton();
    renderPreviewPanel();
  }

  async function init() {
    $('#theme-toggle').addEventListener('click', toggleTheme);
    $('#lang-toggle').addEventListener('click', () => setLang(state.lang === 'en' ? 'pt' : 'en'));
    darkQuery.addEventListener('change', updateThemeButton);
    wideQuery.addEventListener('change', () => state.cv && drawPipeline());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.skill) setFilter(null);
    });

    // Name the saved PDF sensibly.
    let savedTitle = '';
    addEventListener('beforeprint', () => {
      savedTitle = document.title;
      if (state.cv) document.title = `${state.cv.profile.name} — CV`;
    });
    addEventListener('afterprint', () => { if (savedTitle) document.title = savedTitle; });

    try {
      const res = await fetch('data/cv.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.cv = await res.json();
    } catch (err) {
      $('#main').replaceChildren(h('p', { class: 'notice', role: 'alert' },
        'The CV data could not be loaded. If you opened index.html directly from disk, serve the folder instead (python -m http.server).'));
      return;
    }

    const saved = store.get('lang');
    state.lang = saved === 'en' || saved === 'pt' ? saved : (state.cv.meta.default_language || 'en');
    render();

    // Re-apply a deep link (e.g. /#projects) now that the target exists.
    if (location.hash) {
      const jump = () => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'instant' });
      jump();
      document.fonts?.ready.then(jump);
    }
  }

  init();
})();
