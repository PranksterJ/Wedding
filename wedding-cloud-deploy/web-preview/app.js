// app.js - 黄怡 ❤ 金纬 婚礼点歌系统交互逻辑 (已升级支持服务端云端/公网同步)

const ADMIN_PASSWORD = '19951998'; // 管理员登录密码（对宾客保密）

const STORAGE_KEY = 'WEDDING_HY_JW_SONGS_STORE_V2';

class WeddingApp {
  constructor() {
    this.songs = [];
    this.currentGuestTab = 'hot';
    this.guestSearchQuery = '';
    this.currentAdminFilter = 'all';
    this.adminSearchQuery = '';
    this.adminPasscodeValue = '';
    this.upvotedKeys = JSON.parse(localStorage.getItem('WEDDING_UPVOTED') || '{}');

    this.initDOMElements();
    this.bindEvents();

    // 首次拉取服务端数据并启动自动静默轮询 (每8秒刷新一次最新歌单)
    this.fetchSongsFromServer();
    this.startPolling();
  }

  initDOMElements() {
    this.guestPage = document.getElementById('guestPage');
    this.adminPage = document.getElementById('adminPage');

    // 宾客端控件
    this.songForm = document.getElementById('songForm');
    this.songTitleInput = document.getElementById('songTitleInput');
    this.artistInput = document.getElementById('artistInput');
    this.remarkInput = document.getElementById('remarkInput');
    this.guestInfoInput = document.getElementById('guestInfoInput');
    this.btnClearTitle = document.getElementById('btnClearTitle');
    this.totalSongsBadge = document.getElementById('totalSongsBadge');
    this.tabHot = document.getElementById('tabHot');
    this.tabLatest = document.getElementById('tabLatest');
    this.guestSearchInput = document.getElementById('guestSearchInput');
    this.guestSongStream = document.getElementById('guestSongStream');
    this.btnTriggerAdminModal = document.getElementById('btnTriggerAdminModal');

    // 管理端控件
    this.btnAdminReturnGuest = document.getElementById('btnAdminReturnGuest');
    this.kpiTotalRequests = document.getElementById('kpiTotalRequests');
    this.kpiUniqueSongs = document.getElementById('kpiUniqueSongs');
    this.kpiSelectedCount = document.getElementById('kpiSelectedCount');
    this.kpiPlayedCount = document.getElementById('kpiPlayedCount');
    this.btnExportDJ = document.getElementById('btnExportDJ');
    this.adminFilterChips = document.querySelectorAll('.filter-chip-row .chip');
    this.adminSearchInput = document.getElementById('adminSearchInput');
    this.adminSongStream = document.getElementById('adminSongStream');

    // 弹窗
    this.successModal = document.getElementById('successModal');
    this.modalSongName = document.getElementById('modalSongName');
    this.btnCloseSuccessModal = document.getElementById('btnCloseSuccessModal');

    this.adminPassModal = document.getElementById('adminPassModal');
    this.adminPasscode = document.getElementById('adminPasscode');
    this.btnCancelPassModal = document.getElementById('btnCancelPassModal');
    this.btnConfirmPasscode = document.getElementById('btnConfirmPasscode');

    this.toastTip = document.getElementById('toastTip');
  }

