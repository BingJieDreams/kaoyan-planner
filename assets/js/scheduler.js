/* 自动排期：按优先级 / 学科轮转，把任务均匀铺到考试前的每一天 */
window.Scheduler = (function () {
  'use strict';

  var SUBJECT_ORDER = ['english', 'math', 'cs', 'politics', 'habit', 'other'];

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function isoOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseISO(s) { var p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function todayISO() { return isoOf(new Date()); }
  function addDays(iso, n) { var d = parseISO(iso); d.setDate(d.getDate() + n); return isoOf(d); }

  function enumerateDays(startIso, endIso, restWeekday) {
    var days = [];
    var cur = startIso;
    var guard = 0;
    while (cur < endIso && guard < 1000) {
      var d = parseISO(cur);
      if (restWeekday < 0 || d.getDay() !== restWeekday) days.push(cur);
      cur = addDays(cur, 1);
      guard += 1;
    }
    return days;
  }

  function plan(state) {
    var s = state.settings;
    var today = todayISO();
    var start = s.startDate > today ? s.startDate : today;
    var days = enumerateDays(start, s.examDate, Number(s.restWeekday));

    if (!days.length) {
      return { error: 'noDays', days: 0, assigned: 0 };
    }

    var tasks = state.tasks;
    var keep = [];
    var pending = [];

    tasks.forEach(function (t) {
      if (t.status === 'green') { keep.push(t); return; }
      if (t.manual && t.date) { keep.push(t); return; }
      pending.push(t);
    });

    var cap = 0;
    var used = {};
    keep.forEach(function (t) {
      if (!t.date) return;
      used[t.date] = (used[t.date] || 0) + (t.est || 0);
    });

    if (!pending.length) {
      return { days: days.length, assigned: 0, perDay: 0, cap: Number(s.dailyMinutes) || 480, overflow: 0 };
    }

    var total = pending.reduce(function (sum, t) { return sum + (t.est || 0); }, 0);
    var ideal = total / days.length;
    var dailyCap = Number(s.dailyMinutes) || 480;

    if (ideal > dailyCap) {
      cap = Math.ceil(ideal * 1.02);
    } else {
      cap = Math.min(dailyCap, Math.max(90, Math.ceil(ideal * 1.15)));
    }

    // 学科轮转，避免整天只学一科
    var pools = {};
    SUBJECT_ORDER.forEach(function (k) { pools[k] = []; });
    pending.forEach(function (t) {
      var k = pools[t.subject] ? t.subject : 'other';
      pools[k].push(t);
    });
    SUBJECT_ORDER.forEach(function (k) {
      pools[k].sort(function (a, b) {
        return (a.priority - b.priority) || (a.order - b.order);
      });
    });

    var flat = [];
    var more = true;
    while (more) {
      more = false;
      for (var i = 0; i < SUBJECT_ORDER.length; i++) {
        var q = pools[SUBJECT_ORDER[i]];
        if (q.length) { flat.push(q.shift()); more = true; }
      }
    }

    var di = 0;
    var assigned = 0;
    var overflow = 0;

    flat.forEach(function (t) {
      var est = t.est || 0;
      while (di < days.length) {
        var day = days[di];
        var load = used[day] || 0;
        if (load + est <= cap || load === 0) {
          t.date = day;
          t.manual = false;
          used[day] = load + est;
          assigned += 1;
          return;
        }
        di += 1;
      }
      // 容量已排满：兜底放到最后一天，保证任务不丢
      t.date = days[days.length - 1];
      t.manual = false;
      overflow += 1;
      assigned += 1;
    });

    return {
      days: days.length,
      assigned: assigned,
      perDay: Math.round(ideal),
      cap: cap,
      overflow: overflow,
      exceeds: ideal > dailyCap
    };
  }

  function clearSchedule(state) {
    state.tasks.forEach(function (t) {
      t.date = null;
      t.manual = false;
    });
  }

  return { plan: plan, clearSchedule: clearSchedule };
})();
