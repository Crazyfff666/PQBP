/* ============================================================
 * store.js — 本地数据层（多题库版）
 * 账号、密码哈希全局共享；答题进度 / 错题库 / 收藏 / 考试记录按"题库 + 用户"隔离存储
 * ============================================================ */
(function (global) {
  'use strict';

  var K_USERS = 'pqqz.users';
  var K_SESSION = 'pqqz.session';
  var K_BANK = 'pqqz.currentBank';        // 记住上次选用的题库 key
  var K_DATA = 'pqqz.data.';             // + bank + '.' + username

  /* ---------- 基础读写 ---------- */
  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      console.error('存储失败', e);
      return false;
    }
  }

  /* ---------- 题库（bank）切换 ---------- */
  var currentBank = 'djtk';
  function setBank(bank) {
    if (!bank) bank = 'djtk';
    currentBank = bank;
    write(K_BANK, currentBank);
  }
  function getBank() {
    var b = read(K_BANK, null);
    return b || 'djtk';
  }

  /* ---------- 密码哈希 ---------- */
  function fallbackHash(str) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      h1 = (h1 ^ c) >>> 0;
      h1 = (h1 * 16777619) >>> 0;
      h2 = ((h2 << 5) - h2 + c) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  }

  function hashPassword(password, salt) {
    var payload = salt + '::' + password + '::pqqz';
    if (global.crypto && global.crypto.subtle && global.TextEncoder) {
      return global.crypto.subtle
        .digest('SHA-256', new TextEncoder().encode(payload))
        .then(function (buf) {
          return Array.prototype.map
            .call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); })
            .join('');
        })
        .catch(function () { return 'fb:' + fallbackHash(payload); });
    }
    return Promise.resolve('fb:' + fallbackHash(payload));
  }

  function randomSalt() {
    if (global.crypto && global.crypto.getRandomValues) {
      var a = new Uint8Array(12);
      global.crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    }
    return String(Date.now()) + Math.random().toString(16).slice(2);
  }

  /* ---------- 用户默认数据结构（每个"题库 + 用户"一份） ---------- */
  function blankData() {
    return {
      stats: { answered: 0, correct: 0, sessions: 0 },
      records: {},   // questionId -> {t,c,last,lastOk}
      wrong: {},     // questionId -> {count,since,last,fixed}
      favorites: [],
      exams: [],     // {date,total,correct,score,duration}
      history: []    // {date,mode,scope,total,correct}
    };
  }

  function dataKey(name) {
    return K_DATA + currentBank + '.' + name;
  }

  /* ---------- Store ---------- */
  var Store = {
    bank: currentBank,

    /* --- 题库切换 --- */
    setBank: setBank,
    getBank: getBank,
    resetBank: function () { currentBank = getBank(); },

    /* --- 用户管理 --- */
    listUsers: function () { return read(K_USERS, {}); },

    userExists: function (name) {
      return Object.prototype.hasOwnProperty.call(this.listUsers(), name);
    },

    register: function (name, displayName, password) {
      var self = this;
      var users = this.listUsers();
      if (users[name]) return Promise.reject(new Error('该用户名已被注册'));
      var salt = randomSalt();
      return hashPassword(password, salt).then(function (hash) {
        users[name] = {
          name: name,
          display: displayName || name,
          salt: salt,
          hash: hash,
          created: Date.now()
        };
        write(K_USERS, users);
        write(dataKey(name), blankData());
        self.setSession(name);
        return users[name];
      });
    },

    login: function (name, password) {
      var self = this;
      var users = this.listUsers();
      var u = users[name];
      if (!u) return Promise.reject(new Error('用户不存在，请先注册'));
      return hashPassword(password, u.salt).then(function (hash) {
        if (hash !== u.hash) throw new Error('密码不正确');
        self.setSession(name);
        return u;
      });
    },

    changePassword: function (name, oldPass, newPass) {
      var users = this.listUsers();
      var u = users[name];
      if (!u) return Promise.reject(new Error('用户不存在'));
      return hashPassword(oldPass, u.salt).then(function (h) {
        if (h !== u.hash) throw new Error('原密码不正确');
        var salt = randomSalt();
        return hashPassword(newPass, salt).then(function (nh) {
          u.salt = salt; u.hash = nh;
          users[name] = u;
          write(K_USERS, users);
          return true;
        });
      });
    },

    setSession: function (name) { write(K_SESSION, { user: name, at: Date.now() }); },
    getSession: function () { return read(K_SESSION, null); },
    logout: function () { localStorage.removeItem(K_SESSION); },

    currentUser: function () {
      var s = this.getSession();
      if (!s) return null;
      var u = this.listUsers()[s.user];
      return u || null;
    },

    /* --- 个人数据（按 当前题库 + 用户 隔离） --- */
    getData: function (name) {
      var d = read(dataKey(name), null);
      if (!d) { d = blankData(); write(dataKey(name), d); }
      var base = blankData();
      for (var k in base) if (!(k in d)) d[k] = base[k];
      return d;
    },

    saveData: function (name, data) { return write(dataKey(name), data); },

    recordAnswer: function (name, qid, isCorrect) {
      var d = this.getData(name);
      var r = d.records[qid] || { t: 0, c: 0, last: 0, lastOk: false };
      r.t += 1;
      if (isCorrect) r.c += 1;
      r.last = Date.now();
      r.lastOk = !!isCorrect;
      d.records[qid] = r;
      d.stats.answered += 1;
      if (isCorrect) d.stats.correct += 1;
      if (!isCorrect) {
        var w = d.wrong[qid] || { count: 0, since: Date.now(), last: 0, fixed: 0 };
        w.count += 1;
        w.last = Date.now();
        w.fixed = 0;
        d.wrong[qid] = w;
      } else if (d.wrong[qid]) {
        d.wrong[qid].fixed = (d.wrong[qid].fixed || 0) + 1;
        d.wrong[qid].last = Date.now();
      }
      this.saveData(name, d);
      return d;
    },

    removeWrong: function (name, qid) {
      var d = this.getData(name);
      delete d.wrong[qid];
      this.saveData(name, d);
      return d;
    },

    clearWrong: function (name) {
      var d = this.getData(name);
      d.wrong = {};
      this.saveData(name, d);
      return d;
    },

    toggleFavorite: function (name, qid) {
      var d = this.getData(name);
      var i = d.favorites.indexOf(qid);
      if (i >= 0) d.favorites.splice(i, 1); else d.favorites.push(qid);
      this.saveData(name, d);
      return d.favorites.indexOf(qid) >= 0;
    },

    pushHistory: function (name, entry) {
      var d = this.getData(name);
      d.history.unshift(entry);
      d.history = d.history.slice(0, 30);
      d.stats.sessions += 1;
      this.saveData(name, d);
    },

    pushExam: function (name, entry) {
      var d = this.getData(name);
      d.exams.unshift(entry);
      d.exams = d.exams.slice(0, 30);
      this.saveData(name, d);
    },

    resetProgress: function (name) {
      write(dataKey(name), blankData());
    },

    /* --- 导入导出（含题库标识，便于换设备迁移） --- */
    exportData: function (name) {
      var u = this.listUsers()[name];
      return {
        app: '考试习题平台',
        bank: currentBank,
        version: 1,
        exportedAt: new Date().toISOString(),
        user: { name: u.name, display: u.display },
        data: this.getData(name)
      };
    },

    importData: function (name, payload) {
      if (!payload || !payload.data) throw new Error('文件格式不正确');
      var base = blankData();
      var d = payload.data;
      for (var k in base) if (!(k in d)) d[k] = base[k];
      this.saveData(name, d);
      return d;
    }
  };

  global.Store = Store;
})(window);