  bindEvents() {
    // 标题清空按钮
    if (this.songTitleInput) {
      this.songTitleInput.addEventListener('input', () => {
        this.btnClearTitle.style.display = this.songTitleInput.value ? 'block' : 'none';
      });
    }
    if (this.btnClearTitle) {
      this.btnClearTitle.addEventListener('click', () => {
        this.songTitleInput.value = '';
        this.btnClearTitle.style.display = 'none';
        this.songTitleInput.focus();
      });
    }

    // 提交点歌
    if (this.songForm) {
      this.songForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSubmitSong();
      });
    }

    // 宾客 Tab 切换
    if (this.tabHot) {
      this.tabHot.addEventListener('click', () => {
        this.currentGuestTab = 'hot';
        this.tabHot.classList.add('active');
        this.tabLatest.classList.remove('active');
        this.renderGuestList();
      });
    }
    if (this.tabLatest) {
      this.tabLatest.addEventListener('click', () => {
        this.currentGuestTab = 'latest';
        this.tabLatest.classList.add('active');
        this.tabHot.classList.remove('active');
        this.renderGuestList();
      });
    }

    // 宾客搜索
    if (this.guestSearchInput) {
      this.guestSearchInput.addEventListener('input', (e) => {
        this.guestSearchQuery = e.target.value.trim().toLowerCase();
        this.renderGuestList();
      });
    }

    // 成功弹窗关闭
    if (this.btnCloseSuccessModal) {
      this.btnCloseSuccessModal.addEventListener('click', () => {
        this.successModal.classList.remove('active');
      });
    }

    // 管理员登录弹窗唤起与校验
    if (this.btnTriggerAdminModal) {
      this.btnTriggerAdminModal.addEventListener('click', () => {
        this.adminPasscode.value = '';
        this.adminPassModal.classList.add('active');
        setTimeout(() => this.adminPasscode.focus(), 150);
      });
    }

    if (this.btnCancelPassModal) {
      this.btnCancelPassModal.addEventListener('click', () => {
        this.adminPassModal.classList.remove('active');
      });
    }

    if (this.btnConfirmPasscode) {
      this.btnConfirmPasscode.addEventListener('click', () => {
        this.verifyAdminLogin();
      });
    }

    // 支持回车直接提交密码
    if (this.adminPasscode) {
      this.adminPasscode.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
          this.verifyAdminLogin();
        }
      });
    }

    // 管理端返回宾客端
    if (this.btnAdminReturnGuest) {
      this.btnAdminReturnGuest.addEventListener('click', () => {
        this.switchView('guest');
      });
    }

    // 管理端状态筛选
    if (this.adminFilterChips) {
      this.adminFilterChips.forEach(chip => {
        chip.addEventListener('click', () => {
          this.adminFilterChips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          this.currentAdminFilter = chip.dataset.filter;
          this.renderAdminList();
        });
      });
    }

    // 管理端搜索
    if (this.adminSearchInput) {
      this.adminSearchInput.addEventListener('input', (e) => {
        this.adminSearchQuery = e.target.value.trim().toLowerCase();
        this.renderAdminList();
      });
    }

    // 导出 DJ 歌单
    if (this.btnExportDJ) {
      this.btnExportDJ.addEventListener('click', () => this.handleExportDJ());
    }
  }

  // 从服务端获取最新歌单
  async fetchSongsFromServer() {
    try {
      const res = await fetch('/api/songs');
      if (res.ok) {
        const json = await res.json();
        if (json.code === 0 && Array.isArray(json.data)) {
          this.songs = json.data;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.songs));
          this.render();
          return;
        }
      }
    } catch (e) {
      console.warn('服务端连接暂不可用，使用本地缓存 fallback:', e);
    }

    // 本地缓存降级
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        this.songs = JSON.parse(cached);
        this.render();
      } catch (err) {}
    }
  }

  startPolling() {
    setInterval(() => {
      // 只要不在输入框打字就默默同步
      const isTyping = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
      if (!isTyping) {
        this.fetchSongsFromServer();
      }
    }, 8000);
  }

  // 验证管理员密码
  verifyAdminLogin() {
    const code = this.adminPasscode.value.trim();
    if (code === ADMIN_PASSWORD) {
      this.adminPasscodeValue = code;
      this.adminPassModal.classList.remove('active');
      this.switchView('admin');
      this.showToast('欢迎黄怡 ❤ 金纬进入管理后台 ✨');
    } else {
      this.showToast('密码不正确，请重新输入');
    }
  }

  switchView(viewName) {
    if (viewName === 'guest') {
      this.guestPage.classList.add('active');
      this.adminPage.classList.remove('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      this.adminPage.classList.add('active');
      this.guestPage.classList.remove('active');
      this.renderAdminDashboard();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  showToast(msg) {
    if (!this.toastTip) return;
    this.toastTip.textContent = msg;
    this.toastTip.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.toastTip.classList.remove('show');
    }, 2400);
  }

  async handleSubmitSong() {
    const title = this.songTitleInput.value.trim();
    const artist = this.artistInput.value.trim();
    const remark = this.remarkInput.value.trim();
    const guestInfo = this.guestInfoInput ? this.guestInfoInput.value.trim() : '';

    if (!title) {
      this.showToast('请输入想听的歌曲名称哦');
      return;
    }
    if (!artist) {
      this.showToast('请输入歌手名称哦');
      return;
    }
    if (!guestInfo) {
      this.showToast('请填写您的信息（例如：姓名/我和新人的关系）哦');
      return;
    }

    try {
      const res = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, artist, remark, guestInfo })
      });
      const data = await res.json();
      if (data.code === 0) {
        this.songs = data.data;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.songs));
      }
    } catch (e) {
      console.warn('API提交失败，暂存本地');
    }

    // 弹出浪漫祝贺弹窗
    this.modalSongName.textContent = `《${title}》 - ${artist}`;
    this.successModal.classList.add('active');

    // 清空表单
    this.songTitleInput.value = '';
    this.artistInput.value = '';
    this.remarkInput.value = '';
    if (this.guestInfoInput) this.guestInfoInput.value = '';
    this.btnClearTitle.style.display = 'none';

    this.render();
  }

  async handleUpvote(songKey) {
    if (this.upvotedKeys[songKey]) {
      this.showToast('您已经为这首歌点播过啦~');
      return;
    }

    this.upvotedKeys[songKey] = true;
    localStorage.setItem('WEDDING_UPVOTED', JSON.stringify(this.upvotedKeys));

    try {
      await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upvote', songKey })
      });
      this.fetchSongsFromServer();
    } catch (e) {}

    this.showToast('心愿 +1 成功！💖');
    this.render();
  }

  async handleUpdateStatus(songKey, newStatus) {
    try {
      const res = await fetch('/api/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passcode: this.adminPasscodeValue || ADMIN_PASSWORD,
          songKey,
          status: newStatus
        })
      });
      const data = await res.json();
      if (data.code === 0) {
        this.songs = data.data;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.songs));
        this.showToast('歌曲状态已更新 ✨');
        this.render();
        return;
      } else {
        this.showToast(data.message || '更新失败');
      }
    } catch (e) {
      this.showToast('网络请求失败');
    }
  }

  handleExportDJ() {
    const selected = this.songs.filter(s => s.status === 'selected' || s.status === 'played');
    if (selected.length === 0) {
      this.showToast('暂无已入选歌曲，请先选入几首歌');
      return;
    }

    let text = `🎵 ═════════════════════════════\n   黄怡 ❤ 金纬 · 婚礼精选DJ歌单\n   东郊宾馆紫金厅 · 2026.11.14\n═════════════════════════════\n\n`;
    selected.forEach((song, i) => {
      const num = (i + 1 < 10 ? '0' : '') + (i + 1);
      const playedMark = song.status === 'played' ? ' [✓已播放]' : '';
      text += `${num}. 《${song.songTitle}》 - ${song.artist}\n   ✦ 点播热度: ${song.requestCount} 位宾客喜欢${playedMark}\n`;
      if (song.guestInfo) {
        text += `   ✦ 点播人: ${song.guestInfo}\n`;
      }
      if (song.remark) {
        text += `   ✦ 宾客留言: "${song.remark}"\n`;
      }
      text += `\n`;
    });
    text += `═════════════════════════════\n祝新郎金纬、新娘黄怡百年好合，永结同心！\n`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.showToast('📋 DJ 歌单已复制到剪贴板！可以直接粘贴发微信');
      }).catch(() => {
        prompt('请复制以下歌单文本：', text);
      });
    } else {
      prompt('请复制以下歌单文本：', text);
    }
  }

  render() {
    this.renderGuestList();
    this.renderAdminDashboard();
  }

  renderGuestList() {
    let list = this.songs.filter(s => s.status !== 'hidden');

    if (this.guestSearchQuery) {
      list = list.filter(s => 
        s.songTitle.toLowerCase().includes(this.guestSearchQuery) ||
        s.artist.toLowerCase().includes(this.guestSearchQuery) ||
        (s.guestInfo && s.guestInfo.toLowerCase().includes(this.guestSearchQuery))
      );
    }

    if (this.currentGuestTab === 'hot') {
      list.sort((a, b) => (b.requestCount || 1) - (a.requestCount || 1));
    } else {
      list.sort((a, b) => b.createdAt - a.createdAt);
    }

    if (this.totalSongsBadge) {
      this.totalSongsBadge.textContent = `${list.length} 首心愿曲`;
    }

    if (list.length === 0) {
      this.guestSongStream.innerHTML = `
        <div class="wedding-card" style="text-align: center; padding: 40px 20px;">
          <div style="font-size: 38px; margin-bottom: 10px;">🎼</div>
          <div style="font-size: 16px; font-weight: 700; color: var(--text-main);">歌单里还没有这首歌</div>
          <div style="font-size: 13px; color: var(--text-muted); margin-top: 6px;">快成为第一个为新人点播它的人吧！</div>
        </div>
      `;
      return;
    }

    let html = '';
    list.forEach((song, idx) => {
      let rankClass = '';
      let rankText = (idx + 1 < 10 ? '0' : '') + (idx + 1);
      if (this.currentGuestTab === 'hot') {
        if (idx === 0) { rankClass = 'rank-top-1'; rankText = '👑'; }
        else if (idx === 1) { rankClass = 'rank-top-2'; rankText = '🥈'; }
        else if (idx === 2) { rankClass = 'rank-top-3'; rankText = '🥉'; }
      }

      const hasUpvoted = !!this.upvotedKeys[song.songKey];

      let statusBadge = '';
      if (song.status === 'selected') {
        statusBadge = `<span class="tag-badge tag-selected">已入选晚宴</span>`;
      } else if (song.status === 'played') {
        statusBadge = `<span class="tag-badge tag-played">已播放</span>`;
      }

      let guestInfoHtml = '';
      if (song.guestInfo) {
        guestInfoHtml = `
          <div style="font-size: 11.5px; color: var(--palace-gold-dark); margin-top: 4px; display: flex; align-items: center; gap: 4px;">
            <span>👤 点播人:</span>
            <strong>${song.guestInfo}</strong>
          </div>
        `;
      }

      let remarkHtml = '';
      if (song.remark) {
        remarkHtml = `
          <div class="song-remark-text">
            <span>💬 "${song.remark}"</span>
          </div>
        `;
      }

      html += `
        <div class="wedding-card song-item-card">
          <div class="song-main-row">
            <div class="rank-badge ${rankClass}">${rankText}</div>
            <div class="song-details">
              <div class="song-header-line">
                <span class="song-name">${song.songTitle}</span>
                ${statusBadge}
              </div>
              <div class="song-singer">
                <span>🎤</span>
                <span>${song.artist || '现场点播'}</span>
              </div>
              ${guestInfoHtml}
              ${remarkHtml}
            </div>
          </div>

          <div class="song-action-row">
            <div class="vote-count-label">
              <span class="vote-number">${song.requestCount || 1}</span>
              <span class="vote-text">次点播</span>
            </div>
            <button 
              type="button" 
              class="btn-upvote ${hasUpvoted ? 'upvoted' : ''}" 
              data-key="${song.songKey}"
            >
              <span>${hasUpvoted ? '💖' : '🤍'}</span>
              <span>${hasUpvoted ? '已想听' : '+1 我也想听'}</span>
            </button>
          </div>
        </div>
      `;
    });

    this.guestSongStream.innerHTML = html;

    // 绑定 +1 点击
    this.guestSongStream.querySelectorAll('.btn-upvote').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const key = e.currentTarget.dataset.key;
        this.handleUpvote(key);
      });
    });
  }

  renderAdminDashboard() {
    const totalRequests = this.songs.reduce((sum, s) => sum + (s.requestCount || 1), 0);
    const uniqueSongs = this.songs.length;
    const selectedCount = this.songs.filter(s => s.status === 'selected').length;
    const playedCount = this.songs.filter(s => s.status === 'played').length;

    if (this.kpiTotalRequests) this.kpiTotalRequests.textContent = totalRequests;
    if (this.kpiUniqueSongs) this.kpiUniqueSongs.textContent = uniqueSongs;
    if (this.kpiSelectedCount) this.kpiSelectedCount.textContent = selectedCount;
    if (this.kpiPlayedCount) this.kpiPlayedCount.textContent = playedCount;

    this.renderAdminList();
  }

  renderAdminList() {
    let list = [...this.songs];

    if (this.currentAdminFilter !== 'all') {
      list = list.filter(s => s.status === this.currentAdminFilter);
    }

    if (this.adminSearchQuery) {
      list = list.filter(s => 
        s.songTitle.toLowerCase().includes(this.adminSearchQuery) ||
        s.artist.toLowerCase().includes(this.adminSearchQuery) ||
        (s.guestInfo && s.guestInfo.toLowerCase().includes(this.adminSearchQuery)) ||
        (s.remark && s.remark.toLowerCase().includes(this.adminSearchQuery))
      );
    }

    list.sort((a, b) => (b.requestCount || 1) - (a.requestCount || 1));

    if (list.length === 0) {
      this.adminSongStream.innerHTML = `
        <div class="wedding-card" style="text-align: center; padding: 36px 20px;">
          <div style="font-size: 34px; margin-bottom: 8px;">📂</div>
          <div style="font-size: 14px; color: var(--text-muted);">暂无对应状态的歌曲</div>
        </div>
      `;
      return;
    }

    let html = '';
    list.forEach(song => {
      let statusTag = '';
      if (song.status === 'selected') {
        statusTag = `<span class="status-tag status-selected">🌟 已入选晚宴</span>`;
      } else if (song.status === 'played') {
        statusTag = `<span class="status-tag status-played">✅ 已播放</span>`;
      } else if (song.status === 'hidden') {
        statusTag = `<span class="status-tag status-hidden">🚫 已隐藏</span>`;
      } else {
        statusTag = `<span class="status-tag status-public">⏳ 待选曲</span>`;
      }

      let guestInfoLine = song.guestInfo ? `<span>·</span><span style="color: var(--palace-gold-dark);">👤 点播人: <strong>${song.guestInfo}</strong></span>` : '';

      let remarkHtml = '';
      if (song.remark) {
        remarkHtml = `
          <div class="admin-remark-box">
            <strong style="color: var(--rose-royal);">💌 宾客留言:</strong> "${song.remark}"
          </div>
        `;
      }

      let buttonsHtml = '';
      if (song.status !== 'selected' && song.status !== 'played') {
        buttonsHtml += `<button class="act-btn act-select" data-action="selected" data-key="${song.songKey}">🌟 选入晚宴</button>`;
      }
      if (song.status === 'selected') {
        buttonsHtml += `<button class="act-btn act-played" data-action="played" data-key="${song.songKey}">✅ 标记已播放</button>`;
        buttonsHtml += `<button class="act-btn act-remove" data-action="public" data-key="${song.songKey}">移出歌单</button>`;
      }
      if (song.status === 'played') {
        buttonsHtml += `<button class="act-btn act-rewind" data-action="selected" data-key="${song.songKey}">↩ 撤回未播放</button>`;
      }
      if (song.status !== 'hidden') {
        buttonsHtml += `<button class="act-btn act-hide" data-action="hidden" data-key="${song.songKey}">🚫 隐藏</button>`;
      } else {
        buttonsHtml += `<button class="act-btn act-restore" data-action="public" data-key="${song.songKey}">恢复公开</button>`;
      }

      html += `
        <div class="wedding-card admin-card">
          <div class="admin-card-head">
            <span class="admin-song-name">《${song.songTitle}》</span>
            ${statusTag}
          </div>
          <div class="admin-song-meta">
            <span>歌手: ${song.artist}</span>
            <span>·</span>
            <span class="highlight-count">${song.requestCount} 位宾客点播</span>
            ${guestInfoLine}
          </div>
          ${remarkHtml}
          <div class="btn-actions-grid">
            ${buttonsHtml}
          </div>
        </div>
      `;
    });

    this.adminSongStream.innerHTML = html;

    this.adminSongStream.querySelectorAll('.act-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const key = e.currentTarget.dataset.key;
        const action = e.currentTarget.dataset.action;
        this.handleUpdateStatus(key, action);
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new WeddingApp();
});
