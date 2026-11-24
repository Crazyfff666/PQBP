/* ============================================================
 * app.js — 界面渲染与交互（多题库版 · 考试习题平台）
 * 支持 4 套题库；登录后先选择题库，各题库进度/错题独立
 * ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var PLATFORM = '考试习题平台';
  var state = {
    user: null,
    view: 'dashboard',
    bank: null,          // 当前题库 key
    session: null,
    lastSummary: null,
    wrongFilter: 'all',
    timerId: null
  };

  function cur() { return Bank.get(state.bank); }
  function storeData() { return Store.getData(state.user.name); }

  /* ---------------- 工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function fmtDate(ts) {
    var d = new Date(ts);
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fmtDur(sec) { var m = Math.floor(sec / 60), s = sec % 60; return m + '分' + (s < 10 ? '0' + s : s) + '秒'; }
  function fmtClock(sec) { var m = Math.floor(sec / 60), s = sec % 60; return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s); }

  function toast(msg, type) {
    var wrap = $('#toast-wrap');
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s'; el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 260);
    }, 2000);
  }

  function confirmBox(title, body, onOk, okText) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = body;
    var acts = $('#modal-actions');
    acts.innerHTML = '';
    var cancel = document.createElement('button');
    cancel.className = 'btn btn-outline'; cancel.textContent = '取消';
    cancel.onclick = closeModal;
    var ok = document.createElement('button');
    ok.className = 'btn btn-primary'; ok.textContent = okText || '确定';
    ok.onclick = function () { closeModal(); onOk && onOk(); };
    acts.appendChild(cancel); acts.appendChild(ok);
    $('#modal-mask').classList.remove('hidden');
  }
  function closeModal() { $('#modal-mask').classList.add('hidden'); }
  $('#modal-mask').addEventListener('click', function (e) { if (e.target === this) closeModal(); });

  function splitStem(stem) {
    stem = String(stem == null ? '' : stem);
    var i = stem.indexOf('①');
    var main, sub;
    if (i > 10) { main = stem.slice(0, i); sub = stem.slice(i); }
    else { main = stem; sub = ''; }
    main = esc(main).replace(/\n/g, '<br>');
    sub = esc(sub).replace(/\n/g, '<br>');
    return { main: main, sub: sub };
  }

  /* ============================================================
   * 认证
   * ========================================================== */
  $$('[data-authtab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      $$('[data-authtab]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var t = btn.getAttribute('data-authtab');
      $('#login-form').classList.toggle('hidden', t !== 'login');
      $('#register-form').classList.toggle('hidden', t !== 'register');
      $('#login-msg').textContent = ''; $('#reg-msg').textContent = '';
    });
  });

  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var u = $('#login-user').value.trim(), p = $('#login-pass').value;
    var msg = $('#login-msg'); msg.className = 'form-msg'; msg.textContent = '';
    if (!u || !p) { msg.textContent = '请输入用户名和密码'; return; }
    Store.login(u, p).then(function () {
      $('#login-pass').value = '';
      enterApp();
    }).catch(function (err) { msg.textContent = err.message; });
  });

  $('#register-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var u = $('#reg-user').value.trim();
    var n = $('#reg-name').value.trim();
    var p = $('#reg-pass').value, p2 = $('#reg-pass2').value;
    var msg = $('#reg-msg'); msg.className = 'form-msg';
    if (u.length < 2 || u.length > 16) { msg.textContent = '用户名需 2-16 位'; return; }
    if (p.length < 4) { msg.textContent = '密码不少于 4 位'; return; }
    if (p !== p2) { msg.textContent = '两次输入的密码不一致'; return; }
    Store.register(u, n, p).then(function () {
      $('#reg-pass').value = ''; $('#reg-pass2').value = '';
      toast('注册成功，已自动登录', 'ok');
      enterApp();
    }).catch(function (err) { msg.textContent = err.message; });
  });

  $('#btn-logout').addEventListener('click', function () {
    confirmBox('退出登录', '确定要退出当前账号吗？练习记录已保存在本地。', function () {
      Store.logout();
      state.user = null; state.session = null;
      stopTimer();
      $('#app-view').classList.add('hidden');
      $('#auth-view').classList.remove('hidden');
    }, '退出');
  });

  /* ============================================================
   * 导航
   * ========================================================== */
  $('#main-nav').addEventListener('click', function (e) {
    var btn = e.target.closest('.nav-item');
    if (!btn) return;
    var v = btn.getAttribute('data-view');
    if (state.session && ['practice', 'exam', 'wrong', 'dashboard', 'profile'].indexOf(v) >= 0 && state.view === 'quiz') {
      confirmBox('离开答题', '当前答题尚未完成，离开将丢失本次进度。确定离开吗？', function () {
        state.session = null; stopTimer(); go(v);
      }, '离开');
      return;
    }
    go(v);
  });

  $('#menu-toggle').addEventListener('click', function () { $('#main-nav').classList.toggle('open'); });
  $('#logo-home').addEventListener('click', function () { if (state.view !== 'quiz') go('dashboard'); });

  function go(view) {
    state.view = view;
    $('#main-nav').classList.remove('open');
    $$('.nav-item').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === view);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    render();
  }

  function refreshBadge() {
    if (!state.bank) return;
    var d = storeData();
    var n = 0;
    cur().questions.forEach(function (q) { if (d.wrong[q.id]) n++; });
    var b = $('#nav-wrong-badge');
    b.textContent = n;
    b.classList.toggle('zero', n === 0);
  }

  function render() {
    if (state.view === 'bankselect') {
      $('#main').innerHTML = viewBankSelect();
      bindBankSelect();
      return;
    }
    refreshBadge();
    var m = $('#main');
    switch (state.view) {
      case 'dashboard': m.innerHTML = viewDashboard(); bindDashboard(); break;
      case 'practice': m.innerHTML = viewPractice(); bindPractice(); break;
      case 'exam': m.innerHTML = viewExamSetup(); bindExamSetup(); break;
      case 'wrong': m.innerHTML = viewWrong(); bindWrong(); break;
      case 'profile': m.innerHTML = viewProfile(); bindProfile(); break;
      case 'quiz': m.innerHTML = viewQuiz(); bindQuiz(); break;
      case 'result': m.innerHTML = viewResult(); bindResult(); break;
      default: go('dashboard');
    }
  }

  /* ============================================================
   * 题库选择（登录后首屏）
   * ========================================================== */
  function viewBankSelect() {
    var d = state.user;
    var cards = Bank.keys().map(function (key) {
      var reg = Bank.REG[key];
      var bank = Bank.get(key);
      var total = bank.ok ? bank.total : 0;
      var hasData = false;
      if (bank.ok) {
        var dd = Store.getData(d.name);
        bank.questions.forEach(function (q) { if (dd.records[q.id] || dd.wrong[q.id]) hasData = true; });
      }
      var badge = hasData ? '<span class="tag ok has">已有学习记录</span>' : '';
      return '<button class="bank-card" data-bank="' + key + '">' +
        '<div class="bank-top"><span class="bank-title">' + esc(reg.title) + '</span>' + badge + '</div>' +
        '<div class="bank-tag">' + esc(reg.tagline) + '</div>' +
        '<p class="bank-desc">' + esc(reg.desc) + '</p>' +
        '<div class="bank-foot">共 ' + total + ' 题<span class="go">进入 →</span></div>' +
        '</button>';
    }).join('');

    return '' +
      '<div class="page-head"><h2>选择题库</h2><p>' + esc(d.display || d.name) + '，选择要练习的题库（各题库学习记录相互独立）</p></div>' +
      '<div class="bank-grid">' + cards + '</div>';
  }

  function bindBankSelect() {
    $$('[data-bank]').forEach(function (el) {
      el.addEventListener('click', function () { chooseBank(el.getAttribute('data-bank')); });
    });
  }

  function chooseBank(key) {
    var bank = Bank.get(key);
    if (!bank.ok) { toast('该题库加载失败', 'err'); return; }
    state.bank = key;
    Bank.setBank(key);
    Store.setBank(key);
    $('#bank-current-name').textContent = bank.title;
    go('dashboard');
  }

  /* ============================================================
   * 首页
   * ========================================================== */
  function viewDashboard() {
    var d = storeData();
    var bank = cur();
    var meta = bank.meta;
    var practSet = {};
    var mastered = 0, wrongN = 0;
    bank.questions.forEach(function (q) {
      var r = d.records[q.id];
      if (r) practSet[q.id] = 1;
      if (d.wrong[q.id]) wrongN++;
      if (r && r.lastOk && !d.wrong[q.id]) mastered++;
    });
    var practiced = Object.keys(practSet).length;
    var answered = d.stats.answered;
    var acc = answered ? Math.round(d.stats.correct / answered * 1000) / 10 : 0;

    var secs = bank.sections.map(function (s) {
      var qs = bank.bySection(s.id);
      var done = 0, ok = 0;
      qs.forEach(function (q) { if (d.records[q.id]) done++; if (d.records[q.id] && d.records[q.id].lastOk) ok++; });
      var pct = qs.length ? Math.round(done / qs.length * 100) : 0;
      var okPct = qs.length ? Math.round(ok / qs.length * 100) : 0;
      return '<div class="sec-card" data-sec="' + s.id + '">' +
        '<div class="row1"><div class="sname">' + esc(s.name) + '</div><div class="sno">' + s.id + '</div></div>' +
        '<div class="progress' + (okPct >= 90 ? ' ok' : '') + '"><i style="width:' + pct + '%"></i></div>' +
        '<div class="meta"><span>已练 ' + done + '/' + qs.length + ' 题</span><span>掌握 ' + okPct + '%</span></div>' +
        '</div>';
    }).join('');

    var hist = d.history.length ? d.history.slice(0, 6).map(function (h) {
      return '<div class="hist-item"><span class="hi-mode">' + esc(h.mode) + (h.scope ? ' · ' + esc(h.scope) : '') + '</span>' +
        '<span class="hi-date">' + fmtDate(h.date) + '</span>' +
        '<span class="hi-score">' + h.correct + '/' + h.total + '</span></div>';
    }).join('') : '<div class="empty" style="padding:26px 10px"><p class="sm">暂无练习记录，从下方任一分类开始吧</p></div>';

    return '' +
      '<div class="page-head"><h2>学习概览</h2><p>' + esc(meta.title) + ' · ' + esc(meta.version) + ' · 共 ' + meta.total + ' 题</p></div>' +
      '<div class="stat-grid">' +
        '<div class="stat"><div class="k">已练题目</div><div class="v">' + practiced + '<small>/' + meta.total + '</small></div></div>' +
        '<div class="stat ok"><div class="k">已掌握</div><div class="v">' + mastered + '<small>题</small></div></div>' +
        '<div class="stat accent"><div class="k">错题待巩固</div><div class="v">' + wrongN + '<small>题</small></div></div>' +
        '<div class="stat"><div class="k">累计正确率</div><div class="v">' + acc + '<small>%</small></div></div>' +
      '</div>' +
      '<div class="card card-pad" style="margin-bottom:22px">' +
        '<div class="card-title"><span>快速开始</span></div>' +
        '<div class="mode-grid" style="margin-bottom:0">' +
          '<button class="mode-card" data-start="all-seq"><div class="ic">📚</div><h4>全部题目 · 顺序练习</h4><p>按章节顺序通练 ' + meta.total + ' 题，即时判卷并解析</p></button>' +
          '<button class="mode-card" data-start="all-random"><div class="ic">🔀</div><h4>随机抽题 · 20 题</h4><p>全库随机抽取 20 道题，快速自测</p></button>' +
          '<button class="mode-card" data-start="wrong"' + (wrongN ? '' : ' disabled style="opacity:.5;cursor:not-allowed"') + '><div class="ic">🎯</div><h4>错题重练</h4><p>' + (wrongN ? '当前有 ' + wrongN + ' 道错题待巩固' : '暂无错题，继续保持') + '</p></button>' +
          '<button class="mode-card" data-start="exam"><div class="ic">📝</div><h4>模拟考试</h4><p>限时组卷，交卷后统一评分与复盘</p></button>' +
        '</div>' +
      '</div>' +
      '<div class="grid-2">' +
        '<div><div class="card-title"><span>分类练习</span></div><div class="sec-grid" style="grid-template-columns:1fr">' + secs + '</div></div>' +
        '<div><div class="card-title"><span>最近记录</span></div><div class="card card-pad">' + hist + '</div></div>' +
      '</div>';
  }

  function bindDashboard() {
    $$('[data-sec]').forEach(function (el) { el.addEventListener('click', function () { startSection(el.getAttribute('data-sec')); }); });
    $$('[data-start]').forEach(function (el) {
      el.addEventListener('click', function () {
        var k = el.getAttribute('data-start');
        if (k === 'all-seq') startPractice(cur().questions, '全部题目 · 顺序', false);
        else if (k === 'all-random') startPractice(shuffleArr(cur().questions).slice(0, 20), '随机抽题 20 道', false);
        else if (k === 'wrong') startWrongPractice();
        else if (k === 'exam') go('exam');
      });
    });
  }

  /* ============================================================
   * 练习页
   * ========================================================== */
  function viewPractice() {
    var d = storeData();
    var bank = cur();
    var secs = bank.sections.map(function (s) {
      var qs = bank.bySection(s.id);
      var done = 0, ok = 0;
      qs.forEach(function (q) { if (d.records[q.id]) done++; if (d.records[q.id] && d.records[q.id].lastOk) ok++; });
      var pct = qs.length ? Math.round(done / qs.length * 100) : 0;
      var okPct = qs.length ? Math.round(ok / qs.length * 100) : 0;
      return '<div class="sec-card" data-sec="' + s.id + '">' +
        '<div class="row1"><div class="sname">' + esc(s.name) + '</div><div class="sno">' + s.id + '</div></div>' +
        '<div class="progress' + (okPct >= 90 ? ' ok' : '') + '"><i style="width:' + pct + '%"></i></div>' +
        '<div class="meta"><span>共 ' + qs.length + ' 题 · 已练 ' + done + '</span><span>掌握 ' + okPct + '%</span></div>' +
        '</div>';
    }).join('');

    var favN = d.favorites.filter(function (id) { return cur().byId[id]; }).length;
    var total = bank.total;

    return '' +
      '<div class="page-head"><h2>练习</h2><p>练习模式即时判卷并显示正确答案，答错的题目会自动进入你的错题库</p></div>' +
      '<div class="card-title"><span>练习方式</span></div>' +
      '<div class="mode-grid">' +
        '<button class="mode-card" data-start="all-seq"><div class="ic">📚</div><h4>顺序练习</h4><p>按原题库顺序练习全部 ' + total + ' 题</p></button>' +
        '<button class="mode-card" data-start="all-shuffle"><div class="ic">🔀</div><h4>乱序练习</h4><p>打乱全部 ' + total + ' 题顺序练习</p></button>' +
        '<button class="mode-card" data-start="random20"><div class="ic">⚡</div><h4>随机 20 题</h4><p>全库随机抽题，快速自测</p></button>' +
        '<button class="mode-card" data-start="unseen"><div class="ic">🆕</div><h4>只练没做过的</h4><p>跳过已练题目，专攻新题</p></button>' +
        '<button class="mode-card" data-start="fav"' + (favN ? '' : ' disabled style="opacity:.5;cursor:not-allowed"') + '><div class="ic">⭐</div><h4>收藏题目</h4><p>' + (favN ? '共收藏 ' + favN + ' 题' : '暂无收藏题目') + '</p></button>' +
      '</div>' +
      '<div class="card-title" style="margin-top:26px"><span>按分类练习</span></div>' +
      '<div class="sec-grid">' + secs + '</div>';
  }

  function bindPractice() {
    var d = storeData();
    $$('[data-sec]').forEach(function (el) { el.addEventListener('click', function () { startSection(el.getAttribute('data-sec')); }); });
    $$('[data-start]').forEach(function (el) {
      el.addEventListener('click', function () {
        var k = el.getAttribute('data-start');
        if (k === 'all-seq') startPractice(cur().questions, '顺序练习', false);
        else if (k === 'all-shuffle') startPractice(cur().questions, '乱序练习', true);
        else if (k === 'random20') startPractice(shuffleArr(cur().questions).slice(0, 20), '随机 20 题', false);
        else if (k === 'unseen') {
          var list = cur().questions.filter(function (q) { return !d.records[q.id]; });
          if (!list.length) { toast('所有题目都已练习过', 'ok'); return; }
          startPractice(list, '未练题目（' + list.length + ' 题）', false);
        } else if (k === 'fav') {
          var favs = d.favorites.map(function (id) { return cur().byId[id]; }).filter(Boolean);
          if (!favs.length) { toast('暂无收藏题目'); return; }
          startPractice(favs, '收藏题目', false);
        }
      });
    });
  }

  function startSection(sid) {
    var qs = cur().bySection(sid);
    startPractice(qs, cur().sectionShort(sid), false);
  }

  function startPractice(questions, label, shuffleQ) {
    if (!questions.length) { toast('没有可练习的题目'); return; }
    var multi = questions.some(function (q) { return q.type === 'multiple'; });
    var short = questions.some(function (q) { return q.type === 'short'; });
    state.session = new Session({
      questions: questions, mode: 'practice', instant: true,
      shuffleQ: !!shuffleQ, label: label, bankKey: state.bank,
      multiSelect: multi, short: short,
      isCorrect: cur().isCorrect, answerText: cur().answerText
    });
    stopTimer();
    go('quiz');
  }

  function startWrongPractice() {
    var d = storeData();
    var ids = Object.keys(d.wrong).filter(function (id) { return cur().byId[id]; });
    var qs = ids.map(function (id) { return cur().byId[id]; }).filter(Boolean);
    if (!qs.length) { toast('错题库为空，继续保持'); return; }
    qs.sort(function (a, b) { return (d.wrong[b.id].count || 0) - (d.wrong[a.id].count || 0); });
    var multi = qs.some(function (q) { return q.type === 'multiple'; });
    var short = qs.some(function (q) { return q.type === 'short'; });
    state.session = new Session({
      questions: qs, mode: 'wrong', instant: true, label: '错题重练（' + qs.length + ' 题）',
      bankKey: state.bank, multiSelect: multi, short: short,
      isCorrect: cur().isCorrect, answerText: cur().answerText
    });
    stopTimer();
    go('quiz');
  }

  /* ============================================================
   * 模拟考试
   * ========================================================== */
  function viewExamSetup() {
    var d = storeData();
    var bank = cur();
    var maxN = bank.total;
    var exams = d.exams.length ? d.exams.slice(0, 8).map(function (e) {
      return '<div class="hist-item"><span class="hi-mode">' + e.total + ' 题 · ' + fmtDur(e.duration) + '</span>' +
        '<span class="hi-date">' + fmtDate(e.date) + '</span>' +
        '<span class="hi-score" style="color:' + (e.score >= 60 ? 'var(--ok)' : 'var(--err)') + '">' + e.score + ' 分</span></div>';
    }).join('') : '<div class="empty" style="padding:26px 10px"><p class="sm">暂无考试记录</p></div>';

    var counts = [10, 20, 30, 50, 100, 200, 500].filter(function (n) { return n <= maxN; });
    var countOpts = counts.map(function (n) {
      return '<option value="' + n + '"' + (n === 50 && maxN >= 50 ? ' selected' : '') + '>' + n + ' 题</option>';
    }).join('');
    if (!countOpts) countOpts = '<option value="' + maxN + '" selected>全卷 ' + maxN + ' 题</option>';

    return '' +
      '<div class="page-head"><h2>模拟考试</h2><p>考试模式答题过程中不显示对错，交卷后统一评分并提供逐题复盘</p></div>' +
      '<div class="grid-2">' +
        '<div class="card card-pad">' +
          '<div class="card-title"><span>组卷设置</span></div>' +
          '<div class="form-inline">' +
            '<label>题目数量<select id="ex-count">' + countOpts + '</select></label>' +
            '<label>出题范围<select id="ex-scope"><option value="0">全部分类</option>' +
              bank.sections.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('') +
            '</select></label>' +
            '<label>考试时长<select id="ex-time">' +
              '<option value="0">不限时</option><option value="600">10 分钟</option>' +
              '<option value="1200">20 分钟</option><option value="1800" selected>30 分钟</option>' +
              '<option value="3600">60 分钟</option><option value="7200">120 分钟</option>' +
            '</select></label>' +
          '</div>' +
          '<div class="btn-row"><button class="btn btn-primary btn-lg btn-block" id="btn-start-exam">开始考试</button></div>' +
          '<p style="font-size:12.5px;color:var(--text-3);margin:14px 0 0;line-height:1.65">评分规则：每题等分，满分 100 分，60 分及格。交卷后错题自动计入错题库。</p>' +
        '</div>' +
        '<div><div class="card-title"><span>历史成绩</span></div><div class="card card-pad">' + exams + '</div></div>' +
      '</div>';
  }

  function bindExamSetup() {
    $('#btn-start-exam').addEventListener('click', function () {
      var n = Number($('#ex-count').value);
      var scope = Number($('#ex-scope').value);
      var t = Number($('#ex-time').value);
      var pool = scope ? cur().bySection(scope) : cur().questions;
      if (n > pool.length) n = pool.length;
      var qs = shuffleArr(pool).slice(0, n);
      var multi = qs.some(function (q) { return q.type === 'multiple'; });
      var short = qs.some(function (q) { return q.type === 'short'; });
      state.session = new Session({
        questions: qs, mode: 'exam', instant: false, shuffleQ: false,
        label: '模拟考试 · ' + n + ' 题' + (scope ? '（' + cur().sectionShort(scope) + '）' : ''),
        limitSec: t, bankKey: state.bank, multiSelect: multi, short: short,
        isCorrect: cur().isCorrect, answerText: cur().answerText
      });
      go('quiz');
      startTimer();
    });
  }

  /* ============================================================
   * 计时器
   * ========================================================== */
  function startTimer() {
    stopTimer();
    state.timerId = setInterval(function () {
      var s = state.session;
      if (!s) { stopTimer(); return; }
      var el = $('#quiz-timer');
      if (!el) return;
      if (s.limitSec) {
        var left = s.limitSec - Math.round((Date.now() - s.startAt) / 1000);
        if (left <= 0) {
          stopTimer();
          toast('考试时间到，已自动交卷', 'err');
          submitExam(true);
          return;
        }
        el.textContent = fmtClock(left);
        el.style.color = left <= 60 ? 'var(--err)' : '';
      } else {
        el.textContent = fmtClock(Math.round((Date.now() - s.startAt) / 1000));
      }
    }, 500);
  }

  function stopTimer() { if (state.timerId) { clearInterval(state.timerId); state.timerId = null; } }

  /* ============================================================
   * 答题界面
   * ========================================================== */
  function keyInAnswer(q, key) {
    if (q.type === 'multiple') {
      return (Array.isArray(q.answer) ? q.answer : String(q.answer).split('')).indexOf(key) >= 0;
    }
    return q.answer === key;
  }

  function viewQuiz() {
    var s = state.session;
    if (!s) { return '<div class="empty"><p>没有进行中的练习</p></div>'; }
    var q = s.current();
    var d = storeData();
    var isFav = d.favorites.indexOf(q.id) >= 0;
    var picked = s.answers[q.id];
    var checked = s.instant && s.checked[q.id];
    var st = splitStem(q.stem);
    var multi = s.multiSelect;
    var isShort = q.type === 'short';
    var sel = Array.isArray(picked) ? picked : (picked ? [picked] : []);

    var opts = q.options.map(function (o) {
      if (isShort) return '';
      var cls = 'opt';
      if (checked) {
        cls += ' locked';
        if (keyInAnswer(q, o.key)) cls += ' correct';
        else if (sel.indexOf(o.key) >= 0) cls += ' wrong';
      } else if (multi) {
        if (sel.indexOf(o.key) >= 0) cls += ' selected';
      } else if (picked === o.key) {
        cls += ' selected';
      }
      return '<button class="' + cls + '" data-key="' + o.key + '">' +
        '<span class="key">' + o.key + '</span><span class="txt">' + esc(o.text) + '</span></button>';
    }).filter(Boolean).join('');

    var fb = '';
    if (checked && !isShort) {
      var ok = s.isCorrect(q.id);
      var ansLabel = multi ? q.answer.join('、') : q.answer;
      fb = '<div class="feedback show ' + (ok ? 'ok' : 'err') + '">' +
        (ok ? '✓ 回答正确' : '✗ 回答错误，正确答案是 <b>' + esc(ansLabel) + '</b>') +
        '</div>';
    }

    var shortBlock = '';
    if (isShort) {
      shortBlock = '<textarea id="short-input" class="short-input" rows="4" placeholder="请输入你的答案（简答题，提交后对照参考答案）">' + esc((picked || '')) + '</textarea>' +
        '<div class="short-ref' + (checked ? ' show' : '') + '"><div class="lb">参考答案</div>' + esc(s._answerText ? s._answerText(q) : q.answer) + '</div>' +
        '<div class="btn-row" style="margin:10px 0 0"><button class="btn btn-primary btn-sm" id="btn-short-ok">提交答案</button></div>';
    }

    var cells = s.questions.map(function (qq, i) {
      var cls = 'sheet-cell';
      if (i === s.index) cls += ' cur';
      if (s.answers[qq.id] !== undefined) {
        if (s.instant) cls += s.isCorrect(qq.id) ? ' ok' : ' err';
        else cls += ' done';
      }
      return '<button class="' + cls + '" data-goto="' + i + '">' + (i + 1) + '</button>';
    }).join('');

    var legend = s.instant
      ? '<span><i style="background:var(--ok)"></i>答对</span><span><i style="background:var(--err)"></i>答错</span><span><i style="background:#fff;border:1px solid var(--border-2)"></i>未答</span>'
      : '<span><i style="background:#eef1f5;border:1px solid var(--border-2)"></i>已答</span><span><i style="background:#fff;border:1px solid var(--border-2)"></i>未答</span>';

    var isExam = s.mode === 'exam';
    var submitBtn = (isExam
      ? '<button class="btn btn-primary" id="btn-submit">交卷</button>'
      : '<button class="btn btn-primary" id="btn-finish">结束并查看成绩</button>');

    var confirmBtn = (multi && isShort === false)
      ? '<button class="btn btn-primary btn-sm multi-confirm" id="btn-multi-confirm">' + (s.instant ? '确认本题答案' : '确定（已选 ' + sel.length + ' 项）') + '</button>'
      : '';

    return '' +
      '<div class="quiz-top">' +
        '<div class="quiz-title">' + esc(s.label) +
          '<span class="tag' + (isExam ? '' : ' grey') + '">' + (isExam ? '考试模式' : '练习模式') + '</span></div>' +
        '<div class="quiz-meta">' +
          '<span>已答 <b>' + s.answeredCount() + '</b> / ' + s.total() + '</span>' +
          '<span class="timer" id="quiz-timer">00:00</span>' +
        '</div>' +
      '</div>' +
      '<div class="qbar"><i style="width:' + Math.round((s.index + 1) / s.total() * 100) + '%"></i></div>' +
      '<div class="quiz-layout">' +
        '<div class="qcard">' +
          '<div class="qhead">' +
            '<span class="qno">第 ' + (s.index + 1) + ' / ' + s.total() + ' 题</span>' +
            '<span class="tag grey">' + esc(cur().sectionShort(q.section)) + '</span>' +
            '<span class="tag grey">' + esc(Bank.typeLabel(q.type)) + '</span>' +
            '<button class="qfav' + (isFav ? ' on' : '') + '" id="btn-fav" title="收藏">' + (isFav ? '★' : '☆') + '</button>' +
          '</div>' +
          '<div class="qstem">' + st.main + (st.sub ? '<span class="sub">' + st.sub + '</span>' : '') + '</div>' +
          (multi ? '<div class="ms-hint">多选题：可选择多个，点选切换</div>' : '') +
          (isShort ? shortBlock : '<div class="opts" id="opts">' + opts + '</div>' + confirmBtn) +
          fb +
          '<div class="qactions">' +
            '<button class="btn btn-outline" id="btn-prev"' + (s.isFirst() ? ' disabled' : '') + '>上一题</button>' +
            '<button class="btn btn-outline" id="btn-next"' + (s.isLast() ? ' disabled' : '') + '>下一题</button>' +
            '<span class="spacer"></span>' +
            submitBtn +
          '</div>' +
        '</div>' +
        '<div class="sheet">' +
          '<h4>答题卡</h4>' +
          '<div class="sheet-grid" id="sheet">' + cells + '</div>' +
          '<div class="sheet-legend">' + legend + '</div>' +
        '</div>' +
      '</div>';
  }

  function bindQuiz() {
    var s = state.session;
    if (!s) return;
    if (!state.timerId) startTimer();
    var q0 = s.current();
    var isShort = q0.type === 'short';

    if (!isShort) {
      $('#opts').addEventListener('click', function (e) {
        var btn = e.target.closest('.opt');
        if (!btn) return;
        var q = s.current();
        var key = btn.getAttribute('data-key');
        if (s.multiSelect) {
          s.select(key);
          // 多选：点选后更新"确认"按钮文案
          var mc = $('#btn-multi-confirm');
          if (mc) {
            var sel = Array.isArray(s.answers[q.id]) ? s.answers[q.id] : [];
            mc.textContent = s.instant ? '确认本题答案（已选 ' + sel.length + '）' : '确定（已选 ' + sel.length + ' 项）';
          }
          render();
          return;
        }
        s.select(key);
        if (s.instant) {
          Store.recordAnswer(state.user.name, q.id, s.isCorrect(q.id));
        }
        render();
        if (s.instant && key === q.answer && !s.isLast()) {
          setTimeout(function () { if (state.session === s && state.view === 'quiz') { s.next(); render(); } }, 620);
        }
      });

      var mc = $('#btn-multi-confirm');
      if (mc) mc.addEventListener('click', function () {
        var q = s.current();
        if (s.instant && !s.checked[q.id]) {
          Store.recordAnswer(state.user.name, q.id, s.isCorrect(q.id));
        }
        if (s.instant && !s.isLast()) {
          setTimeout(function () { if (state.session === s && state.view === 'quiz') { s.next(); render(); } }, 420);
        } else if (s.instant) {
          finishPractice();
        }
      });
    } else {
      var ok = $('#btn-short-ok');
      if (ok) ok.addEventListener('click', function () {
        var q = s.current();
        s.submitShort($('#short-input').value);
        Store.recordAnswer(state.user.name, q.id, s.isCorrect(q.id));
        render();
      });
    }

    var prev = $('#btn-prev'), next = $('#btn-next');
    if (prev) prev.addEventListener('click', function () { s.prev(); render(); });
    if (next) next.addEventListener('click', function () { s.next(); render(); });

    $('#sheet').addEventListener('click', function (e) {
      var c = e.target.closest('[data-goto]');
      if (!c) return;
      s.goto(Number(c.getAttribute('data-goto')));
      render();
    });

    $('#btn-fav').addEventListener('click', function () {
      var on = Store.toggleFavorite(state.user.name, s.current().id);
      toast(on ? '已加入收藏' : '已取消收藏', on ? 'ok' : '');
      render();
    });

    var fin = $('#btn-finish');
    if (fin) fin.addEventListener('click', function () {
      if (s.answeredCount() === 0) { toast('还没有作答'); return; }
      finishPractice();
    });

    var sub = $('#btn-submit');
    if (sub) sub.addEventListener('click', function () {
      var un = s.unansweredList().length;
      confirmBox('交卷确认',
        un ? '还有 <b>' + un + '</b> 道题未作答，未作答按错误计分。确定交卷吗？' : '已全部作答完毕，确定交卷吗？',
        function () { submitExam(false); }, '交卷');
    });

    document.onkeydown = function (e) {
      if (state.view !== 'quiz' || !state.session) return;
      if (q0.type === 'short') return;
      var k = e.key;
      var map = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'E', '6': 'F' };
      if (/^[1-6]$/.test(k)) k = map[k];
      else if (/^[a-fA-F]$/.test(k)) k = k.toUpperCase();
      if (k) {
        var target = $('#opts .opt[data-key="' + k + '"]');
        if (target) target.click();
      } else if (e.key === 'ArrowLeft') { s.prev(); render(); }
      else if (e.key === 'ArrowRight') { s.next(); render(); }
    };
  }

  function finishPractice() {
    var s = state.session;
    stopTimer();
    s.questions.forEach(function (q) {
      if (s.answers[q.id] !== undefined && !s.checked[q.id]) {
        Store.recordAnswer(state.user.name, q.id, s.isCorrect(q.id));
      }
    });
    var sum = s.finish();
    Store.pushHistory(state.user.name, {
      date: Date.now(), mode: s.mode === 'wrong' ? '错题重练' : '练习',
      scope: s.label, total: sum.total, correct: sum.correct
    });
    if (s.mode === 'wrong') {
      s.questions.forEach(function (q) {
        if (s.answers[q.id] !== undefined && s.isCorrect(q.id)) Store.removeWrong(state.user.name, q.id);
      });
    }
    state.lastSummary = { summary: sum, session: s };
    document.onkeydown = null;
    go('result');
  }

  function submitExam(auto) {
    var s = state.session;
    if (!s) return;
    stopTimer();
    var sum = s.finish();
    s.questions.forEach(function (q) {
      var a = s.answers[q.id];
      if (a === undefined) return;
      if (Array.isArray(a) && a.length === 0) return;
      if (typeof a === 'string' && a.trim() === '') return;
      Store.recordAnswer(state.user.name, q.id, s.isCorrect(q.id));
    });
    Store.pushExam(state.user.name, {
      date: Date.now(), total: sum.total, correct: sum.correct,
      score: sum.score, duration: sum.duration
    });
    Store.pushHistory(state.user.name, {
      date: Date.now(), mode: '模拟考试', scope: s.label,
      total: sum.total, correct: sum.correct
    });
    state.lastSummary = { summary: sum, session: s, auto: auto };
    document.onkeydown = null;
    go('result');
  }

  /* ============================================================
   * 结果页
   * ========================================================== */
  function viewResult() {
    var ls = state.lastSummary;
    if (!ls) return '<div class="empty"><p>暂无结果</p></div>';
    var sum = ls.summary, s = ls.session;
    var pass = sum.score >= 60;
    var wrongs = s.wrongList();
    var unans = s.unansweredList();

    var reviewList = s.questions.filter(function (q) {
      return s.answers[q.id] !== undefined && !s.isCorrect(q.id);
    });

    var review = reviewList.length ? reviewList.map(function (q, i) {
      var a = s.answers[q.id];
      var st = splitStem(q.stem);
      var myLine;
      if (q.type === 'short') {
        myLine = '<div class="review-line err"><span class="lb">你的答案</span><span class="val">' + (a && String(a).trim() ? esc(a) : '未作答') + '</span></div>';
      } else {
        var myKeys = Array.isArray(a) ? a : (a ? [a] : []);
        var myTxt = myKeys.map(function (k) {
          var o = q.options.filter(function (x) { return x.key === k; })[0];
          return o ? (k + '. ' + o.text) : k;
        }).join('；');
        myLine = '<div class="review-line err"><span class="lb">你的答案</span><span class="val">' + (myKeys.length ? esc(myTxt) : '未作答') + '</span></div>';
      }
      var ans = s._answerText ? s._answerText(q) : q.answer;
      var ansLine = '<div class="review-line ok"><span class="lb">参考答案</span><span class="val">' + esc(ans) + '</span></div>';
      var explain = q.explain ? '<div class="review-line exp"><span class="lb">解析</span><span class="val">' + esc(q.explain).replace(/\n/g, '<br>') + '</span></div>' : '';
      return '<div class="review-item">' +
        '<div class="rq"><span class="idx">' + (i + 1) + '.</span>' + st.main + (st.sub ? '<br><span style="color:var(--text-2);font-size:13.5px">' + st.sub + '</span>' : '') + '</div>' +
        myLine + ansLine + explain +
        '</div>';
    }).join('') : '<div class="empty" style="padding:34px 10px"><div class="ic">🎉</div><p>全部答对，表现优异</p></div>';

    return '' +
      '<div class="card">' +
        '<div class="result-hero">' +
          '<div class="score-ring' + (pass ? ' pass' : '') + '" style="--deg:' + (sum.score * 3.6) + 'deg">' +
            '<span class="n">' + sum.score + '</span><span class="u">分</span></div>' +
          '<h3>' + esc(s.label) + (ls.auto ? '（超时自动交卷）' : '') + '</h3>' +
          '<p>' + (s.mode === 'exam' ? (pass ? '成绩合格，继续巩固薄弱环节' : '成绩未达 60 分，建议重点复习错题') : '本轮练习已完成') + '</p>' +
        '</div>' +
        '<div class="result-stats">' +
          '<div><div class="v">' + sum.total + '</div><div class="k">总题数</div></div>' +
          '<div><div class="v" style="color:var(--ok)">' + sum.correct + '</div><div class="k">答对</div></div>' +
          '<div><div class="v" style="color:var(--err)">' + wrongs.length + '</div><div class="k">答错</div></div>' +
          '<div><div class="v">' + fmtDur(sum.duration) + '</div><div class="k">用时</div></div>' +
        '</div>' +
        '<div style="padding:0 22px 22px;display:flex;gap:10px;flex-wrap:wrap">' +
          (reviewList.length ? '<button class="btn btn-primary" id="btn-redo-wrong">立即重做这 ' + reviewList.length + ' 道错题</button>' : '') +
          '<button class="btn btn-outline" id="btn-again">再练一轮</button>' +
          '<button class="btn btn-outline" id="btn-back-home">返回首页</button>' +
        '</div>' +
      '</div>' +
      (unans.length ? '<p style="font-size:13px;color:var(--text-3);margin:14px 2px 0">注：本次有 ' + unans.length + ' 道题未作答，未计入错题库。</p>' : '') +
      '<div class="card-title" style="margin-top:24px"><span>错题复盘（' + reviewList.length + ' 题）</span></div>' +
      '<div class="card">' + review + '</div>';
  }

  function bindResult() {
    var ls = state.lastSummary;
    var b1 = $('#btn-redo-wrong');
    if (b1) b1.addEventListener('click', function () {
      var qs = ls.session.questions.filter(function (q) { return ls.session.answers[q.id] !== undefined && !ls.session.isCorrect(q.id); });
      startPractice(qs, '错题重做（' + qs.length + ' 题）', false);
    });
    $('#btn-again').addEventListener('click', function () {
      startPractice(ls.session.questions, ls.session.label, true);
    });
    $('#btn-back-home').addEventListener('click', function () { go('dashboard'); });
  }

  /* ============================================================
   * 错题库
   * ========================================================== */
  function viewWrong() {
    var d = storeData();
    var bank = cur();
    var ids = Object.keys(d.wrong).filter(function (id) { return bank.byId[id]; });
    var items = ids.map(function (id) { return bank.byId[id]; }).filter(Boolean);

    if (state.wrongFilter !== 'all') {
      items = items.filter(function (q) { return q.section === Number(state.wrongFilter); });
    }
    items.sort(function (a, b) { return (d.wrong[b.id].count || 0) - (d.wrong[a.id].count || 0); });

    var chips = '<button class="chip' + (state.wrongFilter === 'all' ? ' active' : '') + '" data-wf="all">全部 ' + ids.length + '</button>' +
      bank.sections.map(function (s) {
        var n = ids.filter(function (id) { var q = bank.byId[id]; return q && q.section === s.id; }).length;
        if (!n) return '';
        return '<button class="chip' + (String(state.wrongFilter) === String(s.id) ? ' active' : '') + '" data-wf="' + s.id + '">' + esc(s.short) + ' ' + n + '</button>';
      }).join('');

    if (!ids.length) {
      return '<div class="page-head"><h2>我的错题库</h2><p>答错的题目会自动收录到这里，重练答对后自动移出</p></div>' +
        '<div class="card"><div class="empty"><div class="ic">✅</div><p>错题库是空的</p><p class="sm">去练习页做几轮题，答错的题会自动出现在这里</p>' +
        '<div style="margin-top:16px"><button class="btn btn-primary" id="btn-go-practice">开始练习</button></div></div></div>';
    }

    var list = items.map(function (q) {
      var w = d.wrong[q.id];
      var st = splitStem(q.stem);
      var optHtml = q.options.length ? '<div class="wrong-opts">' + q.options.map(function (o) {
        var isAns = (q.type === 'multiple') ? q.answer.indexOf(o.key) >= 0 : (o.key === q.answer);
        return '<div class="wrong-opt' + (isAns ? ' ans' : '') + '">' + o.key + '. ' + esc(o.text) + (isAns ? '　✓' : '') + '</div>';
      }).join('') + '</div>' : '';
      var ans = q.type === 'multiple' ? q.answer.join('、') : (q.type === 'short' ? esc(q.answer) : q.answer);
      var ansLine = '<div class="wrong-ans"><span class="lb">参考答案</span> ' + ans + '</div>';
      return '<div class="wrong-item">' +
        '<div class="wrong-head">' +
          '<span class="tag grey">' + esc(bank.sectionShort(q.section)) + ' ' + q.section + '-' + q.no + ' · ' + esc(Bank.typeLabel(q.type)) + '</span>' +
          '<span class="cnt">答错 ' + w.count + ' 次</span>' +
          '<span class="hi-date" style="font-size:12px;color:var(--text-3)">最近 ' + fmtDate(w.last) + '</span>' +
          '<span class="spacer"></span>' +
          '<button class="btn btn-outline btn-sm" data-single="' + q.id + '">单题重做</button>' +
          '<button class="btn btn-danger btn-sm" data-rm="' + q.id + '">移出</button>' +
        '</div>' +
        '<div class="wrong-stem">' + st.main + (st.sub ? '<br><span style="color:var(--text-2);font-size:13px">' + st.sub + '</span>' : '') + '</div>' +
        optHtml + ansLine +
        '</div>';
    }).join('');

    return '' +
      '<div class="page-head"><h2>我的错题库</h2><p>共 ' + ids.length + ' 道错题 · 重练答对后自动移出错题库</p></div>' +
      '<div class="filter-row">' + chips +
        '<span style="flex:1"></span>' +
        '<button class="btn btn-primary btn-sm" id="btn-redo-all">全部重练</button>' +
        '<button class="btn btn-danger btn-sm" id="btn-clear-wrong">清空错题库</button>' +
      '</div>' +
      '<div class="card">' + (items.length ? list : '<div class="empty" style="padding:40px"><p class="sm">该分类下暂无错题</p></div>') + '</div>';
  }

  function bindWrong() {
    var gp = $('#btn-go-practice');
    if (gp) gp.addEventListener('click', function () { go('practice'); });
    $$('[data-wf]').forEach(function (c) {
      c.addEventListener('click', function () { state.wrongFilter = c.getAttribute('data-wf'); render(); });
    });
    $$('[data-rm]').forEach(function (b) {
      b.addEventListener('click', function () {
        Store.removeWrong(state.user.name, String(b.getAttribute('data-rm')));
        toast('已移出错题库', 'ok'); render();
      });
    });
    $$('[data-single]').forEach(function (b) {
      b.addEventListener('click', function () {
        var q = cur().byId[b.getAttribute('data-single')];
        startPractice([q], '单题重做', false);
      });
    });
    var ra = $('#btn-redo-all');
    if (ra) ra.addEventListener('click', startWrongPractice);
    var cw = $('#btn-clear-wrong');
    if (cw) cw.addEventListener('click', function () {
      confirmBox('清空错题库', '将清空本题库的全部错题记录，此操作不可撤销。确定继续吗？', function () {
        Store.clearWrong(state.user.name); toast('错题库已清空', 'ok'); render();
      }, '清空');
    });
  }

  /* ============================================================
   * 个人中心
   * ========================================================== */
  function viewProfile() {
    var u = state.user;
    var d = storeData();
    var bank = cur();
    var practiced = 0, wrongN = 0;
    bank.questions.forEach(function (q) { if (d.records[q.id]) practiced++; if (d.wrong[q.id]) wrongN++; });
    var acc = d.stats.answered ? Math.round(d.stats.correct / d.stats.answered * 1000) / 10 : 0;
    var hist = d.history.length ? d.history.map(function (h) {
      return '<div class="hist-item"><span class="hi-mode">' + esc(h.mode) + ' · ' + esc(h.scope || '') + '</span>' +
        '<span class="hi-date">' + fmtDate(h.date) + '</span>' +
        '<span class="hi-score">' + h.correct + '/' + h.total + '</span></div>';
    }).join('') : '<div class="empty" style="padding:26px 10px"><p class="sm">暂无记录</p></div>';

    return '' +
      '<div class="page-head"><h2>个人中心</h2><p>账号信息、学习数据与备份管理（当前：' + esc(bank.title) + '）</p></div>' +
      '<div class="grid-2">' +
        '<div>' +
          '<div class="card card-pad" style="margin-bottom:16px">' +
            '<div class="card-title"><span>账号信息</span></div>' +
            '<div class="kv"><span class="k">用户名</span><span class="v">' + esc(u.name) + '</span></div>' +
            '<div class="kv"><span class="k">姓名 / 昵称</span><span class="v">' + esc(u.display || u.name) + '</span></div>' +
            '<div class="kv"><span class="k">注册时间</span><span class="v">' + fmtDate(u.created) + '</span></div>' +
            '<div class="kv"><span class="k">本库已练</span><span class="v">' + practiced + ' / ' + bank.total + ' 题</span></div>' +
            '<div class="kv"><span class="k">本库错题</span><span class="v">' + wrongN + ' 题</span></div>' +
            '<div class="kv"><span class="k">累计作答</span><span class="v">' + d.stats.answered + ' 次</span></div>' +
            '<div class="kv"><span class="k">累计正确率</span><span class="v">' + acc + '%</span></div>' +
          '</div>' +
          '<div class="card card-pad" style="margin-bottom:16px">' +
            '<div class="card-title"><span>修改密码</span></div>' +
            '<div class="form-inline">' +
              '<label>原密码<input type="password" id="pw-old" autocomplete="current-password"></label>' +
              '<label>新密码<input type="password" id="pw-new" autocomplete="new-password"></label>' +
              '<label>确认新密码<input type="password" id="pw-new2" autocomplete="new-password"></label>' +
            '</div>' +
            '<div class="form-msg" id="pw-msg"></div>' +
            '<button class="btn btn-primary" id="btn-chpw">保存新密码</button>' +
          '</div>' +
          '<div class="card card-pad">' +
            '<div class="card-title"><span>数据备份</span></div>' +
            '<p style="font-size:13px;color:var(--text-2);margin:0 0 4px;line-height:1.7">学习数据仅保存在当前浏览器（各题库独立）。更换设备、清理缓存前请先导出备份。</p>' +
            '<div class="btn-row">' +
              '<button class="btn btn-outline" id="btn-export">导出当前题库备份</button>' +
              '<button class="btn btn-outline" id="btn-import">导入备份</button>' +
              '<button class="btn btn-danger" id="btn-reset">清空本题库学习数据</button>' +
            '</div>' +
            '<input type="file" id="file-import" accept="application/json,.json" class="hidden">' +
          '</div>' +
        '</div>' +
        '<div><div class="card-title"><span>练习记录（' + esc(bank.title) + '，最近 30 条）</span></div><div class="card card-pad">' + hist + '</div></div>' +
      '</div>';
  }

  function bindProfile() {
    $('#btn-chpw').addEventListener('click', function () {
      var o = $('#pw-old').value, n = $('#pw-new').value, n2 = $('#pw-new2').value;
      var msg = $('#pw-msg'); msg.className = 'form-msg';
      if (n.length < 4) { msg.textContent = '新密码不少于 4 位'; return; }
      if (n !== n2) { msg.textContent = '两次输入的新密码不一致'; return; }
      Store.changePassword(state.user.name, o, n).then(function () {
        msg.className = 'form-msg ok'; msg.textContent = '密码已更新';
        $('#pw-old').value = $('#pw-new').value = $('#pw-new2').value = '';
        toast('密码修改成功', 'ok');
      }).catch(function (e) { msg.textContent = e.message; });
    });

    $('#btn-export').addEventListener('click', function () {
      var payload = Store.exportData(state.user.name);
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = PLATFORM + '-' + state.bank + '-' + state.user.name + '-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      toast('备份文件已导出', 'ok');
    });

    $('#btn-import').addEventListener('click', function () { $('#file-import').click(); });
    $('#file-import').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var p = JSON.parse(fr.result);
          if (p.bank && p.bank !== state.bank) {
            confirmBox('题库不匹配', '该备份来自其它题库（标识 ' + p.bank + '），与当前所选题库不一致。仍导入到当前题库吗？', function () {
              Store.importData(state.user.name, p); toast('备份已导入（注意题库标识）', 'ok'); render();
            }, '导入');
            return;
          }
          Store.importData(state.user.name, p);
          toast('备份已导入', 'ok');
          render();
        } catch (err) { toast('导入失败：' + err.message, 'err'); }
      };
      fr.readAsText(f);
      e.target.value = '';
    });

    $('#btn-reset').addEventListener('click', function () {
      confirmBox('清空学习数据',
        '将清空 <b>' + esc(state.user.name) + '</b> 在「' + esc(cur().title) + '」的答题记录、错题库与收藏。此操作不可撤销。',
        function () { Store.resetProgress(state.user.name); toast('学习数据已清空', 'ok'); go('dashboard'); }, '确认清空');
    });
  }

  /* ============================================================
   * 启动
   * ========================================================== */
  function enterApp() {
    state.user = Store.currentUser();
    if (!state.user) return;
    $('#auth-view').classList.add('hidden');
    $('#app-view').classList.remove('hidden');
    $('#cur-user-name').textContent = state.user.display || state.user.name;
    state.session = null;
    state.bank = null;
    go('bankselect');
  }

  function boot() {
    var loaded = Bank.keys().some(function (k) { return Bank.get(k).ok; });
    if (!loaded) {
      document.body.innerHTML = '<div style="padding:60px;text-align:center;font-family:sans-serif">题库数据加载失败，请检查 data 目录下 4 个数据文件是否齐全</div>';
      return;
    }
    var u = Store.currentUser();
    if (u) enterApp();
    else {
      $('#auth-view').classList.remove('hidden');
      $('#app-view').classList.add('hidden');
      var users = Store.listUsers();
      if (!Object.keys(users).length) {
        $('[data-authtab="register"]').click();
      }
    }
  }

  boot();
})();
