/**
 * Live 9:16 Client Controller — Chánh Điện Đức Phật A Di Đà & Đạo Tràng Phật Tử Quỳ Lễ
 * - Hiển thị 6 Đệm Quỳ VIP (Top 6 Bảng Vàng Công Đức)
 * - Hiển thị 40 Phật Tử mặc áo lam quỳ hai bên thảm đỏ + thẻ tên người xem
 * - Hiệu ứng người xem bước dọc thảm đỏ lên trước Lư Hương Đồng dâng hương
 * - Giọng đọc ZeroTTS (Mai Chi) + Pháp khí Web Audio
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  if (params.get('obs') === '1') {
    document.body.classList.add('obs-mode');
  }

  // 1. Tự động co giãn khung 1080x1920 vừa khít Stage Wrapper (9:16)
  const stageWrapper = document.getElementById('stageWrapper');
  const stage9x16 = document.getElementById('stage9x16');

  let fitStageRaf = null;
  function fitStage() {
    if (!stageWrapper || !stage9x16) return;
    if (fitStageRaf) return;
    fitStageRaf = requestAnimationFrame(() => {
      fitStageRaf = null;
      const w = stageWrapper.clientWidth;
      const h = stageWrapper.clientHeight;
      if (w > 0 && h > 0) {
        const scale = Math.min(w / 1080, h / 1920);
        stage9x16.style.transform = `translate3d(0, 0, 0) scale(${scale})`;
      }
    });
  }

  if (typeof ResizeObserver !== 'undefined' && stageWrapper) {
    const stageObserver = new ResizeObserver(fitStage);
    stageObserver.observe(stageWrapper);
  } else {
    window.addEventListener('resize', fitStage, { passive: true });
  }
  fitStage();

  // 2. Khởi tạo Particle Engine & Audio Engine (ZeroTTS Mai Chi)
  const canvas = document.getElementById('templeCanvas');
  const particles = new window.TempleParticleEngine(canvas);
  const audio = new window.TempleAudioEngine();
  window.__templeAudio = audio;
  window.audio = audio;

  function unlockAudioOnce() {
    audio.ensureContext();
    if (typeof audio.unlockTtsAudio === 'function') {
      audio.unlockTtsAudio();
    }
    if (audio.bgMusicEnabled) {
      audio.startZenAmbience();
    }
    const btnUnlock = document.getElementById('btnUnlockAudio');
    if (btnUnlock) {
      btnUnlock.textContent = '✅ Âm Thanh Chùa Đã Sẵn Sàng';
      btnUnlock.classList.remove('gold');
      btnUnlock.classList.add('active-toggle');
    }
  }
  window.addEventListener('pointerdown', unlockAudioOnce, { once: true });
  document.getElementById('btnUnlockAudio')?.addEventListener('click', unlockAudioOnce);

  // 3. Vẽ các nén nhang đang cháy trong Lư Hương Đỉnh Đồng (x=540, y=895)
  const incenseHolder = document.getElementById('incenseSticksHolder');
  let renderedStickCount = 0;

  function renderIncenseSticks(count) {
    const target = Math.max(3, Math.min(27, Number(count) || 9));
    if (target === renderedStickCount && incenseHolder.children.length > 0) return;
    renderedStickCount = target;
    incenseHolder.innerHTML = '';

    const tips = [];
    for (let i = 0; i < target; i++) {
      const stick = document.createElement('div');
      stick.className = 'incense-stick';

      const spread = target === 1 ? 0 : (i / (target - 1) - 0.5) * 2;
      const leftPx = 65 + spread * 28 + Math.sin(i * 2.1) * 2;
      const angleDeg = spread * 12 + Math.cos(i * 1.5) * 1.5;
      const heightPx = 76 + (i % 3) * 6;

      stick.style.left = `${leftPx}px`;
      stick.style.height = `${heightPx}px`;
      stick.style.transform = `rotate(${angleDeg}deg)`;

      const ember = document.createElement('div');
      ember.className = 'incense-ember';
      ember.style.animationDelay = `${(i * 0.15) % 1.1}s`;
      stick.appendChild(ember);
      incenseHolder.appendChild(stick);

      const rad = (angleDeg * Math.PI) / 180;
      const tipX = 540 + (leftPx - 65) + Math.sin(rad) * heightPx;
      const tipY = 895 - Math.cos(rad) * heightPx;
      tips.push({ x: tipX, y: tipY });
    }
    particles.setIncenseTips(tips);
  }

  // 4. Dựng Hàng 6 Đệm Quỳ VIP (Top 6 Thí Chủ trên bục gỗ y=1188)
  const activeDevoteeKeys = new Set();
  let activeAltarUserKey = null;
  let activeAltarSeatType = null;
  let activeAltarSeatIdx = null;
  let activeAltarSeatEl = null;

  const VIP_CUSHION_COORDS = [
    { x: 140, y: 1188, rank: 1 },
    { x: 268, y: 1188, rank: 2 },
    { x: 392, y: 1188, rank: 3 },
    { x: 688, y: 1188, rank: 4 },
    { x: 812, y: 1188, rank: 5 },
    { x: 940, y: 1188, rank: 6 }
  ];

  let lastVipSig = '';
  function renderVipCushions(leaderboard = [], force = false) {
    const layer = document.getElementById('vipCushionsLayer');
    if (!layer) return;

    const sig = leaderboard.slice(0, 6).map((d) => `${d.name}_${d.merit}`).join('|');
    if (!force && sig === lastVipSig && layer.children.length > 0) {
      layer.querySelectorAll('.vip-devotee-slot').forEach((el) => {
        const uKey = (el.dataset.userKey || '').toLowerCase();
        const uName = (el.dataset.userName || '').toLowerCase();
        const isAtAltar = Boolean(
          (activeAltarSeatType === 'vip' &&
            activeAltarUserKey &&
            (uKey === activeAltarUserKey || uName === activeAltarUserKey)) ||
          activeDevoteeKeys.has(uKey) ||
          activeDevoteeKeys.has(uName)
        );
        el.classList.toggle('devotee-at-altar', isAtAltar);
      });
      return;
    }
    lastVipSig = sig;

    layer.innerHTML = VIP_CUSHION_COORDS.map((slot, idx) => {
      const dev = leaderboard[idx];
      if (!dev) return '';
      const userKey = (dev.uniqueId || dev.name || '').toLowerCase();
      const userName = dev.name || '';
      const isAtAltar = Boolean(
        (activeAltarSeatType === 'vip' &&
          (activeAltarSeatIdx === idx ||
            (activeAltarUserKey && (userKey === activeAltarUserKey || userName.toLowerCase() === activeAltarUserKey)))) ||
        activeDevoteeKeys.has(userKey) ||
        activeDevoteeKeys.has(userName.toLowerCase())
      );
      return `
        <div class="vip-devotee-slot ${isAtAltar ? 'devotee-at-altar' : ''}" data-seat-idx="${idx}" data-user-key="${escapeHtml(userKey)}" data-user-name="${escapeHtml(userName)}" style="left: ${slot.x}px; top: ${slot.y}px; z-index: ${12 + idx};">
          <div class="vip-rank-pill">
            <span class="vip-rank-num">${slot.rank}</span>
            <span class="vip-rank-name">${escapeHtml(userName)}</span>
          </div>
          <img src="/assets/devotee.png" alt="VIP Devotee" class="devotee-sprite" style="animation-delay: ${((idx * 0.55) % 3.6).toFixed(2)}s;" />
        </div>
      `;
    }).join('');
  }

  // 5. Dựng Đạo Tràng 96 Phật Tử Quỳ Lễ Hai Bên Thảm Đỏ (12 Hàng x 4 Cột mỗi bên)
  const congregationHall = document.getElementById('congregationHall');
  const HALL_SEAT_COORDS = [];

  (function buildHallGrid() {
    const rows = 12; // 12 hàng (8 hàng cũ + 4 hàng mới phía sau Chánh Điện)
    const colsPerSide = 4;
    for (let r = 0; r < rows; r++) {
      const progress = r / (rows - 1); // 0 (xa nhất, gần bục gỗ) -> 1 (gần nhất ở phía sau Chánh Điện)
      // Đường cong phối cảnh 3D tự nhiên: các hàng gần camera dãn nhẹ theo chiều sâu
      const y = Math.round(1255 + (progress * 0.88 + Math.pow(progress, 2) * 0.12) * 610);
      const scale = +(0.74 + progress * 0.36).toFixed(2); // 0.74 -> 1.10 (tăng kích thước hài hoà, rõ nét trên điện thoại)

      // Cánh trái thảm đỏ: đưa mép ngoài vào trong an toàn, thu hẹp khoảng cách lối đi giữa
      const leftInnerX = Math.round(375 - progress * 20); // 375px -> 355px
      const leftOuterX = Math.round(75 + progress * 20);  // 75px -> 95px
      for (let c = 0; c < colsPerSide; c++) {
        const t = c / (colsPerSide - 1);
        const x = Math.round(leftOuterX + t * (leftInnerX - leftOuterX));
        HALL_SEAT_COORDS.push({ side: 'L', row: r, col: c, x, y, scale });
      }

      // Cánh phải thảm đỏ
      const rightInnerX = Math.round(705 + progress * 20); // 705px -> 725px
      const rightOuterX = Math.round(1005 - progress * 20); // 1005px -> 985px
      for (let c = 0; c < colsPerSide; c++) {
        const t = c / (colsPerSide - 1);
        const x = Math.round(rightInnerX + t * (rightOuterX - rightInnerX));
        HALL_SEAT_COORDS.push({ side: 'R', row: r, col: c, x, y, scale });
      }
    }
  })();

  // Danh sách 24 ghế sát thảm đỏ (Cột 3 bên L, Cột 0 bên R) — precomputed để không query DOM
  const AISLE_SEAT_INDICES = HALL_SEAT_COORDS
    .map((s, idx) => ({ ...s, idx }))
    .filter(s => (s.side === 'L' && s.col === 3) || (s.side === 'R' && s.col === 0))
    .map(s => s.idx);

  const hallSeatElements = new Array(HALL_SEAT_COORDS.length);
  const hallSeatSignatures = new Array(HALL_SEAT_COORDS.length).fill('');

  // Danh sách 96 nhân vật mặc định của Đạo Tràng Chùa Online
  const SIM_DEVOTEES_96 = [
    { user: 'Ngọc Anh Nguyễn', uniqueId: 'ngocanh.98' },
    { user: 'Trần Minh Quân', uniqueId: 'minhquan_bds' },
    { user: 'Diệu Thảo Tâm An', uniqueId: 'tam_an_99' },
    { user: 'Lê Hoàng Nam', uniqueId: 'hoangnam.dev' },
    { user: 'Phạm Thanh Hà', uniqueId: 'thanhha.lotus' },
    { user: 'Vũ Đức Thịnh', uniqueId: 'ducthinh88' },
    { user: 'Tuệ Minh Cư Sĩ', uniqueId: 'tueminh_zen' },
    { user: 'Nguyễn Bích Ngọc', uniqueId: 'bichngoc.hn' },
    { user: 'Hoàng Quốc Bảo', uniqueId: 'bao_quoc_86' },
    { user: 'Đỗ Thảo Vy', uniqueId: 'thaovy_cute' },
    { user: 'Phan Tuấn Kiệt', uniqueId: 'tuankiet.design' },
    { user: 'Lâm Huệ An', uniqueId: 'huean_anlac' },
    { user: 'Đinh Hoàng Long', uniqueId: 'hoanglong_sg' },
    { user: 'Võ Mai Phương', uniqueId: 'maiphuong.flower' },
    { user: 'Bùi Thế Vinh', uniqueId: 'vinh_the_bui' },
    { user: 'Hồ Kim Chi', uniqueId: 'kimchi_lotus' },
    { user: 'Nguyễn Tấn Đạt', uniqueId: 'tandat.logistic' },
    { user: 'Trương Mỹ Duyên', uniqueId: 'myduyen.95' },
    { user: 'Dương Văn Hùng', uniqueId: 'hung_duong_auto' },
    { user: 'Đặng Thục Trinh', uniqueId: 'thuctrinh_zen' },
    { user: 'Tạ Minh Triết', uniqueId: 'triet_lawyer' },
    { user: 'Mai Lan Hương', uniqueId: 'lanhuong.phuongnam' },
    { user: 'Châu Vĩnh Khang', uniqueId: 'khang_chau_89' },
    { user: 'Lý Kim Ngân', uniqueId: 'kimngan_fengshui' },
    { user: 'Huỳnh Bá Thông', uniqueId: 'bathong_tech' },
    { user: 'Ngô Thanh Trúc', uniqueId: 'thanhtruc.sg' },
    { user: 'Trịnh Quang Khải', uniqueId: 'quangkhai.mk' },
    { user: 'Lưu Cẩm Tú', uniqueId: 'camtu_flower' },
    { user: 'Đoàn Hữu Phước', uniqueId: 'huuphuoc_danang' },
    { user: 'Tô Ánh Nguyệt', uniqueId: 'anhnguyet_yoga' },
    { user: 'Thái Văn Hậu', uniqueId: 'vanhau_realestate' },
    { user: 'Phùng Gia Hân', uniqueId: 'giahan.lotus' },
    { user: 'Lương Đình Trọng', uniqueId: 'trong_luong_91' },
    { user: 'Giang Mỹ Linh', uniqueId: 'mylinh.makeup' },
    { user: 'Từ Quang Nhật', uniqueId: 'quangnhat.solar' },
    { user: 'Hà Diệu Linh', uniqueId: 'dieulinh_buddhism' },
    { user: 'Nghiêm Đức Duy', uniqueId: 'ducduy_finance' },
    { user: 'Khổng Minh Tâm', uniqueId: 'minhtam_tamlinh' },
    { user: 'Vương Tuyết Mai', uniqueId: 'tuyetmai.foodie' },
    { user: 'Phan Bách Hợp', uniqueId: 'bachhop_peace' },
    { user: 'Tăng Khắc Cường', uniqueId: 'cuong_tang_gym' },
    { user: 'Quách Tố Như', uniqueId: 'tonhu.teacher' },
    { user: 'Đỗ Hùng Dũng', uniqueId: 'hungdung_driver' },
    { user: 'Vi Diệu Huyền', uniqueId: 'dieuhuyen_art' },
    { user: 'Chu Thanh Phong', uniqueId: 'thanhphong.vlog' },
    { user: 'Tào Thục Uyên', uniqueId: 'thucuyen_spa' },
    { user: 'Thân Trọng Nghĩa', uniqueId: 'trongnghia.ct' },
    { user: 'Ân Ngọc Trâm', uniqueId: 'ngoctram_gem' },
    { user: 'Mạc Văn Khoa', uniqueId: 'vankhoa.dalat' },
    { user: 'Diệp Hồng Nhung', uniqueId: 'hongnhung_tea' },
    { user: 'Nhan Thế Hào', uniqueId: 'thehao.export' },
    { user: 'La Cẩm Vân', uniqueId: 'camvan.singer' },
    { user: 'Kha Vĩnh Tiến', uniqueId: 'vinhtien.farm' },
    { user: 'Ôn Thị Lệ', uniqueId: 'le_on_flower' },
    { user: 'Cổ Thiên Thanh', uniqueId: 'thienthanh_blue' },
    { user: 'Bạch Thảo Nguyên', uniqueId: 'thaonguyen.eco' },
    { user: 'Viên Như Tâm', uniqueId: 'viennhu.zen' },
    { user: 'Thích Tịnh Tâm', uniqueId: 'tinhtam.tuvi' },
    { user: 'Quảng Trí Dũng', uniqueId: 'quangtri.dung' },
    { user: 'Diệu Hạnh Hoa', uniqueId: 'dieuhanh.lotus' },
    { user: 'Tuệ Đăng Cư Sĩ', uniqueId: 'tuedang.zen' },
    { user: 'Thiện Nhân Tâm', uniqueId: 'thiennhan.tam' },
    { user: 'An Lạc Cư Sĩ', uniqueId: 'anlac.peace' },
    { user: 'Minh Định Pháp', uniqueId: 'minhdinh.phap' },
    { user: 'Huệ Quang Minh', uniqueId: 'huequang.zen' },
    { user: 'Chúc An Nhiên', uniqueId: 'annhien.chuc' },
    { user: 'Chân Thiện Mỹ', uniqueId: 'chanthienmy.hn' },
    { user: 'Bồ Đề Tâm', uniqueId: 'bodetam.vn' },
    { user: 'Thanh Tịnh Trúc', uniqueId: 'thanhtinh.truc' },
    { user: 'Diệu Âm Cư Sĩ', uniqueId: 'dieuam.sg' },
    { user: 'Pháp Bảo Lâm', uniqueId: 'phapbao.lam' },
    { user: 'Vạn Hạnh Thiền', uniqueId: 'vanhanh.thien' },
    { user: 'Liễu Tri Đạt', uniqueId: 'lieutri.dat' },
    { user: 'Tịnh Độ Tâm', uniqueId: 'tinhdo.tam' },
    { user: 'Quảng Đức Hòa', uniqueId: 'quangduc.hoa' },
    { user: 'Hạnh Nguyện An', uniqueId: 'hanhnguyen.an' },
    { user: 'Tùy Duyên Khởi', uniqueId: 'tuyduyen.khoi' },
    { user: 'Vô Lượng Quang', uniqueId: 'voluongquang.vn' },
    { user: 'Trí Dũng Tướng', uniqueId: 'tridung.tuong' },
    { user: 'Phổ Hiền Tâm', uniqueId: 'phohien.tam' },
    { user: 'Văn Thù Hoa', uniqueId: 'vanthu.hoa' },
    { user: 'Quán Tự Tại', uniqueId: 'quantutai.zen' },
    { user: 'Đại Trí Huệ', uniqueId: 'daitri.hue' },
    { user: 'Kim Cương Tạng', uniqueId: 'kimcuong.tang' },
    { user: 'Nhật Quang Minh', uniqueId: 'nhatquang.minh' },
    { user: 'Nguyệt Tịnh Không', uniqueId: 'nguyettinh.khong' },
    { user: 'Bảo Tích Kinh', uniqueId: 'baotich.kinh' },
    { user: 'Hoa Nghiêm Tâm', uniqueId: 'hoanghiem.tam' },
    { user: 'Pháp Hoa Duyên', uniqueId: 'phaphoa.duyen' },
    { user: 'Lăng Nghiêm Định', uniqueId: 'langnghiem.dinh' },
    { user: 'Bát Nhã Thuyền', uniqueId: 'batnha.thuyen' },
    { user: 'Viên Thông Giác', uniqueId: 'vienthong.giac' },
    { user: 'Vô Ngại Trí', uniqueId: 'vongai.tri' },
    { user: 'Cát Tường Như', uniqueId: 'cattuong.nhu' },
    { user: 'Như Ý Cát', uniqueId: 'nhuy.cat' },
    { user: 'Phúc Trí Viên', uniqueId: 'phuctri.vien' }
  ];

  // Phật tử mặc định được phân bổ cho toàn bộ Đạo Tràng Chánh Điện
  const frontRowDevoteesMap = new Map(); // seatIndex -> devotee { user, uniqueId, avatar }

  function initFrontRowDevotees(list = SIM_DEVOTEES_96) {
    if (!Array.isArray(list) || list.length === 0) return;
    frontRowDevoteesMap.clear();
    const shuffled = [...list].sort(() => Math.random() - 0.5);
    HALL_SEAT_COORDS.forEach((seat, idx) => {
      // Mặc định ban đầu CHỈ có 2 hàng đầu (row 0 và row 1) có Phật tử quỳ lạy
      if (seat.row < 2) {
        const dev = shuffled[idx % shuffled.length];
        if (dev) {
          frontRowDevoteesMap.set(idx, dev);
        }
      }
    });
  }
  initFrontRowDevotees();

  // Quản lý chỗ ngồi của người xem thật trong phòng
  const userSeatMap = new Map(); // key (uniqueId / user) -> seatIndex
  const viewerMetaMap = new Map(); // key -> { user, avatar, uniqueId }
  const settledViewers = new Set(); // những viewer đã tịnh tiến đến đích và an toạ
  const walkingViewers = new Set(); // những viewer đang tịnh tiến trên thảm đỏ hoặc trong hàng đợi
  const leavingViewers = new Set(); // những viewer đang bước ra khỏi Chánh Điện khi rời phòng
  const clearingDevotees = new Set(); // những viewer đang trong danh sách chờ tịnh tiến dọn dẹp
  const viewerJoinTimestamp = new Map(); // key -> timestamp khi vào phòng
  let isInitialSyncDone = false;
  let currentRoomViewers = [];
  let lastRenderSig = '';

  function allocateSeatForUser(user, uniqueId, avatar) {
    const key = (uniqueId || user || 'devotee').slice(0, 40);
    viewerMetaMap.set(key, { user: user || key, avatar: avatar || '', uniqueId: key });
    if (userSeatMap.has(key)) {
      return userSeatMap.get(key);
    }

    const occupiedSeats = new Set(userSeatMap.values());
    const realCount = userSeatMap.size;
    const isCrowded = realCount >= 80;

    // 2 hàng đầu (row 0, row 1) mặc định dành cho Phật tử mặc định, xếp user thật từ hàng 2 trở đi
    let candidateSeats = [];
    if (!isCrowded) {
      candidateSeats = HALL_SEAT_COORDS
        .map((s, idx) => ({ ...s, idx }))
        .filter(s => s.row >= 2 && !occupiedSeats.has(s.idx));
    } else {
      // Khi quá 80 người xem thật: mở tất cả ghế (kể cả 2 hàng đầu) đón user thật
      candidateSeats = HALL_SEAT_COORDS
        .map((s, idx) => ({ ...s, idx }))
        .filter(s => !occupiedSeats.has(s.idx));
    }

    if (candidateSeats.length === 0) {
      // Nếu kín toàn bộ 96 ghế, gán theo modulo
      const chosenIdx = realCount % HALL_SEAT_COORDS.length;
      userSeatMap.set(key, chosenIdx);
      return chosenIdx;
    }

    // Lấp đầy các hàng phía trước trước (hàng có chỉ số row nhỏ nhất còn ghế trống)
    const minRow = Math.min(...candidateSeats.map((s) => s.row));
    const targetRowSeats = candidateSeats.filter((s) => s.row === minRow);

    // Trong hàng đó, chọn NGẪU NHIÊN một vị trí ghế trống để các Phật tử lấp đầy hàng tự nhiên
    const chosen = targetRowSeats[Math.floor(Math.random() * targetRowSeats.length)];
    const chosenIdx = chosen.idx;

    userSeatMap.set(key, chosenIdx);
    return chosenIdx;
  }

  function initCongregationHallOnce() {
    if (!congregationHall) return;
    if (congregationHall.children.length === HALL_SEAT_COORDS.length) return;
    congregationHall.innerHTML = '';
    const frag = document.createDocumentFragment();
    HALL_SEAT_COORDS.forEach((seat, idx) => {
      const el = document.createElement('div');
      el.className = 'hall-seat empty-seat';
      el.dataset.seatIdx = idx;
      el.style.left = `${seat.x}px`;
      el.style.top = `${seat.y}px`;
      el.style.zIndex = 15 + seat.row * 2;
      el.style.transform = `translate(-50%, -100%) scale(${seat.scale})`;
      el.innerHTML = '<div class="cushion-mat empty-cushion"></div>';
      frag.appendChild(el);
      hallSeatElements[idx] = el;
      hallSeatSignatures[idx] = 'empty';
    });
    congregationHall.appendChild(frag);
  }

  function renderCongregationHall(leaderboard = [], force = false) {
    if (!congregationHall) return;
    initCongregationHallOnce();

    const now = Date.now();

    // Đảm bảo những viewer THẬT đã vào phòng đều có ghế đặt trước
    if (Array.isArray(currentRoomViewers)) {
      currentRoomViewers.forEach((v) => {
        const key = (v.uniqueId || v.user || '').slice(0, 40);
        if (key) {
          if (!viewerJoinTimestamp.has(key)) {
            viewerJoinTimestamp.set(key, now);
          }
          if (!userSeatMap.has(key)) {
            allocateSeatForUser(v.user, v.uniqueId, v.avatar);
          }
        }
      });
    }

    const realUserCount = userSeatMap.size;
    const isCrowded = realUserCount >= 80;

    const seatUserMap = new Map();
    userSeatMap.forEach((seatIdx, key) => {
      // TUYỆT ĐỐI CHỈ hiển thị nhân vật tại ghế KHI ĐÃ TỊNH TIẾN ĐẾN ĐÍCH VÀ AN TỌA XONG
      const isSettled = (settledViewers.has(key) || clearingDevotees.has(key)) && !walkingViewers.has(key) && !leavingViewers.has(key);
      const joinTime = viewerJoinTimestamp.get(key) || now;
      // Fallback an toàn: nếu sau 12s không có hoạt ảnh bước đi (ví dụ do rớt mạng), tự động an toạ
      const isFallback = !walkingViewers.has(key) && (now - joinTime > 12000);

      if (isSettled || isFallback) {
        if (isFallback) settledViewers.add(key);
        let v = currentRoomViewers.find((u) => (u.uniqueId || u.user || '').slice(0, 40) === key) || viewerMetaMap.get(key);
        if (!v) v = { user: key, uniqueId: key, avatar: '' };
        seatUserMap.set(seatIdx, v);
      }
    });

    // Dọn dẹp bộ nhớ định kỳ tránh rò rỉ RAM khi live nhiều tiếng liên tục
    if (viewerMetaMap.size > 150) {
      viewerMetaMap.forEach((_, k) => {
        if (!userSeatMap.has(k)) viewerMetaMap.delete(k);
      });
    }
    if (viewerJoinTimestamp.size > 150) {
      viewerJoinTimestamp.forEach((_, k) => {
        if (!userSeatMap.has(k)) viewerJoinTimestamp.delete(k);
      });
    }

    // TỐI ƯU HÓA: Cập nhật từng ghế độc lập (In-Place Granular Patching)
    // Chỉ cập nhật đúng ghế thay đổi trạng thái, 95 ghế còn lại hoàn toàn không bị chạm vào DOM
    for (let idx = 0; idx < HALL_SEAT_COORDS.length; idx++) {
      const realUser = seatUserMap.get(idx);
      const isFirstTwoRows = HALL_SEAT_COORDS[idx].row < 2;
      const defaultDevotee = isFirstTwoRows && !isCrowded ? frontRowDevoteesMap.get(idx) : null;

      const isOccupied = Boolean(realUser || defaultDevotee);
      const devoteeKey = realUser
        ? (realUser.uniqueId || realUser.user || '').toLowerCase()
        : (defaultDevotee ? (defaultDevotee.uniqueId || defaultDevotee.user || '').toLowerCase() : '');
      const devoteeName = realUser ? realUser.user : (defaultDevotee ? defaultDevotee.user : '');
      const isDevoteeAtAltar = Boolean(
        (activeAltarSeatType === 'hall' &&
          (activeAltarSeatIdx === idx ||
            (activeAltarUserKey &&
              (devoteeKey === activeAltarUserKey || devoteeName.toLowerCase() === activeAltarUserKey)))) ||
        activeDevoteeKeys.has(devoteeKey) ||
        activeDevoteeKeys.has(devoteeName.toLowerCase())
      );

      const seatSig = `${realUser ? (realUser.uniqueId || realUser.user) + '_' + (realUser.avatar || '') : (defaultDevotee ? defaultDevotee.user : 'empty')}:${isOccupied}:${isDevoteeAtAltar}`;
      if (!force && hallSeatSignatures[idx] === seatSig) {
        continue;
      }
      hallSeatSignatures[idx] = seatSig;

      const seatEl = hallSeatElements[idx] || congregationHall.querySelector(`[data-seat-idx="${idx}"]`);
      if (!seatEl) continue;

      seatEl.className = `hall-seat ${isOccupied ? 'occupied-seat' : 'empty-seat'} ${isDevoteeAtAltar ? 'devotee-at-altar' : ''}`;
      seatEl.dataset.userKey = devoteeKey;
      seatEl.dataset.userName = devoteeName;

      let devoteeContent = '';
      if (realUser) {
        const avatarHtml = realUser.avatar
          ? `<img src="${escapeHtml(realUser.avatar)}" alt="" />`
          : escapeHtml(String(realUser.user || 'P').charAt(0).toUpperCase());

        devoteeContent = `
          <div class="cushion-mat user-cushion"></div>
          <div class="seat-badge">
            <span class="seat-avatar">${avatarHtml}</span>
            <span class="seat-username">${escapeHtml(realUser.user)}</span>
          </div>
          <img
            src="/assets/devotee.png"
            alt="Phật tử"
            class="devotee-sprite"
            style="animation-delay: ${((idx * 0.27) % 3.5).toFixed(2)}s;"
          />
        `;
      } else if (defaultDevotee) {
        const avatarHtml = defaultDevotee.avatar
          ? `<img src="${escapeHtml(defaultDevotee.avatar)}" alt="" />`
          : escapeHtml(String(defaultDevotee.user || 'P').charAt(0).toUpperCase());

        devoteeContent = `
          <div class="cushion-mat default-cushion"></div>
          <div class="seat-badge default-seat-badge">
            <span class="seat-avatar">${avatarHtml}</span>
            <span class="seat-username">${escapeHtml(defaultDevotee.user)}</span>
          </div>
          <img
            src="/assets/devotee.png"
            alt="Phật tử mặc định"
            class="devotee-sprite default-devotee"
            style="animation-delay: ${((idx * 0.27) % 3.5).toFixed(2)}s;"
          />
        `;
      } else {
        devoteeContent = `
          <div class="cushion-mat empty-cushion"></div>
        `;
      }

      seatEl.innerHTML = devoteeContent;
    }
  }
  renderCongregationHall();

  let renderHallPending = false;
  function scheduleRenderCongregationHall(force = false) {
    if (renderHallPending) return;
    renderHallPending = true;
    requestAnimationFrame(() => {
      renderHallPending = false;
      renderCongregationHall([], force);
    });
  }

  // Preload toàn bộ 8 frame nhân vật vào bộ nhớ để chuyển frame mượt 0ms
  const SPRITE_FRAMES = {
    walk1: '/assets/devotee_walk.png',
    walk2: '/assets/devotee_walk_2.png',
    kneelDown: '/assets/devotee_kneel_down.png',
    kneel: '/assets/devotee.png',
    forehead: '/assets/devotee_bow.png',
    bowMid: '/assets/devotee_bow_mid.png',
    prostrate: '/assets/devotee_prostrate.png',
    prostrateDeep: '/assets/devotee_prostrate_deep.png'
  };
  Object.values(SPRITE_FRAMES).forEach((url) => {
    const img = new Image();
    img.src = url;
  });

  let isHallBowingActive = false;
  let hasPendingBowing = false;

  function pulseHallBowing(force = false) {
    if (!congregationHall) return;

    // Nếu đang trong nhịp lạy dang dở do người dùng thả tim liên tục (spam like),
    // ghi nhận lượt tiếp theo để lạy nối tiếp nhịp nhàng, tránh giật hình/xé frame
    if (isHallBowingActive && !force) {
      hasPendingBowing = true;
      return;
    }

    isHallBowingActive = true;
    hasPendingBowing = false;

    // 1. Toàn bộ 100% Phật tử đang an toạ trong sảnh (cả Phật tử thật và Phật tử mặc định)
    const seats = congregationHall.querySelectorAll('.hall-seat');
    seats.forEach((el) => {
      const img = el.querySelector('.devotee-sprite');
      if (!img) return; // Đệm trống chưa có người ngồi thì bỏ qua

      const seatIdx = Number(el.dataset.seatIdx);
      const seatInfo = HALL_SEAT_COORDS[seatIdx];
      const row = seatInfo ? seatInfo.row : 0;
      const col = seatInfo ? seatInfo.col : 0;
      const side = seatInfo ? seatInfo.side : 'L';

      // Khoảng cách đối xứng từ mép thảm đỏ sang hai bên (0 = cạnh thảm, 3 = cạnh tường)
      const distFromCarpet = side === 'L' ? (3 - col) : col;

      // Hiệu ứng lượn sóng so le (checkerboard alternating stagger): các vị trí xen kẽ nhấp nhô
      const isStagger = (row + col) % 2 === 1;
      const staggerOffset = isStagger ? 75 : 0;

      // Lan toả: Từ hàng đầu gần bàn thờ lan dần ra sau, từ thảm đỏ lan sang hai bên + nhịp so le
      const delay = (row * 60) + (distFromCarpet * 35) + staggerOffset;

      setTimeout(() => { if (img.parentElement) img.src = SPRITE_FRAMES.forehead; }, delay);
      setTimeout(() => { if (img.parentElement) img.src = SPRITE_FRAMES.bowMid; }, delay + 150);
      setTimeout(() => { if (img.parentElement) img.src = SPRITE_FRAMES.prostrateDeep; }, delay + 350);
      setTimeout(() => { if (img.parentElement) img.src = SPRITE_FRAMES.bowMid; }, delay + 720);
      setTimeout(() => { if (img.parentElement) img.src = SPRITE_FRAMES.kneel; }, delay + 900);
    });

    // 2. Đồng bộ hiệu ứng lạy cho cả 6 vị Phật tử VIP trên bục gỗ
    const vipSlots = document.querySelectorAll('.vip-devotee-slot');
    vipSlots.forEach((el, idx) => {
      const img = el.querySelector('.devotee-sprite');
      if (!img) return;
      const distFromCenter = Math.abs(idx - 2.5);
      const delay = Math.round(distFromCenter * 50) + ((idx % 2 === 1) ? 40 : 0);
      setTimeout(() => { if (img.parentElement) img.src = SPRITE_FRAMES.forehead; }, delay);
      setTimeout(() => { if (img.parentElement) img.src = SPRITE_FRAMES.bowMid; }, delay + 150);
      setTimeout(() => { if (img.parentElement) img.src = SPRITE_FRAMES.prostrateDeep; }, delay + 350);
      setTimeout(() => { if (img.parentElement) img.src = SPRITE_FRAMES.bowMid; }, delay + 720);
      setTimeout(() => { if (img.parentElement) img.src = SPRITE_FRAMES.kneel; }, delay + 900);
    });

    // Sau khi toàn bộ đợt sóng kết thúc (~1.4s), mở khóa hoặc tự động thực hiện đợt lạy kế tiếp nếu còn hàng đợi
    setTimeout(() => {
      isHallBowingActive = false;
      if (hasPendingBowing) {
        hasPendingBowing = false;
        pulseHallBowing();
      }
    }, 1450);
  }

  // Chu kỳ tự động đảnh lễ tĩnh tâm cả sảnh (mỗi 30 giây nếu sảnh yên tĩnh không có sự kiện gõ mõ/chuông)
  let lastBowingTime = Date.now();
  const rawPulseHallBowing = pulseHallBowing;
  pulseHallBowing = function (force = false) {
    lastBowingTime = Date.now();
    rawPulseHallBowing(force);
  };

  setInterval(() => {
    if (Date.now() - lastBowingTime >= 14000) {
      pulseHallBowing();
    }
  }, 3000);

  // 5.1. Hoạt ảnh lạy riêng lẻ cho từng vị Phật tử (đáp ứng lạy ngẫu nhiên & khi comment)
  function bowSingleDevotee(el, options = {}) {
    if (!el) return;
    const img = el.querySelector('.devotee-sprite');
    if (!img) return;

    // Nếu là comment thì luôn ưu tiên hiển thị (không bị chặn bởi lạy ngẫu nhiên)
    if (el.dataset.isBowing === 'true' && !options.isComment) return;
    el.dataset.isBowing = 'true';

    if (options.isComment) {
      el.classList.add('comment-bowing');
      showDevoteeChatBubble(el, options.comment || 'Nam Mô A Di Đà Phật');
    }

    const delay = options.delay || 0;
    setTimeout(() => { if (img.parentElement) img.src = SPRITE_FRAMES.forehead; }, delay);
    setTimeout(() => { if (img.parentElement) img.src = SPRITE_FRAMES.bowMid; }, delay + 160);
    setTimeout(() => { if (img.parentElement) img.src = SPRITE_FRAMES.prostrateDeep; }, delay + 380);
    setTimeout(() => { if (img.parentElement) img.src = SPRITE_FRAMES.bowMid; }, delay + 760);
    setTimeout(() => {
      if (img.parentElement) img.src = SPRITE_FRAMES.kneel;
      el.dataset.isBowing = 'false';
      if (options.isComment) {
        setTimeout(() => el.classList.remove('comment-bowing'), 600);
      }
    }, delay + 960);
  }

  function showDevoteeChatBubble(targetEl, text) {
    if (!targetEl || !text) return;

    if (targetEl._commentTimer) {
      clearTimeout(targetEl._commentTimer);
      targetEl._commentTimer = null;
    }

    const existing = targetEl.querySelector('.devotee-comment-bubble');
    if (existing) existing.remove();

    // Thêm class comment-active để ẩn tên Phật tử trong khi comment đang hiển thị
    targetEl.classList.add('comment-active');

    const bubble = document.createElement('div');
    bubble.className = 'devotee-comment-bubble';
    bubble.innerHTML = `<span style="color: var(--gold-bright); margin-right: 5px;">💬</span><span>“${escapeHtml(text)}”</span>`;
    targetEl.appendChild(bubble);

    // Đúng 3 giây: Ẩn comment và hiện lại thẻ tên Phật tử
    targetEl._commentTimer = setTimeout(() => {
      if (bubble.parentElement) bubble.remove();
      targetEl.classList.remove('comment-active');
      targetEl._commentTimer = null;
    }, 3000);
  }

  // 5.2. HỆ THỐNG PHẬT TỬ SỐNG ĐỘNG, NHỘN NHỊP & DỄ THƯƠNG (LIVELY DEVOTEES ENGINE)
  const CUTE_DEVOTEE_EMOJIS = ['🪷', '🙏', '✨', '💖', '📿', '⭐', '🍵', '🌸', '🏮', '🕊️'];
  let livelyDevoteesTimer = null;

  function spawnCuteDevoteeBubble(targetEl, emoji = null) {
    if (!targetEl) return;
    const existing = targetEl.querySelectorAll('.devotee-mini-bubble');
    if (existing.length >= 2) return;

    const chosenEmoji = emoji || CUTE_DEVOTEE_EMOJIS[Math.floor(Math.random() * CUTE_DEVOTEE_EMOJIS.length)];
    const bubble = document.createElement('div');
    bubble.className = 'devotee-mini-bubble';
    bubble.textContent = chosenEmoji;
    const drift = (Math.random() * 24 - 12).toFixed(1);
    bubble.style.setProperty('--bubble-drift', `${drift}px`);
    targetEl.appendChild(bubble);

    setTimeout(() => {
      if (bubble.parentElement) bubble.remove();
    }, 2400);
  }

  function triggerCuteMicroAction() {
    if (isHallBowingActive) return;

    const available = [];
    document.querySelectorAll('.hall-seat.occupied-seat').forEach((el) => {
      if (el.dataset.isBowing !== 'true' && !el.classList.contains('seat-leaving')) {
        available.push(el);
      }
    });
    document.querySelectorAll('.vip-devotee-slot').forEach((el) => {
      if (el.dataset.isBowing !== 'true') available.push(el);
    });

    if (available.length === 0) return;

    // Khoảng 25% xác suất: Kích hoạt Làn Sóng Lạy Nhỏ (Mini-Wave) 4-7 vị Phật tử lạy nhấp nhô nối tiếp
    if (Math.random() < 0.25 && available.length >= 4) {
      const rippleCount = Math.min(available.length, 4 + Math.floor(Math.random() * 4));
      for (let r = 0; r < rippleCount; r++) {
        const idx = Math.floor(Math.random() * available.length);
        const dev = available.splice(idx, 1)[0];
        if (dev) {
          bowSingleDevotee(dev, { delay: r * 120 + Math.floor(Math.random() * 50), isComment: false });
        }
      }
      return;
    }

    // Chọn ngẫu nhiên từ 3 đến 7 vị Phật tử mỗi nhịp để hành lễ / biểu cảm rộn rã
    const count = Math.min(available.length, 3 + Math.floor(Math.random() * 5));
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * available.length);
      const chosen = available.splice(idx, 1)[0];
      if (!chosen) continue;

      const rand = Math.random();
      if (rand < 0.72) {
        // 72%: LẠY THÀNH KÍNH NGẪU NHIÊN (kèm delay so le tự nhiên)
        const stagger = Math.floor(Math.random() * 280);
        bowSingleDevotee(chosen, { delay: stagger, isComment: false });
      } else if (rand < 0.88) {
        // 16%: Gật gù tụng niệm theo kinh Phật
        chosen.classList.remove('cute-nod', 'cute-whisper-left', 'cute-whisper-right');
        void chosen.offsetWidth;
        chosen.classList.add('cute-nod');
        setTimeout(() => chosen.classList.remove('cute-nod'), 1250);
      } else if (rand < 0.95) {
        // 7%: Bay biểu tượng búp sen, tâm thành cute (🪷, 🙏, ✨, 💖, ⭐, 📿)
        spawnCuteDevoteeBubble(chosen);
      } else {
        // 5%: Nghiêng người thì thầm sang bạn đồng tu bên cạnh
        const dir = Math.random() < 0.5 ? 'cute-whisper-left' : 'cute-whisper-right';
        chosen.classList.remove('cute-nod', 'cute-whisper-left', 'cute-whisper-right');
        void chosen.offsetWidth;
        chosen.classList.add(dir);
        setTimeout(() => chosen.classList.remove(dir), 2050);
      }
    }
  }

  function startLivelyDevoteesLoop() {
    if (livelyDevoteesTimer) clearTimeout(livelyDevoteesTimer);
    // Nhịp 0.28s - 0.60s liên tục nhộn nhịp, chánh điện luôn có nhiều người quỳ lạy sống động
    const nextMs = 280 + Math.random() * 320;
    livelyDevoteesTimer = setTimeout(() => {
      triggerCuteMicroAction();
      startLivelyDevoteesLoop();
    }, nextMs);
  }
  startLivelyDevoteesLoop();

  // Nhún nhảy đồng loạt theo nhịp mõ cốc cốc cốc
  function triggerWoodenFishBounceAll() {
    const seats = document.querySelectorAll('.hall-seat.occupied-seat, .vip-devotee-slot');
    seats.forEach((el, i) => {
      if (el.dataset.isBowing === 'true') return;
      const stagger = (i % 8) * 32;
      setTimeout(() => {
        el.classList.remove('wooden-fish-bounce');
        void el.offsetWidth;
        el.classList.add('wooden-fish-bounce');
        setTimeout(() => el.classList.remove('wooden-fish-bounce'), 400);
      }, stagger);
    });
  }

  // Hoan hỷ tưng bừng khi có Đại Lễ, Dâng Quà, Thả Đèn
  function triggerGrandRejoiceAll(bannerEmoji = '🪷') {
    const seats = document.querySelectorAll('.vip-devotee-slot, .hall-seat.occupied-seat');
    seats.forEach((el, i) => {
      const delay = (i % 6) * 70;
      setTimeout(() => {
        el.classList.remove('grand-rejoice');
        requestAnimationFrame(() => {
          el.classList.add('grand-rejoice');
          spawnCuteDevoteeBubble(el, ['🪷', '🌸', '✨', '💖', bannerEmoji][i % 5]);
          setTimeout(() => el.classList.remove('grand-rejoice'), 1850);
        });
      }, delay);
    });
  }

  // Chào đón khi có người mới bước vào sảnh — Tối ưu hóa: 0 Forced Reflow + Coalescing Buffer
  let lastAisleGreetingTime = 0;
  function triggerAisleDevoteesGreeting() {
    const now = Date.now();
    // Coalesce: Nếu vừa có đợt chào đón trong 400ms, để các Phật tử chào xong, không restart ngắt quãng
    if (now - lastAisleGreetingTime < 400) return;
    lastAisleGreetingTime = now;

    let greeted = 0;
    for (const seatIdx of AISLE_SEAT_INDICES) {
      const el = hallSeatElements[seatIdx] || congregationHall?.querySelector(`[data-seat-idx="${seatIdx}"]`);
      if (!el || !el.classList.contains('occupied-seat')) continue;
      const seatInfo = HALL_SEAT_COORDS[seatIdx];
      if (!seatInfo) continue;

      if (greeted < 6 && Math.random() < 0.75) {
        greeted++;
        const dir = seatInfo.side === 'L' ? 'cute-whisper-right' : 'cute-whisper-left';
        el.classList.remove('cute-nod', 'cute-whisper-left', 'cute-whisper-right');
        requestAnimationFrame(() => {
          el.classList.add(dir);
          spawnCuteDevoteeBubble(el, '👋');
          setTimeout(() => el.classList.remove(dir), 2100);
        });
      }
    }
  }

  // 5.3. Khi có người dùng comment: tìm đúng Phật tử đó và kích hoạt cúi lạy + hiện bong bóng bình luận
  function handleViewerCommentBow(user, uniqueId, avatar, comment) {
    const rawName = String(user || uniqueId || 'Thí Chủ').trim();
    const cleanKey = (uniqueId || user || '').toLowerCase().trim().slice(0, 40);
    const displayText = String(comment || 'Nam Mô A Di Đà Phật').slice(0, 48);

    // A. Kiểm tra nếu là Chủ Lễ trung tâm đang đứng/quỳ trước lư hương
    const centralNameEl = document.getElementById('centralName');
    const centralEl = document.getElementById('centralWorshipper');
    if (
      centralEl &&
      centralEl.classList.contains('active') &&
      centralNameEl &&
      centralNameEl.textContent.trim().toLowerCase() === rawName.toLowerCase()
    ) {
      setCentralPose('forehead');
      setTimeout(() => setCentralPose('bowMid'), 160);
      setTimeout(() => setCentralPose('prostrateDeep'), 380);
      setTimeout(() => setCentralPose('bowMid'), 760);
      setTimeout(() => setCentralPose('kneel'), 960);
      showDevoteeChatBubble(centralEl, displayText);
      return;
    }

    // B. Tìm trong 6 đệm VIP trên bục gỗ
    const vips = document.querySelectorAll('.vip-devotee-slot');
    for (const v of vips) {
      if (
        (v.dataset.userKey && v.dataset.userKey === cleanKey) ||
        (v.dataset.userName && v.dataset.userName.toLowerCase() === rawName.toLowerCase())
      ) {
        bowSingleDevotee(v, { isComment: true, comment: displayText });
        return;
      }
    }

    // C. Tìm ghế của Phật tử trong sảnh (theo userSeatMap hoặc data-user-key)
    let targetSeatEl = null;

    if (cleanKey && userSeatMap.has(cleanKey)) {
      const seatIdx = userSeatMap.get(cleanKey);
      targetSeatEl = document.querySelector(`.hall-seat[data-seat-idx="${seatIdx}"]`);
    }

    if (!targetSeatEl && cleanKey) {
      targetSeatEl = document.querySelector(`.hall-seat[data-user-key="${cleanKey}"]`);
    }

    if (!targetSeatEl && rawName) {
      const seats = document.querySelectorAll('.hall-seat.occupied-seat');
      for (const s of seats) {
        if (s.dataset.userName && s.dataset.userName.toLowerCase() === rawName.toLowerCase()) {
          targetSeatEl = s;
          break;
        }
      }
    }

    // D. Nếu người comment chưa có ghế: tự động cấp ghế ngay để xuất hiện lập tức và lạy
    if (!targetSeatEl) {
      const seatIdx = allocateSeatForUser(user, uniqueId, avatar);
      settledViewers.add(cleanKey);
      renderCongregationHall([], true);
      const allocatedEl = document.querySelector(`.hall-seat[data-seat-idx="${seatIdx}"]`);
      if (allocatedEl) {
        bowSingleDevotee(allocatedEl, { isComment: true, comment: displayText });
      }
      return;
    }

    if (targetSeatEl) {
      bowSingleDevotee(targetSeatEl, { isComment: true, comment: displayText });
    }
  }
  window.handleViewerCommentBow = handleViewerCommentBow;

  let prostrationTimers = [];
  let centralWishTimer = null;
  let currentWalkAnimation = null;

  function triggerCentralWishDisplay(wishText) {
    const centralEl = document.getElementById('centralWorshipper');
    const wishEl = document.getElementById('centralWishBubble');
    if (!centralEl) return;

    if (centralWishTimer) {
      clearTimeout(centralWishTimer);
      centralWishTimer = null;
    }

    const cleanWish = String(wishText || '').trim();
    if (cleanWish.length > 0) {
      if (wishEl) wishEl.textContent = `“${cleanWish}”`;
      // Chỉ hiển thị lời cầu nguyện và ẩn thẻ tên phía dưới đi
      centralEl.classList.add('showing-wish');

      // Lời cầu nguyện chỉ hiển thị trong đúng 3 giây, sau đó ẩn đi để hiển thị lại thẻ tên
      centralWishTimer = setTimeout(() => {
        centralEl.classList.remove('showing-wish');
        centralWishTimer = null;
      }, 3000);
    } else {
      centralEl.classList.remove('showing-wish');
    }
  }

  function restoreDevoteeSeatToHall(devoteeSeat, cleanKey) {
    let targetEl = devoteeSeat ? devoteeSeat.el : null;
    const k = (cleanKey || '').toLowerCase();

    if (!targetEl || !targetEl.isConnected) {
      if (k) {
        targetEl = document.querySelector(`.vip-devotee-slot[data-user-key="${k}"]`) ||
                   document.querySelector(`.hall-seat[data-user-key="${k}"]`);
      }
      if (!targetEl && devoteeSeat && devoteeSeat.idx !== undefined && devoteeSeat.idx !== -1) {
        if (devoteeSeat.type === 'vip') {
          const slots = document.querySelectorAll('.vip-devotee-slot');
          targetEl = slots[devoteeSeat.idx];
        } else if (devoteeSeat.type === 'hall') {
          targetEl = document.querySelector(`.hall-seat[data-seat-idx="${devoteeSeat.idx}"]`);
        }
      }
    }

    if (targetEl) {
      targetEl.classList.remove('devotee-at-altar');
      spawnCuteDevoteeBubble(targetEl, '🙏');
      bowSingleDevotee(targetEl);
    }
  }

  function restoreAltarDevoteeToHall() {
    let targetEl = null;
    if (activeAltarSeatType === 'vip') {
      if (activeAltarUserKey) {
        targetEl = document.querySelector(`.vip-devotee-slot[data-user-key="${activeAltarUserKey}"]`);
      }
      if (!targetEl && activeAltarSeatIdx !== null) {
        const slots = document.querySelectorAll('.vip-devotee-slot');
        targetEl = slots[activeAltarSeatIdx];
      }
    } else if (activeAltarSeatType === 'hall') {
      if (activeAltarSeatIdx !== null) {
        targetEl = document.querySelector(`.hall-seat[data-seat-idx="${activeAltarSeatIdx}"]`);
      }
      if (!targetEl && activeAltarUserKey) {
        targetEl = document.querySelector(`.hall-seat[data-user-key="${activeAltarUserKey}"]`);
      }
    }
    if (!targetEl && activeAltarSeatEl) {
      targetEl = activeAltarSeatEl;
    }

    if (targetEl) {
      targetEl.classList.remove('devotee-at-altar');
      spawnCuteDevoteeBubble(targetEl, '🙏');
      bowSingleDevotee(targetEl);
    }

    activeAltarSeatEl = null;
    activeAltarUserKey = null;
    activeAltarSeatType = null;
    activeAltarSeatIdx = null;
  }

  function clearProstrationTimers() {
    while (prostrationTimers.length > 0) {
      clearTimeout(prostrationTimers.pop());
    }
    if (centralWishTimer) {
      clearTimeout(centralWishTimer);
      centralWishTimer = null;
    }
    if (currentWalkAnimation) {
      try {
        currentWalkAnimation.cancel();
      } catch (e) {}
      currentWalkAnimation = null;
    }
  }

  // Chuyển đổi tức thời giữa 8 khung hình đã giải mã sẵn trên GPU (KHÔNG BAO GIỜ BỊ MẤT HÌNH)
  function setCentralPose(poseKey) {
    const stack = document.getElementById('centralSpriteStack');
    if (!stack) return;
    const frames = stack.querySelectorAll('.pose-frame');
    frames.forEach((img) => {
      img.classList.toggle('active', img.getAttribute('data-pose') === poseKey);
    });
  }

  function schedulePose(ms, poseKey) {
    prostrationTimers.push(
      setTimeout(() => {
        setCentralPose(poseKey);
      }, ms)
    );
  }

  // Chuỗi 8 khung hình Đảnh lễ Tam Bái mượt mà (Hạ gối -> Chắp tay ngực -> Đưa lên trán -> Nghiêng 45° -> Chống tay -> Lạy sát đất -> Ngẩng lên)
  function playThreeBowsSequence(startDelayMs = 0) {
    schedulePose(startDelayMs, 'kneelDown');
    schedulePose(startDelayMs + 160, 'kneel');

    const bowOffsets = [startDelayMs + 320, startDelayMs + 1820, startDelayMs + 3320];
    bowOffsets.forEach((t0) => {
      schedulePose(t0, 'forehead');            // 1. Chắp tay đưa lên trán
      schedulePose(t0 + 170, 'bowMid');        // 2. Cúi gập lưng 45°
      schedulePose(t0 + 330, 'prostrate');     // 3. Vươn hai tay chống xuống đệm
      schedulePose(t0 + 490, 'prostrateDeep'); // 4. Lạy sát đất (Ngũ thể đầu địa)
      schedulePose(t0 + 860, 'prostrate');     // 5. Bắt đầu nâng đầu lên
      schedulePose(t0 + 1020, 'bowMid');       // 6. Nâng lưng lên góc 45°
      schedulePose(t0 + 1180, 'kneel');        // 7. Ngồi quỳ thẳng lưng

      // Đồng bộ toàn bộ Phật tử ở sảnh lạy theo nhịp mỗi lạy của chủ lễ
      prostrationTimers.push(
        setTimeout(() => {
          pulseHallBowing();
        }, t0)
      );
    });

    schedulePose(startDelayMs + 4800, 'forehead');
    schedulePose(startDelayMs + 5350, 'kneel');
  }

  // Định vị chính xác vị trí ghế an toạ của thí chủ (VIP trên bục gỗ hoặc ghế sảnh Chánh Điện)
  function findDevoteeSeat(user, uniqueId) {
    const rawName = String(user || uniqueId || '').trim();
    const cleanKey = String(uniqueId || user || '').trim().toLowerCase().slice(0, 40);

    // 1. Kiểm tra 6 vị VIP trên bục gỗ (Top 6 bảng vàng công đức)
    const vipSlots = document.querySelectorAll('.vip-devotee-slot');
    for (let idx = 0; idx < vipSlots.length; idx++) {
      const v = vipSlots[idx];
      const vKey = (v.dataset.userKey || '').toLowerCase();
      const vName = (v.dataset.userName || '').toLowerCase();
      if ((cleanKey && vKey === cleanKey) || (rawName && vName === rawName.toLowerCase())) {
        const coord = VIP_CUSHION_COORDS[idx] || { x: 268, y: 1188 };
        return {
          type: 'vip',
          el: v,
          idx,
          startX: coord.x,
          startY: coord.y,
          startScale: 0.82,
          side: coord.x < 540 ? 'L' : 'R',
          midX: Math.round(coord.x + (540 - coord.x) * 0.55),
          midY: 1190,
          midScale: 0.92,
          isVip: true
        };
      }
    }

    // 2. Kiểm tra xem người xem thật đã có ghế trong sảnh chưa
    let seatIdx = undefined;
    if (cleanKey && userSeatMap.has(cleanKey)) {
      seatIdx = userSeatMap.get(cleanKey);
    }

    // 3. Nếu chưa có ghế theo userSeatMap, kiểm tra trong frontRowDevoteesMap (Phật tử mặc định)
    if (seatIdx === undefined) {
      for (const [idx, dev] of frontRowDevoteesMap.entries()) {
        const devKey = (dev.uniqueId || dev.user || '').toLowerCase();
        const devName = (dev.user || '').toLowerCase();
        if ((cleanKey && devKey === cleanKey) || (rawName && devName === rawName.toLowerCase())) {
          seatIdx = idx;
          break;
        }
      }
    }

    // 4. Nếu chưa tìm ra theo Map: tìm theo thuộc tính DOM của các ghế đã render
    let seatEl = null;
    if (seatIdx !== undefined) {
      seatEl = document.querySelector(`.hall-seat[data-seat-idx="${seatIdx}"]`);
    }
    if (!seatEl && cleanKey) {
      seatEl = document.querySelector(`.hall-seat[data-user-key="${cleanKey}"]`);
      if (seatEl && seatEl.dataset.seatIdx !== undefined) {
        seatIdx = Number(seatEl.dataset.seatIdx);
      }
    }
    if (!seatEl && rawName) {
      const seats = document.querySelectorAll('.hall-seat.occupied-seat');
      for (const s of seats) {
        if (s.dataset.userName && s.dataset.userName.toLowerCase() === rawName.toLowerCase()) {
          seatEl = s;
          seatIdx = Number(s.dataset.seatIdx);
          break;
        }
      }
    }

    // 5. Nếu vẫn chưa có ghế: tự động cấp ghế trong sảnh
    if (seatIdx === undefined || !seatEl) {
      seatIdx = allocateSeatForUser(user, cleanKey, '');
      settledViewers.add(cleanKey);
      walkingViewers.delete(cleanKey);
      renderCongregationHall([], true);
      seatEl = document.querySelector(`.hall-seat[data-seat-idx="${seatIdx}"]`);
    }

    const seatCoord = HALL_SEAT_COORDS[seatIdx];
    if (seatCoord) {
      const side = seatCoord.side || (seatCoord.x < 540 ? 'L' : 'R');
      const midX = side === 'L' ? 478 : 602;
      const midY = Math.max(1188, Math.round(seatCoord.y - 30));
      const midScale = +(0.5 * (seatCoord.scale + 1.0)).toFixed(2);
      return {
        type: 'hall',
        el: seatEl,
        idx: seatIdx,
        startX: seatCoord.x,
        startY: seatCoord.y,
        startScale: seatCoord.scale,
        side,
        midX,
        midY,
        midScale,
        isVip: false
      };
    }

    // Fallback an toàn: bắt đầu từ cuối thảm đỏ
    return {
      type: 'entrance',
      el: null,
      idx: -1,
      startX: 540,
      startY: 1880,
      startScale: 1.05,
      side: 'C',
      midX: 540,
      midY: 1530,
      midScale: 1.02,
      isVip: false
    };
  }

  // ==========================================================================
  // HỆ THỐNG HÀNG ĐỢI ĐẢNH LỄ & XẾP HÀNG 2 CỘT TRÊN THẢM ĐỎ (FIFO 2-COLUMN QUEUE)
  // ==========================================================================
  const MAX_ROWS_PER_COL = 4;
  const WAITING_ROWS = [
    { y: 1380, scale: 0.94, zIndex: 43 }, // Hàng 1 (gần bàn thờ nhất)
    { y: 1530, scale: 0.98, zIndex: 44 }, // Hàng 2
    { y: 1680, scale: 1.02, zIndex: 45 }, // Hàng 3
    { y: 1820, scale: 1.06, zIndex: 46 }  // Hàng 4 (sát cửa chính điện)
  ];

  // Tọa độ X cho 2 cột song song trên thảm đỏ, mở rộng nhẹ theo phối cảnh Chánh Điện
  const COLUMN_X = {
    L: [482, 480, 478, 476], // Cột Trái: Hàng 1 -> Hàng 4
    R: [598, 600, 602, 604]  // Cột Phải: Hàng 1 -> Hàng 4
  };

  let ritualItemIdSeq = 0;
  const queueL = []; // Hàng đợi Cột Trái
  const queueR = []; // Hàng đợi Cột Phải
  let currentAltarRitual = null;

  function createQueueWalkerElement(item) {
    const el = document.createElement('div');
    el.className = 'ritual-queue-walker';
    el.id = `queueWalker_${item.id}`;

    const avatar = item.avatar;
    const initial = String(item.user || 'P').charAt(0).toUpperCase();
    const avatarHtml = (avatar && avatar.trim().length > 0)
      ? `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(item.user)}" onerror="this.onerror=null;this.parentElement.textContent='${escapeHtml(initial)}';" />`
      : escapeHtml(initial);

    el.innerHTML = `
      <div class="queue-sprite-stack">
        <img src="/assets/devotee_walk.png" data-pose="walk1" class="devotee-sprite queue-pose-frame" alt="" />
        <img src="/assets/devotee_walk_2.png" data-pose="walk2" class="devotee-sprite queue-pose-frame" alt="" />
        <img src="/assets/devotee.png" data-pose="kneel" class="devotee-sprite queue-pose-frame" alt="" />
        <img src="/assets/devotee_bow.png" data-pose="bow" class="devotee-sprite queue-pose-frame active" alt="" />
      </div>
      <div class="name-tag queue-name-tag">
        <div class="tag-avatar">${avatarHtml}</div>
        <div class="tag-info">
          <span class="tag-name">${escapeHtml(item.user)}</span>
          <span class="tag-action">${escapeHtml(item.actionLabel || 'Chờ dâng lễ')}</span>
        </div>
      </div>
    `;
    return el;
  }

  function setQueueWalkerPose(el, poseKey) {
    if (!el) return;
    const frames = el.querySelectorAll('.queue-pose-frame');
    frames.forEach((img) => {
      img.classList.toggle('active', img.getAttribute('data-pose') === poseKey);
    });
  }

  function runQueueWalkerSteps(el, durationMs, stepCount = 6) {
    const stepInterval = Math.max(120, Math.round(durationMs / stepCount));
    setQueueWalkerPose(el, 'walk1');
    for (let s = 1; s <= stepCount; s++) {
      setTimeout(() => {
        if (!el || !el.isConnected) return;
        setQueueWalkerPose(el, s % 2 === 0 ? 'walk1' : 'walk2');
      }, s * stepInterval);
    }
  }

  function updateSingleColumnLine(queue, side, carpetLayer) {
    const maxVisible = Math.min(queue.length, MAX_ROWS_PER_COL);
    for (let r = 0; r < maxVisible; r++) {
      const item = queue[r];
      const targetX = COLUMN_X[side][r];
      const targetY = WAITING_ROWS[r].y;
      const targetScale = WAITING_ROWS[r].scale;
      const targetZIndex = WAITING_ROWS[r].zIndex;

      const targetDx = targetX - 540;
      const targetDy = targetY - 1192;

      if (!item.walkerEl) {
        // Phật tử từ ghế bước ra thảm đỏ vào hàng đợi tại cột (side), hàng r
        item.currentSide = side;
        item.currentRow = r;
        item.state = 'waiting_carpet';
        const el = createQueueWalkerElement(item);
        item.walkerEl = el;
        el.style.zIndex = String(targetZIndex);
        carpetLayer.appendChild(el);

        const seat = item.devoteeSeat;
        const startDx = seat.startX - 540;
        const startDy = seat.startY - 1192;
        const startScale = seat.startScale;

        const midDx = seat.midX - 540;
        const midDy = seat.midY - 1192;
        const midScale = seat.midScale;

        const walkKeyframes = [
          {
            transform: `translate3d(calc(-50% + ${startDx}px), ${startDy}px, 0) scale(${startScale})`,
            opacity: 0,
            offset: 0
          },
          {
            transform: `translate3d(calc(-50% + ${startDx}px), ${startDy}px, 0) scale(${startScale})`,
            opacity: 1,
            offset: 0.1
          },
          {
            transform: `translate3d(calc(-50% + ${midDx}px), ${midDy}px, 0) scale(${midScale})`,
            opacity: 1,
            offset: 0.45
          },
          {
            transform: `translate3d(calc(-50% + ${targetDx}px), ${targetDy}px, 0) scale(${targetScale})`,
            opacity: 1,
            offset: 1
          }
        ];

        runQueueWalkerSteps(el, 1800, 8);
        const anim = el.animate(walkKeyframes, {
          duration: 1800,
          easing: 'cubic-bezier(0.25, 0.1, 0.25, 1.0)',
          fill: 'forwards'
        });
        anim.onfinish = () => {
          if (el && el.isConnected) {
            el.style.transform = `translate3d(calc(-50% + ${targetDx}px), ${targetDy}px, 0) scale(${targetScale})`;
            setQueueWalkerPose(el, 'bow');
          }
        };
      } else if (item.currentRow !== r || item.currentSide !== side) {
        // Phật tử đã ở trong cột và tịnh tiến lên hàng r phía trước
        const oldRow = item.currentRow !== undefined ? item.currentRow : r + 1;
        const oldSide = item.currentSide || side;
        const oldX = COLUMN_X[oldSide][Math.min(oldRow, MAX_ROWS_PER_COL - 1)];
        const oldY = WAITING_ROWS[Math.min(oldRow, MAX_ROWS_PER_COL - 1)].y;
        const oldScale = WAITING_ROWS[Math.min(oldRow, MAX_ROWS_PER_COL - 1)].scale;

        const oldDx = oldX - 540;
        const oldDy = oldY - 1192;

        item.currentSide = side;
        item.currentRow = r;
        const el = item.walkerEl;
        el.style.zIndex = String(targetZIndex);

        const advanceKeyframes = [
          {
            transform: `translate3d(calc(-50% + ${oldDx}px), ${oldDy}px, 0) scale(${oldScale})`,
            offset: 0
          },
          {
            transform: `translate3d(calc(-50% + ${targetDx}px), ${targetDy}px, 0) scale(${targetScale})`,
            offset: 1
          }
        ];

        runQueueWalkerSteps(el, 900, 4);
        const anim = el.animate(advanceKeyframes, {
          duration: 900,
          easing: 'cubic-bezier(0.25, 0.1, 0.25, 1.0)',
          fill: 'forwards'
        });
        anim.onfinish = () => {
          if (el && el.isConnected) {
            el.style.transform = `translate3d(calc(-50% + ${targetDx}px), ${targetDy}px, 0) scale(${targetScale})`;
            setQueueWalkerPose(el, 'bow');
          }
        };
      }
    }
  }

  function updateWaitingLinePositions() {
    const carpetLayer = document.getElementById('carpetWalkerLayer');
    if (!carpetLayer) return;

    updateSingleColumnLine(queueL, 'L', carpetLayer);
    updateSingleColumnLine(queueR, 'R', carpetLayer);
  }

  function executeAltarRitual(item) {
    const centralEl = document.getElementById('centralWorshipper');
    if (!centralEl) return;

    currentAltarRitual = item;
    item.state = 'active_altar';

    activeAltarUserKey = item.cleanKey;
    activeAltarSeatType = item.devoteeSeat.type;
    activeAltarSeatIdx = item.devoteeSeat.idx;
    activeAltarSeatEl = item.devoteeSeat.el;

    if (item.walkerEl) {
      // Đang đứng ở đầu hàng (Hàng 1 của Cột Trái hoặc Phải) -> tịnh tiến lên đệm trung tâm (0, 0, scale 1)
      const el = item.walkerEl;
      const side = item.currentSide || 'L';
      const row = item.currentRow !== undefined ? item.currentRow : 0;
      const currentX = COLUMN_X[side][row] || (side === 'L' ? 475 : 605);
      const currentY = WAITING_ROWS[row].y;
      const currentScale = WAITING_ROWS[row].scale;

      const currentDx = currentX - 540;
      const currentDy = currentY - 1192;

      const stepUpKeyframes = [
        {
          transform: `translate3d(calc(-50% + ${currentDx}px), ${currentDy}px, 0) scale(${currentScale})`,
          offset: 0
        },
        {
          transform: `translate3d(-50%, 0, 0) scale(1)`,
          offset: 1
        }
      ];

      runQueueWalkerSteps(el, 1200, 6);
      const anim = el.animate(stepUpKeyframes, {
        duration: 1200,
        easing: 'cubic-bezier(0.25, 0.1, 0.25, 1.0)',
        fill: 'forwards'
      });

      anim.onfinish = () => {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
        item.walkerEl = null;

        updateCentralWorshipper(item.user, item.avatar, item.actionLabel, item.wish, false);
        centralEl.classList.add('active');
        centralEl.style.opacity = '1';
        centralEl.style.transform = 'translate3d(-50%, 0, 0) scale(1)';

        runAltarProstrationAndReturn(item, 0);
      };
    } else {
      // Chưa ở hàng đợi, bước trực tiếp từ ghế lên bàn thờ
      updateCentralWorshipper(item.user, item.avatar, item.actionLabel, item.wish, false);
      centralEl.classList.add('active');
      centralEl.style.opacity = '1';

      const seat = item.devoteeSeat;
      const startDx = seat.startX - 540;
      const startDy = seat.startY - 1192;
      const startScale = seat.startScale;

      const midDx = seat.midX - 540;
      const midDy = seat.midY - 1192;
      const midScale = seat.midScale;

      const walkUpKeyframes = [
        {
          transform: `translate3d(calc(-50% + ${startDx}px), ${startDy}px, 0) scale(${startScale})`,
          opacity: 1,
          offset: 0
        },
        {
          transform: `translate3d(calc(-50% + ${midDx}px), ${midDy}px, 0) scale(${midScale})`,
          opacity: 1,
          offset: 0.35
        },
        {
          transform: `translate3d(-50%, 0, 0) scale(1)`,
          opacity: 1,
          offset: 1
        }
      ];

      currentWalkAnimation = centralEl.animate(walkUpKeyframes, {
        duration: 2100,
        easing: 'cubic-bezier(0.25, 0.1, 0.25, 1.0)',
        fill: 'forwards'
      });

      setCentralPose('walk1');
      for (let step = 1; step <= 10; step++) {
        schedulePose(step * 185, step % 2 === 0 ? 'walk1' : 'walk2');
      }

      runAltarProstrationAndReturn(item, 2050);
    }
  }

  function runAltarProstrationAndReturn(item, startDelayMs) {
    const centralEl = document.getElementById('centralWorshipper');
    if (!centralEl) return;

    // 1. Đảnh lễ Tam Bái (3 lạy ngũ thể đầu địa trước Đức Phật)
    playThreeBowsSequence(startDelayMs);

    // 2. Lễ tất: Đứng dậy chuẩn bị tịnh tiến về ghế ban đầu
    schedulePose(startDelayMs + 5400, 'kneelDown');
    schedulePose(startDelayMs + 5650, 'walk1');

    // 3. Tịnh tiến lùi từ bàn thờ về lại đúng ghế ban đầu
    const seat = item.devoteeSeat;
    const startDx = seat.startX - 540;
    const startDy = seat.startY - 1192;
    const startScale = seat.startScale;

    const midDx = seat.midX - 540;
    const midDy = seat.midY - 1192;
    const midScale = seat.midScale;

    const walkDownKeyframes = [
      {
        transform: `translate3d(-50%, 0, 0) scale(1)`,
        opacity: 1,
        offset: 0
      },
      {
        transform: `translate3d(calc(-50% + ${midDx}px), ${midDy}px, 0) scale(${midScale})`,
        opacity: 1,
        offset: 0.65
      },
      {
        transform: `translate3d(calc(-50% + ${startDx}px), ${startDy}px, 0) scale(${startScale})`,
        opacity: 1,
        offset: 1
      }
    ];

    const tWalkStart = startDelayMs + 5650;
    const walkDownDuration = 2200;

    prostrationTimers.push(
      setTimeout(() => {
        if (currentWalkAnimation) {
          try { currentWalkAnimation.cancel(); } catch (e) {}
        }
        currentWalkAnimation = centralEl.animate(walkDownKeyframes, {
          duration: walkDownDuration,
          easing: 'cubic-bezier(0.25, 0.1, 0.25, 1.0)',
          fill: 'forwards'
        });
      }, tWalkStart)
    );

    for (let step = 1; step <= 11; step++) {
      schedulePose(tWalkStart + step * 185, step % 2 === 0 ? 'walk1' : 'walk2');
    }

    // 4. Về đến đúng ghế ban đầu -> hạ gối an toạ trên đệm
    schedulePose(tWalkStart + walkDownDuration, 'kneelDown');
    schedulePose(tWalkStart + walkDownDuration + 150, 'kneel');

    prostrationTimers.push(
      setTimeout(() => {
        centralEl.style.opacity = '0';
        centralEl.classList.remove('active', 'showing-wish');
        if (currentWalkAnimation) {
          try { currentWalkAnimation.cancel(); } catch (e) {}
          currentWalkAnimation = null;
        }

        // Khôi phục lại hình ảnh Phật tử đang an toạ trên ghế
        restoreDevoteeSeatToHall(item.devoteeSeat, item.cleanKey);
        activeDevoteeKeys.delete(item.cleanKey);
        if (item.user) activeDevoteeKeys.delete(item.user.toLowerCase());

        currentAltarRitual = null;
        activeAltarUserKey = null;
        activeAltarSeatType = null;
        activeAltarSeatIdx = null;
        activeAltarSeatEl = null;

        // Xử lý người tiếp theo từ 2 cột (chọn người đến trước theo id nhỏ hơn)
        let nextItem = null;
        if (queueL.length > 0 && queueR.length > 0) {
          nextItem = queueL[0].id <= queueR[0].id ? queueL.shift() : queueR.shift();
        } else if (queueL.length > 0) {
          nextItem = queueL.shift();
        } else if (queueR.length > 0) {
          nextItem = queueR.shift();
        }

        if (nextItem) {
          updateWaitingLinePositions();
          executeAltarRitual(nextItem);
        }
      }, tWalkStart + walkDownDuration + 200)
    );
  }

  // Điều phối hàng đợi dâng hương / hoa / đảnh lễ của Phật tử
  function enqueueRitual(user, avatar, actionLabel, wish) {
    const rawName = String(user || 'Phật tử').trim();
    const cleanKey = String(user || 'devotee').trim().toLowerCase().slice(0, 40);

    if (Array.isArray(currentRoomViewers)) {
      const exists = currentRoomViewers.some((u) => (u.uniqueId || u.user) === cleanKey);
      if (!exists && user) {
        currentRoomViewers.push({ user, uniqueId: cleanKey, avatar: avatar || '' });
        if (currentRoomViewers.length > 120) {
          currentRoomViewers.splice(0, currentRoomViewers.length - 120);
        }
      }
    }

    // Nếu người này đang ở trong hàng đợi: cập nhật thêm lời chúc / lễ vật chứ không tạo avatar trùng lặp
    const existingQueueItem = queueL.find((q) => q.cleanKey === cleanKey) ||
                              queueR.find((q) => q.cleanKey === cleanKey);
    if (existingQueueItem && existingQueueItem.state !== 'active_altar') {
      existingQueueItem.actionLabel = actionLabel || existingQueueItem.actionLabel;
      if (wish) existingQueueItem.wish = wish;
      if (existingQueueItem.walkerEl) {
        const actSpan = existingQueueItem.walkerEl.querySelector('.tag-action');
        if (actSpan) actSpan.textContent = existingQueueItem.actionLabel;
      }
      return;
    }

    if (currentAltarRitual && currentAltarRitual.cleanKey === cleanKey) {
      if (wish) triggerCentralWishDisplay(wish);
      return;
    }

    const devoteeSeat = findDevoteeSeat(user, cleanKey);
    activeDevoteeKeys.add(cleanKey);
    if (rawName) activeDevoteeKeys.add(rawName.toLowerCase());

    if (devoteeSeat.el) {
      devoteeSeat.el.classList.add('devotee-at-altar');
    }

    const item = {
      id: ++ritualItemIdSeq,
      user: rawName,
      avatar: avatar || '',
      actionLabel: actionLabel || 'Dâng hương cầu an',
      wish: wish || '',
      cleanKey,
      devoteeSeat,
      state: 'queued',
      walkerEl: null,
      currentSide: 'L',
      currentRow: -1
    };

    if (!currentAltarRitual) {
      executeAltarRitual(item);
    } else {
      // Phân bổ vào 2 cột song song theo từng hàng: Trái -> Phải -> Trái -> Phải
      if (queueL.length <= queueR.length) {
        item.currentSide = 'L';
        queueL.push(item);
      } else {
        item.currentSide = 'R';
        queueR.push(item);
      }
      updateWaitingLinePositions();
    }
  }

  function animateWalkerOnCarpet(user, avatar, actionLabel, wish) {
    enqueueRitual(user, avatar, actionLabel, wish);
  }

  function updateCentralWorshipper(user, avatar, actionLabel, wish, doThreeBows = true) {
    if (doThreeBows) {
      animateWalkerOnCarpet(user, avatar, actionLabel, wish);
      return;
    }

    const nameEl = document.getElementById('centralName');
    const actEl = document.getElementById('centralAction');
    const avatarEl = document.getElementById('centralAvatar');
    const beam = document.getElementById('sacredLightBeam');
    const centralEl = document.getElementById('centralWorshipper');

    if (nameEl) nameEl.textContent = user || 'Thí Chủ Hữu Duyên';
    if (actEl) actEl.textContent = actionLabel || '✨ Dâng hương cầu an';

    // Chỉ hiển thị lời cầu nguyện trong 3 giây và ẩn tên phía dưới đi, sau 3 giây ẩn lời cầu nguyện để hiện lại tên
    triggerCentralWishDisplay(wish || 'Nam Mô A Di Đà Phật, cầu bình an cát tường');

    if (avatarEl) {
      if (avatar) {
        avatarEl.innerHTML = `<img src="${escapeHtml(avatar)}" alt="" />`;
      } else {
        avatarEl.textContent = String(user || '🙏').trim().charAt(0).toUpperCase();
      }
    }
    if (beam) {
      beam.classList.add('intense');
      setTimeout(() => beam.classList.remove('intense'), 4500);
    }

    const haloSys = document.getElementById('buddhaHaloSystem');
    const lotusHand = document.getElementById('lotusHandHalo');
    if (haloSys) {
      haloSys.classList.add('flare');
      setTimeout(() => haloSys.classList.remove('flare'), 3600);
    }
    if (lotusHand) {
      lotusHand.classList.add('flare');
      setTimeout(() => lotusHand.classList.remove('flare'), 3600);
    }
    particles.spawnBellWave(540, 260, 2);

    // Cập nhật dòng thông báo dưới thanh HUD
    const hudName = document.getElementById('devoteeNameLine');
    const hudAct = document.getElementById('devoteeActionTag');
    if (hudName) hudName.textContent = user || 'Thí Chủ';
    if (hudAct) hudAct.textContent = actionLabel || 'Dâng hương';
  }

  // 6. Cập nhật toàn bộ giao diện theo State từ Server (Tối ưu hóa: Frame-Coalescing via rAF)
  let hasInitializedRealLeader = false;
  let pendingUIState = null;
  let isUIStateScheduled = false;

  function updateUIState(st) {
    if (!st) return;
    pendingUIState = st;
    if (!isUIStateScheduled) {
      isUIStateScheduled = true;
      requestAnimationFrame(() => {
        isUIStateScheduled = false;
        if (pendingUIState) {
          executeUIStateUpdate(pendingUIState);
          pendingUIState = null;
        }
      });
    }
  }

  function executeUIStateUpdate(st) {
    if (!st) return;

    if (st.totalIncense != null) {
      document.getElementById('statIncense').textContent = Number(st.totalIncense || 0).toLocaleString('vi-VN');
    }
    if (st.totalMerit != null) {
      document.getElementById('statMerit').textContent = Number(st.totalMerit || 0).toLocaleString('vi-VN');
    }
    if (st.woodenFishHits != null) {
      document.getElementById('statWoodenFish').textContent = Number(st.woodenFishHits || 0).toLocaleString('vi-VN');
    }

    if (st.activeIncenseSticks != null) {
      renderIncenseSticks(st.activeIncenseSticks || 9);
    }

    if (Array.isArray(st.simDevotees) && st.simDevotees.length > 0 && frontRowDevoteesMap.size === 0) {
      initFrontRowDevotees(st.simDevotees);
    }

    if (Array.isArray(st.roomViewers)) {
      currentRoomViewers = st.roomViewers;

      // Khi tải trang lần đầu: những người đang có sẵn trong phòng coi như đã an toạ và phân bổ ghế ngay
      if (!isInitialSyncDone) {
        st.roomViewers.forEach((v) => {
          const key = (v.uniqueId || v.user || '').slice(0, 40);
          if (key && !walkingViewers.has(key)) {
            settledViewers.add(key);
            if (!userSeatMap.has(key)) {
              allocateSeatForUser(v.user, v.uniqueId, v.avatar);
            }
          }
        });
        isInitialSyncDone = true;
      }

      // Dọn dẹp những viewer đã rời phòng khỏi bộ nhớ
      const currentKeys = new Set(st.roomViewers.map((v) => (v.uniqueId || v.user || '').slice(0, 40)));
      userSeatMap.forEach((_, k) => {
        if (!currentKeys.has(k) && !leavingViewers.has(k) && !clearingDevotees.has(k) && !walkingViewers.has(k)) {
          userSeatMap.delete(k);
          viewerMetaMap.delete(k);
          settledViewers.delete(k);
          walkingViewers.delete(k);
          viewerJoinTimestamp.delete(k);
        }
      });
    }

    if (Array.isArray(st.leaderboard)) {
      const lb = st.leaderboard;
      renderVipCushions(lb);
      renderCongregationHall(lb);

      // Đồng bộ tên Chủ Lễ mặc định theo người dẫn đầu thực tế nếu chưa có sự kiện mới
      if (!hasInitializedRealLeader && lb.length > 0) {
        hasInitializedRealLeader = true;
        const topDev = lb[0];
        updateCentralWorshipper(
          topDev.name,
          topDev.avatar,
          `✨ Công đức: ${Number(topDev.merit).toLocaleString('vi-VN')} CĐ`,
          topDev.lastWish || 'Nam Mô A Di Đà Phật, cầu bình an cát tường',
          false
        );
      }

      // Cập nhật Bảng TOP CÔNG ĐỨC ở góc dưới phải (Top 4)
      const lbList = document.getElementById('leaderboardList');
      if (lbList) {
        lbList.innerHTML = lb
          .slice(0, 4)
          .map(
            (item) => `
            <div class="leader-item">
              <span class="leader-rank">${item.rank}</span>
              <span class="leader-name">${escapeHtml(shortenName(item.name, 14))}</span>
              <span class="leader-merit">${Number(item.merit).toLocaleString('vi-VN')}</span>
            </div>
          `
          )
          .join('');
      }
    }

    // Trạng thái kết nối TikTok Live
    const liveDot = document.getElementById('liveDot');
    const liveText = document.getElementById('liveStatusText');
    if (st.tiktok?.connected) {
      liveDot.classList.add('connected');
      liveText.textContent = `LIVE @${st.tiktok.username} • ${st.tiktok.viewerCount || 0} mắt`;
    } else if (st.tiktok?.connecting) {
      liveDot.classList.remove('connected');
      liveText.textContent = `Đang kết nối @${st.tiktok.username}...`;
    } else {
      liveDot.classList.remove('connected');
      liveText.textContent = st.settings?.autoSim
        ? 'CHÙA LINH ỨNG • TỰ ĐỘNG GIẢ LẬP ĐÔNG NGƯỜI'
        : 'CHÙA LINH ỨNG • ĐỨC PHẬT A DI ĐÀ';
    }

    const btnAutoSim = document.getElementById('btnToggleAutoSim');
    if (btnAutoSim && st.settings) {
      btnAutoSim.textContent = st.settings.autoSim
        ? '🤖 Tự động Giả lập Người Xem: ĐANG BẬT'
        : '🤖 Tự động Giả lập Người Xem: TẮT';
      btnAutoSim.classList.toggle('active-toggle', Boolean(st.settings.autoSim));
    }
    if (st.settings) {
      if (typeof st.settings.musicVolume === 'number') {
        audio.setMusicVolume(st.settings.musicVolume);
        const sMus = document.getElementById('sliderMusicVol');
        const vMus = document.getElementById('valMusicVol');
        const pct = Math.round(st.settings.musicVolume * 100);
        if (sMus) sMus.value = String(pct);
        if (vMus) vMus.textContent = `${pct}%`;
      }
      if (typeof st.settings.sutraVolume === 'number') {
        audio.setSutraVolume(st.settings.sutraVolume);
        const sSutra = document.getElementById('sliderSutraVol');
        const vSutra = document.getElementById('valSutraVol');
        const pct = Math.round(st.settings.sutraVolume * 100);
        if (sSutra) sSutra.value = String(pct);
        if (vSutra) vSutra.textContent = `${pct}%`;
      }
      if (typeof st.settings.ttsVolume === 'number') {
        audio.setTtsVolume(st.settings.ttsVolume);
        const sTts = document.getElementById('sliderTtsVol');
        const vTts = document.getElementById('valTtsVol');
        const pct = Math.round(st.settings.ttsVolume * 100);
        if (sTts) sTts.value = String(pct);
        if (vTts) vTts.textContent = `${pct}%`;
      }
    }


    const feed = document.getElementById('eventFeed');
    if (feed && Array.isArray(st.recentEvents)) {
      feed.innerHTML = st.recentEvents
        .slice(0, 8)
        .map((ev) => `<div class="event-feed-item">${formatEventSummary(ev)}</div>`)
        .join('');
    }
  }

  function formatEventSummary(ev) {
    switch (ev.type) {
      case 'burnIncense':
        return `🔥 <strong>${escapeHtml(ev.user)}</strong> dâng ${ev.count} nén nhang (+${ev.merit} CĐ)`;
      case 'strikeWoodenFish':
        return `🪵 <strong>${escapeHtml(ev.user)}</strong> gõ mõ ${ev.count} nhịp (+${ev.merit} CĐ)`;
      case 'ringBell':
        return `🔔 <strong>${escapeHtml(ev.user)}</strong> thỉnh Đại Hồng Chung (+${ev.merit} CĐ)`;
      case 'sendPrayer':
        return `🏮 <strong>${escapeHtml(ev.user)}</strong> cầu phúc: “${escapeHtml(ev.wish)}”`;
      case 'offerGift':
      case 'grandCeremony':
        return `🪷 <strong>${escapeHtml(ev.user)}</strong> dâng <em>${escapeHtml(ev.giftName)}</em> (+${ev.merit} CĐ)`;
      case 'drawFortune':
        return `🎋 <strong>${escapeHtml(ev.user)}</strong> gieo được Quẻ số ${ev.fortune?.number} (${ev.fortune?.rank})`;
      case 'chantSutra':
        return `📿 <strong>${escapeHtml(ev.user)}</strong> tụng: <em>${escapeHtml(ev.sutra?.shortTitle || 'Kinh Phật')}</em> (+${ev.merit} CĐ)`;
      case 'stopSutra':
        return `⏹️ <strong>Khép thời kinh</strong> tụng niệm`;
      default:
        return `✨ <strong>${escapeHtml(ev.user || 'Thí chủ')}</strong> tương tác`;
    }
  }

  // 7. Xử lý hiệu ứng khi có Nghi Thức mới
  let fortuneTimer = null;
  let sutraTimer = null;
  let grandTimer = null;
  let autoReplayEnabled = false;
  let currentSutraEvent = null;

  function triggerRitualVisuals(ev) {
    if (!ev) return;

    if (ev.ttsText && ev.type !== 'drawFortune' && ev.type !== 'chantSutra') {
      audio.enqueueTts(ev.ttsText, { voice: ev.ttsVoice || 'maichi' });
    }

    switch (ev.type) {
      case 'burnIncense': {
        audio.playIncenseChime();
        particles.spawnIncenseBurst(540, 895);
        particles.spawnFloatingMerit(`+${ev.merit} Công Đức`, 540, 860, '#ffe082');
        animateWalkerOnCarpet(ev.user, ev.avatar, `🔥 Dâng ${ev.count} nén hương (+${ev.merit} CĐ)`, ev.wish);
        break;
      }

      case 'strikeWoodenFish': {
        audio.playWoodenFish();
        if (ev.count && ev.count >= 6) {
          setTimeout(() => audio.playWoodenFish(1.08), 110);
        }
        pulseHallBowing();
        triggerWoodenFishBounceAll();
        particles.spawnFloatingMerit(`+${ev.merit} Công Đức`, 890, 935, '#ffd54f');
        break;
      }

      case 'ringBell': {
        audio.playTempleBell(1.0);
        pulseHallBowing();
        particles.spawnBellWave(540, 510, 4);
        particles.spawnFloatingMerit(`+${ev.merit} Công Đức`, 190, 935, '#fff3b0');
        updateCentralWorshipper(ev.user, ev.avatar, `🔔 Thỉnh Đại Hồng Chung (+${ev.merit} CĐ)`, ev.wish);
        document.querySelectorAll('.hall-seat.occupied-seat, .vip-devotee-slot').forEach((el, i) => {
          if (i % 4 === 0) spawnCuteDevoteeBubble(el, '🔔');
          else if (i % 6 === 0) spawnCuteDevoteeBubble(el, '✨');
        });
        break;
      }

      case 'sendPrayer': {
        audio.playIncenseChime();
        spawnSkyLantern(ev.user, ev.wish);
        particles.spawnFloatingMerit(`+${ev.merit} Công Đức`, 540, 920, '#ffb74d');
        animateWalkerOnCarpet(ev.user, ev.avatar, `🏮 Cầu phúc (+${ev.merit} CĐ)`, ev.wish);
        triggerGrandRejoiceAll('🏮');
        break;
      }

      case 'offerGift': {
        audio.playIncenseChime();
        audio.playTempleBell(0.85);
        particles.spawnIncenseBurst(540, 895);
        particles.spawnFloatingMerit(`+${ev.merit} Công Đức`, 540, 840, '#fff3b0');
        animateWalkerOnCarpet(ev.user, ev.avatar, `🪷 Dâng ${ev.giftName} (+${ev.merit} CĐ)`, ev.wish);
        triggerGrandRejoiceAll('🪷');
        break;
      }

      case 'grandCeremony': {
        audio.playTempleBell(1.2);
        setTimeout(() => audio.playTempleBell(1.1), 900);
        particles.spawnGrandCeremonyRain();
        pulseHallBowing();
        showGrandCeremonyBanner(ev.user, ev.giftName, ev.merit);
        animateWalkerOnCarpet(ev.user, ev.avatar, `🐉 ${ev.giftName} (+${ev.merit} CĐ)`, ev.wish);
        triggerGrandRejoiceAll('🐉');
        break;
      }

      case 'drawFortune': {
        audio.playFortuneShake();
        updateCentralWorshipper(
          ev.user,
          ev.avatar,
          `🎋 Đang xin xăm...`,
          `Thí chủ ${ev.user} đang thành tâm xin quẻ...`,
          false
        );
        // Chỉ hiển thị tờ Quẻ Xăm đúng thời điểm giọng đọc bắt đầu vang lên!
        audio.enqueueTts(ev.ttsText || '', {
          voice: ev.ttsVoice || 'maichi',
          onStart: () => {
            audio.playIncenseChime();
            showFortuneModal(ev.user, ev.fortune);
            updateCentralWorshipper(
              ev.user,
              ev.avatar,
              `🎋 Quẻ số ${ev.fortune?.number} (${ev.fortune?.rank})`,
              ev.fortune?.meaning || '',
              true
            );
          },
          onEnd: () => {
            clearTimeout(fortuneTimer);
            fortuneTimer = setTimeout(() => {
              document.getElementById('fortuneModal')?.classList.remove('visible');
            }, 1800);
          }
        });
        break;
      }

      case 'stopSutra': {
        audio.stopSutraAudio(true);
        const dockStop = document.getElementById('btnDockStopSutra');
        if (dockStop) dockStop.style.display = 'none';
        updateCentralWorshipper('Chùa Linh Ứng', '', 'Đã khép thời kinh', 'Tâm an vạn sự an • Công đức viên mãn', false);
        break;
      }

      case 'chantSutra': {
        const sutra = ev.sutra || {};
        currentSutraEvent = ev;
        const actionPrefix = ev.isReplay ? '🔁 Tụng lại' : '📿 Tụng kinh';
        updateCentralWorshipper(
          ev.user,
          ev.avatar,
          `${actionPrefix}: ${sutra.shortTitle || 'Kinh Phật'}`,
          `Thành tâm trì tụng ${sutra.title || 'kinh văn'}...`,
          false
        );
        pulseHallBowing(true);
        particles.spawnFloatingMerit(`+${ev.merit} Công Đức`, 540, 840, '#ffd700');
        particles.spawnBellWave(540, 510, 3);

        const realAudioUrl = sutra.audioUrl || ev.audioUrl;
        if (realAudioUrl) {
          // 1. Nếu đây là sự kiện từ Auto-Sim và đang có bài MP3 phát nền: KHÔNG NGẮT BÀI ĐANG PHÁT!
          if (ev.isAutoSim && audio.isSutraPlaying()) {
            return;
          }

          // 2. Nếu bài MP3 này đang phát rồi (trùng bài): KHÔNG PHÁT LẠI TỪ ĐẦU, TIẾP TỤC PHÁT XUYÊN SUỐT!
          if (audio.isSutraPlaying() && audio.currentSutraUrl === realAudioUrl) {
            return;
          }

          // 3. Phát bài MP3 như nhạc nền xuyên suốt cho đến khi hết bài
          audio.playSutraAudio(realAudioUrl, {
            onStart: () => {
              // 1 tiếng chuông mở màn trang nghiêm
              audio.playTempleBell?.(0.85);
              updateCentralWorshipper(
                ev.user,
                ev.avatar,
                `${actionPrefix} ${sutra.shortTitle || 'Kinh Phật'} (+${ev.merit} CĐ)`,
                sutra.subtitle || '',
                true
              );
              const dockStop = document.getElementById('btnDockStopSutra');
              if (dockStop) dockStop.style.display = 'inline-block';
            },
            onEnd: () => {
              const dockStop = document.getElementById('btnDockStopSutra');
              if (dockStop) dockStop.style.display = 'none';
              if (autoReplayEnabled) {
                clearTimeout(sutraTimer);
                sutraTimer = setTimeout(() => {
                  if (autoReplayEnabled && currentSutraEvent?.sutra) {
                    callRpc('temple.replaySutra', {
                      user: currentSutraEvent.user,
                      sutraId: currentSutraEvent.sutra.id
                    });
                  }
                }, 2500);
              }
            }
          });
        } else {
          // Bài kinh không có file MP3: Giọng đọc ZeroTTS đọc lời kinh,
          // MP3 nhạc nền đang phát (nếu có) sẽ tự động hạ nhỏ (ducking) rồi khôi phục khi đọc xong
          audio.enqueueTts(ev.ttsText || '', {
            voice: ev.ttsVoice || 'maichi',
            onStart: () => {
              audio.startSutraChantAccompaniment(14000);
              updateCentralWorshipper(
                ev.user,
                ev.avatar,
                `${actionPrefix} ${sutra.shortTitle || 'Kinh Phật'} (+${ev.merit} CĐ)`,
                sutra.subtitle || '',
                true
              );
            },
            onEnd: () => {
              if (autoReplayEnabled) {
                clearTimeout(sutraTimer);
                sutraTimer = setTimeout(() => {
                  if (autoReplayEnabled && currentSutraEvent?.sutra) {
                    callRpc('temple.replaySutra', {
                      user: currentSutraEvent.user,
                      sutraId: currentSutraEvent.sutra.id
                    });
                  }
                }, 2500);
              }
            }
          });
        }
        break;
      }
    }
  }

  function spawnSkyLantern(user, wish) {
    const layer = document.getElementById('skyLanternsLayer');
    if (!layer) return;
    const lantern = document.createElement('div');
    lantern.className = 'sky-lantern';
    const leftPos = 80 + Math.floor(Math.random() * 640);
    lantern.style.left = `${leftPos}px`;
    lantern.innerHTML = `
      <div class="sky-lantern-user">🙏 ${escapeHtml(user)}</div>
      <div class="sky-lantern-wish">“${escapeHtml(wish)}”</div>
    `;
    layer.appendChild(lantern);
    setTimeout(() => {
      lantern.remove();
    }, 10600);
  }

  // ============================================================================
  // NGƯỜI MỚI VÀO CHÙA — BƯỚC DỌC THẢM ĐỎ RỒI TỊNH TIẾN SANG 2 BÊN QUỲ LỄ
  // ============================================================================

  // ============================================================================
  // NGƯỜI MỚI VÀO CHÙA — HIỂN THỊ NGAY LẬP TỨC ĐỂ TỊNH TIẾN ĐẾN ĐÚNG VỊ TRÍ CHỈ ĐỊNH
  // ============================================================================

  function enqueueJoinWalker(user, avatar, uniqueId) {
    const key = (uniqueId || user || 'devotee').slice(0, 40);
    // Nếu Phật tử này ĐÃ có ghế và ĐÃ an toạ trong Chánh Điện:
    // TUYỆT ĐỐI KHÔNG xóa khỏi ghế hay bắt đi lại từ cửa, giữ nguyên an toạ
    if (userSeatMap.has(key) && settledViewers.has(key) && !walkingViewers.has(key) && !leavingViewers.has(key)) {
      const seatIdx = userSeatMap.get(key);
      const seatEl = congregationHall?.querySelector(`[data-seat-idx="${seatIdx}"]`);
      if (seatEl) {
        bowSingleDevotee(seatEl, { isComment: false });
        spawnCuteDevoteeBubble(seatEl, '🙏');
      }
      return;
    }
    // Nếu đang trên đường bước vào, không tạo thêm walker trùng lặp
    if (walkingViewers.has(key)) {
      return;
    }
    // Đánh dấu Phật tử đang tịnh tiến — KHÔNG ĐƯỢC hiển thị ở ghế sảnh trước khi an toạ
    walkingViewers.add(key);
    settledViewers.delete(key);
    allocateSeatForUser(user, uniqueId, avatar);

    // Các Phật tử ngồi dọc lối đi thảm đỏ vẫy tay chào đón nhộn nhịp
    triggerAisleDevoteesGreeting();

    // KHI NHIỀU NGƯỜI VÀO CÙNG LÚC: HIỂN THỊ NGAY LẬP TỨC ĐỂ TỊNH TIẾN, KHÔNG PHẢI ĐỢI
    spawnDevoteeWalkToSide(user, avatar, uniqueId);
  }

  const WALKER_START_Y = 1920;

  /**
   * Phật tử mới vào chùa:
   * Hiển thị ngay lập tức khi vào phòng live, tịnh tiến dọc thảm đỏ rồi rẽ vào ghế chỉ định
   * Phase 1 (0–1850ms)  : Bước dọc thảm đỏ đi lên từ đáy (walk1/walk2 luân phiên)
   * Phase 2 (1850–3200ms): Rẽ sang Trái/Phải + tiến đến đúng vị trí đệm ghế chỉ định
   * Phase 3 (3200–3700ms): Hạ gối (kneelDown) → Quỳ chắp tay (kneel)
   * An Tọa (3700ms)      : Bàn giao ghế chính thức trong congregationHall.
   *                        TUYỆT ĐỐI KHÔNG MỜ DẦN — LUÔN HIỂN THỊ CHO ĐẾN KHI RỜI PHÒNG!
   */
  function spawnDevoteeWalkToSide(user, avatar, uniqueId, onComplete) {
    const key = (uniqueId || user || 'devotee').slice(0, 40);
    walkingViewers.add(key);
    settledViewers.delete(key);

    const layer = document.getElementById('carpetWalkerLayer');
    if (!layer) {
      walkingViewers.delete(key);
      if (userSeatMap.has(key)) {
        settledViewers.add(key);
        scheduleRenderCongregationHall(true);
      }
      if (onComplete) onComplete();
      return;
    }

    const targetSeatIdx = allocateSeatForUser(user, uniqueId, avatar);
    const targetSeat = HALL_SEAT_COORDS[targetSeatIdx] || { x: 220, y: 1620, scale: 1.0, row: 2, side: 'L' };

    // Phân luồng xuất phát trên thảm đỏ theo cánh trái / phải và cột ghế để nhiều người đi cùng lúc tự nhiên, không bị đè hình
    const baseOffset = targetSeat.side === 'L' ? -42 : 42;
    const colOffset = ((targetSeat.col || 0) - 1.5) * 16;
    const startX = Math.round(540 + baseOffset + colOffset);

    const destX = targetSeat.x;
    const destY = targetSeat.y;
    const destScale = targetSeat.scale;

    // Offset ngang từ điểm xuất phát (startX) và dọc từ đáy (WALKER_START_Y) đến đích
    const deltaX = destX - startX;
    const deltaY = destY - WALKER_START_Y;

    const walker = document.createElement('div');
    walker.className = 'join-walker';
    walker.style.setProperty('--jw-start-x', `${startX}px`);
    walker.style.setProperty('--jw-dest-x', `${deltaX}px`);
    walker.style.setProperty('--jw-dest-y', `${deltaY}px`);
    walker.style.setProperty('--jw-dest-scale', destScale);
    walker.style.zIndex = 15 + (targetSeat.row || 0) * 2 + 1;

    const avatarHtml = avatar
      ? `<img src="${escapeHtml(avatar)}" alt="" />`
      : escapeHtml(String(user || 'P').charAt(0).toUpperCase());

    walker.innerHTML = `
      <div class="join-walker-sprite-stack">
        <img src="/assets/devotee_walk.png" class="jw-frame jw-frame-walk1" alt="" />
        <img src="/assets/devotee_walk_2.png" class="jw-frame jw-frame-walk2" alt="" />
        <img src="/assets/devotee_kneel_down.png" class="jw-frame jw-frame-kneel-down" alt="" />
        <img src="/assets/devotee.png" class="jw-frame jw-frame-kneel" alt="" />
      </div>
      <div class="join-walker-badge">
        <span class="join-walker-avatar">${avatarHtml}</span>
        <span class="join-walker-name">${escapeHtml(user)}</span>
      </div>
    `;

    layer.appendChild(walker);

    const timers = [];

    // Phase 1: Bước đi lên dọc thảm (Chuyển động bước chân hoàn toàn do GPU CSS xử lý)
    walker.classList.add('jw-phase-walk-up', 'jw-walking');

    // Phase 2: Rẽ sang bên + tiếp tục bước đến đúng vị trí đệm ngồi trong sảnh (1850ms)
    timers.push(setTimeout(() => {
      walker.classList.remove('jw-phase-walk-up');
      walker.classList.add('jw-phase-walk-side');
    }, 1850));

    // Phase 3a: Hạ gối tại đúng vị trí đệm (3200ms)
    timers.push(setTimeout(() => {
      walker.classList.remove('jw-phase-walk-side', 'jw-walking');
      walker.classList.add('jw-phase-kneel-down');
    }, 3200));

    // Phase 3b: Quỳ chắp tay an tọa vào ghế (3700ms)
    // Tịnh tiến hoàn tất -> Bàn giao vị trí chính thức cho congregationHall
    timers.push(setTimeout(() => {
      walker.classList.remove('jw-phase-kneel-down');
      walker.classList.add('jw-phase-kneel');
      walkingViewers.delete(key);
      if (userSeatMap.has(key)) {
        settledViewers.add(key);
        renderCongregationHall([], false); // Bàn giao ngay lập tức ghế sảnh để không có khoảng trống
        setTimeout(() => {
          const seatEl = hallSeatElements[targetSeatIdx] || congregationHall?.querySelector(`[data-seat-idx="${targetSeatIdx}"]`);
          if (seatEl) spawnCuteDevoteeBubble(seatEl, '🙏');
        }, 120);
      }
      // Đợi 1 frame sau khi ghế trong sảnh đã hiển thị ổn định mới dọn dẹp walker
      requestAnimationFrame(() => {
        walker.remove();
        if (onComplete) onComplete();
      });
    }, 3700));

    walker._timers = timers;
  }

  function animateWalkerExitCarpet(el) {
    if (!el) return;
    const cs = window.getComputedStyle(el);
    const anim = el.animate([
      { transform: cs.transform, opacity: 1, offset: 0 },
      { transform: 'translate3d(-50%, 768px, 0) scale(1.1)', opacity: 0, offset: 1 }
    ], {
      duration: 1800,
      easing: 'ease-in',
      fill: 'forwards'
    });
    anim.onfinish = () => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    };
  }

  function spawnDevoteeWalkOut(user, uniqueId, avatar, seatIdx) {
    const key = (uniqueId || user || '').slice(0, 40);
    const layer = document.getElementById('carpetWalkerLayer');
    if (!layer || seatIdx === undefined || seatIdx === null || seatIdx === -1) {
      userSeatMap.delete(key);
      viewerMetaMap.delete(key);
      currentRoomViewers = currentRoomViewers.filter((v) => (v.uniqueId || v.user) !== key);
      renderCongregationHall([], true);
      return;
    }

    const seatCoord = HALL_SEAT_COORDS[seatIdx];
    if (!seatCoord) {
      userSeatMap.delete(key);
      viewerMetaMap.delete(key);
      currentRoomViewers = currentRoomViewers.filter((v) => (v.uniqueId || v.user) !== key);
      renderCongregationHall([], true);
      return;
    }

    // Đánh dấu người này đang bước ra khỏi Chánh Điện
    leavingViewers.add(key);
    settledViewers.delete(key);
    walkingViewers.delete(key);

    // Ẩn riêng nhân vật tại ghế ngồi này, giữ nguyên đệm quỳ trên sàn Chánh Điện
    const seatEl = document.querySelector(`.hall-seat[data-seat-idx="${seatIdx}"]`);
    if (seatEl) {
      const sprite = seatEl.querySelector('.devotee-sprite');
      if (sprite) sprite.style.opacity = '0';
      const badge = seatEl.querySelector('.seat-badge');
      if (badge) badge.style.opacity = '0';
    }

    const initial = String(user || 'P').charAt(0).toUpperCase();
    const avatarHtml = (avatar && avatar.trim().length > 0)
      ? `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(user)}" onerror="this.onerror=null;this.parentElement.textContent='${escapeHtml(initial)}';" />`
      : escapeHtml(initial);

    const startX = seatCoord.x;
    const startY = seatCoord.y;
    const startScale = seatCoord.scale;
    const side = seatCoord.side || (startX < 540 ? 'L' : 'R');

    // Tạo phần tử walker bước ra, đặt toạ độ gốc TRÙNG KHỚP 100% VỚI VỊ TRÍ GHẾ NGỒI
    const walker = document.createElement('div');
    walker.className = 'leave-walker';
    walker.style.left = `${startX}px`;
    walker.style.top = `${startY}px`;
    walker.style.zIndex = String(16 + (seatCoord.row || 0) * 2 + 1);
    walker.style.transform = `translate(-50%, -100%) scale(${startScale})`;

    walker.innerHTML = `
      <div class="queue-sprite-stack">
        <img src="/assets/devotee_walk.png" data-pose="walk1" class="devotee-sprite queue-pose-frame" alt="" />
        <img src="/assets/devotee_walk_2.png" data-pose="walk2" class="devotee-sprite queue-pose-frame" alt="" />
        <img src="/assets/devotee_kneel_down.png" data-pose="kneelDown" class="devotee-sprite queue-pose-frame" alt="" />
        <img src="/assets/devotee.png" data-pose="kneel" class="devotee-sprite queue-pose-frame active" alt="" />
      </div>
      <div class="name-tag queue-name-tag">
        <div class="tag-avatar">${avatarHtml}</div>
        <div class="tag-info">
          <span class="tag-name">${escapeHtml(user)}</span>
          <span class="tag-action">Tạ lễ rời chùa</span>
        </div>
      </div>
    `;

    layer.appendChild(walker);

    const setPose = (pose) => {
      const frames = walker.querySelectorAll('.queue-pose-frame');
      frames.forEach((f) => f.classList.toggle('active', f.getAttribute('data-pose') === pose));
    };

    const spriteStack = walker.querySelector('.queue-sprite-stack');
    if (spriteStack) {
      // Khi bước từ ghế ra giữa thảm đỏ: quay mặt theo hướng di chuyển ngang
      spriteStack.style.transform = side === 'R' ? 'scaleX(-1)' : 'scaleX(1)';
    }

    // Điểm đến giữa Chánh Điện (lối đi thảm đỏ)
    const midX = side === 'L' ? 490 : 590;
    const midY = Math.min(1880, Math.round(startY + 25));
    const midScale = +(0.5 * (startScale + 1.05)).toFixed(2);

    // Điểm thoát ra ngoài cửa Chánh Điện (cuối màn hình)
    const exitX = midX;
    const exitY = 2050;
    const exitScale = 1.15;

    const dx1 = midX - startX;
    const dy1 = midY - startY;
    const dx2 = exitX - startX;
    const dy2 = exitY - startY;

    // Chặng 1 (0 -> 600ms): Đang quỳ tại đệm rồi từ từ đứng dậy (kneel -> kneelDown -> walk1)
    setTimeout(() => {
      if (walker && walker.isConnected) setPose('kneelDown');
    }, 220);

    setTimeout(() => {
      if (walker && walker.isConnected) setPose('walk1');
    }, 480);

    // Chặng 2 (1600ms): Khi đã ra tới giữa thảm đỏ, quay mặt xuôi theo hướng bước ra cửa
    setTimeout(() => {
      if (spriteStack && walker.isConnected) {
        spriteStack.style.transform = 'scaleX(1)';
      }
    }, 1600);

    // Chuỗi keyframe mượt mà từ vị trí ghế -> ra giữa thảm đỏ -> tịnh tiến ra cửa
    const leaveKeyframes = [
      {
        transform: `translate(-50%, -100%) scale(${startScale})`,
        opacity: 1,
        offset: 0
      },
      {
        transform: `translate(-50%, -100%) scale(${startScale})`,
        opacity: 1,
        offset: 0.18 // 0 -> 650ms: đứng dậy tại chỗ trên đệm
      },
      {
        transform: `translate(calc(-50% + ${dx1}px), calc(-100% + ${dy1}px)) scale(${midScale})`,
        opacity: 1,
        offset: 0.46 // 650ms -> 1650ms: bước ra giữa thảm đỏ
      },
      {
        transform: `translate(calc(-50% + ${dx2}px), calc(-100% + ${Math.round(dy2 * 0.72)}px)) scale(${exitScale * 0.95})`,
        opacity: 1,
        offset: 0.80
      },
      {
        transform: `translate(calc(-50% + ${dx2}px), calc(-100% + ${dy2}px)) scale(${exitScale})`,
        opacity: 0,
        offset: 1 // 1650ms -> 3600ms: đi ra khỏi cửa chánh điện
      }
    ];

    const totalDuration = 3600; // 3.6 giây
    // Nhịp bước chân xen kẽ walk1 / walk2
    for (let t = 650; t <= 3400; t += 175) {
      const stepIdx = Math.round((t - 650) / 175);
      setTimeout(() => {
        if (!walker || !walker.isConnected) return;
        setPose(stepIdx % 2 === 0 ? 'walk2' : 'walk1');
      }, t);
    }

    const anim = walker.animate(leaveKeyframes, {
      duration: totalDuration,
      easing: 'cubic-bezier(0.25, 0.1, 0.25, 1.0)',
      fill: 'forwards'
    });

    anim.onfinish = () => {
      if (walker && walker.parentNode) {
        walker.parentNode.removeChild(walker);
      }
      leavingViewers.delete(key);
      userSeatMap.delete(key);
      viewerMetaMap.delete(key);
      currentRoomViewers = currentRoomViewers.filter((v) => (v.uniqueId || v.user) !== key);
      // Nếu không còn ai đang bước ra hoặc chờ dọn dẹp, đồng bộ lại Chánh Điện
      if (leavingViewers.size === 0 && clearingDevotees.size === 0) {
        renderCongregationHall([], true);
      }
    };
  }

  function handleViewerLeft(params) {
    if (!params) return;
    const { user, uniqueId, avatar } = params;
    const key = (uniqueId || user || '').slice(0, 40);

    // 1. Kiểm tra nếu user đang đứng trong hàng đợi 2 cột trên thảm đỏ:
    const idxL = queueL.findIndex((q) => q.cleanKey === key);
    if (idxL !== -1) {
      const item = queueL.splice(idxL, 1)[0];
      if (item && item.walkerEl) {
        animateWalkerExitCarpet(item.walkerEl);
      }
      activeDevoteeKeys.delete(key);
      if (item.user) activeDevoteeKeys.delete(item.user.toLowerCase());
      updateWaitingLinePositions();
      return;
    }

    const idxR = queueR.findIndex((q) => q.cleanKey === key);
    if (idxR !== -1) {
      const item = queueR.splice(idxR, 1)[0];
      if (item && item.walkerEl) {
        animateWalkerExitCarpet(item.walkerEl);
      }
      activeDevoteeKeys.delete(key);
      if (item.user) activeDevoteeKeys.delete(item.user.toLowerCase());
      updateWaitingLinePositions();
      return;
    }

    // 2. Nếu đang bước vào live chưa kịp ngồi (walkingViewers)
    walkingViewers.delete(key);
    settledViewers.delete(key);
    viewerJoinTimestamp.delete(key);

    // 3. Nếu đang có ghế trong sảnh -> đứng dậy và tịnh tiến ra khỏi Chánh Điện:
    let seatIdx = userSeatMap.get(key);
    if (seatIdx === undefined && user) {
      for (const [sKey, sIdx] of userSeatMap.entries()) {
        if (sKey.toLowerCase() === String(user).toLowerCase()) {
          seatIdx = sIdx;
          break;
        }
      }
    }
    if (seatIdx !== undefined) {
      spawnDevoteeWalkOut(user, uniqueId, avatar, seatIdx);
    } else {
      userSeatMap.delete(key);
      viewerMetaMap.delete(key);
      currentRoomViewers = currentRoomViewers.filter((v) => (v.uniqueId || v.user) !== key);
      renderCongregationHall([], true);
    }
  }

  let isClearingHall = false;
  function handleClearingHall() {
    if (isClearingHall) return;
    isClearingHall = true;
    setTimeout(() => {
      isClearingHall = false;
      clearingDevotees.clear();
    }, 25000);

    // 1. Rút lui các Phật tử đang xếp hàng trên thảm đỏ nếu có
    [...queueL, ...queueR].forEach((item) => {
      if (item && item.walkerEl) {
        animateWalkerExitCarpet(item.walkerEl);
      }
      if (item && item.cleanKey) activeDevoteeKeys.delete(item.cleanKey);
      if (item && item.user) activeDevoteeKeys.delete(item.user.toLowerCase());
    });
    queueL.length = 0;
    queueR.length = 0;

    // 2. Thu thập danh sách Phật tử thật trong sảnh cần dọn dẹp
    const viewersToClear = [];
    const processedKeys = new Set();

    userSeatMap.forEach((seatIdx, key) => {
      const seatCoord = HALL_SEAT_COORDS[seatIdx];
      if (seatCoord) {
        processedKeys.add(key);
        const dev = currentRoomViewers.find((v) => (v.uniqueId || v.user) === key);
        viewersToClear.push({
          key,
          user: dev ? dev.user : key,
          uniqueId: key,
          avatar: dev ? dev.avatar : '',
          seatIdx,
          row: seatCoord.row
        });
      }
    });

    currentRoomViewers.forEach((v) => {
      const key = (v.uniqueId || v.user || '').slice(0, 40);
      if (key && !processedKeys.has(key)) {
        const seatIdx = userSeatMap.get(key) ?? allocateSeatForUser(v.user, v.uniqueId, v.avatar);
        const seatCoord = HALL_SEAT_COORDS[seatIdx];
        if (seatCoord) {
          processedKeys.add(key);
          viewersToClear.push({
            key,
            user: v.user || key,
            uniqueId: key,
            avatar: v.avatar || '',
            seatIdx,
            row: seatCoord.row
          });
        }
      }
    });

    if (viewersToClear.length === 0) {
      isClearingHall = false;
      return;
    }

    // Đánh dấu tất cả người trong danh sách để bảo vệ không bị xoá đột ngột bởi updateUIState
    viewersToClear.forEach((v) => clearingDevotees.add(v.key));

    // 3. Trộn ngẫu nhiên danh sách Phật tử để từng người ngẫu nhiên đứng dậy và tịnh tiến ra ngoài
    const shuffledViewers = [...viewersToClear].sort(() => Math.random() - 0.5);

    // 4. Cho từng Phật tử từ từ đứng dậy và bước ra theo nhịp ngẫu nhiên cho đến vị cuối cùng
    shuffledViewers.forEach((v, index) => {
      const delay = index * 450;
      setTimeout(() => {
        clearingDevotees.delete(v.key);
        spawnDevoteeWalkOut(v.user, v.uniqueId, v.avatar, v.seatIdx);
      }, delay);
    });
  }

  function showFortuneModal(user, fortune) {
    if (!fortune) return;
    const modal = document.getElementById('fortuneModal');
    document.getElementById('fortuneRankBadge').textContent = fortune.rank.toUpperCase();
    document.getElementById('fortuneTitle').textContent = `Quẻ Số ${fortune.number} — ${fortune.title}`;
    document.getElementById('fortuneDevotee').textContent = `Thí chủ cầu quẻ: ${user}`;
    document.getElementById('fortunePoem').textContent = fortune.poem;
    document.getElementById('fortuneMeaning').textContent = `Lời bàn: ${fortune.meaning}`;

    modal.classList.add('visible');
    clearTimeout(fortuneTimer);
    fortuneTimer = setTimeout(() => {
      modal.classList.remove('visible');
    }, 15000);
  }

  document.getElementById('fortuneCloseBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('fortuneModal')?.classList.remove('visible');
  });

  document.getElementById('fortuneModal')?.addEventListener('click', () => {
    document.getElementById('fortuneModal')?.classList.remove('visible');
  });

  function syncAutoReplayUI(enabled) {
    autoReplayEnabled = Boolean(enabled);
    const dockBtn = document.getElementById('btnToggleReplay');
    if (dockBtn) {
      dockBtn.textContent = `🔁 Tự Động Replay Kinh: ${autoReplayEnabled ? 'BẬT' : 'TẮT'}`;
      dockBtn.classList.toggle('active-toggle', autoReplayEnabled);
    }
  }

  document.getElementById('btnDockStopSutra')?.addEventListener('click', (e) => {
    e.stopPropagation();
    callRpc('temple.stopSutra', {});
  });

  function showGrandCeremonyBanner(user, giftName, merit) {
    const banner = document.getElementById('grandCeremonyBanner');
    document.getElementById('grandTitle').textContent = `🐉 ${giftName.toUpperCase()} 🐉`;
    document.getElementById('grandSub').textContent = `Đại Thí Chủ ${user} • Công Đức Vô Lượng (+${merit} CĐ)`;
    banner.classList.add('visible');
    clearTimeout(grandTimer);
    grandTimer = setTimeout(() => {
      banner.classList.remove('visible');
    }, 6800);
  }

  // 7.1. Đọc lời chào mừng khi Phật tử mới vào live — Hàng đợi tuần tự Pipelined Prefetch
  // Cơ chế Double-Buffering: Nạp trước (prefetch) file âm thanh của câu tiếp theo trong khi câu trước
  // đang phát trên loa. Ngay khi câu trước dứt lời, câu sau ĐÃ CÓ SẴN trong cache và phát NGAY TỨC THÌ
  // mà không phải chờ tổng hợp ZeroTTS 3-4 giây.
  // Đồng thời đảm bảo câu trước đọc XONG HOÀN TOÀN TRỌN VẸN 100%, tuyệt đối không chồng tiếng hay ngắt ngang!
  let welcomeVoiceEnabled = true;
  const viewerJoinQueue = [];
  let viewerBatchTimer = null;
  let viewerFallbackTimer = null;
  const MAX_WELCOME_PIPELINE = 2; // 1 câu đang phát + 1 câu nạp trước sẵn sàng trong queue

  function getWelcomePipelineCount() {
    return typeof audio.getWelcomePipelineCount === 'function'
      ? audio.getWelcomePipelineCount()
      : (audio.ttsPlaying ? 1 : 0);
  }

  // Đăng ký listener để tự động giải phóng hàng đợi lời chào ngay khi TTS rảnh slot
  audio.onTtsStateChange = (ttsState) => {
    if (!ttsState?.speaking && viewerJoinQueue.length > 0) {
      checkAndDispatchViewerQueue();
    }
  };

  function handleViewerJoinWelcome(user, uniqueId) {
    if (!welcomeVoiceEnabled || !audio.ttsEnabled) return;

    // Đọc tên của user (display name/nickname), không đọc username @uniqueId
    let rawName = String(user || uniqueId || 'Hữu Duyên').replace(/^@/, '').trim();
    // Lọc bỏ ký tự emoji nếu có để ZeroTTS đọc tên trôi chảy, ấm áp
    rawName = rawName.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
    const cleanName = rawName && rawName.length >= 2 ? rawName.slice(0, 25) : 'Hữu Duyên';

    // Đưa vào hàng đợi theo đúng thứ tự gia nhập phòng live, không bỏ sót bất kỳ ai
    viewerJoinQueue.push(cleanName);
    // Giới hạn trần hàng đợi lời chào, tránh bão bot làm tràn RAM
    if (viewerJoinQueue.length > 120) {
      viewerJoinQueue.splice(0, viewerJoinQueue.length - 120);
    }
    checkAndDispatchViewerQueue();
  }

  function checkAndDispatchViewerQueue() {
    if (!welcomeVoiceEnabled || !audio.ttsEnabled) return;
    if (viewerJoinQueue.length === 0) return;

    const pipelineCount = getWelcomePipelineCount();

    // Nếu pipeline đã đầy (1 câu đang phát + 1 câu đang prefetch sẵn sàng):
    // Đặt timer fallback để tiếp tục xả hàng ngay khi slot trống
    if (pipelineCount >= MAX_WELCOME_PIPELINE) {
      if (!viewerFallbackTimer) {
        viewerFallbackTimer = setTimeout(() => {
          viewerFallbackTimer = null;
          checkAndDispatchViewerQueue();
        }, 300);
      }
      return;
    }

    if (viewerFallbackTimer) {
      clearTimeout(viewerFallbackTimer);
      viewerFallbackTimer = null;
    }

    // Nếu pipeline đang rảnh (chưa có ai nói): dispatch nhanh (70ms) để nói ngay
    // Nếu pipeline đang có câu phát: gom nhóm tự nhiên (220ms) để nạp trước câu tiếp theo
    if (!viewerBatchTimer) {
      const delayMs = pipelineCount === 0 ? 70 : 220;
      viewerBatchTimer = setTimeout(() => {
        viewerBatchTimer = null;
        dispatchNextWelcomeBatch();
      }, delayMs);
    }
  }

  function dispatchNextWelcomeBatch() {
    if (!welcomeVoiceEnabled || !audio.ttsEnabled) return;
    if (viewerJoinQueue.length === 0) return;

    const pipelineCount = getWelcomePipelineCount();
    if (pipelineCount >= MAX_WELCOME_PIPELINE) {
      if (!viewerFallbackTimer) {
        viewerFallbackTimer = setTimeout(() => {
          viewerFallbackTimer = null;
          checkAndDispatchViewerQueue();
        }, 300);
      }
      return;
    }

    // Thuật toán gom nhóm tự nhiên theo tải của phòng live:
    // - Hàng đợi >= 4 người: gom 4 người / câu để giải phóng hàng đợi nhanh
    // - Hàng đợi 3 người: gom 3 người / câu
    // - Hàng đợi 2 người: gom 2 người / câu
    // - Hàng đợi 1 người: chào 1 người
    // Đảm bảo 100% người vào live đều được đọc tên theo thứ tự FIFO, không bỏ sót ai!
    let batchSize = 1;
    if (viewerJoinQueue.length >= 4) {
      batchSize = 4;
    } else if (viewerJoinQueue.length === 3) {
      batchSize = 3;
    } else if (viewerJoinQueue.length === 2) {
      batchSize = 2;
    }

    const names = viewerJoinQueue.splice(0, batchSize);
    if (!names.length) return;

    let welcomeText = '';
    if (names.length === 1) {
      welcomeText = `Chào mừng quý phật tử ${names[0]} vào chánh điện`;
    } else {
      const allExceptLast = names.slice(0, -1).join(', ');
      const lastName = names[names.length - 1];
      welcomeText = `Chào mừng quý phật tử ${allExceptLast} và ${lastName} vào chánh điện`;
    }

    // Đưa vào hàng đợi TTS để prefetch âm thanh ngầm ngay lập tức
    audio.enqueueTts(welcomeText, {
      voice: audio.ttsVoice || 'maichi',
      isWelcome: true,
      duckBg: false,
      priority: 'low',
      onEnd: () => {
        // Khi câu đọc này phát xong hoàn toàn trên loa:
        // Lập tức giải phóng và nạp câu kế tiếp nếu còn người chờ
        if (viewerJoinQueue.length > 0) {
          checkAndDispatchViewerQueue();
        }
      }
    });

    // Nếu pipeline vẫn còn slot (ví dụ sau khi dispatch câu 1, slot 2 vẫn trống)
    // và còn người trong viewerJoinQueue, tiếp tục nạp trước câu tiếp theo ngay!
    if (viewerJoinQueue.length > 0 && getWelcomePipelineCount() < MAX_WELCOME_PIPELINE) {
      checkAndDispatchViewerQueue();
    }
  }

  function scheduleProcessViewerJoinQueue() {
    checkAndDispatchViewerQueue();
  }
  window.__handleViewerJoinWelcome = handleViewerJoinWelcome;
  window.__enqueueJoinWalker = enqueueJoinWalker;

  // 8. Kết nối JSON-RPC 2.0 WebSocket & Gửi Lệnh RPC
  let ws = null;
  let rpcId = 1;

  function connectWebSocket() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.method === 'temple.state') {
          updateUIState(msg.params);
        } else if (msg.method === 'temple.event') {
          if (msg.params?.state) updateUIState(msg.params.state);
          if (msg.params?.event) triggerRitualVisuals(msg.params.event);
        } else if (msg.method === 'tts.play') {
          if (msg.params?.url) {
            audio.enqueueTts(msg.params.text || 'Nam mô A Di Đà Phật', {
              voice: msg.params.voice || 'maichi',
              url: msg.params.url
            });
          }
        } else if (msg.method === 'temple.viewerJoined') {
          // Phật tử mới vào chùa — bước dọc thảm rồi rẽ vào ghế quỳ an tọa
          const { user, avatar, uniqueId } = msg.params || {};
          if (user) {
            const key = (uniqueId || user).slice(0, 40);
            if (!currentRoomViewers.some((v) => (v.uniqueId || v.user) === key)) {
              currentRoomViewers.push({ user, uniqueId: key, avatar: avatar || '' });
              if (currentRoomViewers.length > 120) {
                currentRoomViewers.splice(0, currentRoomViewers.length - 120);
              }
            }
            enqueueJoinWalker(user, avatar || '', key);
            handleViewerJoinWelcome(user, uniqueId);
          }
        } else if (msg.method === 'temple.viewerLeft') {
          // Phật tử rời chùa — giải phóng ghế
          handleViewerLeft(msg.params || {});
        } else if (msg.method === 'temple.clearingHall') {
          // Dọn chánh điện — các Phật tử vãng lai từ từ bước ra
          handleClearingHall();
        } else if (msg.method === 'temple.chat') {
          // Người dùng comment: kích hoạt Phật tử tương ứng cúi lạy và hiện bong bóng bình luận
          const { user, uniqueId, avatar, comment } = msg.params || {};
          handleViewerCommentBow(user, uniqueId, avatar, comment);
        }
      } catch (_) { }
    };

    ws.onclose = () => {
      setTimeout(connectWebSocket, 2000);
    };
  }
  connectWebSocket();

  async function callRpc(method, params = {}) {
    audio.ensureContext();
    const payload = {
      jsonrpc: '2.0',
      id: rpcId++,
      method,
      params
    };
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return;
    }
    const res = await fetch('/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data?.result?.state) updateUIState(data.result.state);
    if (data?.result?.event) triggerRitualVisuals(data.result.event);
    return data;
  }

  function getFormInput() {
    const user = document.getElementById('inputDevoteeName')?.value.trim() || 'BLACK';
    const wish =
      document.getElementById('inputDevoteeWish')?.value.trim() ||
      'Cầu cho gia đình bình an, tài lộc hanh thông';
    return { user, wish };
  }

  // Gắn sự kiện tương tác trực tiếp trên màn hình 9:16 & Thanh HUD dưới đáy
  document.getElementById('incenseBurnerZone')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.burnIncense', { user, count: 3, wish });
  });

  document.getElementById('cardIncense')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.burnIncense', { user, count: 3, wish });
  });

  document.getElementById('cardBlessing')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.sendPrayer', { user, wish });
  });

  document.getElementById('cardLotus')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.offerGift', {
      user,
      giftType: 'lotus',
      coins: 20,
      giftName: 'Đài Hoa Sen Vàng',
      wish
    });
  });

  document.getElementById('woodenFishStation')?.addEventListener('click', () => {
    const { user } = getFormInput();
    callRpc('temple.strikeWoodenFish', { user, count: 1 });
  });

  document.getElementById('bellStation')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.ringBell', { user, count: 1, wish, readTts: true });
  });

  document.getElementById('sutraStation')?.addEventListener('click', () => {
    audio.ensureContext();
    const { user } = getFormInput();
    const sutraId = document.getElementById('selectSutra')?.value || 'daibi';
    callRpc('temple.chantSutra', { user, sutraId });
  });

  document.getElementById('fortuneCylinder')?.addEventListener('click', () => {
    audio.ensureContext();
    const { user, wish } = getFormInput();
    callRpc('temple.drawFortune', { user, topic: wish });
  });

  // Các nút trên Quick RPC Dock bên phải
  document.getElementById('btnRpcChantSutra')?.addEventListener('click', () => {
    audio.ensureContext();
    const { user } = getFormInput();
    const sutraId = document.getElementById('selectSutra')?.value || 'daibi';
    callRpc('temple.chantSutra', { user, sutraId });
  });

  document.getElementById('btnRpcReplaySutra')?.addEventListener('click', () => {
    audio.ensureContext();
    const { user } = getFormInput();
    const sutraId = document.getElementById('selectSutra')?.value || currentSutraEvent?.sutra?.id || 'daibi';
    callRpc('temple.replaySutra', { user, sutraId });
  });

  document.getElementById('btnToggleReplay')?.addEventListener('click', () => {
    syncAutoReplayUI(!autoReplayEnabled);
    callRpc('temple.toggleAutoReplay', { enabled: autoReplayEnabled });
  });

  document.getElementById('btnRpcIncense')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.burnIncense', { user, count: 3, wish });
  });

  document.getElementById('btnRpcLantern')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.sendPrayer', { user, wish });
  });

  document.getElementById('btnRpcWoodenFish')?.addEventListener('click', () => {
    const { user } = getFormInput();
    callRpc('temple.strikeWoodenFish', { user, count: 5 });
  });

  document.getElementById('btnRpcBell')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.ringBell', { user, count: 1, wish, readTts: true });
  });

  document.getElementById('btnRpcFortune')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.drawFortune', { user, topic: wish });
  });

  document.getElementById('btnRpcGiftLotus')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.offerGift', {
      user,
      giftType: 'lotus',
      coins: 20,
      giftName: 'Đài Hoa Sen Vàng',
      wish
    });
  });

  document.getElementById('btnRpcGrandCeremony')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.grandCeremony', {
      user,
      coins: 299,
      giftName: 'Đại Lễ Kim Long Chầu Phật',
      wish
    });
  });

  // Nút test: Giả lập người mới vào chùa (kích hoạt animation bước đi sang 2 bên)
  document.getElementById('btnRpcViewerJoin')?.addEventListener('click', () => {
    const { user } = getFormInput();
    const isCustom = user && user !== 'BLACK';
    callRpc('temple.viewerJoin', isCustom ? { user } : { random: true });
  });

  // Nút test: Giả lập Phật tử rời chùa (kích hoạt đứng dậy và bước ra cửa)
  document.getElementById('btnRpcViewerLeave')?.addEventListener('click', () => {
    const { user } = getFormInput();
    const isCustom = user && user !== 'BLACK';
    if (isCustom) {
      callRpc('temple.viewerLeave', { user });
    } else {
      const seatedKeys = Array.from(userSeatMap.keys());
      if (seatedKeys.length > 0) {
        const randKey = seatedKeys[Math.floor(Math.random() * seatedKeys.length)];
        callRpc('temple.viewerLeave', { uniqueId: randKey });
      } else {
        callRpc('temple.viewerLeave', {});
      }
    }
  });

  // Dọn dẹp chánh điện (các phật tử vãng lai từ từ bước ra ngoài, đưa chánh điện về chỉ 2 hàng đầu mặc định)
  document.getElementById('btnRpcClearHall')?.addEventListener('click', () => {
    handleClearingHall();
    callRpc('temple.clearRoomViewers');
  });

  // Gửi bình luận test trực tiếp từ Quick Dock
  const sendDockComment = () => {
    const { user } = getFormInput();
    const inputEl = document.getElementById('inputDockComment');
    const comment = inputEl?.value.trim() || 'Nam Mô A Di Đà Phật';
    callRpc('temple.comment', { user, comment });
  };
  document.getElementById('btnDockSendComment')?.addEventListener('click', sendDockComment);
  document.getElementById('inputDockComment')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendDockComment();
  });

  document.getElementById('btnConnectTikTok')?.addEventListener('click', () => {
    const username = document.getElementById('inputTikTokUser')?.value.trim();
    if (!username) return;
    callRpc('live.connect', { username });
  });

  let autoSimState = false;
  document.getElementById('btnToggleAutoSim')?.addEventListener('click', () => {
    autoSimState = !autoSimState;
    callRpc('live.setAutoSim', { enabled: autoSimState });
  });

  document.getElementById('btnToggleTts')?.addEventListener('click', (e) => {
    audio.ttsEnabled = !audio.ttsEnabled;
    const btn = e.currentTarget;
    btn.textContent = `🎙️ Giọng Đọc: ${audio.ttsEnabled ? 'BẬT' : 'TẮT'}`;
    btn.classList.toggle('active-toggle', audio.ttsEnabled);
  });

  document.getElementById('btnToggleMusic')?.addEventListener('click', (e) => {
    audio.bgMusicEnabled = !audio.bgMusicEnabled;
    if (audio.bgMusicEnabled) {
      audio.startZenAmbience();
    } else {
      audio.stopZenAmbience();
    }
    const btn = e.currentTarget;
    btn.textContent = `🎵 Nhạc Nền: ${audio.bgMusicEnabled ? 'BẬT' : 'TẮT'}`;
    btn.classList.toggle('active-toggle', audio.bgMusicEnabled);
  });

  document.getElementById('btnToggleWelcomeVoice')?.addEventListener('click', (e) => {
    welcomeVoiceEnabled = !welcomeVoiceEnabled;
    const btn = e.currentTarget;
    btn.textContent = `👋 Chào Phật Tử Vào Live: ${welcomeVoiceEnabled ? 'BẬT' : 'TẮT'}`;
    btn.classList.toggle('active-toggle', welcomeVoiceEnabled);
    if (welcomeVoiceEnabled) {
      checkAndDispatchViewerQueue();
    } else {
      viewerJoinQueue.length = 0;
      if (viewerBatchTimer) {
        clearTimeout(viewerBatchTimer);
        viewerBatchTimer = null;
      }
    }
  });

  // Khởi tạo và gắn sự kiện thanh trượt chỉnh âm lượng Nhạc nền & Giọng đọc
  const sliderMusicVol = document.getElementById('sliderMusicVol');
  const valMusicVol = document.getElementById('valMusicVol');
  const sliderSutraVol = document.getElementById('sliderSutraVol');
  const valSutraVol = document.getElementById('valSutraVol');

  function syncMusicSliders(pct) {
    if (valMusicVol) valMusicVol.textContent = `${pct}%`;
    if (sliderMusicVol) sliderMusicVol.value = String(pct);
    if (valSutraVol) valSutraVol.textContent = `${pct}%`;
    if (sliderSutraVol) sliderSutraVol.value = String(pct);
  }

  if (sliderMusicVol && valMusicVol) {
    const initMusPct = Math.round(audio.bgBaseVolume * 100);
    syncMusicSliders(initMusPct);
    sliderMusicVol.addEventListener('input', (e) => {
      const pct = Number(e.target.value);
      syncMusicSliders(pct);
      audio.ensureContext();
      audio.setMusicVolume(pct / 100);
    });
    sliderMusicVol.addEventListener('change', (e) => {
      const pct = Number(e.target.value);
      callRpc('temple.updateSettings', { musicVolume: +(pct / 100).toFixed(2), sutraVolume: +(pct / 100).toFixed(2) });
    });
  }

  if (sliderSutraVol && valSutraVol) {
    sliderSutraVol.addEventListener('input', (e) => {
      const pct = Number(e.target.value);
      syncMusicSliders(pct);
      audio.ensureContext();
      audio.setSutraVolume(pct / 100);
    });
    sliderSutraVol.addEventListener('change', (e) => {
      const pct = Number(e.target.value);
      callRpc('temple.updateSettings', { sutraVolume: +(pct / 100).toFixed(2), musicVolume: +(pct / 100).toFixed(2) });
    });
  }

  const sliderTtsVol = document.getElementById('sliderTtsVol');
  const valTtsVol = document.getElementById('valTtsVol');
  if (sliderTtsVol && valTtsVol) {
    const initTtsPct = Math.round(audio.ttsVolume * 100);
    sliderTtsVol.value = String(initTtsPct);
    valTtsVol.textContent = `${initTtsPct}%`;
    sliderTtsVol.addEventListener('input', (e) => {
      const pct = Number(e.target.value);
      valTtsVol.textContent = `${pct}%`;
      audio.setTtsVolume(pct / 100);
    });
    sliderTtsVol.addEventListener('change', (e) => {
      const pct = Number(e.target.value);
      callRpc('temple.updateSettings', { ttsVolume: +(pct / 100).toFixed(2) });
    });
  }

  // Cho phép bấm vào tiêu đề các mục trong Quick Dock để Thu gọn / Mở rộng linh hoạt
  document.querySelectorAll('.dock-section-title').forEach((titleEl) => {
    titleEl.addEventListener('click', () => {
      const sec = titleEl.closest('.dock-section');
      if (sec) {
        sec.classList.toggle('collapsed');
      }
    });
  });

  function shortenName(name, maxLen = 13) {
    const str = String(name || '');
    return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
