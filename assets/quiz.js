/* ============================================================
 * quiz.js — 多题库索引与答题会话逻辑
 * 支持题型：single（单选）/ multiple（多选）/ judge、truefalse（判断）/ short（简答）
 * 题库以 window.X_BANK 形式加载，BANKS 注册表统一管理
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 题库注册表 ----------
   * key   : 存储键
   * src   : 全局数据变量名（window.X_BANK）
   * title / tagline : 展示文案
   * desc  : 一句话简介
   */
  var BANKS = {
    djtk: {
      key: 'djtk', src: 'DJTK_BANK',
      title: 'D建模拟题', tagline: '100 题 · 单选',
      desc: '党建应知应会模拟题库，单选 100 题，答案取自原件标注。'
    },
    tztz: {
      key: 'tztz', src: 'TZTZ_BANK',
      title: '投资类业务模拟题', tagline: '410 题 · 单选/多选/判断',
      desc: '投资业务管理手册（流程 + 评审分册）模拟题，公司名已脱敏。'
    },
    ccsa: {
      key: 'ccsa', src: 'CCSA_BANK',
      title: 'CCSA标准化人员资格考试', tagline: '128 题 · 含GB/T 1.1-2020考点',
      desc: '基于 GB/T 1.1-2020、《标准化法》、通信行业标准整理，开卷核心参考 GB/T 1.1-2020。'
    },
    diank: {
      key: 'diank', src: 'DIANK_BANK',
      title: '电力交易员（中级工）', tagline: '790 题 · 单选/多选/判断',
      desc: '电力交易员中级工题库，覆盖电力交易、申报、结算、零售合同等。'
    }
  };

  var ORDER = ['djtk', 'tztz', 'ccsa', 'diank'];

  /* ---------- 题库数据封装 ---------- */
  function buildBankData(key) {
    var reg = BANKS[key];
    var raw = global[reg.src];
    if (!raw || !raw.questions || !raw.questions.length) {
      return { ok: false, key: key, title: reg.title, tagline: reg.tagline, desc: reg.desc };
    }
    var byId = {};
    raw.questions.forEach(function (q) { byId[q.id] = q; });

    function findOptText(q, key) {
      for (var i = 0; i < q.options.length; i++) {
        if (q.options[i].key === key) return q.options[i].text;
      }
      return key;
    }
    function typeLabel(t) {
      return { single: '单选', multiple: '多选', judge: '判断', truefalse: '判断', short: '简答' }[t] || t;
    }
    function answerText(q) {
      if (q.type === 'short') return q.answer;
      if (Array.isArray(q.answer)) {
        return q.answer.map(function (k) { return findOptText(q, k); }).filter(Boolean).join('、');
      }
      return findOptText(q, q.answer);
    }
    function isQCorrect(q, picked) {
      if (q.type === 'short') return picked && picked.trim() !== '';
      if (q.type === 'multiple') {
        var a = (Array.isArray(q.answer) ? q.answer.slice() : String(q.answer).split('')).sort();
        var b = (Array.isArray(picked) ? picked.slice() : String(picked).split('')).sort();
        if (a.length !== b.length) return false;
        for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
      }
      return picked === q.answer;   // single / judge / truefalse
    }

    return {
      ok: true,
      key: key,
      title: raw.meta.title,
      tagline: reg.tagline,
      desc: reg.desc,
      version: raw.meta.version,
      total: raw.questions.length,
      questions: raw.questions.slice(),
      byId: byId,
      sections: (raw.sections || []).map(function (s) {
        return {
          id: s.id, name: s.name, short: s.short || s.name, manual: s.manual || '',
          count: raw.questions.filter(function (q) { return q.section === s.id; }).length
        };
      }),
      meta: { title: raw.meta.title, version: raw.meta.version, total: raw.questions.length },
      bySection: function (sid) {
        return raw.questions.filter(function (q) { return q.section === Number(sid); });
      },
      sectionShort: function (sid) {
        var s = (raw.sections || []).filter(function (x) { return x.id === Number(sid); })[0];
        return s ? (s.short || s.name) : '未分类';
      },
      typeLabel: typeLabel,
      answerText: answerText,
      isCorrect: isQCorrect
    };
  }

  /* ---------- 题库管理器 ---------- */
  var Bank = {
    ORDER: ORDER,
    REG: BANKS,
    keys: function () { return ORDER.slice(); },

    get: function (key) {
      if (!BANKS[key]) key = ORDER[0];
      return buildBankData(key);
    },

    currentKey: 'djtk',
    setBank: function (key) { this.currentKey = (key in BANKS) ? key : 'djtk'; },
    current: function () { return this.get(this.currentKey); },

    all: function () { return this.current().questions; },
    getQ: function (id) { return this.current().byId[id]; },
    sections: function () { return this.current().sections; },
    bySection: function (sid) {
      return this.current().questions.filter(function (q) { return q.section === Number(sid); });
    },
    sectionName: function (sid) {
      var s = this.current().sections.filter(function (x) { return x.id === Number(sid); })[0];
      return s ? s.name : '未分类';
    },
    sectionShort: function (sid) {
      var s = this.current().sections.filter(function (x) { return x.id === Number(sid); })[0];
      return s ? (s.short || s.name) : this.sectionName(sid);
    },
    typeLabel: function (t) {
      return { single: '单选', multiple: '多选', judge: '判断', truefalse: '判断', short: '简答' }[t] || t;
    },
    meta: function () { return this.current().meta; }
  };

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ------------------------------------------------------------
   * Session：一次答题会话
   * 多选 answers[qid] 为已选 key 数组；单选/判断为单个 key；简答为字符串。
   * ---------------------------------------------------------- */
  function Session(opts) {
    this.mode = opts.mode || 'practice';
    this.label = opts.label || '练习';
    this.instant = opts.instant !== false;
    this.limitSec = opts.limitSec || 0;
    this.bankKey = opts.bankKey || 'djtk';
    this._isCorrect = opts.isCorrect;
    this._answerText = opts.answerText;
    this.multiSelect = opts.multiSelect || false;
    this.short = opts.short || false;
    var qs = opts.questions.slice();
    if (opts.shuffleQ) qs = shuffle(qs);
    this.questions = qs;
    this.index = 0;
    this.answers = {};
    this.checked = {};
    this.startAt = Date.now();
    this.endAt = null;
  }

  Session.prototype = {
    total: function () { return this.questions.length; },
    current: function () { return this.questions[this.index]; },
    isFirst: function () { return this.index === 0; },
    isLast: function () { return this.index >= this.questions.length - 1; },

    select: function (key) {
      var q = this.current();
      if (!q) return false;
      if (this.instant && this.checked[q.id]) return false;
      if (this.multiSelect) {
        var cur = this.answers[q.id];
        if (!Array.isArray(cur)) cur = [];
        var idx = cur.indexOf(key);
        if (idx >= 0) cur.splice(idx, 1); else cur.push(key);
        cur.sort();
        this.answers[q.id] = cur;
      } else {
        this.answers[q.id] = key;
      }
      if (this.instant) this.checked[q.id] = true;
      return true;
    },

    submitShort: function (text) {
      var q = this.current();
      if (!q) return false;
      if (this.instant && this.checked[q.id]) return false;
      this.answers[q.id] = (text || '').trim();
      if (this.instant) this.checked[q.id] = true;
      return true;
    },

    isCorrect: function (qid) {
      var q;
      for (var i = 0; i < this.questions.length; i++) if (this.questions[i].id === qid) { q = this.questions[i]; break; }
      if (!q || !this._isCorrect) return this.answers[qid] === q.answer;
      return this._isCorrect(q, this.answers[qid]);
    },

    answeredCount: function () { return Object.keys(this.answers).length; },

    correctCount: function () {
      var self = this, n = 0;
      this.questions.forEach(function (q) {
        if (self.answers[q.id] !== undefined && self.isCorrect(q.id)) n++;
      });
      return n;
    },

    wrongList: function () {
      var self = this;
      return this.questions.filter(function (q) {
        var a = self.answers[q.id];
        return a !== undefined && !self.isCorrect(q.id);
      });
    },

    unansweredList: function () {
      var self = this;
      return this.questions.filter(function (q) {
        var a = self.answers[q.id];
        if (a === undefined) return true;
        if (Array.isArray(a)) return a.length === 0;
        if (typeof a === 'string') return a.trim() === '';
        return false;
      });
    },

    next: function () { if (!this.isLast()) { this.index++; return true; } return false; },
    prev: function () { if (!this.isFirst()) { this.index--; return true; } return false; },
    goto: function (i) { if (i >= 0 && i < this.questions.length) { this.index = i; return true; } return false; },

    finish: function () { this.endAt = Date.now(); return this.summary(); },

    durationSec: function () {
      return Math.round(((this.endAt || Date.now()) - this.startAt) / 1000);
    },

    summary: function () {
      var total = this.total();
      var correct = this.correctCount();
      return {
        total: total,
        correct: correct,
        wrong: this.wrongList().length,
        unanswered: this.unansweredList().length,
        accuracy: total ? Math.round((correct / total) * 1000) / 10 : 0,
        score: total ? Math.round((correct / total) * 100) : 0,
        duration: this.durationSec()
      };
    }
  };

  global.Bank = Bank;
  global.Session = Session;
  global.BANKS = BANKS;
  global.shuffleArr = shuffle;
})(window);
