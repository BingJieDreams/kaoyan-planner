/* 冲刺 · 考研规划 — 应用逻辑 */
(function () {
  'use strict';

  /* ================= 基础工具 ================= */
  var STORAGE_KEY = 'kaoyan-planner-v2';
  var BACKUP_KEY = 'kaoyan-planner-v2-backup';
  var STATUS = { red: '未完成', yellow: '进行中', green: '已完成' };
  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function isoOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseISO(s) { var p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function todayISO() { return isoOf(new Date()); }
  function addDays(iso, n) { var d = parseISO(iso); d.setDate(d.getDate() + n); return isoOf(d); }
  function diffDays(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
  function fmtCN(iso) { var d = parseISO(iso); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function fmtShort(iso) { var d = parseISO(iso); return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function fmtFull(iso) { var d = parseISO(iso); return fmtCN(iso) + ' ' + WEEK[d.getDay()]; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icon(name) {
    return '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  var SUBJECTS = window.SEED.subjects;
  var SUBJECT_MAP = {};
  var SUBJECT_ORDER = SUBJECTS.map(function (s) { return s.key; });
  SUBJECTS.forEach(function (s) { SUBJECT_MAP[s.key] = s; });

  function subjectMeta(key) { return SUBJECT_MAP[key] || SUBJECT_MAP.other; }

  /* 固定时刻表：每天 6 个学习时段 */
  var SLOTS = [
    { key: '0700', range: '07:00–08:00', label: '早读背诵', short: '07:00' },
    { key: '0800', range: '08:00–12:00', label: '数学', short: '08:00' },
    { key: '1400', range: '14:00–17:00', label: '408', short: '14:00' },
    { key: '1900', range: '19:00–20:00', label: '英语阅读', short: '19:00' },
    { key: '2000', range: '20:00–20:30', label: '晚间加练', short: '20:00' },
    { key: '2030', range: '20:30–22:00', label: '政治', short: '20:30' }
  ];
  var SLOT_MAP = {};
  SLOTS.forEach(function (s, i) { s.index = i; SLOT_MAP[s.key] = s; });

  function slotOf(key) { return SLOT_MAP[key] || null; }
  function slotOrder(t) { var s = slotOf(t.slot); return s ? s.index : 99; }

  /* ================= 数据层 ================= */
  function defaultState() {
    return {
      version: 2,
      settings: {
        examDate: '2026-12-19',
        startDate: '2026-11-11',
        dailyMinutes: 660,
        restWeekday: -1
      },
      tasks: window.SEED.buildTasks(),
      doubts: [],
      checkpoints: window.SEED.checkpoints(),
      notes: {},
      routine: {},
      routineItems: window.SEED.defaultRoutine(),
      vocab: { cursor: 0, newPerDay: 30, progress: {} },
      meta: { createdAt: new Date().toISOString() }
    };
  }

  function normalize(s) {
    var d = defaultState();
    s = s || {};
    s.settings = Object.assign({}, d.settings, s.settings || {});
    s.tasks = (s.tasks || []).map(function (t, i) {
      return Object.assign({
        id: 't-' + i,
        order: i,
        subject: 'other',
        group: '',
        title: '',
        detail: '',
        est: 60,
        priority: 2,
        date: null,
        slot: '',
        status: 'red',
        manual: false,
        note: ''
      }, t);
    });
    s.doubts = Array.isArray(s.doubts) ? s.doubts : [];
    s.checkpoints = Array.isArray(s.checkpoints) && s.checkpoints.length ? s.checkpoints : d.checkpoints;
    s.notes = s.notes || {};
    s.routine = s.routine || {};
    s.routineItems = Array.isArray(s.routineItems) && s.routineItems.length ? s.routineItems : d.routineItems;
    return s;
  }

  var recoveredFromBackup = false;

  function parseSaved(raw) {
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.tasks) || !parsed.tasks.length) return null;
      return normalize(parsed);
    } catch (e) {
      return null;
    }
  }

  function loadState() {
    var main = null;
    var bak = null;
    try { main = parseSaved(localStorage.getItem(STORAGE_KEY)); } catch (e) { main = null; }
    try { bak = parseSaved(localStorage.getItem(BACKUP_KEY)); } catch (e) { bak = null; }
    if (main && bak) {
      var a = (main.meta && main.meta.updatedAt) || 0;
      var b = (bak.meta && bak.meta.updatedAt) || 0;
      if (b > a) { recoveredFromBackup = true; return bak; }
      return main;
    }
    if (main) return main;
    if (bak) { recoveredFromBackup = true; return bak; }
    return null;
  }

  var state = loadState();
  var firstRun = !state;
  if (firstRun) {
    state = defaultState();
    try { window.Scheduler.plan(state); } catch (e) { /* ignore */ }
  }

  function saveState() {
    state.meta = state.meta || {};
    state.meta.updatedAt = Date.now();
    var raw;
    try { raw = JSON.stringify(state); } catch (e) { return; }
    try {
      localStorage.setItem(STORAGE_KEY, raw);
      try { localStorage.setItem(BACKUP_KEY, raw); } catch (e2) { /* 备份失败不影响主存储 */ }
    } catch (e) {
      try { localStorage.setItem(BACKUP_KEY, raw); } catch (e3) { /* ignore */ }
      toast('保存失败：本地存储空间不足');
    }
    scheduleSync();
  }

  if (firstRun) saveState();

  /* 双保险：离开页面 / 切到后台时立即落盘；申请持久化存储，避免被浏览器自动清理 */
  window.addEventListener('pagehide', function () { saveState(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') saveState();
  });
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  } catch (e) { /* ignore */ }

  if (recoveredFromBackup) {
    setTimeout(function () { toast('已从本地备份恢复数据'); }, 800);
  }

  /* ================= 云同步：私有 Gist（清缓存 / 换设备都能恢复） ================= */
  var SYNC_KEY = 'kaoyan-planner-sync';
  var sync = { token: '', gistId: '', lastSync: 0, lastError: '' };
  var syncTimer = null;
  var applyingRemote = false;
  try {
    var storedSync = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null');
    if (storedSync && storedSync.token) sync = Object.assign(sync, storedSync);
  } catch (e) { /* ignore */ }

  function saveSync() {
    try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch (e) { /* ignore */ }
  }

  function ghHeaders() {
    return {
      Authorization: 'Bearer ' + sync.token,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    };
  }

  function syncText() {
    if (!sync.token) return '未开启。开启后数据自动备份到你的私有 Gist，清缓存或换设备都能恢复。';
    if (sync.lastError) return '同步异常：' + sync.lastError;
    if (!sync.lastSync) return '已连接，等待首次同步…';
    return '上次同步：' + new Date(sync.lastSync).toLocaleString('zh-CN', { hour12: false });
  }

  function refreshSyncUI() {
    var el = document.querySelector('[data-sync-status]');
    if (el) el.textContent = syncText();
  }

  function syncPayload() {
    return JSON.stringify({ updatedAt: state.meta.updatedAt || Date.now(), state: state });
  }

  function mapSyncError(msg) {
    var m = String(msg || '');
    if (/Bad credentials|401|Requires authentication/i.test(m)) return 'Token 无效或已过期，请重新粘贴（注意不要带空格/换行）';
    if (/rate limit/i.test(m)) return '请求过于频繁，请稍后再试';
    if (/Not Found|404/i.test(m)) return '云端数据不存在或无权访问';
    return m || '同步失败';
  }

  function handlePushJson(j) {
    var ok = !!(j && j.id);
    if (ok) {
      sync.gistId = j.id;
      sync.lastSync = Date.now();
      sync.lastError = '';
      saveSync();
    } else {
      sync.lastError = mapSyncError(j && j.message);
    }
    refreshSyncUI();
    return ok;
  }

  function syncPush(then) {
    if (!sync.token) { if (then) then(false); return; }
    var payload = syncPayload();
    var done = function (ok) { if (then) then(ok); };
    var fail = function () {
      sync.lastError = '网络不可用';
      refreshSyncUI();
      done(false);
    };
    if (sync.gistId) {
      fetch('https://api.github.com/gists/' + sync.gistId, {
        method: 'PATCH',
        headers: ghHeaders(),
        body: JSON.stringify({ files: { 'kaoyan-planner.json': { content: payload } } })
      }).then(function (r) { return r.json(); }).then(function (j) { done(handlePushJson(j)); }).catch(fail);
    } else {
      fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: ghHeaders(),
        body: JSON.stringify({
          description: 'kaoyan-planner 数据同步（私有）',
          public: false,
          files: { 'kaoyan-planner.json': { content: payload } }
        })
      }).then(function (r) { return r.json(); }).then(function (j) { done(handlePushJson(j)); }).catch(fail);
    }
  }

  function scheduleSync() {
    if (!sync.token || applyingRemote) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncPush, 3000);
  }

  function applyRemote(text) {
    var obj;
    try { obj = JSON.parse(text); } catch (e) { return; }
    if (!obj || !obj.state || !Array.isArray(obj.state.tasks) || !obj.state.tasks.length) return;
    var localAt = (state.meta && state.meta.updatedAt) || 0;
    if (!firstRun && (obj.updatedAt || 0) <= localAt) return;
    applyingRemote = true;
    state = normalize(obj.state);
    try {
      var raw = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, raw);
      localStorage.setItem(BACKUP_KEY, raw);
    } catch (e) { /* ignore */ }
    applyingRemote = false;
    sync.lastSync = Date.now();
    sync.lastError = '';
    saveSync();
    try { render(); } catch (e) { /* ignore */ }
    refreshSyncUI();
    toast('已从云端恢复最新数据');
  }

  function syncPull(then) {
    if (!sync.token || !sync.gistId) { if (then) then(); return; }
    fetch('https://api.github.com/gists/' + sync.gistId, { headers: ghHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.files) {
          if (j && j.message === 'Not Found') { sync.gistId = ''; saveSync(); }
          sync.lastError = (j && j.message) || '读取失败';
          refreshSyncUI();
          if (then) then();
          return;
        }
        var f = j.files['kaoyan-planner.json'];
        if (f && f.content) { applyRemote(f.content); if (then) then(); return; }
        if (f && f.raw_url) {
          fetch(f.raw_url).then(function (r) { return r.text(); }).then(function (t) {
            applyRemote(t);
            if (then) then();
          }).catch(function () { if (then) then(); });
          return;
        }
        if (then) then();
      })
      .catch(function () {
        sync.lastError = '网络不可用';
        refreshSyncUI();
        if (then) then();
      });
  }

  function syncFindGist(cb) {
    if (sync.gistId) { cb(); return; }
    fetch('https://api.github.com/gists?per_page=100', { headers: ghHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (list) {
        if (!Array.isArray(list)) {
          sync.lastError = mapSyncError(list && list.message);
          refreshSyncUI();
          cb();
          return;
        }
        for (var i = 0; i < list.length; i++) {
          if (list[i].files && list[i].files['kaoyan-planner.json']) {
            sync.gistId = list[i].id;
            saveSync();
            break;
          }
        }
        cb();
      })
      .catch(function () {
        sync.lastError = '网络不可用';
        refreshSyncUI();
        cb();
      });
  }

  function syncConnect(token) {
    var t = String(token || '').replace(/[^\x21-\x7E]/g, '');
    if (!t) { toast('请先粘贴 GitHub Token'); return; }
    sync.token = t;
    sync.lastError = '';
    saveSync();
    refreshSyncUI();
    /* 先找回已有 Gist（清缓存后只填 Token 也能恢复），再上传 */
    syncFindGist(function () {
      syncPull(function () {
        syncPush(function (ok) {
          toast(ok ? '云同步已开启' : '云同步失败：' + sync.lastError);
        });
      });
    });
  }

  function syncNow() {
    if (!sync.token) { toast('请先填写 Token 并开启'); return; }
    syncFindGist(function () {
      syncPull(function () {
        syncPush(function (ok) { toast(ok ? '同步完成' : '同步失败：' + sync.lastError); });
      });
    });
  }

  function syncOff() {
    sync.token = '';
    sync.gistId = '';
    sync.lastSync = 0;
    sync.lastError = '';
    saveSync();
    refreshSyncUI();
    toast('已关闭云同步（云端 Gist 保留，可随时重新连接）');
  }

  /* 启动时若已连接：先拉云端，再决定是否需要推送 */
  if (sync.token && sync.gistId) {
    setTimeout(function () { syncPull(null); }, 600);
  }

  /* ================= UI 状态 ================= */
  var ui = {
    view: 'today',
    filter: { subject: 'all', status: 'all', q: '' },
    dragId: null,
    saveTimer: null,
    vocab: null   /* 背单词会话：{ queue, i, show, active, stats, reps } */
  };

  var TITLES = {
    today: '今日',
    vocab: '背单词',
    schedule: '排期',
    tasks: '任务库',
    review: '复盘',
    settings: '设置'
  };

  /* ================= 通用渲染 ================= */
  function toast(msg) {
    var wrap = $('#toasts');
    if (!wrap) return;
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { el.remove(); }, 240);
    }, 1900);
  }

  function tick() {
    var units = document.getElementById('cdUnits');
    if (!units) return;
    var target = parseISO(state.settings.examDate).getTime();
    var ms = target - Date.now();
    if (ms < 0) ms = 0;
    var d = Math.floor(ms / 86400000);
    var h = Math.floor((ms % 86400000) / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    var s = Math.floor((ms % 60000) / 1000);
    units.innerHTML =
      '<div class="cd-unit"><b>' + String(d).padStart(3, '0') + '</b><span>天</span></div>' +
      '<div class="cd-unit cd-unit--sm"><b>' + pad2(h) + '</b><span>时</span></div>' +
      '<div class="cd-unit cd-unit--sm"><b>' + pad2(m) + '</b><span>分</span></div>' +
      '<div class="cd-unit cd-unit--sm"><b>' + pad2(s) + '</b><span>秒</span></div>';
  }

  function updateChrome() {
    $$('.nav__item').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.view === ui.view);
    });
    $$('.tabbar button').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.view === ui.view);
    });

    var t = todayISO();
    var exam = state.settings.examDate;
    var left = Math.max(0, diffDays(t, exam));
    var todayList = state.tasks.filter(function (x) { return x.date === t; });
    var bad = todayList.filter(function (x) { return x.status !== 'green'; }).length +
      state.tasks.filter(function (x) { return x.date && x.date < t && x.status !== 'green'; }).length;

    var badge = $('#navBadgeToday');
    if (badge) {
      badge.hidden = bad === 0;
      badge.textContent = bad > 99 ? '99+' : String(bad);
    }
    var dotEl = $('#tabDot');
    if (dotEl) dotEl.hidden = bad === 0;

    var vBadge = $('#navBadgeVocab');
    if (vBadge) {
      var vLeft = vocabTodo();
      vBadge.hidden = vLeft === 0;
      vBadge.textContent = vLeft > 99 ? '99+' : String(vLeft);
    }

    var sideDays = $('#sideDays');
    if (sideDays) sideDays.textContent = left;
    var sideExam = $('#sideExam');
    if (sideExam) sideExam.textContent = '目标 ' + fmtCN(exam);

    var subText = {
      today: fmtFull(t) + ' · 今天必须完成的任务',
      vocab: '每个词过 7 轮：先看单词，点开再看中文',
      schedule: '11.11–12.11 固定日程，可拖动调整',
      tasks: '共 ' + state.tasks.length + ' 项任务',
      review: '完成率、错题与阶段验收',
      settings: '考试日期与学习节奏'
    };
    $('#pageTitle').textContent = TITLES[ui.view];
    $('#pageSub').textContent = subText[ui.view] || '';
  }

  function render() {
    var main = $('.main');
    var scrollTop = main ? main.scrollTop : 0;

    updateChrome();
    $$('.view').forEach(function (v) {
      v.classList.toggle('is-active', v.id === 'view-' + ui.view);
    });

    if (ui.view === 'today') $('#view-today').innerHTML = todayHTML();
    if (ui.view === 'vocab') $('#view-vocab').innerHTML = vocabHTML();
    if (ui.view === 'schedule') $('#view-schedule').innerHTML = scheduleHTML();
    if (ui.view === 'tasks') $('#view-tasks').innerHTML = tasksHTML();
    if (ui.view === 'review') $('#view-review').innerHTML = reviewHTML();
    if (ui.view === 'settings') $('#view-settings').innerHTML = settingsHTML();

    if (main) main.scrollTop = scrollTop;
    tick();
  }

  function switchView(view) {
    if (!TITLES[view]) return;
    ui.view = view;
    render();
    var main = $('.main');
    if (main) main.scrollTop = 0;
    if (window.innerWidth <= 900) window.scrollTo(0, 0);
  }

  /* ================= 任务行 ================= */
  function trafficHTML(t) {
    return '<div class="traffic">' + ['red', 'yellow', 'green'].map(function (s) {
      return '<button class="traffic__btn traffic__btn--' + s + (t.status === s ? ' is-on' : '') +
        '" data-action="status" data-id="' + t.id + '" data-status="' + s +
        '" title="' + STATUS[s] + '" aria-label="' + STATUS[s] + '"></button>';
    }).join('') + '</div>';
  }

  function taskRow(t, overdue) {
    var sub = subjectMeta(t.subject);
    return '<div class="task' + (t.status === 'green' ? ' is-done' : '') + '" data-id="' + t.id + '">' +
      trafficHTML(t) +
      '<div class="task__main">' +
        '<div class="task__title">' + esc(t.title) +
          (overdue ? '<span class="pill pill--danger">逾期 ' + fmtShort(t.date) + '</span>' : '') +
          (t.status === 'yellow' ? '<span class="pill pill--warn">进行中</span>' : '') +
        '</div>' +
        '<div class="task__meta">' +
          (slotOf(t.slot) ? '<span class="task__time">' + slotOf(t.slot).range + '</span>' : '') +
          '<span class="dot" style="--c:' + sub.color + '"></span><span>' + sub.name + '</span>' +
          (t.group ? '<span>·</span><span>' + esc(t.group) + '</span>' : '') +
          '<span>·</span><span>' + t.est + ' 分钟</span>' +
        '</div>' +
      '</div>' +
      '<div class="task__acts">' +
        (overdue ? '<button class="btn btn--sm btn--ghost" data-action="carry-one" data-id="' + t.id + '">顺延</button>' : '') +
        '<button class="icon-btn" data-action="edit-task" data-id="' + t.id + '" title="编辑">' + icon('edit') + '</button>' +
      '</div>' +
    '</div>';
  }

  /* ================= 今日 ================= */
  function todayHTML() {
    var t = todayISO();
    var cfg = state.settings;
    var exam = cfg.examDate;
    var left = Math.max(0, diffDays(t, exam));
    var span = Math.max(1, diffDays(cfg.startDate, exam));
    var passed = Math.min(100, Math.max(0, Math.round(diffDays(cfg.startDate, t) / span * 100)));

    var mine = state.tasks.filter(function (x) { return x.date === t; });
    var overdue = state.tasks
      .filter(function (x) { return x.date && x.date < t && x.status !== 'green'; })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });

    /* 今天补完的逾期任务也要计入“已完成”，否则补完反而从列表消失、完成数还是 0 */
    var overdueDoneToday = state.tasks.filter(function (x) {
      return x.date && x.date < t && x.status === 'green' && x.doneAt && isoOf(new Date(x.doneAt)) === t;
    });
    var done = mine.filter(function (x) { return x.status === 'green'; }).length + overdueDoneToday.length;
    var mid = mine.filter(function (x) { return x.status === 'yellow'; }).length;
    var total = mine.length + overdue.length + overdueDoneToday.length;
    var pct = total ? Math.round(done / total * 100) : 0;

    var html = '';

    /* 倒计时 */
    html += '<section class="countdown">' +
      '<div class="countdown__head">' +
        '<div class="countdown__label">' + icon('target') + '<span>距离初试 · ' + fmtCN(exam) + '</span></div>' +
        '<button class="btn btn--sm btn--ghost" data-action="nav" data-view="settings">改日期</button>' +
      '</div>' +
      '<div class="cd-units" id="cdUnits"></div>' +
      '<div class="countdown__bar"><div class="bar"><i style="width:' + passed + '%"></i></div></div>' +
      '<div class="countdown__foot">' +
        '<span>' + fmtFull(t) + ' · 冲刺进度已过 ' + passed + '%</span>' +
        '<span>剩余 ' + left + ' 天</span>' +
      '</div>' +
    '</section>';

    /* 数据条 */
    html += '<div class="stats" style="margin-top:16px">' +
      '<div class="stat"><b>' + total + '</b><span>今日必做</span></div>' +
      '<div class="stat"><b>' + done + '</b><span>已完成</span></div>' +
      '<div class="stat"><b>' + overdue.length + '</b><span>逾期未完成</span></div>' +
      '<div class="stat"><b>' + totalMinutes(mine) + '</b><span>今日计划分钟</span></div>' +
    '</div>';

    /* 主体 */
    html += '<div class="today-grid">';

    /* 左列 */
    html += '<div class="stack">';

    if (overdue.length) {
      html += '<div class="card" style="border-color:rgba(248,113,113,.3)">' +
        '<div class="card__head">' +
          '<div class="card__title">' + icon('alert') + '逾期未完成 <span class="pill pill--danger">' + overdue.length + '</span></div>' +
          '<button class="btn btn--sm btn--ghost" data-action="carry-all">全部顺延到今天</button>' +
        '</div>' +
        overdue.map(function (x) { return taskRow(x, true); }).join('') +
      '</div>';
    }

    html += '<div class="card">' +
      '<div class="card__head">' +
        '<div class="card__title">' + icon('clock') + '今日时刻表</div>' +
        '<button class="btn btn--sm btn--ghost" data-action="new-task" data-date="' + t + '">' + icon('plus') + '加一项</button>' +
      '</div>';

    if (!mine.length) {
      html += '<div class="empty">今天还没有安排任务<br>可以点「自动排期」，或手动新建一条任务</div>' +
        '<button class="btn btn--primary btn--block" data-action="auto-schedule" style="margin-top:6px">立即自动排期</button>';
    } else {
      SLOTS.forEach(function (slot) {
        var arr = mine.filter(function (x) { return x.slot === slot.key; });
        if (!arr.length) return;
        var gDone = arr.filter(function (x) { return x.status === 'green'; }).length;
        var label = slot.key === '2000' ? (t >= '2026-11-25' ? '写作' : '阅读加练') : slot.label;
        html += '<div class="group">' +
          '<div class="group__head">' +
            '<span class="group__time">' + slot.range + '</span><b>' + label + '</b>' +
            '<span>' + gDone + '/' + arr.length + '</span>' +
          '</div>' +
          arr.sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
            .map(function (x) { return taskRow(x, false); }).join('') +
        '</div>';
      });

      var others = mine.filter(function (x) { return !slotOf(x.slot); });
      if (others.length) {
        html += '<div class="group">' +
          '<div class="group__head"><span class="group__time">其他</span><b>临时安排</b>' +
            '<span>' + others.filter(function (x) { return x.status === 'green'; }).length + '/' + others.length + '</span>' +
          '</div>' +
          others.map(function (x) { return taskRow(x, false); }).join('') +
        '</div>';
      }
    }
    html += '</div>';

    html += '</div>'; /* 左列结束 */

    /* 右列 */
    html += '<div class="stack">' +
      '<div class="card">' +
        '<div class="card__head"><div class="card__title">' + icon('clock') + '今日完成度</div><span class="card__sub">' + done + ' / ' + mine.length + '</span></div>' +
        '<div class="ring-wrap">' +
          '<div class="ring" style="--p:' + pct + '"><div class="ring__in"><b>' + pct + '%</b><span>今日进度</span></div></div>' +
          '<div class="ring-side">' +
            '<div>已完成 <b>' + done + '</b> 项</div>' +
            '<div>进行中 <b>' + mid + '</b> 项</div>' +
            '<div>未开始 <b>' + (mine.length - done - mid) + '</b> 项</div>' +
            '<div class="dim">拼到全绿才算过关</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card__head"><div class="card__title">' + icon('check') + '日常打卡</div></div>' +
        '<div class="routine">' + routineHTML(t) + '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card__head"><div class="card__title">' + icon('edit') + '今日备注</div><span class="card__sub">自动保存</span></div>' +
        '<textarea class="note-area" id="todayNote" data-note-date="' + t + '" placeholder="今天的状态、卡点、明天要补什么…">' + esc(state.notes[t] || '') + '</textarea>' +
      '</div>' +
    '</div>';

    html += '</div>';
    return html;
  }

  function totalMinutes(list) {
    return list.reduce(function (s, x) { return s + (Number(x.est) || 0); }, 0);
  }

  function routineHTML(date) {
    var rec = state.routine[date] || {};
    return (state.routineItems || []).map(function (name, i) {
      return '<button class="routine__item' + (rec[i] ? ' is-done' : '') + '" data-action="routine" data-index="' + i + '">' +
        '<span class="routine__box">' + icon('check') + '</span><span>' + esc(name) + '</span></button>';
    }).join('');
  }

  /* ================= 排期 ================= */
  function chipHTML(t) {
    var sub = subjectMeta(t.subject);
    var sc = t.status === 'green' ? 'var(--ok)' : t.status === 'yellow' ? 'var(--warn)' : 'var(--danger)';
    return '<button class="chip' + (t.status === 'green' ? ' is-done' : '') + '" draggable="true" data-action="edit-task" data-id="' + t.id + '">' +
      '<span class="chip__d" style="background:' + sub.color + '"></span>' +
      '<span class="chip__t">' + esc(t.title) + '</span>' +
      '<span class="chip__d" style="background:' + sc + '"></span>' +
      '<span class="chip__m">' + (slotOf(t.slot) ? slotOf(t.slot).short + ' · ' : '') + t.est + '′</span>' +
    '</button>';
  }

  function sortTasks(arr) {
    return arr.slice().sort(function (a, b) {
      var oa = slotOrder(a);
      var ob = slotOrder(b);
      if (oa !== ob) return oa - ob;
      var d = (a.order || 0) - (b.order || 0);
      if (d) return d;
      var sa = SUBJECT_ORDER.indexOf(a.subject);
      var sb = SUBJECT_ORDER.indexOf(b.subject);
      return (sa < 0 ? 99 : sa) - (sb < 0 ? 99 : sb);
    });
  }

  function scheduleHTML() {
    var cfg = state.settings;
    var t = todayISO();
    var start = cfg.startDate > t ? cfg.startDate : t;
    var backlog = state.tasks.filter(function (x) { return !x.date; });

    var days = [];
    var cur = start;
    var last = state.tasks.reduce(function (m, x) {
      return x.date && x.date > m ? x.date : m;
    }, '');
    var end = last && last < cfg.examDate ? addDays(last, 1) : cfg.examDate;
    var guard = 0;
    while (cur < end && guard < 400) {
      days.push(cur);
      cur = addDays(cur, 1);
      guard += 1;
    }

    var scheduled = state.tasks.filter(function (x) { return !!x.date; }).length;
    var cap = Number(cfg.dailyMinutes) || 480;

    var html = '<div class="card schedule-toolbar">' +
      '<div><b>' + days.length + ' 天</b><span>已排期 ' + scheduled + ' 项 · 待排 ' + backlog.length + ' 项</span></div>' +
      '<div class="schedule-toolbar__acts">' +
        '<button class="btn btn--sm btn--primary" data-action="auto-schedule">' + icon('refresh') + '自动排期</button>' +
        '<button class="btn btn--sm btn--ghost btn--danger" data-action="clear-schedule">清空排期</button>' +
      '</div>' +
    '</div>';

    if (backlog.length) {
      html += '<div class="card backlog" style="margin-top:14px" data-drop="backlog">' +
        '<div class="card__head">' +
          '<div class="card__title">' + icon('drag') + '未排期任务 <span class="pill pill--accent">' + backlog.length + '</span></div>' +
          '<span class="card__sub">拖到下方某一天即可安排</span>' +
        '</div>' +
        '<div class="chip-list">' + backlog.slice(0, 60).map(chipHTML).join('') +
          (backlog.length > 60 ? '<div class="day__empty">还有 ' + (backlog.length - 60) + ' 项未显示，可先用自动排期</div>' : '') +
        '</div>' +
      '</div>';
    }

    html += '<div class="schedule-grid">';

    days.forEach(function (day) {
      var list = sortTasks(state.tasks.filter(function (x) { return x.date === day; }));
      var load = totalMinutes(list);
      var pct = Math.min(100, Math.round(load / cap * 100));
      var rest = cfg.restWeekday >= 0 && parseISO(day).getDay() === Number(cfg.restWeekday);
      var rel = diffDays(t, day);
      var leftText = rel === 0 ? '今天' : rel > 0 ? '还剩 ' + rel + ' 天' : '已过 ' + (-rel) + ' 天';
      var cls = 'day' + (day === t ? ' is-today' : '') + (rest ? ' is-rest' : '') + (day < t ? ' is-past' : '');

      html += '<article class="' + cls + '" data-date="' + day + '">' +
        '<div class="day__head">' +
          '<div class="day__date"><b>' + fmtCN(day) + '</b><span>' + WEEK[parseISO(day).getDay()] + '</span></div>' +
          '<span class="day__left' + (rel <= 3 && rel >= 0 ? ' is-near' : '') + '">' + (rest ? '休息日' : leftText) + '</span>' +
        '</div>' +
        '<div class="day__bar"><div class="bar' + (pct > 100 ? ' bar--warn' : '') + '"><i style="width:' + pct + '%"></i></div><em>' + load + '/' + cap + '′</em></div>' +
        '<div class="day__tasks" data-drop="' + day + '">' +
          (list.length ? list.map(chipHTML).join('') : '<div class="day__empty">拖任务到这里</div>') +
        '</div>' +
      '</article>';
    });

    html += '</div>';
    return html;
  }

  /* ================= 任务库 ================= */
  function tasksHTML() {
    var f = ui.filter;

    var list = state.tasks.filter(function (t) {
      if (f.subject !== 'all' && t.subject !== f.subject) return false;
      if (f.status !== 'all' && t.status !== f.status) return false;
      if (f.q) {
        var hay = (t.title + ' ' + (t.group || '') + ' ' + (t.detail || '')).toLowerCase();
        if (hay.indexOf(f.q.toLowerCase()) < 0) return false;
      }
      return true;
    });

    var html = '<div class="card filterbar">' +
      '<div class="filters">' +
        '<button class="filter-chip' + (f.subject === 'all' ? ' is-on' : '') + '" data-action="filter-subject" data-subject="all">全部</button>' +
        SUBJECTS.map(function (s) {
          return '<button class="filter-chip' + (f.subject === s.key ? ' is-on' : '') + '" data-action="filter-subject" data-subject="' + s.key + '">' + s.name + '</button>';
        }).join('') +
      '</div>' +
      '<div class="filterbar__right">' +
        '<div class="search">' + icon('search') + '<input id="taskSearch" placeholder="搜索任务" value="' + esc(f.q) + '"></div>' +
        '<select class="select-sm" id="statusFilter">' +
          '<option value="all"' + (f.status === 'all' ? ' selected' : '') + '>全部状态</option>' +
          '<option value="red"' + (f.status === 'red' ? ' selected' : '') + '>红 · 未完成</option>' +
          '<option value="yellow"' + (f.status === 'yellow' ? ' selected' : '') + '>黄 · 进行中</option>' +
          '<option value="green"' + (f.status === 'green' ? ' selected' : '') + '>绿 · 已完成</option>' +
        '</select>' +
        '<button class="btn btn--sm" data-action="import-open">' + icon('upload') + '导入</button>' +
      '</div>' +
    '</div>';

    html += '<div class="card" style="margin-top:14px;padding:8px 16px 14px">' +
      '<div class="card__head" style="margin:10px 0 4px"><div class="card__title">全部任务 <span class="pill">' + list.length + ' / ' + state.tasks.length + '</span></div>' +
      '<button class="btn btn--sm btn--ghost" data-action="new-task">' + icon('plus') + '新建</button></div>';

    if (!list.length) {
      html += '<div class="empty">没有符合条件的任务</div>';
    } else {
      SUBJECTS.forEach(function (sub) {
        var arr = list.filter(function (x) { return x.subject === sub.key; });
        if (!arr.length) return;
        var gDone = arr.filter(function (x) { return x.status === 'green'; }).length;
        html += '<div class="group">' +
          '<div class="group__head"><span class="dot" style="--c:' + sub.color + '"></span><b>' + sub.name + '</b><span>' + gDone + '/' + arr.length + '</span></div>';

        sortTasks(arr).forEach(function (t) {
          html += '<div class="row' + (t.status === 'green' ? ' is-done' : '') + '" data-id="' + t.id + '">' +
            trafficHTML(t) +
            '<div class="row__main"><b>' + esc(t.title) + '</b>' +
              '<span>' + (slotOf(t.slot) ? slotOf(t.slot).range + ' · ' : '') + (t.group ? esc(t.group) + ' · ' : '') + t.est + ' 分钟' +
              (t.priority === 1 ? ' · <span class="pill pill--accent">高优先</span>' : '') + '</span>' +
            '</div>' +
            '<div class="row__side">' +
              '<span class="pill' + (t.date ? '' : ' pill--accent') + '">' + (t.date ? fmtShort(t.date) : '未排期') + '</span>' +
              '<button class="icon-btn" data-action="edit-task" data-id="' + t.id + '" title="编辑">' + icon('edit') + '</button>' +
            '</div>' +
          '</div>';
        });
        html += '</div>';
      });
    }

    html += '</div>';
    return html;
  }

  /* ================= 复盘 ================= */
  function reviewHTML() {
    var total = state.tasks.length;
    var done = state.tasks.filter(function (t) { return t.status === 'green'; }).length;
    var rate = total ? Math.round(done / total * 100) : 0;
    var minutes = totalMinutes(state.tasks);

    var html = '<div class="stats">' +
      '<div class="stat"><b>' + total + '</b><span>任务总数</span></div>' +
      '<div class="stat"><b>' + done + '</b><span>已完成</span></div>' +
      '<div class="stat"><b>' + rate + '%</b><span>整体完成率</span></div>' +
      '<div class="stat"><b>' + Math.round(minutes / 60) + '</b><span>计划总工时</span></div>' +
    '</div>';

    html += '<div class="review-grid">';

    /* 左：学科完成率 */
    html += '<div class="card">' +
      '<div class="card__head"><div class="card__title">' + icon('chart') + '学科完成率</div></div>' +
      '<div class="subject-stat">';

    SUBJECTS.forEach(function (sub) {
      var arr = state.tasks.filter(function (x) { return x.subject === sub.key; });
      if (!arr.length) return;
      var d = arr.filter(function (x) { return x.status === 'green'; }).length;
      var p = Math.round(d / arr.length * 100);
      html += '<div class="subject-row">' +
        '<div class="subject-row__top"><span class="dot" style="--c:' + sub.color + '"></span><b>' + sub.name + '</b><span>' + d + '/' + arr.length + ' · ' + p + '%</span></div>' +
        '<div class="bar"><i style="width:' + p + '%;background:' + sub.color + '"></i></div>' +
      '</div>';
    });

    html += '</div></div>';

    /* 右：近14天 */
    html += '<div class="card">' +
      '<div class="card__head"><div class="card__title">' + icon('today') + '近 14 天完成情况</div></div>' +
      '<div class="activity">';

    var days = [];
    for (var i = 13; i >= 0; i--) days.push(addDays(todayISO(), -i));
    var counts = days.map(function (d) {
      return state.tasks.filter(function (x) { return x.date === d && x.status === 'green'; }).length;
    });
    var max = Math.max.apply(null, counts.concat([1]));

    days.forEach(function (d, idx) {
      var h = Math.round(counts[idx] / max * 100);
      html += '<div class="activity__col' + (counts[idx] > 0 ? ' is-done' : '') + '" title="' + fmtCN(d) + '：' + counts[idx] + ' 项">' +
        '<div class="activity__bar" style="height:' + Math.max(3, h) + '%"></div>' +
        '<em>' + parseISO(d).getDate() + '</em>' +
      '</div>';
    });

    html += '</div></div>';

    /* 错题 / 疑问 */
    html += '<div class="card">' +
      '<div class="card__head"><div class="card__title">' + icon('alert') + '错题 / 疑问记录 <span class="pill">' + state.doubts.filter(function (d) { return !d.done; }).length + ' 待解决</span></div></div>' +
      '<div class="doubt-form">' +
        '<select class="select-sm" id="doubtSubject">' + SUBJECTS.map(function (s) {
          return '<option value="' + s.key + '">' + s.name + '</option>';
        }).join('') + '</select>' +
        '<input id="doubtText" placeholder="记录一个错题或疑问…">' +
        '<button class="btn btn--sm btn--primary" data-action="add-doubt">添加</button>' +
      '</div>';

    if (!state.doubts.length) {
      html += '<div class="empty">还没有记录，遇到卡点随手记一条</div>';
    } else {
      html += '<ul class="doubts">' + state.doubts.slice().reverse().map(function (d) {
        var sub = subjectMeta(d.subject);
        return '<li class="' + (d.done ? 'is-done' : '') + '">' +
          '<button class="check-btn' + (d.done ? ' is-on' : '') + '" data-action="toggle-doubt" data-id="' + d.id + '" aria-label="标记解决">' + icon('check') + '</button>' +
          '<div><b>' + esc(d.text) + '</b><span>' + sub.name + ' · ' + (d.date || '') + '</span></div>' +
          '<button class="icon-btn" data-action="del-doubt" data-id="' + d.id + '" title="删除">' + icon('trash') + '</button>' +
        '</li>';
      }).join('') + '</ul>';
    }
    html += '</div>';

    /* 阶段验收 */
    html += '<div class="card">' +
      '<div class="card__head"><div class="card__title">' + icon('target') + '阶段节点自查</div>' +
        '<span class="card__sub">' + state.checkpoints.filter(function (c) { return c.done; }).length + '/' + state.checkpoints.length + '</span></div>' +
      '<div class="checkpoints">' + state.checkpoints.map(function (c) {
        return '<div class="checkpoint' + (c.done ? ' is-done' : '') + '">' +
          '<button class="check-btn' + (c.done ? ' is-on' : '') + '" data-action="toggle-checkpoint" data-id="' + c.id + '" aria-label="标记完成">' + icon('check') + '</button>' +
          '<div><b>' + esc(c.title) + '</b><span>' + fmtCN(c.date) + '</span></div>' +
        '</div>';
      }).join('') + '</div>' +
    '</div>';

    html += '</div>';
    return html;
  }

  /* ================= 设置 ================= */
  function settingsHTML() {
    var s = state.settings;
    var restOptions = '<option value="-1"' + (Number(s.restWeekday) === -1 ? ' selected' : '') + '>不设休息日</option>' +
      WEEK.map(function (w, i) {
        return '<option value="' + i + '"' + (Number(s.restWeekday) === i ? ' selected' : '') + '>' + w + '</option>';
      }).join('');

    return '<div class="settings-grid">' +
      '<div class="card">' +
        '<div class="card__head"><div class="card__title">' + icon('target') + '考试与节奏</div></div>' +
        '<div class="form-grid">' +
          '<label class="field"><span>考试日期</span><input type="date" data-setting="examDate" value="' + s.examDate + '"></label>' +
          '<label class="field"><span>排期起始日</span><input type="date" data-setting="startDate" value="' + s.startDate + '"></label>' +
          '<label class="field"><span>每日可用时长（分钟）</span><input type="number" min="60" step="30" data-setting="dailyMinutes" value="' + s.dailyMinutes + '"></label>' +
          '<label class="field"><span>每周休息日</span><select data-setting="restWeekday">' + restOptions + '</select></label>' +
        '</div>' +
        '<p class="hint">修改后点顶部「自动排期」按新节奏重新分配。已完成（绿）与手动调整过的任务会被保留，其余会重新排。</p>' +
        '<p class="hint">当前任务总量约 ' + Math.round(totalMinutes(state.tasks) / 60) + ' 小时，按 ' +
          Math.max(1, diffDays(todayISO(), s.examDate)) + ' 天计算，日均约 ' +
          Math.round(totalMinutes(state.tasks) / Math.max(1, diffDays(todayISO(), s.examDate))) + ' 分钟。</p>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card__head"><div class="card__title">' + icon('refresh') + '云同步（私有 Gist）</div></div>' +
        '<p class="hint" data-sync-status>' + esc(syncText()) + '</p>' +
        '<div class="form-grid">' +
          '<label class="field"><span>GitHub Token（仅勾选 gist 权限）</span>' +
            '<input type="password" data-sync-token autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="ghp_… 或 github_pat_…" value=""></label>' +
        '</div>' +
        '<div class="settings-acts">' +
          '<div class="setting-line"><div><b>开启 / 更换 Token</b><span>粘贴后自动创建私有 Gist 并上传当前进度</span></div>' +
            '<button class="btn btn--sm" data-action="sync-connect">开启</button></div>' +
          '<div class="setting-line"><div><b>立即同步</b><span>先拉云端最新，再把本机进度传上去</span></div>' +
            '<button class="btn btn--sm" data-action="sync-now">' + icon('refresh') + '同步</button></div>' +
          '<div class="setting-line"><div><b>关闭云同步</b><span>只断开本机，云端 Gist 数据保留</span></div>' +
            '<button class="btn btn--sm btn--danger" data-action="sync-off">关闭</button></div>' +
        '</div>' +
        '<p class="hint">Token 只保存在本机浏览器，用来读写你账号下的私有 Gist（别人看不到）。清缓存、换 iPad/手机后重新填同一个 Token 即可恢复全部进度。</p>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card__head"><div class="card__title">' + icon('upload') + '数据管理</div></div>' +
        '<div class="settings-acts">' +
          '<div class="setting-line"><div><b>导出备份</b><span>下载完整 JSON，换设备可再导入</span></div>' +
            '<button class="btn btn--sm" data-action="export">' + icon('download') + '导出</button></div>' +
          '<div class="setting-line"><div><b>导入备份</b><span>用 JSON 覆盖当前全部数据</span></div>' +
            '<button class="btn btn--sm" data-action="import-file">' + icon('upload') + '选择文件</button></div>' +
          '<div class="setting-line"><div><b>恢复初始任务</b><span>按清单重建任务，清空完成记录</span></div>' +
            '<button class="btn btn--sm" data-action="reset-seed">恢复</button></div>' +
          '<div class="setting-line"><div><b>重置单词进度</b><span>清空 7 轮记录，从第一天重新背</span></div>' +
            '<button class="btn btn--sm btn--danger" data-action="vocab-reset">重置</button></div>' +
          '<div class="setting-line"><div><b>清空全部数据</b><span>任务、备注、记录全部删除</span></div>' +
            '<button class="btn btn--sm btn--danger" data-action="clear-all">清空</button></div>' +
        '</div>' +
        '<input type="file" id="importFile" accept="application/json,.json" hidden>' +
        '<p class="hint">数据同时保存在本机浏览器与（开启后的）云端私有 Gist。清理浏览器数据前建议先确认「上次同步」时间较新。</p>' +
      '</div>' +
    '</div>';
  }

  /* ================= 背单词 · 七轮记忆 ================= */
  var VOCAB_ROUNDS = 7;
  var VOCAB_GAPS = [1, 2, 3, 5, 7, 10, 0]; /* 通过第 n 轮后隔几天再抽到 */
  var WORDS = window.WORDS || [];
  var WORD_MAP = {};
  var WORD_ORDER = {};
  WORDS.forEach(function (x, i) {
    var k = String(x.w || '').toLowerCase();
    if (!k) return;
    WORD_MAP[k] = x;
    WORD_ORDER[k] = i;
  });

  function vocabOf() {
    if (!state.vocab || typeof state.vocab !== 'object') {
      state.vocab = { cursor: 0, newPerDay: 30, progress: {} };
    }
    var v = state.vocab;
    if (typeof v.cursor !== 'number' || !isFinite(v.cursor)) v.cursor = 0;
    if (!v.newPerDay) v.newPerDay = 30;
    if (!v.progress || typeof v.progress !== 'object') v.progress = {};
    return v;
  }

  /* 今日牌组：到期复习词 + 当天配额内的新词 */
  function vocabDeck() {
    var v = vocabOf(), t = todayISO();
    var due = [], fresh = [], newToday = 0;
    Object.keys(v.progress).forEach(function (k) {
      var p = v.progress[k] || {};
      if (p.first === t) newToday += 1;
      if ((p.r || 0) >= VOCAB_ROUNDS) return;
      if (!p.due || p.due <= t) due.push(k);
    });
    due.sort(function (a, b) {
      var da = (v.progress[a] || {}).due || '';
      var db = (v.progress[b] || {}).due || '';
      return da.localeCompare(db);
    });
    var quota = Math.max(0, v.newPerDay - newToday);
    for (var i = v.cursor; i < WORDS.length && fresh.length < quota; i++) {
      var k = String(WORDS[i].w || '').toLowerCase();
      if (!k || v.progress[k]) continue;
      fresh.push(k);
    }
    return { due: due, fresh: fresh, newToday: newToday, quota: v.newPerDay, total: due.length + fresh.length };
  }

  function vocabTodo() {
    if (!WORDS.length) return 0;
    return vocabDeck().total;
  }

  function vocabStats() {
    var v = vocabOf();
    var total = WORDS.length, done = 0, learning = 0;
    var byRound = [0, 0, 0, 0, 0, 0, 0, 0];
    Object.keys(v.progress).forEach(function (k) {
      var r = Math.min(VOCAB_ROUNDS, Math.max(0, (v.progress[k] || {}).r || 0));
      byRound[r] += 1;
      if (r >= VOCAB_ROUNDS) done += 1;
      else learning += 1;
    });
    return { total: total, done: done, learning: learning, byRound: byRound, pct: total ? Math.round(done / total * 100) : 0 };
  }

  /* 七轮漏斗：第 i 行 = 至少过完 i 轮的词数 */
  function vocabRoundBars(st) {
    var html = '';
    for (var i = 1; i <= VOCAB_ROUNDS; i++) {
      var n = 0;
      for (var r = i; r <= VOCAB_ROUNDS; r++) n += st.byRound[r];
      var pct = st.total ? Math.min(100, Math.round(n / st.total * 100)) : 0;
      html += '<div class="vround">' +
        '<span class="vround__k">第 ' + i + ' 轮</span>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<span class="vround__n">' + n + '</span>' +
      '</div>';
    }
    return html;
  }

  function vocabCardHTML(d) {
    var s = ui.vocab;
    if (s && s.active) {
      var key = s.queue[s.i];
      var word = WORD_MAP[key] || { w: key, m: [] };
      var p = vocabOf().progress[key] || {};
      var round = Math.min(VOCAB_ROUNDS, (p.r || 0) + 1);
      var pct = s.queue.length ? Math.round(s.i / s.queue.length * 100) : 0;
      var html = '<div class="vocab__bar"><div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<span>' + (s.i + 1) + ' / ' + s.queue.length + '</span></div>' +
        '<div class="vocab__tags">' +
          '<span class="pill pill--accent">第 ' + round + ' / ' + VOCAB_ROUNDS + ' 轮</span>' +
          (p.r ? '' : '<span class="pill">新词</span>') +
          '<span class="vocab__score">认识 ' + s.stats.know + ' · 模糊 ' + s.stats.fuzzy + ' · 不认识 ' + s.stats.no + '</span>' +
        '</div>' +
        '<div class="vocab__word">' + esc(word.w) + '</div>';
      if (!s.show) {
        html += '<button class="vocab__flip" data-action="vocab-flip">点击显示中文</button>';
      } else {
        html += '<div class="vocab__mean">' + (word.m.length
          ? word.m.map(function (m) { return '<div>' + esc(m) + '</div>'; }).join('')
          : '<div class="dim">这个词在词库里没有释义</div>') + '</div>' +
          '<div class="vocab__grades">' +
            '<button class="grade grade--no" data-action="vocab-grade" data-grade="no"><b>不认识</b><em>今天再抽一次</em></button>' +
            '<button class="grade grade--fuzzy" data-action="vocab-grade" data-grade="fuzzy"><b>模糊</b><em>本轮不算过</em></button>' +
            '<button class="grade grade--know" data-action="vocab-grade" data-grade="know"><b>认识</b><em>' + (round + 1 > VOCAB_ROUNDS ? '进入掌握' : '进第 ' + (round + 1) + ' 轮') + '</em></button>' +
          '</div>';
      }
      return html;
    }

    if (s && s.finished) {
      return '<div class="vocab__idle">' +
        '<b>这轮背完了</b>' +
        '<span>认识 ' + s.stats.know + ' · 模糊 ' + s.stats.fuzzy + ' · 不认识 ' + s.stats.no + '</span>' +
        (d.total
          ? '<button class="btn btn--primary btn--block" data-action="vocab-start">再背 ' + d.total + ' 个</button>'
          : '<span class="dim">今天的量完成了，明天按节奏继续</span>') +
      '</div>';
    }

    return '<div class="vocab__idle">' +
      '<b>' + (d.total ? '今天要背 ' + d.total + ' 个' : '今天没有到期的单词') + '</b>' +
      '<span>复习 ' + d.due.length + ' · 新词 ' + d.fresh.length + '（今日已学 ' + d.newToday + ' / ' + vocabOf().newPerDay + '）</span>' +
      (d.total
        ? '<button class="btn btn--primary btn--block" data-action="vocab-start">开始背单词</button>'
        : '<span class="dim">明天会按记忆节奏把该复习的词再抽给你</span>') +
    '</div>';
  }

  function vocabHTML() {
    if (!WORDS.length) {
      return '<div class="card"><div class="empty">词库还没加载出来，刷新一下页面再试</div></div>';
    }
    var st = vocabStats();
    var d = vocabDeck();
    var perDay = Number(vocabOf().newPerDay);
    var opts = [10, 20, 30, 40, 60].map(function (n) {
      return '<option value="' + n + '"' + (perDay === n ? ' selected' : '') + '>' + n + ' 词/天</option>';
    }).join('');

    return '<div class="stats">' +
        '<div class="stat"><b>' + st.total + '</b><span>词库总量</span></div>' +
        '<div class="stat"><b>' + st.done + '</b><span>已过 7 轮</span></div>' +
        '<div class="stat"><b>' + st.learning + '</b><span>在学单词</span></div>' +
        '<div class="stat"><b>' + d.total + '</b><span>今日待背</span></div>' +
      '</div>' +
      '<div class="vocab-grid">' +
        '<div class="card vocab-panel">' + vocabCardHTML(d) + '</div>' +
        '<div class="stack">' +
          '<div class="card">' +
            '<div class="card__head"><div class="card__title">' + icon('chart') + '七轮漏斗</div>' +
              '<span class="card__sub">掌握 ' + st.pct + '%</span></div>' +
            '<div class="vrounds">' + vocabRoundBars(st) + '</div>' +
            '<p class="hint">记忆节奏：认识 → 1 天 → 2 天 → 3 天 → 5 天 → 7 天 → 10 天。每认对一次进一轮，隔得越久还认得出，才算真的记住；模糊 / 不认识会回到今天重抽。</p>' +
          '</div>' +
          '<div class="card">' +
            '<div class="card__head"><div class="card__title">' + icon('settings') + '今日节奏</div></div>' +
            '<div class="setting-line"><div><b>每天新词</b><span>今天已学 ' + d.newToday + ' 个</span></div>' +
              '<select class="select-sm" data-vocab-new>' + opts + '</select></div>' +
            '<div class="setting-line"><div><b>到期复习</b><span>' + d.due.length + ' 个词到期待复习</span></div>' +
              '<button class="btn btn--sm" data-action="vocab-start">' + icon('refresh') + '开始</button></div>' +
            '<p class="hint">进度会自动保存在本机，并随云同步备份；换设备或清缓存后重新打开也在。</p>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function vocabStart() {
    var d = vocabDeck();
    var q = d.due.concat(d.fresh);
    if (!q.length) { toast('今天没有需要背的单词'); return; }
    ui.vocab = { queue: q, i: 0, show: false, active: true, finished: false, stats: { know: 0, fuzzy: 0, no: 0 }, reps: {} };
    render();
  }

  function vocabFlip() {
    if (!ui.vocab || !ui.vocab.active) return;
    ui.vocab.show = true;
    render();
  }

  function vocabGrade(grade) {
    var s = ui.vocab;
    if (!s || !s.active) return;
    var key = s.queue[s.i];
    if (!key) return;
    var v = vocabOf();
    var t = todayISO();
    var p = v.progress[key];
    if (!p) {
      p = v.progress[key] = { r: 0, first: t, due: t, seen: 0 };
      v.cursor = Math.max(v.cursor, (WORD_ORDER[key] || 0) + 1);
    }
    p.seen = (p.seen || 0) + 1;
    p.last = t;

    if (grade === 'know') {
      p.r = Math.min(VOCAB_ROUNDS, (p.r || 0) + 1);
      p.due = p.r >= VOCAB_ROUNDS ? '' : addDays(t, VOCAB_GAPS[p.r - 1] || 1);
      s.stats.know += 1;
    } else if (grade === 'fuzzy') {
      p.due = t;
      s.stats.fuzzy += 1;
    } else {
      p.r = Math.max(0, (p.r || 0) - 1);
      p.due = t;
      s.stats.no += 1;
    }

    /* 没认对的词本轮再抽一次（最多回炉 2 次，避免原地打转） */
    if (grade !== 'know') {
      s.reps[key] = (s.reps[key] || 0) + 1;
      if (s.reps[key] <= 2) s.queue.push(key);
    }

    s.i += 1;
    s.show = false;
    if (s.i >= s.queue.length) {
      s.active = false;
      s.finished = true;
      saveState();
      render();
      toast('这轮背完：认识 ' + s.stats.know + ' 个');
      return;
    }
    saveState();
    render();
  }

  function vocabReset() {
    state.vocab = { cursor: 0, newPerDay: 30, progress: {} };
    ui.vocab = null;
    saveState();
    render();
    toast('单词进度已重置');
  }

  /* ================= 弹窗 ================= */
  var modalEl = $('#modal');

  function openModal(opts) {
    $('#modalTitle').textContent = opts.title || '';
    $('#modalBody').innerHTML = opts.body || '';
    $('#modalFoot').innerHTML = opts.foot || '';
    modalEl.hidden = false;
    if (opts.onMount) opts.onMount();
  }

  function closeModal() {
    modalEl.hidden = true;
    $('#modalBody').innerHTML = '';
    $('#modalFoot').innerHTML = '';
  }

  function confirmAction(title, text, onYes) {
    openModal({
      title: title,
      body: '<p class="confirm-text">' + text + '</p>',
      foot: '<div class="spacer"></div>' +
        '<button class="btn btn--ghost" data-action="close-modal">取消</button>' +
        '<button class="btn btn--primary" id="confirmYes">确认</button>',
      onMount: function () {
        $('#confirmYes').addEventListener('click', function () {
          closeModal();
          onYes();
        });
      }
    });
  }

  function openTaskModal(id, presetDate) {
    var t = id ? state.tasks.find(function (x) { return x.id === id; }) : null;
    var v = t || {
      title: '',
      subject: 'english',
      group: '',
      date: presetDate || todayISO(),
      slot: '',
      est: 60,
      priority: 2,
      status: 'red',
      detail: ''
    };

    var subjectOptions = SUBJECTS.map(function (s) {
      return '<option value="' + s.key + '"' + (v.subject === s.key ? ' selected' : '') + '>' + s.name + '</option>';
    }).join('');

    var body = '<form id="taskForm" class="form">' +
      '<label class="field field--full"><span>任务标题</span>' +
        '<input name="title" required maxlength="80" value="' + esc(v.title) + '" placeholder="例如：2021 阅读 Text1–4 · 第一轮"></label>' +
      '<div class="form-grid">' +
        '<label class="field"><span>学科</span><select name="subject">' + subjectOptions + '</select></label>' +
        '<label class="field"><span>时段</span><select name="slot">' +
          '<option value=""' + (!v.slot ? ' selected' : '') + '>不指定</option>' +
          SLOTS.map(function (s) {
            return '<option value="' + s.key + '"' + (v.slot === s.key ? ' selected' : '') + '>' + s.range + ' ' + s.label + '</option>';
          }).join('') +
        '</select></label>' +
        '<label class="field"><span>分组</span><input name="group" value="' + esc(v.group || '') + '" placeholder="可留空"></label>' +
        '<label class="field"><span>计划日期</span><input type="date" name="date" value="' + (v.date || '') + '"></label>' +
        '<label class="field"><span>预估时长（分钟）</span><input type="number" name="est" min="5" step="5" value="' + (v.est || 60) + '"></label>' +
        '<label class="field"><span>优先级</span><select name="priority">' +
          '<option value="1"' + (Number(v.priority) === 1 ? ' selected' : '') + '>高</option>' +
          '<option value="2"' + (Number(v.priority) === 2 ? ' selected' : '') + '>中</option>' +
          '<option value="3"' + (Number(v.priority) === 3 ? ' selected' : '') + '>低</option>' +
        '</select></label>' +
        '<label class="field"><span>进展</span><select name="status">' +
          '<option value="red"' + (v.status === 'red' ? ' selected' : '') + '>红 · 未完成</option>' +
          '<option value="yellow"' + (v.status === 'yellow' ? ' selected' : '') + '>黄 · 进行中</option>' +
          '<option value="green"' + (v.status === 'green' ? ' selected' : '') + '>绿 · 已完成</option>' +
        '</select></label>' +
      '</div>' +
      '<label class="field field--full"><span>说明 / 复盘要点</span>' +
        '<textarea name="detail" rows="3" placeholder="例如：生词、长难句、错因">' + esc(v.detail || '') + '</textarea></label>' +
    '</form>';

    var foot = (t ? '<button class="btn btn--danger" data-action="modal-delete" data-id="' + t.id + '">删除</button>' : '') +
      '<div class="spacer"></div>' +
      '<button class="btn btn--ghost" data-action="close-modal">取消</button>' +
      '<button class="btn btn--primary" type="submit" form="taskForm">保存</button>';

    openModal({
      title: t ? '编辑任务' : '新建任务',
      body: body,
      foot: foot,
      onMount: function () {
        var form = $('#taskForm');
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          var fd = new FormData(form);
          var date = String(fd.get('date') || '');
          var data = {
            title: String(fd.get('title') || '').trim(),
            subject: String(fd.get('subject') || 'other'),
            group: String(fd.get('group') || '').trim(),
            date: date || null,
            slot: String(fd.get('slot') || ''),
            est: Math.max(5, parseInt(fd.get('est'), 10) || 60),
            priority: parseInt(fd.get('priority'), 10) || 2,
            status: String(fd.get('status') || 'red'),
            detail: String(fd.get('detail') || '').trim()
          };
          if (!data.title) return;
          if (t) {
            Object.assign(t, data);
            t.manual = !!data.date;
          } else {
            var maxOrder = state.tasks.reduce(function (m, x) { return Math.max(m, x.order || 0); }, 0);
            state.tasks.push(Object.assign({
              id: 't-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 900 + 100),
              order: maxOrder + 1,
              note: ''
            }, data, { manual: !!data.date }));
          }
          saveState();
          closeModal();
          render();
          toast(t ? '已保存' : '已新建任务');
        });
        var input = form.querySelector('input[name="title"]');
        if (input) input.focus();
      }
    });
  }

  function openImportModal() {
    var body = '<div class="form">' +
      '<p class="hint" style="margin:0 0 4px">每行一条任务，用竖线或逗号分隔：<code>学科 | 标题 | 时长(分钟) | 优先级</code><br>' +
      '例如：<code>英语 | 单词大观 第7轮 | 90 | 1</code>　学科可写 英语 / 数学 / 408 / 政治 / 打卡。' +
      '只写标题也行，会归到下方所选学科。</p>' +
      '<label class="field field--full"><span>默认学科（行内没写学科时使用）</span>' +
        '<select id="importSubject">' + SUBJECTS.map(function (s) {
          return '<option value="' + s.key + '">' + s.name + '</option>';
        }).join('') + '</select></label>' +
      '<textarea class="import-area" id="importText" placeholder="英语 | 单词大观 第7轮 | 90 | 1&#10;数学 | 套卷 2005 第一遍 | 180"></textarea>' +
    '</div>';
    var foot = '<div class="spacer"></div>' +
      '<button class="btn btn--ghost" data-action="close-modal">取消</button>' +
      '<button class="btn btn--primary" id="importDo">导入任务</button>';

    openModal({
      title: '批量导入任务',
      body: body,
      foot: foot,
      onMount: function () {
        $('#importDo').addEventListener('click', function () {
          var text = $('#importText').value;
          var def = $('#importSubject').value;
          var items = parseImport(text, def);
          if (!items.length) { toast('没有识别到有效任务'); return; }
          var maxOrder = state.tasks.reduce(function (m, x) { return Math.max(m, x.order || 0); }, 0);
          items.forEach(function (item, i) {
            state.tasks.push({
              id: 't-' + Date.now().toString(36) + '-' + i + '-' + Math.floor(Math.random() * 900 + 100),
              order: maxOrder + i + 1,
              subject: item.subject,
              group: item.group,
              title: item.title,
              detail: '',
              est: item.est,
              priority: item.priority,
              date: item.date,
              status: 'red',
              manual: !!item.date,
              note: ''
            });
          });
          saveState();
          closeModal();
          render();
          toast('已导入 ' + items.length + ' 个任务');
        });
      }
    });
  }

  function parseImport(text, defaultSubject) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line || line.charAt(0) === '#') return;
      var parts = line.split(/\s*[|,\t]\s*/).filter(function (x) { return x !== ''; });
      if (!parts.length) return;

      var subject = defaultSubject || 'other';
      var matched = matchSubject(parts[0]);
      if (matched && parts.length > 1) {
        subject = matched;
        parts.shift();
      }

      var title = parts[0];
      if (!title) return;

      var est = 60;
      var priority = 2;
      if (parts[1] && /\d/.test(parts[1])) {
        var n = parseInt(parts[1].replace(/[^\d]/g, ''), 10);
        if (n > 0) est = n;
      }
      if (parts[2]) {
        if (/高|1/.test(parts[2])) priority = 1;
        else if (/低|3/.test(parts[2])) priority = 3;
      }

      out.push({ subject: subject, group: '', title: title, est: est, priority: priority, date: null });
    });
    return out;
  }

  function matchSubject(word) {
    var w = String(word || '').trim().toLowerCase();
    if (!w) return null;
    if (/英语|english|en/.test(w)) return 'english';
    if (/数学|math/.test(w)) return 'math';
    if (/408|计算机|cs/.test(w)) return 'cs';
    if (/政治|politics|pol/.test(w)) return 'politics';
    if (/打卡|习惯|habit/.test(w)) return 'habit';
    if (/其他|other/.test(w)) return 'other';
    return null;
  }

  /* ================= 行为 ================= */
  function setStatus(id, status) {
    var t = state.tasks.find(function (x) { return x.id === id; });
    if (!t || !STATUS[status]) return;
    t.status = status;
    t.doneAt = status === 'green' ? new Date().toISOString() : '';
    saveState();
    render();
  }

  function carryOver(id) {
    var t = state.tasks.find(function (x) { return x.id === id; });
    if (!t) return;
    t.date = todayISO();
    t.manual = true;
    saveState();
    render();
    toast('已顺延到今天');
  }

  function carryAll() {
    var t = todayISO();
    var n = 0;
    state.tasks.forEach(function (x) {
      if (x.date && x.date < t && x.status !== 'green') {
        x.date = t;
        x.manual = true;
        n += 1;
      }
    });
    if (!n) return;
    saveState();
    render();
    toast('已顺延 ' + n + ' 项任务');
  }

  function autoSchedule() {
    var res = window.Scheduler.plan(state);
    if (res.error === 'noDays') {
      toast('考试日期已过，请先在设置里调整');
      return;
    }
    saveState();
    render();
    if (!res.assigned) {
      toast('所有任务都已排期');
      return;
    }
    toast('已排期 ' + res.assigned + ' 项 · 日均约 ' + res.perDay + ' 分钟');
    if (res.exceeds) {
      setTimeout(function () {
        toast('任务量超出每日时长，日均需 ' + res.perDay + ' 分钟');
      }, 700);
    }
  }

  function exportJSON() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '冲刺计划备份-' + todayISO() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('备份已导出');
  }

  function addDoubt() {
    var input = $('#doubtText');
    var sel = $('#doubtSubject');
    if (!input) return;
    var text = input.value.trim();
    if (!text) { input.focus(); return; }
    state.doubts.push({
      id: 'd-' + Date.now().toString(36),
      subject: sel ? sel.value : 'other',
      text: text,
      date: todayISO(),
      done: false
    });
    saveState();
    render();
    toast('已记录');
  }

  /* ================= 事件绑定 ================= */
  function bind() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-action]');
      if (!el) return;
      var action = el.dataset.action;
      var id = el.dataset.id;

      switch (action) {
        case 'nav':
          switchView(el.dataset.view);
          break;
        case 'new-task':
          openTaskModal(null, el.dataset.date || todayISO());
          break;
        case 'edit-task':
          if (ui.dragId) return;
          openTaskModal(id);
          break;
        case 'status':
          setStatus(id, el.dataset.status);
          break;
        case 'carry-one':
          carryOver(id);
          break;
        case 'carry-all':
          carryAll();
          break;
        case 'auto-schedule':
          autoSchedule();
          break;
        case 'clear-schedule':
          confirmAction('清空排期', '所有任务的日期会被清空并回到未排期状态，完成状态不受影响。', function () {
            window.Scheduler.clearSchedule(state);
            saveState();
            render();
            toast('已清空排期');
          });
          break;
        case 'routine': {
          var t = todayISO();
          var idx = Number(el.dataset.index);
          state.routine[t] = state.routine[t] || {};
          state.routine[t][idx] = !state.routine[t][idx];
          saveState();
          render();
          break;
        }
        case 'add-doubt':
          addDoubt();
          break;
        case 'toggle-doubt': {
          var d = state.doubts.find(function (x) { return x.id === id; });
          if (d) { d.done = !d.done; saveState(); render(); }
          break;
        }
        case 'del-doubt':
          state.doubts = state.doubts.filter(function (x) { return x.id !== id; });
          saveState();
          render();
          break;
        case 'toggle-checkpoint': {
          var c = state.checkpoints.find(function (x) { return x.id === id; });
          if (c) { c.done = !c.done; saveState(); render(); }
          break;
        }
        case 'filter-subject':
          ui.filter.subject = el.dataset.subject;
          render();
          break;
        case 'import-open':
          openImportModal();
          break;
        case 'export':
          exportJSON();
          break;
        case 'sync-connect': {
          var tokenInput = document.querySelector('[data-sync-token]');
          syncConnect(tokenInput ? tokenInput.value : '');
          if (tokenInput) tokenInput.value = '';
          break;
        }
        case 'sync-now':
          syncNow();
          break;
        case 'sync-off':
          syncOff();
          break;
        case 'import-file': {
          var fileInput = $('#importFile');
          if (fileInput) fileInput.click();
          break;
        }
        case 'reset-seed':
          confirmAction('恢复初始任务', '将按清单重建全部 ' + window.SEED.buildTasks().length +
            ' 个任务，当前的完成状态与日期会被清空（备注和错题记录保留）。', function () {
            state.tasks = window.SEED.buildTasks();
            window.Scheduler.plan(state);
            saveState();
            render();
            toast('已恢复初始任务并重新排期');
          });
          break;
        case 'clear-all':
          confirmAction('清空全部数据', '任务、进度、备注、错题记录会全部删除且无法恢复，建议先导出备份。确定继续？', function () {
            try {
              localStorage.removeItem(STORAGE_KEY);
              localStorage.removeItem(BACKUP_KEY);
            } catch (err) { /* ignore */ }
            state = defaultState();
            window.Scheduler.plan(state);
            saveState();
            render();
            toast('已清空并重置');
          });
          break;
        case 'vocab-start':
          vocabStart();
          break;
        case 'vocab-flip':
          vocabFlip();
          break;
        case 'vocab-grade':
          vocabGrade(el.dataset.grade);
          break;
        case 'vocab-reset':
          confirmAction('重置单词进度', '所有单词的轮次、到期时间会清空，回到第一天重新开始。确定继续？', function () {
            vocabReset();
          });
          break;
        case 'close-modal':
          closeModal();
          break;
        case 'modal-delete': {
          var target = state.tasks.find(function (x) { return x.id === id; });
          if (!target) { closeModal(); break; }
          var title = target.title;
          state.tasks = state.tasks.filter(function (x) { return x.id !== id; });
          saveState();
          closeModal();
          render();
          toast('已删除：' + title);
          break;
        }
        default:
          break;
      }
    });

    /* 搜索 / 备注 / 设置 */
    document.addEventListener('input', function (e) {
      if (e.target.id === 'taskSearch') {
        ui.filter.q = e.target.value;
        render();
        var el = $('#taskSearch');
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
        return;
      }

      if (e.target.id === 'todayNote') {
        var date = e.target.dataset.noteDate;
        var value = e.target.value;
        state.notes[date] = value;
        clearTimeout(ui.saveTimer);
        ui.saveTimer = setTimeout(function () { saveState(); }, 300);
      }
    });

    document.addEventListener('change', function (e) {
      var el = e.target;

      if (el.id === 'statusFilter') {
        ui.filter.status = el.value;
        render();
        return;
      }

      if (el.matches('[data-setting]')) {
        var key = el.dataset.setting;
        var val = el.value;
        if (key === 'dailyMinutes') val = Math.max(30, parseInt(val, 10) || 480);
        if (key === 'restWeekday') val = parseInt(val, 10);
        state.settings[key] = val;
        saveState();
        render();
        toast('设置已更新');
        return;
      }

      if (el.matches('[data-vocab-new]')) {
        var n = parseInt(el.value, 10) || 30;
        vocabOf().newPerDay = n;
        saveState();
        render();
        toast('每天新词改为 ' + n + ' 个');
        return;
      }

      if (el.id === 'importFile') {
        var file = el.files && el.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var data = JSON.parse(String(reader.result));
            if (!data || !Array.isArray(data.tasks)) throw new Error('bad');
            state = normalize(data);
            saveState();
            render();
            toast('备份已导入');
          } catch (err) {
            toast('导入失败：文件格式不正确');
          }
          el.value = '';
        };
        reader.readAsText(file);
      }
    });

    /* 拖拽排期 */
    document.addEventListener('dragstart', function (e) {
      var chip = e.target.closest ? e.target.closest('.chip') : null;
      if (!chip) return;
      ui.dragId = chip.dataset.id;
      chip.classList.add('is-dragging');
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', ui.dragId);
      } catch (err) { /* ignore */ }
    });

    document.addEventListener('dragend', function () {
      ui.dragId = null;
      $$('.chip.is-dragging').forEach(function (c) { c.classList.remove('is-dragging'); });
      $$('.is-over').forEach(function (z) { z.classList.remove('is-over'); });
    });

    document.addEventListener('dragover', function (e) {
      var zone = e.target.closest ? e.target.closest('[data-drop]') : null;
      if (!zone || !ui.dragId) return;
      e.preventDefault();
      zone.classList.add('is-over');
    });

    document.addEventListener('dragleave', function (e) {
      var zone = e.target.closest ? e.target.closest('[data-drop]') : null;
      if (zone) zone.classList.remove('is-over');
    });

    document.addEventListener('drop', function (e) {
      var zone = e.target.closest ? e.target.closest('[data-drop]') : null;
      if (!zone || !ui.dragId) return;
      e.preventDefault();
      zone.classList.remove('is-over');

      var id = ui.dragId;
      ui.dragId = null;
      var t = state.tasks.find(function (x) { return x.id === id; });
      if (!t) return;

      var target = zone.dataset.drop;
      if (target === 'backlog') {
        t.date = null;
        t.manual = false;
        toast('已移回未排期');
      } else {
        t.date = target;
        t.manual = true;
        toast('已调整到 ' + fmtCN(target));
      }
      saveState();
      render();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalEl && !modalEl.hidden) closeModal();
    });
  }

  /* ================= 启动 ================= */
  function init() {
    bind();
    render();
    setInterval(tick, 1000);

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* ignore */ });
    }
  }

  init();
})();
