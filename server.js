const express = require('express');
const compression = require('compression');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TTS_CACHE_DIR = path.join(DATA_DIR, 'tts-cache');
const STATE_FILE = path.join(DATA_DIR, 'merit-state.json');

fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });

// ============================================================================
// TTS CACHE JANITOR — Bộ dọn rác an toàn cho thư mục tts-cache
// Nguyên tắc an toàn: KHÔNG bao giờ xóa file < TTS_SAFE_MIN_AGE_MS (2 phút)
// vì browser vẫn có thể đang tải file đó về để phát.
// ============================================================================
const TTS_SAFE_MIN_AGE_MS  = 2  * 60 * 1000; // 2 phút  — "vùng bất khả xâm phạm"
const TTS_MAX_AGE_MS       = 30 * 60 * 1000; // 30 phút — xóa file quá cũ
const TTS_MAX_FILES        = 50;              // Hard quota: tối đa 50 file đồng thời
const TTS_JANITOR_INTERVAL = 3  * 60 * 1000; // Quét mỗi 3 phút

function runTtsCacheJanitor() {
  try {
    const now = Date.now();
    const entries = fs.readdirSync(TTS_CACHE_DIR)
      .filter((f) => f.endsWith('.wav'))
      .map((f) => {
        const full = path.join(TTS_CACHE_DIR, f);
        try {
          const { mtimeMs } = fs.statSync(full);
          return { full, ageMs: now - mtimeMs };
        } catch (_) { return null; }
      })
      .filter(Boolean);

    let deleted = 0;

    // Bước 1: Xóa mọi file vượt quá ngưỡng tuổi thọ tối đa (30 phút)
    for (const e of entries) {
      if (e.ageMs > TTS_MAX_AGE_MS) {
        try { fs.unlinkSync(e.full); deleted++; } catch (_) {}
      }
    }

    // Bước 2: Hard quota — nếu còn quá nhiều file, xóa cũ nhất
    // (chỉ xóa file nằm ngoài "vùng bất khả xâm phạm" 2 phút)
    const safe = entries
      .filter((e) => e.ageMs <= TTS_MAX_AGE_MS && e.ageMs >= TTS_SAFE_MIN_AGE_MS)
      .sort((a, b) => b.ageMs - a.ageMs); // cũ nhất lên đầu
    const liveCount = entries.filter((e) => e.ageMs <= TTS_MAX_AGE_MS).length - deleted;
    if (liveCount > TTS_MAX_FILES) {
      const toEvict = safe.slice(0, liveCount - TTS_MAX_FILES);
      for (const e of toEvict) {
        try { fs.unlinkSync(e.full); deleted++; } catch (_) {}
      }
    }

    if (deleted > 0) {
      console.log(`[TTS Janitor] Đã dọn ${deleted} file âm thanh cũ.`);
    }
  } catch (err) {
    console.warn('[TTS Janitor] Lỗi quét thư mục:', err.message);
  }
}

// Startup: xóa sạch file rác từ phiên live trước (chúng đã chết hoàn toàn)
(function cleanupOnStart() {
  try {
    const files = fs.readdirSync(TTS_CACHE_DIR).filter((f) => f.endsWith('.wav'));
    let n = 0;
    for (const f of files) {
      try { fs.unlinkSync(path.join(TTS_CACHE_DIR, f)); n++; } catch (_) {}
    }
    if (n > 0) console.log(`[TTS Janitor] Khởi động: đã xóa ${n} file tts cũ từ phiên trước.`);
  } catch (_) {}
})();

// Chạy janitor định kỳ mỗi 3 phút khi server đang hoạt động
setInterval(runTtsCacheJanitor, TTS_JANITOR_INTERVAL).unref();

// ============================================================================
// 1. BỘ 18 QUẺ LINH XĂM CHÙA LINH ỨNG (FORTUNE STICKS DECK)
// ============================================================================
const FORTUNE_DECK = [
  {
    number: 1,
    rank: 'Thượng Thượng Cát',
    title: 'Nhật Xuất Đông Phương — Mặt Trời Mọc Phương Đông',
    poem: 'Đông phương nhật xuất chiếu Càn Khôn\nHoa nở đầy cành rạng sắc xuân\nCông danh tài lộc đều viên mãn\nGia đạo bình an phúc lộc tồn.',
    meaning: 'Mọi sự mưu cầu đều đại cát đại lợi. Công việc hanh thông, quý nhân phù trợ, gia đình hòa thuận ấm êm.',
    ttsSummary: 'Quẻ số 1, Thượng Thượng Cát, Nhật Xuất Đông Phương. Mọi sự mưu cầu đều đại cát đại lợi, công danh tài lộc viên mãn, quý nhân phù trợ.'
  },
  {
    number: 8,
    rank: 'Thượng Cát',
    title: 'Kim Liên Khai Nở — Sen Vàng Tỏa Ngát',
    poem: 'Sen vàng nở rộ giữa hồ trong\nHương thơm lan tỏa khắp non sông\nLòng thành thắp nén nhang cầu nguyện\nTrời Phật chứng tri thỏa ước mong.',
    meaning: 'Tâm thiện lành ắt gặp phước báu. Cầu tài đắc tài, cầu bình an đắc bình an, bệnh tật tiêu trừ.',
    ttsSummary: 'Quẻ số 8, Thượng Cát, Kim Liên Khai Nở. Tâm thiện lành ắt gặp phước báu, cầu tài đắc tài, cầu bình an đắc bình an.'
  },
  {
    number: 12,
    rank: 'Đại Cát',
    title: 'Long Vân Tương Hội — Rồng Mây Gặp Gỡ',
    poem: 'Rồng thiêng gặp hội tầng mây xanh\nVượt Vũ Môn Quan rạng rỡ danh\nThí chủ kiên tâm hành thiện đạo\nPhúc dày lộc vượng khắp gia đình.',
    meaning: 'Thời vận đang lên mạnh mẽ. Thi cử đỗ đạt, kinh doanh phát đạt, gặp cơ hội lớn đổi đời.',
    ttsSummary: 'Quẻ số 12, Đại Cát, Long Vân Tương Hội. Thời vận đang lên mạnh mẽ, thi cử đỗ đạt, kinh doanh phát đạt.'
  },
  {
    number: 18,
    rank: 'Thượng Cát',
    title: 'Xuân Phong Đắc Ý — Gió Xuân Thuận Buồm',
    poem: 'Thuận buồm xuôi gió vượt trùng khơi\nBến giác bình yên nắng rạng ngời\nTài lộc dồi dào nhân duyên tốt\nBốn mùa hưng thịnh rộn niềm vui.',
    meaning: 'Đi xa gặp may, buôn bán thuận lợi, tình duyên êm đẹp, người thân mạnh khỏe.',
    ttsSummary: 'Quẻ số 18, Thượng Cát, Xuân Phong Đắc Ý. Thuận buồm xuôi gió, tài lộc dồi dào, nhân duyên tốt đẹp.'
  },
  {
    number: 24,
    rank: 'Trung Cát',
    title: 'Vũ Quá Thiên Thanh — Mưa Tạnh Trời Trong',
    poem: 'Mưa qua trời lại sáng trong ngần\nGian khó lùi xa đón phúc phần\nGiữ vững lòng thành đừng nản chí\nHoa thơm trái ngọt đến mười phân.',
    meaning: 'Khó khăn cũ sắp qua đi, vận may mới đang tới. Hãy kiên nhẫn và giữ tâm bình tĩnh.',
    ttsSummary: 'Quẻ số 24, Trung Cát, Vũ Quá Thiên Thanh. Mưa qua trời lại sáng trong, gian khó lùi xa để đón phúc phần mới.'
  },
  {
    number: 36,
    rank: 'Thượng Thượng Cát',
    title: 'Phúc Tinh Cao Chiếu — Sao Phúc Chiếu Mệnh',
    poem: 'Phúc tinh rực sáng giữa đêm rằm\nTừ bi Phật độ suốt quanh năm\nTài lộc tự nhiên về gõ cửa\nTrăm điều như ý vạn điều lành.',
    meaning: 'Sao Phúc chiếu mạng, tai qua nạn khỏi, tiền tài sung túc, gia đạo hưng long.',
    ttsSummary: 'Quẻ số 36, Thượng Thượng Cát, Phúc Tinh Cao Chiếu. Sao Phúc chiếu mạng, tài lộc tự nhiên gõ cửa, trăm điều như ý.'
  },
  {
    number: 52,
    rank: 'Thượng Cát',
    title: 'Ngọc Xuất Côn Sơn — Ngọc Quý Phát Sáng',
    poem: 'Ngọc quý Côn Sơn tỏa ánh ngời\nBấy lâu rèn giũa nay gặp thời\nTri âm tương ngộ cùng nâng đỡ\nSự nghiệp thăng hoa rạng rỡ đời.',
    meaning: 'Nỗ lực bấy lâu nay sắp được đền đáp xứng đáng. Có người tốt nâng đỡ trong công việc và cuộc sống.',
    ttsSummary: 'Quẻ số 52, Thượng Cát, Ngọc Xuất Côn Sơn. Nỗ lực bấy lâu sắp được đền đáp xứng đáng, sự nghiệp thăng hoa.'
  },
  {
    number: 68,
    rank: 'Đại Cát',
    title: 'Lộc Mã Đồng Hương — Lộc Tài Cùng Tới',
    poem: 'Lộc Mã song hành đến tận nhà\nLàm ăn buôn bán nở như hoa\nTâm thành bố thí thêm công đức\nPhú quý vinh hoa khắp một nhà.',
    meaning: 'Quẻ đại lợi về tài lộc và kinh doanh. Nên làm nhiều việc thiện để phúc đức càng thêm bền vững.',
    ttsSummary: 'Quẻ số 68, Đại Cát, Lộc Mã Đồng Hương. Đại lợi về tài lộc và buôn bán, phú quý vinh hoa khắp một nhà.'
  },
  {
    number: 81,
    rank: 'Thượng Cát',
    title: 'Nguyệt Nhập Trung Thiên — Trăng Rằm Giữa Đỉnh',
    poem: 'Trăng tròn vằng vặc giữa trời thu\nSoi sáng muôn phương sạch mây mù\nTình duyên viên mãn gia đình thuận\nTâm an vạn sự chẳng ưu tư.',
    meaning: 'Tình duyên và gia đạo vô cùng tốt đẹp. Người độc thân dễ gặp ý trung nhân, gia đình thêm tin vui.',
    ttsSummary: 'Quẻ số 81, Thượng Cát, Nguyệt Nhập Trung Thiên. Tình duyên viên mãn, gia đình hòa thuận, tâm an vạn sự lành.'
  },
  {
    number: 99,
    rank: 'Thượng Thượng Cát',
    title: 'Vạn Sự Viên Thành — Cửu Cửu Đại Cát',
    poem: 'Chín tầng mây trắng ánh hào quang\nTừ bi Phật Tổ độ nhân gian\nThí chủ lòng thành dâng lễ bái\nTrọn đời trường thọ hưởng vinh khang.',
    meaning: 'Quẻ tối thượng cát tường. Sức khỏe trường thọ, công danh hiển đạt, vạn sự viên thành.',
    ttsSummary: 'Quẻ số 99, Thượng Thượng Cát, Vạn Sự Viên Thành. Quẻ tối thượng cát tường, sức khỏe trường thọ, vạn sự như ý.'
  }
];

// ============================================================================
// 1B. KHO TÀNG KINH PHẬT TỤNG NIỆM CHÙA LINH ỨNG (BUDDHIST SUTRAS DECK)
// ============================================================================
const SUTRAS_DECK = [
  {
    id: 'nammoadida',
    title: 'Kinh Niệm Phật — Nam Mô A Di Đà Phật',
    shortTitle: 'Niệm Nam Mô A Di Đà Phật',
    subtitle: 'Tiêu trừ nghiệp chướng, vãng sanh Cực Lạc, thân tâm an lạc',
    audioUrl: '/assets/sutra_nammoadida.mp3',
    audioTitle: 'Niệm Nam Mô A Di Đà Phật (Bản Gốc MP3)',
    lines: [
      'Nam mô A Di Đà Phật (Niệm danh hiệu)',
      'Nam mô Bổn Sư Thích Ca Mâu Ni Phật',
      'Nam mô Đại Bi Quán Thế Âm Bồ Tát',
      'Nam mô Đại Thế Chí Bồ Tát',
      'Nam mô Thanh Tịnh Đại Hải Chúng Bồ Tát'
    ],
    ttsChant: 'Nam mô A Di Đà Phật. Nam mô Bổn Sư Thích Ca Mâu Ni Phật. Nam mô Đại Bi Quán Thế Âm Bồ Tát. Nam mô Đại Thế Chí Bồ Tát. Nam mô Thanh Tịnh Đại Hải Chúng Bồ Tát.',
    merit: 30
  },
  {
    id: 'daibi',
    title: 'Thiên Thủ Thiên Nhãn Vô Ngại Đại Bi Tâm Đà La Ni',
    shortTitle: 'Chú Đại Bi',
    subtitle: 'Tiêu trừ chướng nạn, tai qua nạn khỏi, tăng trưởng phước tuệ',
    audioUrl: '/assets/sutra_daibi.mp3',
    audioTitle: 'Chú Đại Bi Tiếng Phạn (Bản Gốc Chân Thực)',
    lines: [
      'Nam mô Hắc ra đát na, đa ra dạ da. Nam mô a rị da',
      'Bà lô kiết đế, thước bát ra da, Bồ Đề tát đỏa bà da',
      'Ma ha tát đỏa bà da, Ma ha ca lô ni ca da',
      'Án, tát bàn ra phạt duệ, số đát na đát tỏa',
      'Nam mô tất kiết lật đỏa y mông a rị da, bà lô kiết đế thất Phật ra lăng đà bà',
      'Án, tất điện đô, mạn đà ra, bạt đà gia, ta bà ha.'
    ],
    ttsChant: 'Nam mô Đại Bi Quán Thế Âm Bồ Tát. Nam mô Hắc ra đát na, đa ra dạ da. Nam mô a rị da, bà lô kiết đế, thước bát ra da. Bồ Đề tát đỏa bà da, Ma ha tát đỏa bà da, Ma ha ca lô ni ca da. Án, tát bàn ra phạt duệ, số đát na đát tỏa. Án, tất điện đô, mạn đà ra, bạt đà gia, ta bà ha.',
    merit: 30
  },
  {
    id: 'langnghiem',
    title: 'Đại Phật Đảnh Thủ Lăng Nghiêm Thần Chú',
    shortTitle: 'Chú Lăng Nghiêm',
    subtitle: 'Hàng phục ma chướng, hộ trì chánh pháp, công đức vô lượng vô biên',
    audioUrl: '/assets/sutra_langnghiem.mp3',
    audioTitle: 'Tâm Chú Thủ Lăng Nghiêm (Tiếng Việt)',
    lines: [
      'Nam mô Lăng Nghiêm Hội Thượng Phật Bồ Tát (3 biến)',
      'Đát điệt tha: Án, a na lệ, tỳ xá đề',
      'Bệ ra bạt xà ra đà rị, bàn đà bàn đà nể',
      'Bạt xà ra báng ni phấn',
      'Hổ hồng đô lô ung phấn, ta bà ha.'
    ],
    ttsChant: 'Nam mô Lăng Nghiêm Hội Thượng Phật Bồ Tát. Đát điệt tha, Án, a na lệ, tỳ xá đề, bệ ra bạt xà ra đà rị, bàn đà bàn đà nể, bạt xà ra báng ni phấn, hổ hồng đô lô ung phấn, ta bà ha.',
    merit: 35
  },
  {
    id: 'batnha',
    title: 'Ma Ha Bát Nhã Ba La Mật Đa Tâm Kinh',
    shortTitle: 'Bát Nhã Tâm Kinh',
    subtitle: 'Khai mở trí tuệ Bát Nhã, dứt trừ phiền não khổ đau, tâm vô quái ngại',
    lines: [
      'Quán Tự Tại Bồ Tát hành thâm Bát Nhã Ba La Mật Đa thời',
      'Chiếu kiến ngũ uẩn giai không, độ nhất thiết khổ ách',
      'Xá Lợi Tử! Sắc bất dị không, không bất dị sắc',
      'Sắc tức thị không, không tức thị sắc',
      'Thọ, tưởng, hành, thức, diệc phục như thị'
    ],
    ttsChant: 'Ma Ha Bát Nhã Ba La Mật Đa Tâm Kinh. Quán Tự Tại Bồ Tát hành thâm Bát Nhã Ba La Mật Đa thời, chiếu kiến ngũ uẩn giai không, độ nhất thiết khổ ách. Xá Lợi Tử, sắc bất dị không, không bất dị sắc, sắc tức thị không, không tức thị sắc.',
    merit: 30
  },
  {
    id: 'vangsanh',
    title: 'Bạt Nhất Thiết Nghiệp Chướng Sanh Tịnh Độ Đà La Ni',
    shortTitle: 'Chú Vãng Sanh',
    subtitle: 'Cầu siêu độ cửu huyền thất tổ, tiêu trừ nghiệp chướng, siêu sanh Cực Lạc',
    lines: [
      'Nam mô a di đa bà dạ, Đa tha già đa dạ',
      'Đa điệt dạ tha, A di rị đô bà tỳ',
      'A di rị đa, tất đam bà tỳ',
      'A di rị đa, tì ca lan đế',
      'A di rị đa, tì ca lan đa, Già di nị, Già già na, Chỉ đa ca lệ, Ta bà ha'
    ],
    ttsChant: 'Nam mô A Di Đà Phật. Nam mô a di đa bà dạ, Đa tha già đa dạ, Đa điệt dạ tha. A di rị đô bà tỳ, A di rị đa tất đam bà tỳ, A di rị đa tì ca lan đế, Ta bà ha.',
    merit: 30
  },
  {
    id: 'duocsu',
    title: 'Dược Sư Lưu Ly Quang Như Lai Quán Đảnh Chân Ngôn',
    shortTitle: 'Chú Dược Sư',
    subtitle: 'Cầu tai qua nạn khỏi, bệnh tật tiêu trừ, thân tâm an lạc diên thọ',
    lines: [
      'Nam mô bạt già phạt đế, Bệ sát xã',
      'Lũ lô thích lưu ly, Bát lạt bà, Hắc ra xà dã',
      'Đát tha yết đa da, A ra ha đế, Tam miệu tam bột đà da',
      'Đát điệt tha: Án! Bệ sát thệ, Bệ sát thệ',
      'Bệ sát xã, Tam một yết đế tát ha'
    ],
    ttsChant: 'Nam mô Dược Sư Lưu Ly Quang Vương Phật. Nam mô bạt già phạt đế, Bệ sát xã, Lũ lô thích lưu ly, Đát tha yết đa da. Đát điệt tha, Án, Bệ sát thệ, Bệ sát thệ, Bệ sát xã, Tam một yết đế tát ha.',
    merit: 30
  },
  {
    id: 'cauan',
    title: 'Kinh Phổ Môn Cầu An & Hồi Hướng Thập Phương',
    shortTitle: 'Kinh Cầu An',
    subtitle: 'Gia đạo bình an, tai ách lánh xa, phúc huệ trang nghiêm',
    lines: [
      'Nguyện ngày an lành, đêm an lành',
      'Đêm ngày sáu thời thường an lành',
      'Tất cả các thời đều an lành',
      'Nguyện xin Tam Bảo thường gia hộ',
      'Nguyện đem công đức này, Hướng về khắp tất cả',
      'Đệ tử và chúng sanh, Đều trọn thành Phật đạo'
    ],
    ttsChant: 'Nguyện ngày an lành, đêm an lành, đêm ngày sáu thời thường an lành, tất cả các thời đều an lành, nguyện xin Tam Bảo thường gia hộ. Nguyện đem công đức này hướng về khắp tất cả, đệ tử và chúng sanh đều trọn thành Phật đạo.',
    merit: 30
  }
];

// ============================================================================
// 2. ZEROTTS PYTHON WORKER MANAGER (VOICE: MAI CHI)
// ============================================================================
class ZeroTTSManager {
  constructor() {
    this.proc = null;
    this.ready = false;
    this.status = 'starting';
    this.voice = 'maichi';
    this.voices = ['maichi'];
    this.model = 'zeroweight-ai/ZeroTTS';
    this.pending = new Map();
    this.inflight = new Map();
    this.reqCounter = 0;
    this.buffer = '';
    this.startWorker();
  }

  resolvePythonBin() {
    const candidates = [
      path.join(__dirname, '.venv', 'Scripts', 'python.exe'), // Windows venv
      path.join(__dirname, '.venv', 'bin', 'python'),        // Linux / macOS venv
      process.env.PYTHON_PATH,
      process.platform === 'win32' ? 'python' : 'python3',
      'python',
      'python3'
    ].filter(Boolean);

    // 1. Ưu tiên binary hợp lệ đã cài đặt đầy đủ gói zerotts
    for (const bin of candidates) {
      if (fs.existsSync(bin)) {
        try {
          const testProc = spawnSync(bin, ['-c', 'import zerotts'], { timeout: 3500 });
          if (testProc.status === 0) return bin;
        } catch (_) {}
      }
    }

    // 2. Thử gọi trực tiếp từ PATH hệ thống nếu binary trong candidates chưa kiểm tra được
    for (const cmd of [process.platform === 'win32' ? 'python' : 'python3', 'python', 'python3']) {
      try {
        const testProc = spawnSync(cmd, ['-c', 'import zerotts'], { timeout: 3500 });
        if (testProc.status === 0) return cmd;
      } catch (_) {}
    }

    // 3. Fallback an toàn nếu chưa kiểm tra được
    for (const bin of candidates) {
      if (fs.existsSync(bin)) return bin;
    }
    return process.platform === 'win32' ? 'python' : 'python3';
  }

  startWorker() {
    const pyBin = this.resolvePythonBin();
    const scriptPath = path.join(__dirname, 'tts_worker.py');
    console.log(`[ZeroTTS] Khởi chạy worker với ${pyBin} (Giọng mặc định: Mai Chi)...`);

    this.status = 'loading';
    this.proc = spawn(pyBin, [scriptPath], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8'
      }
    });

    this.proc.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');
      // Phòng thủ bộ nhớ: tránh buffer phình to nếu worker in chuỗi bất thường không có ký tự xuống dòng
      if (this.buffer.length > 65536) {
        this.buffer = this.buffer.slice(-16384);
      }
      let lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        this.handleWorkerLine(line.trim());
      }
    });

    this.proc.stderr.on('data', (chunk) => {
      const msg = chunk.toString('utf8').trim();
      if (msg) console.log(`[ZeroTTS stderr] ${msg}`);
    });

    this.proc.on('exit', (code) => {
      console.warn(`[ZeroTTS] Worker thoát với mã ${code}`);
      this.ready = false;
      this.status = 'stopped';
      for (const [, item] of this.pending) {
        clearTimeout(item.timer);
        item.resolve({ ok: false, error: 'ZeroTTS worker exited' });
      }
      this.pending.clear();
    });
  }

  handleWorkerLine(line) {
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'status') {
        this.status = msg.status;
        this.model = msg.model || this.model;
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'ready') {
        this.ready = true;
        this.status = 'ready';
        this.voice = msg.voice || 'maichi';
        this.voices = msg.voices || ['maichi'];
        this.model = msg.model || this.model;
        console.log(`[ZeroTTS] Sẵn sàng sau ${msg.loadSec}s! Giọng: ${this.voice} (${this.voices.join(', ')})`);
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'result' && msg.id != null) {
        const entry = this.pending.get(msg.id);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(msg.id);
          entry.resolve(msg);
        }
      } else if (msg.type === 'error') {
        console.error('[ZeroTTS Error]', msg.error);
        this.status = 'error';
        broadcastNotification('tts.status', this.getStatus());
      }
    } catch (err) {
      console.log('[ZeroTTS stdout]', line);
    }
  }

  getStatus() {
    return {
      ready: this.ready,
      status: this.status,
      engine: 'ZeroTTS (zeroweight-ai/ZeroTTS)',
      voice: state.settings.ttsVoice || this.voice || 'maichi',
      voices: this.voices,
      model: this.model
    };
  }

  synthesize(text, voiceOverride) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return Promise.resolve({ ok: false, error: 'Empty text' });
    const voice = (voiceOverride || state.settings.ttsVoice || 'maichi').toLowerCase();
    const dedupKey = `${voice}::${cleanText}`;

    if (this.inflight.has(dedupKey)) {
      return this.inflight.get(dedupKey);
    }

    const promise = new Promise((resolve) => {
      if (!this.proc || !this.ready) {
        return resolve({ ok: false, error: `ZeroTTS đang ở trạng thái: ${this.status}` });
      }
      const id = ++this.reqCounter;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: 'ZeroTTS synthesis timeout' });
      }, 30000);

      this.pending.set(id, { resolve, timer });
      const payload = JSON.stringify({ id, text: cleanText, voice }) + '\n';
      this.proc.stdin.write(payload);
    }).finally(() => {
      this.inflight.delete(dedupKey);
    });

    this.inflight.set(dedupKey, promise);
    return promise;
  }
}

// ============================================================================
// 3. TRẠNG THÁI CHÙA ONLINE & BẢNG VÀNG CÔNG ĐỨC
// ============================================================================
const DEFAULT_STATE = {
  totalIncense: 108,
  totalMerit: 1080,
  woodenFishHits: 360,
  bellRings: 36,
  lanternCount: 18,
  fortuneCount: 12,
  chantCount: 24,
  lastChantedSutra: { sutraId: 'daibi', user: 'Phật Tử Hữu Duyên' },
  autoReplaySutra: false,
  activeIncenseSticks: 9,
  haloIntensity: 0.45,
  offerings: {
    lotus: 3,
    fruit: 2,
    lamp: 2,
    dragon: 1
  },
  devotees: {},
  roomViewers: {},
  recentEvents: [],
  settings: {
    ttsEnabled: true,
    ttsVoice: 'maichi',
    bgMusicEnabled: true,
    sfxEnabled: true,
    smokeDensity: 1.0,
    autoSim: false,
    autoSimIntervalMs: 9500,
    musicVolume: 0.65,
    ttsVolume: 0.95,
    sutraVolume: 0.85
  },
  tiktok: {
    connected: false,
    connecting: false,
    username: 'vlex.os',
    roomId: null,
    viewerCount: 0,
    lastError: null
  }
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return {
        ...DEFAULT_STATE,
        ...saved,
        devotees: saved.devotees || {},
        roomViewers: {},
        offerings: { ...DEFAULT_STATE.offerings, ...(saved.offerings || {}) },
        settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) },
        tiktok: { ...DEFAULT_STATE.tiktok }
      };
    }
  } catch (e) {
    console.warn('[State] Không đọc được merit-state.json, dùng mặc định:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

let state = loadState();

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const toSave = {
      totalIncense: state.totalIncense,
      totalMerit: state.totalMerit,
      woodenFishHits: state.woodenFishHits,
      bellRings: state.bellRings,
      lanternCount: state.lanternCount,
      fortuneCount: state.fortuneCount,
      chantCount: state.chantCount,
      activeIncenseSticks: state.activeIncenseSticks,
      offerings: state.offerings,
      devotees: state.devotees,
      settings: state.settings
    };
    fs.promises.writeFile(STATE_FILE, JSON.stringify(toSave, null, 2), 'utf8').catch((e) => {
      console.error('[State] Lỗi lưu file:', e.message);
    });
  }, 5000); // 5s debounce: giảm 75% lượt ghi SSD so với 1.2s ban đầu
}

function getLeaderboard(limit = 6) {
  return Object.values(state.devotees)
    .sort((a, b) => b.merit - a.merit)
    .slice(0, limit)
    .map((d, index) => ({
      rank: index + 1,
      name: d.name,
      uniqueId: d.uniqueId,
      avatar: d.avatar || '',
      merit: d.merit,
      incense: d.incense || 0,
      lastWish: d.lastWish || ''
    }));
}
// Bộ lọc chặn ký tự lạ (Cuneiform 𒐫, Zalgo, Braille, ký tự spam) & từ ngữ phản cảm
const WEIRD_SPAM_RE = /[\u{12000}-\u{1254F}\uFDFD\u2800-\u28FF\u2580-\u259F]|[\u0300-\u036F]{3,}/u;
const BRACKET_EMOTE_RE = /\[[^\]]{1,24}\]/g;
const ALLOWED_VI_TEXT_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s.,!?]/g;
const ALLOWED_VI_NAME_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s._-]/g;
const VI_LETTER_RE = /[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ]/g;
const BAD_WORDS_RE = /(đá dái|địt|lồn|cặc|đm|vcl|vl|yamate|i cư|lừa đảo|lừa à|te-le gram|telegram|bố là trùm)/i;

function isBlockedSpamOrToxic(raw) {
  if (!raw) return true;
  const s = String(raw);
  if (WEIRD_SPAM_RE.test(s)) return true;
  if (BAD_WORDS_RE.test(s)) return true;
  return false;
}

function sanitizeUserName(rawName) {
  const normalized = String(rawName || '')
    .normalize('NFKC')
    .normalize('NFC')
    .replace(BRACKET_EMOTE_RE, ' ')
    .replace(ALLOWED_VI_NAME_RE, ' ')
    .replace(/(.)\1{3,}/gi, '$1$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 26);

  if (!normalized || BAD_WORDS_RE.test(normalized)) {
    return 'Thí Chủ Hữu Duyên';
  }
  const letters = normalized.match(VI_LETTER_RE) || [];
  if (letters.length < 2) {
    return 'Thí Chủ Hữu Duyên';
  }
  return normalized;
}

function sanitizeWishText(rawWish) {
  if (!rawWish) return '';
  const cleaned = String(rawWish)
    .normalize('NFKC')
    .normalize('NFC')
    .replace(BRACKET_EMOTE_RE, ' ')
    .replace(ALLOWED_VI_TEXT_RE, ' ')
    .replace(/([.,!?])\1+/g, '$1')
    .replace(/(.)\1{2,}/gi, '$1$1')
    .replace(/\s+/g, ' ')
    .replace(/^[.,!?\s-]+|[.,!?\s-]+$/g, '')
    .slice(0, 120);

  if (!cleaned || BAD_WORDS_RE.test(cleaned)) return '';
  const letters = cleaned.match(VI_LETTER_RE) || [];
  if (letters.length < 2) return '';
  return cleaned;
}

// Giới hạn bộ nhớ tối đa cho danh sách Phật tử trong RAM để tránh rò rỉ bộ nhớ (Unbounded Heap Growth)
const MAX_DEVOTEES_CAP = 300;
const PROTECTED_TOP_DEVOTEES = 50;

function pruneDevotees() {
  if (!state || !state.devotees) return;
  const keys = Object.keys(state.devotees);
  if (keys.length <= MAX_DEVOTEES_CAP) return;

  // 1. Chuyển thành danh sách để phân loại
  const allDevotees = keys.map((k) => ({ key: k, ...state.devotees[k] }));
  // Sắp xếp theo công đức giảm dần
  allDevotees.sort((a, b) => (Number(b.merit) || 0) - (Number(a.merit) || 0));

  // 2. Bảo vệ vĩnh viễn Top 50 người có công đức cao nhất (VÙNG BẤT KHẢ XÂM PHẠM)
  const protectedKeys = new Set(allDevotees.slice(0, PROTECTED_TOP_DEVOTEES).map((d) => d.key));

  // 3. Những người còn lại: sắp xếp theo công đức thấp nhất và thời gian hoạt động cũ nhất lên đầu để giải phóng
  const evictCandidates = allDevotees
    .slice(PROTECTED_TOP_DEVOTEES)
    .sort((a, b) => {
      const meritA = Number(a.merit) || 0;
      const meritB = Number(b.merit) || 0;
      if (meritA !== meritB) return meritA - meritB;
      return (Number(a.lastActive) || 0) - (Number(b.lastActive) || 0);
    });

  const countToRemove = keys.length - MAX_DEVOTEES_CAP;
  for (let i = 0; i < countToRemove && i < evictCandidates.length; i++) {
    delete state.devotees[evictCandidates[i].key];
  }
}

function recordDevotee(user, uniqueId, avatar, meritDelta, incenseDelta = 0, giftDelta = 0, wish = '') {
  const displayName = sanitizeUserName(user || uniqueId);
  const cleanWish = sanitizeWishText(wish);
  const key = (uniqueId || displayName).slice(0, 40);
  const isNew = !state.devotees[key];
  if (isNew) {
    state.devotees[key] = {
      name: displayName,
      uniqueId: uniqueId || displayName.toLowerCase().replace(/\s+/g, ''),
      avatar: avatar || '',
      merit: 0,
      incense: 0,
      gifts: 0,
      lastWish: '',
      lastActive: Date.now()
    };
  }
  const dev = state.devotees[key];
  dev.name = displayName;
  if (avatar) dev.avatar = avatar;
  dev.merit += meritDelta;
  dev.incense += incenseDelta;
  dev.gifts += giftDelta;
  dev.lastActive = Date.now();
  if (cleanWish) dev.lastWish = cleanWish;

  state.totalMerit += meritDelta;
  state.haloIntensity = Math.min(1.0, 0.35 + (state.totalMerit % 1000) / 1400);

  // Cắt tỉa bộ nhớ định kỳ nếu vượt quá ngưỡng trần an toàn
  if (isNew && Object.keys(state.devotees).length > MAX_DEVOTEES_CAP + 15) {
    pruneDevotees();
  }

  return dev;
}

function pushEventLog(evt) {
  const entry = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...evt
  };
  state.recentEvents.unshift(entry);
  if (state.recentEvents.length > 35) {
    state.recentEvents.length = 35;
  }
  return entry;
}

function addRoomViewer(user, uniqueId, avatar) {
  if (!state.roomViewers) state.roomViewers = {};
  const cleanName = sanitizeUserName(user || uniqueId);
  const key = (uniqueId || cleanName).slice(0, 40);
  state.roomViewers[key] = {
    user: cleanName,
    uniqueId: key,
    avatar: avatar || '',
    joinedAt: state.roomViewers[key]?.joinedAt || Date.now(),
    lastActive: Date.now()
  };

  // Giới hạn bộ nhớ tối đa 120 người xem trong phòng (xóa người vào sớm nhất nếu vượt quá)
  const keys = Object.keys(state.roomViewers);
  if (keys.length > 120) {
    const oldestKey = keys.sort((a, b) => state.roomViewers[a].joinedAt - state.roomViewers[b].joinedAt)[0];
    delete state.roomViewers[oldestKey];
  }
  return state.roomViewers[key];
}

function removeRoomViewer(uniqueIdOrUser) {
  if (!state.roomViewers) state.roomViewers = {};
  let key = uniqueIdOrUser;
  if (!key) {
    const keys = Object.keys(state.roomViewers);
    if (keys.length === 0) return null;
    key = keys[Math.floor(Math.random() * keys.length)];
  }

  // Nếu tìm trực tiếp bằng key không có, thử tìm theo user name
  if (!state.roomViewers[key]) {
    for (const [k, v] of Object.entries(state.roomViewers)) {
      if (v.user === key || v.uniqueId === key || v.user?.toLowerCase() === String(key).toLowerCase()) {
        key = k;
        break;
      }
    }
  }

  if (state.roomViewers[key]) {
    const removed = state.roomViewers[key];
    delete state.roomViewers[key];
    broadcastNotification('temple.viewerLeft', {
      user: removed.user,
      uniqueId: removed.uniqueId,
      avatar: removed.avatar
    });
    // Trì hoãn gửi temple.state 3500ms để animation tịnh tiến rời chùa (3.2s) trên client hoàn tất mượt mà
    setTimeout(() => {
      broadcastNotification('temple.state', getPublicState());
    }, 3500);
    return removed;
  }
  return null;
}

/**
 * getPublicState()
 * Luôn trả về đầy đủ state:
 * - simDevotees: danh sách 56 Phật tử mặc định đầy đủ
 * - roomViewers: danh sách người xem đang an toạ trong phòng (tối đa 120 người)
 * - leaderboard, recentEvents, settings, tiktok, tts...
 */
function getPublicState() {
  return {
    totalIncense: state.totalIncense,
    totalMerit: state.totalMerit,
    woodenFishHits: state.woodenFishHits,
    bellRings: state.bellRings,
    lanternCount: state.lanternCount,
    fortuneCount: state.fortuneCount,
    chantCount: state.chantCount || 0,
    lastChantedSutra: state.lastChantedSutra || null,
    autoReplaySutra: Boolean(state.autoReplaySutra),
    activeIncenseSticks: state.activeIncenseSticks,
    haloIntensity: state.haloIntensity,
    offerings: state.offerings,
    sutras: SUTRAS_DECK,
    leaderboard: getLeaderboard(24),
    recentEvents: state.recentEvents.slice(0, 15),
    roomViewers: Object.values(state.roomViewers || {}),
    simDevotees: SIM_DEVOTEES,
    settings: state.settings,
    tiktok: state.tiktok,
    tts: zeroTts ? zeroTts.getStatus() : { ready: false, status: 'init', voice: 'maichi' }
  };
}

/**
 * getPublicStateDelta(options)
 * Bản tin trạng thái Delta Patch siêu nhẹ cho các sự kiện real-time:
 * - KHÔNG gửi lại simDevotees (17 KB) và sutras (6 KB) tĩnh lặp đi lặp lại
 * - Giảm kích thước gói tin Like gõ mõ từ ~45 KB xuống còn ~180 B (giảm 99.6%)
 */
function getPublicStateDelta(options = {}) {
  const delta = {
    totalIncense: state.totalIncense,
    totalMerit: state.totalMerit,
    woodenFishHits: state.woodenFishHits,
    bellRings: state.bellRings,
    lanternCount: state.lanternCount,
    fortuneCount: state.fortuneCount,
    chantCount: state.chantCount || 0,
    lastChantedSutra: state.lastChantedSutra || null,
    autoReplaySutra: Boolean(state.autoReplaySutra),
    activeIncenseSticks: state.activeIncenseSticks,
    haloIntensity: state.haloIntensity,
    offerings: state.offerings
  };
  if (options.includeLeaderboard) {
    delta.leaderboard = getLeaderboard(24);
  }
  if (options.includeRecentEvents) {
    delta.recentEvents = state.recentEvents.slice(0, 15);
  }
  if (options.includeRoomViewers) {
    delta.roomViewers = Object.values(state.roomViewers || {});
  }
  return delta;
}

let stateThrottleTimer = null;
function broadcastThrottledState(delayMs = 2000) {
  if (stateThrottleTimer) return;
  stateThrottleTimer = setTimeout(() => {
    stateThrottleTimer = null;
    broadcastNotification('temple.state', getPublicState());
  }, delayMs);
}

// ============================================================================
// 4. NGHI THỨC TƯƠNG TÁC (RITUAL HANDLERS)
// ============================================================================
const Rituals = {
  burnIncense(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(9, Number(params.count) || 3));
    const wish = sanitizeWishText(params.wish) || 'Thành tâm dâng hương bái Phật, cầu bình an cát tường';
    const merit = count * 5;

    state.totalIncense += count;
    state.activeIncenseSticks = Math.min(36, state.activeIncenseSticks + count);
    const devotee = recordDevotee(user, uniqueId, avatar, merit, count, 0, wish);

    const ttsText = params.readTts === false
      ? ''
      : `Nam mô A Di Đà Phật. Cảm tạ thí chủ ${devotee.name} đã thành tâm thắp ${count} nén hương thơm. ${wish}.`;

    const event = pushEventLog({
      type: 'burnIncense',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      count,
      merit,
      wish,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    const patch = getPublicStateDelta({ includeLeaderboard: true, includeRecentEvents: true });
    broadcastNotification('temple.event', { event, state: patch });
    return { event, state: patch };
  },

  strikeWoodenFish(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(50, Number(params.count) || 1));
    const merit = count;

    state.woodenFishHits += count;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 0, 0);

    const event = pushEventLog({
      type: 'strikeWoodenFish',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      count,
      merit,
      ttsText: params.ttsText || ''
    });

    saveState();
    const patch = getPublicStateDelta();
    broadcastNotification('temple.event', { event, state: patch });
    return { event, state: patch };
  },

  ringBell(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(9, Number(params.count) || 1));
    const wish = sanitizeWishText(params.wish) || 'Thỉnh chuông Bát Nhã, phiền não tiêu tan, trí tuệ sáng ngời';
    const merit = count * 10;

    state.bellRings += count;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 0, 0, wish);

    const ttsText = params.readTts
      ? `Thí chủ ${devotee.name} thỉnh Đại Hồng Chung cầu nguyện: ${wish}.`
      : '';

    const event = pushEventLog({
      type: 'ringBell',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      count,
      merit,
      wish,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    const patch = getPublicStateDelta({ includeLeaderboard: true, includeRecentEvents: true });
    broadcastNotification('temple.event', { event, state: patch });
    return { event, state: patch };
  },

  sendPrayer(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const wish = sanitizeWishText(params.wish) || 'Cầu cho quốc thái dân an, gia đình mạnh khỏe hạnh phúc';
    const merit = 10;

    state.lanternCount += 1;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 1, 0, wish);

    const ttsText = params.readTts === false
      ? ''
      : `Lời cầu nguyện của thí chủ ${devotee.name}: ${wish}. Nam mô A Di Đà Phật.`;

    const event = pushEventLog({
      type: 'sendPrayer',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      wish,
      merit,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    const patch = getPublicStateDelta({ includeLeaderboard: true, includeRecentEvents: true });
    broadcastNotification('temple.event', { event, state: patch });
    return { event, state: patch };
  },

  offerGift(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const coins = Math.max(1, Number(params.coins) || 10);
    const giftType = ['lotus', 'fruit', 'lamp', 'dragon'].includes(params.giftType)
      ? params.giftType
      : (coins >= 100 ? 'dragon' : coins >= 20 ? 'fruit' : coins >= 5 ? 'lamp' : 'lotus');

    const giftLabels = {
      lotus: 'Đài Hoa Sen Vàng',
      fruit: 'Mâm Ngũ Quả Cát Tường',
      lamp: 'Đèn Lưu Ly Trí Tuệ',
      dragon: 'Đại Lễ Kim Long Chầu Phật'
    };
    const giftName = params.giftName || giftLabels[giftType];
    const multiplier = coins >= 100 ? 50 : coins >= 10 ? 30 : 20;
    const merit = Math.max(20, coins * multiplier);

    state.offerings[giftType] = (state.offerings[giftType] || 0) + 1;
    state.totalIncense += 3;
    state.activeIncenseSticks = Math.min(36, state.activeIncenseSticks + 3);

    const wish = params.wish || `Dâng cúng ${giftName} lên Tam Bảo`;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 3, 1, wish);

    const ttsText = params.readTts === false
      ? ''
      : `Công đức vô lượng! Cảm tạ thí chủ ${devotee.name} đã phát tâm dâng cúng ${giftName}, tích thêm ${merit} điểm công đức. Nguyện cầu chư Phật gia hộ cho thí chủ vạn sự cát tường như ý.`;

    const event = pushEventLog({
      type: giftType === 'dragon' ? 'grandCeremony' : 'offerGift',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      giftType,
      giftName,
      coins,
      merit,
      wish,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    const patch = getPublicStateDelta({ includeLeaderboard: true, includeRecentEvents: true });
    broadcastNotification('temple.event', { event, state: patch });
    return { event, state: patch };
  },

  drawFortune(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const topic = sanitizeWishText(params.topic) || 'Gia đạo, Tài lộc và Bình an';
    const fortune = FORTUNE_DECK[Math.floor(Math.random() * FORTUNE_DECK.length)];
    const merit = 10;

    state.fortuneCount += 1;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 0, 0, `Xin xăm: Quẻ số ${fortune.number} (${fortune.rank})`);

    const ttsText = params.readTts === false
      ? ''
      : `Thí chủ ${devotee.name} vừa gieo được ${fortune.ttsSummary}`;

    const event = pushEventLog({
      type: 'drawFortune',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      topic,
      fortune,
      merit,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    const patch = getPublicStateDelta({ includeLeaderboard: true, includeRecentEvents: true });
    broadcastNotification('temple.event', { event, state: patch });
    return { event, state: patch };
  },

  chantSutra(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const sutraId = String(params.sutraId || '').toLowerCase().trim();
    const isReplay = Boolean(params.isReplay);

    let sutra = SUTRAS_DECK.find(s => s.id === sutraId);
    if (!sutra) {
      if (params.random) {
        sutra = SUTRAS_DECK[Math.floor(Math.random() * SUTRAS_DECK.length)];
      } else {
        sutra = SUTRAS_DECK[0]; // Mặc định Chú Đại Bi
      }
    }

    const merit = sutra.merit || 30;
    state.chantCount = (state.chantCount || 0) + 1;
    state.woodenFishHits = (state.woodenFishHits || 0) + 9;
    state.activeIncenseSticks = Math.min(15, (state.activeIncenseSticks || 0) + 3);

    const actionDesc = isReplay ? `🔁 Tụng lại: ${sutra.shortTitle}` : `Tụng kinh: ${sutra.shortTitle}`;
    const devotee = recordDevotee(
      user,
      uniqueId,
      avatar,
      merit,
      3,
      9,
      actionDesc
    );

    // Lưu lại bài kinh vừa tụng để sẵn sàng replay
    state.lastChantedSutra = {
      sutraId: sutra.id,
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      sutra,
      timestamp: Date.now()
    };

    const hasRealAudio = Boolean(sutra.audioUrl);
    const ttsText = (params.readTts === false || hasRealAudio)
      ? ''
      : isReplay
        ? `Phật tử ${devotee.name} thành tâm tụng lại thời kinh ${sutra.title}. ${sutra.ttsChant}`
        : `Phật tử ${devotee.name} phát tâm thọ trì tụng niệm ${sutra.title}. ${sutra.ttsChant}`;

    const event = pushEventLog({
      type: 'chantSutra',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      sutra,
      audioUrl: sutra.audioUrl || null,
      merit,
      isReplay,
      isAutoSim: Boolean(params.isAutoSim),
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    const patch = getPublicStateDelta({ includeLeaderboard: true, includeRecentEvents: true });
    broadcastNotification('temple.event', { event, state: patch });
    return { event, state: patch };
  },

  replaySutra(params = {}) {
    const last = state.lastChantedSutra || {
      sutraId: 'daibi',
      user: params.user || 'Phật Tử Hữu Duyên'
    };
    const user = params.user ? sanitizeUserName(params.user) : (last.user || 'Phật Tử Hữu Duyên');
    const uniqueId = params.uniqueId || last.uniqueId || '';
    const avatar = params.avatar || last.avatar || '';
    const sutraId = params.sutraId || last.sutraId || 'daibi';

    return this.chantSutra({
      user,
      uniqueId,
      avatar,
      sutraId,
      isReplay: true
    });
  },

  toggleAutoReplay(enabled) {
    state.autoReplaySutra = typeof enabled === 'boolean' ? enabled : !state.autoReplaySutra;
    saveState();
    broadcastNotification('temple.state', getPublicState());
    return { autoReplaySutra: state.autoReplaySutra, state: getPublicState() };
  },

  stopSutra() {
    state.lastChantedSutra = null;
    const event = pushEventLog({
      type: 'stopSutra',
      user: 'Chùa Linh Ứng',
      merit: 0
    });
    saveState();
    const patch = getPublicStateDelta({ includeRecentEvents: true });
    broadcastNotification('temple.event', { event, state: patch });
    return { ok: true, event };
  },

  grandCeremony(params = {}) {
    return this.offerGift({
      ...params,
      giftType: 'dragon',
      coins: Math.max(100, Number(params.coins) || 199),
      giftName: params.giftName || 'Đại Lễ Hào Quang Vạn Trượng'
    });
  },

  updateSettings(params = {}) {
    state.settings = {
      ...state.settings,
      ...params
    };
    if (typeof params.autoSim === 'boolean') {
      configureAutoSim(params.autoSim);
    }
    saveState();
    broadcastNotification('temple.state', getPublicState());
    return getPublicState();
  },

  resetMerit() {
    state.totalIncense = 9;
    state.totalMerit = 0;
    state.woodenFishHits = 0;
    state.bellRings = 0;
    state.lanternCount = 0;
    state.fortuneCount = 0;
    state.chantCount = 0;
    state.activeIncenseSticks = 3;
    state.offerings = { lotus: 1, fruit: 1, lamp: 1, dragon: 0 };
    state.devotees = {};
    state.recentEvents = [];
    state.roomViewers = {};
    saveState();
    broadcastNotification('temple.state', getPublicState());
    return getPublicState();
  },

  clearRoomViewers() {
    const leavingKeys = Object.keys(state.roomViewers || {});
    state.roomViewers = {};
    saveState();
    broadcastNotification('temple.clearingHall', { keys: leavingKeys });
    const delayMs = Math.min(22000, 4500 + leavingKeys.length * 450);
    setTimeout(() => {
      broadcastNotification('temple.state', getPublicState());
    }, delayMs);
    return getPublicState();
  }
};

// ============================================================================
// 5. TIKTOK LIVE CONNECTOR & COMMENT PARSER
// ============================================================================
let tiktokConn = null;

const commentCooldownMap = new Map();

function parseViewerComment(commentText, user, uniqueId, avatar) {
  const raw = String(commentText || '').trim();
  if (!raw || isBlockedSpamOrToxic(raw)) {
    return null;
  }

  const cleanWish = sanitizeWishText(raw);
  if (!cleanWish || cleanWish.length < 3) {
    return null;
  }

  // Chống 1 người spam bình luận liên tục làm nghẽn hàng đợi TTS (cooldown 3.5 giây/người)
  const userKey = uniqueId || user || '';
  const now = Date.now();
  if (userKey) {
    const lastTs = commentCooldownMap.get(userKey) || 0;
    if (now - lastTs < 3500) {
      return null;
    }
    commentCooldownMap.set(userKey, now);
    if (commentCooldownMap.size > 600) {
      const oldestKey = commentCooldownMap.keys().next().value;
      commentCooldownMap.delete(oldestKey);
    }
  }

  const cleanUser = sanitizeUserName(user);
  const lower = cleanWish.toLowerCase();

  // 0A. Replay / Tụng lại thời kinh vừa đọc
  if (
    lower.includes('replay') ||
    lower.includes('tụng lại') ||
    lower.includes('tung lai') ||
    lower.includes('đọc lại') ||
    lower.includes('doc lai') ||
    lower.includes('lặp lại') ||
    lower.includes('lap lai')
  ) {
    return Rituals.replaySutra({ user: cleanUser, uniqueId, avatar });
  }

  // 0B. Tụng Kinh / Đọc Kinh (Ưu tiên nhận diện trước khi xử lý gõ mõ hay cầu nguyện)
  if (
    lower.includes('tụng kinh') ||
    lower.includes('tung kinh') ||
    lower.includes('đọc kinh') ||
    lower.includes('doc kinh') ||
    lower.includes('khai kinh') ||
    lower.includes('chú đại bi') ||
    lower.includes('chu dai bi') ||
    lower.includes('đại bi') ||
    lower.includes('dai bi') ||
    lower.includes('lăng nghiêm') ||
    lower.includes('lang nghiem') ||
    lower.includes('chú lăng nghiêm') ||
    lower.includes('chu lang nghiem') ||
    lower.includes('bát nhã') ||
    lower.includes('bat nha') ||
    lower.includes('vãng sanh') ||
    lower.includes('vang sanh') ||
    lower.includes('dược sư') ||
    lower.includes('duoc su') ||
    lower.includes('cầu an') ||
    lower.includes('cau an') ||
    lower.includes('hồi hướng') ||
    lower.includes('hoi huong')
  ) {
    let chosenId = 'nammoadida';
    if (lower.includes('đại bi') || lower.includes('dai bi')) chosenId = 'daibi';
    else if (lower.includes('lăng nghiêm') || lower.includes('lang nghiem')) chosenId = 'langnghiem';
    else if (lower.includes('bát nhã') || lower.includes('bat nha')) chosenId = 'batnha';
    else if (lower.includes('vãng sanh') || lower.includes('vang sanh')) chosenId = 'vangsanh';
    else if (lower.includes('dược sư') || lower.includes('duoc su')) chosenId = 'duocsu';
    else if (lower.includes('cầu an') || lower.includes('cau an') || lower.includes('hồi hướng') || lower.includes('hoi huong')) chosenId = 'cauan';
    return Rituals.chantSutra({ user: cleanUser, uniqueId, avatar, sutraId: chosenId });
  }

  // 1. Xin xăm / Gieo quẻ
  if (
    lower.includes('xin xăm') ||
    lower.includes('xin xam') ||
    lower.includes('gieo quẻ') ||
    lower.includes('gieo que') ||
    lower.includes('rút quẻ') ||
    lower.includes('rut que') ||
    lower.includes('quẻ') ||
    lower.includes('que')
  ) {
    return Rituals.drawFortune({ user: cleanUser, uniqueId, avatar, topic: cleanWish });
  }

  // 2. Thỉnh chuông
  if (lower.includes('chuông') || lower.includes('chuong') || lower.includes('thỉnh chuông')) {
    return Rituals.ringBell({ user: cleanUser, uniqueId, avatar, count: 1, wish: cleanWish, readTts: true });
  }

  // 3. Gõ mõ
  if (lower.includes('gõ mõ') || lower.includes('go mo') || lower.includes('mõ')) {
    return Rituals.strikeWoodenFish({ user: cleanUser, uniqueId, avatar, count: 3 });
  }

  // 4. Thắp hương / Bái Phật
  if (
    lower.includes('thắp hương') ||
    lower.includes('thap huong') ||
    lower.includes('dâng hương') ||
    lower.includes('dang huong') ||
    lower.includes('bái phật') ||
    lower.includes('bai phat') ||
    lower.includes('lạy phật') ||
    lower.includes('lay phat') ||
    lower.includes('thắp nhang') ||
    lower.includes('thap nhang') ||
    lower.includes('dâng nhang') ||
    lower.includes('dang nhang') ||
    lower.includes('nén hương') ||
    lower.includes('nen huong') ||
    lower.includes('nén nhang') ||
    lower.includes('nen nhang')
  ) {
    return Rituals.burnIncense({ user: cleanUser, uniqueId, avatar, count: 3, wish: cleanWish });
  }

  // 5. Cầu nguyện / Thả đèn hoa đăng
  if (
    lower.includes('cầu') ||
    lower.includes('cau ') ||
    lower.includes('nguyện') ||
    lower.includes('nguyen') ||
    lower.includes('nam mô') ||
    lower.includes('nam mo') ||
    lower.includes('mô phật') ||
    lower.includes('mo phat') ||
    lower.includes('a di đà') ||
    lower.includes('a di da') ||
    lower.includes('bình an') ||
    lower.includes('tài lộc') ||
    lower.includes('chúc')
  ) {
    return Rituals.sendPrayer({ user: cleanUser, uniqueId, avatar, wish: cleanWish });
  }

  // Nếu bình luận là giao lưu/trao đổi thông thường, không chứa từ khóa nghi thức tâm linh:
  // Bình luận đã được phát sóng để Phật tử cúi lạy và hiển thị bong bóng chat (temple.chat).
  // Tuyệt đối KHÔNG tự động ép thành thắp hương hay sinh file TTS để tránh bão file .wav rác tràn ổ đĩa!
  return null;
}

const giftComboTracker = new Map();

async function resolveTikTokUsername(rawInput) {
  let input = String(rawInput || '').trim();
  if (!input) {
    throw new Error('Vui lòng nhập @username hoặc link TikTok Live cần kết nối');
  }
  if (input.startsWith('http://') || input.startsWith('https://') || input.includes('tiktok.com/')) {
    const urlToFetch = input.startsWith('http') ? input : `https://${input}`;
    const directMatch = urlToFetch.match(/tiktok\.com\/@([^/?#]+)/i);
    if (directMatch && directMatch[1]) {
      return directMatch[1];
    }
    try {
      const resp = await fetch(urlToFetch, { redirect: 'follow' });
      const finalUrl = resp.url || '';
      const resolvedMatch = finalUrl.match(/tiktok\.com\/@([^/?#]+)/i);
      if (resolvedMatch && resolvedMatch[1]) {
        return resolvedMatch[1];
      }
    } catch (e) {
      console.warn('[TikTok URL Resolve Warning]', e.message);
    }
  }
  return input.replace(/^@/, '').split(/[/?#]/)[0].trim();
}

function extractUserFromEvent(data) {
  const u = data?.user || data || {};
  const uniqueId = u.uniqueId || u.displayId || data?.uniqueId || '';
  const user = u.nickname || uniqueId || data?.nickname || 'Thí Chủ';
  const avatar =
    u.profilePictureUrl ||
    u.avatarLarge?.urlList?.[0] ||
    u.avatarThumb?.urlList?.[0] ||
    u.avatarMedium?.urlList?.[0] ||
    data?.profilePictureUrl ||
    '';
  return { user, uniqueId, avatar };
}

async function connectTikTokLive(usernameOrUrl) {
  const cleanUser = await resolveTikTokUsername(usernameOrUrl);
  if (!cleanUser) {
    throw new Error('Không tìm thấy @username hợp lệ từ dữ liệu nhập vào');
  }

  if (tiktokConn) {
    try {
      await tiktokConn.disconnect();
    } catch (_) { }
    tiktokConn = null;
  }

  state.tiktok = {
    connected: false,
    connecting: true,
    username: cleanUser,
    roomId: null,
    viewerCount: 0,
    lastError: null
  };
  broadcastNotification('temple.state', getPublicState());

  tiktokConn = new TikTokLiveConnection(cleanUser, {
    processInitialData: false,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: false
  });

  tiktokConn.on(ControlEvent.CONNECTED, (roomState) => {
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    state.tiktok.lastError = null;
    console.log(`[TikTok Live] Đã kết nối phòng @${cleanUser} (roomId: ${state.tiktok.roomId})`);
    broadcastNotification('temple.state', getPublicState());
  });

  tiktokConn.on(ControlEvent.DISCONNECTED, () => {
    try { flushLikeBatch(); } catch (_) {}
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    console.log(`[TikTok Live] Đã ngắt kết nối @${cleanUser}`);
    broadcastNotification('temple.state', getPublicState());
  });

  tiktokConn.on(ControlEvent.ERROR, (err) => {
    state.tiktok.lastError = err?.message || String(err);
    console.warn('[TikTok Live Warning]', state.tiktok.lastError);
    broadcastNotification('temple.state', getPublicState());
  });

  tiktokConn.on(WebcastEvent.ROOM_USER, (data) => {
    const viewerCount = Number(data?.total ?? data?.viewerCount ?? 0);
    if (viewerCount > 0) {
      state.tiktok.viewerCount = viewerCount;
      broadcastNotification('temple.viewerCount', { viewerCount });
    }
  });

  // Rate-limiter cho sự kiện MEMBER: mỗi user chỉ kích hoạt animation 1 lần / 8 giây
  const memberAnimCooldown = new Map();

  tiktokConn.on(WebcastEvent.MEMBER, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    recordDevotee(user, uniqueId, avatar, 1, 0, 0, 'Đã vào Chánh Điện lễ Phật');
    addRoomViewer(user, uniqueId, avatar);
    broadcastThrottledState(2000);

    // Chỉ phát sự kiện animation nếu user chưa kích hoạt trong 8 giây gần đây
    const now = Date.now();
    const cooldownKey = uniqueId || user;
    const lastAnimMs = memberAnimCooldown.get(cooldownKey) || 0;
    if (now - lastAnimMs >= 8000) {
      memberAnimCooldown.set(cooldownKey, now);
      // Giới hạn bộ nhớ Map tránh leak (giữ tối đa 300 entry)
      if (memberAnimCooldown.size > 300) {
        memberAnimCooldown.delete(memberAnimCooldown.keys().next().value);
      }
      broadcastNotification('temple.viewerJoined', { user, uniqueId, avatar });
    }
  });

  tiktokConn.on(WebcastEvent.CHAT, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const commentText = data?.content || data?.comment || '';
    console.log(`[TikTok Chat] ${user}: ${commentText}`);
    addRoomViewer(user, uniqueId, avatar);
    broadcastNotification('temple.chat', { user, uniqueId, avatar, comment: commentText });
    parseViewerComment(commentText, user, uniqueId, avatar);
  });

  // ==========================================================================
  // LIKE BATCHING BUFFER — Gom nhóm lượt Like trong cửa sổ 500ms
  // Giảm tần số bắn WebSocket từ 30-50 packets/s xuống còn tối đa 2 packets/s,
  // bảo toàn 100% điểm công đức cho từng Phật tử tap tim mà không làm lag Client.
  // ==========================================================================
  const LIKE_BATCH_WINDOW_MS = 500;
  const likeUserBuffer = new Map();
  let likeBatchTimer = null;

  function flushLikeBatch() {
    if (likeBatchTimer) {
      clearTimeout(likeBatchTimer);
      likeBatchTimer = null;
    }
    if (likeUserBuffer.size === 0) return;

    let totalBatchLikes = 0;
    let topLiker = null;
    let maxUserLikes = 0;
    const participantCount = likeUserBuffer.size;

    // 1. Ghi nhận chính xác 100% công đức cho từng Phật tử đã like trong 500ms
    for (const [, entry] of likeUserBuffer) {
      const userCount = entry.count;
      totalBatchLikes += userCount;
      const devotee = recordDevotee(entry.user, entry.uniqueId, entry.avatar, userCount, 0, 0);
      if (userCount > maxUserLikes) {
        maxUserLikes = userCount;
        topLiker = devotee;
      }
    }
    likeUserBuffer.clear();

    if (totalBatchLikes <= 0) return;

    // 2. Cập nhật tổng số nhịp mõ chánh điện
    state.woodenFishHits += totalBatchLikes;

    // 3. Tên người hiển thị đại diện: người like nhiều nhất trong đợt này
    const primaryName = topLiker?.name || 'Phật Tử Hữu Duyên';
    const displayName = participantCount > 1
      ? `${primaryName} và các Phật tử`
      : primaryName;

    const event = pushEventLog({
      type: 'strikeWoodenFish',
      user: displayName,
      uniqueId: topLiker?.uniqueId || '',
      avatar: topLiker?.avatar || '',
      count: totalBatchLikes,
      merit: totalBatchLikes,
      ttsText: ''
    });

    saveState();
    const patch = getPublicStateDelta();
    broadcastNotification('temple.event', { event, state: patch });
  }

  tiktokConn.on(WebcastEvent.LIKE, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const likeCount = Math.min(20, Math.max(1, Number(data?.count ?? data?.likeCount ?? 1)));
    const key = (uniqueId || user || 'anonymous').slice(0, 40);

    const existing = likeUserBuffer.get(key) || { user, uniqueId, avatar, count: 0 };
    existing.count += likeCount;
    if (avatar) existing.avatar = avatar;
    likeUserBuffer.set(key, existing);

    // Nếu bộ đệm tích lũy trên 100 người like đồng thời, xả ngay để giải phóng RAM
    if (likeUserBuffer.size >= 100) {
      flushLikeBatch();
      return;
    }

    if (!likeBatchTimer) {
      likeBatchTimer = setTimeout(flushLikeBatch, LIKE_BATCH_WINDOW_MS);
    }
  });

  const handleSocialEvent = (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    Rituals.ringBell({
      user,
      uniqueId,
      avatar,
      count: 1,
      wish: 'Hữu duyên tương ngộ nơi cửa Phật, cầu bình an may mắn',
      readTts: false
    });
  };
  tiktokConn.on(WebcastEvent.FOLLOW, handleSocialEvent);
  tiktokConn.on(WebcastEvent.SHARE, handleSocialEvent);
  tiktokConn.on(WebcastEvent.SOCIAL, (data) => {
    const action = String(data?.action || '');
    const disp = String(data?.common?.displayText?.displayType || data?.displayType || '').toLowerCase();
    if (action === '1' || action === '3' || disp.includes('follow') || disp.includes('share')) {
      handleSocialEvent(data);
    }
  });

  tiktokConn.on(WebcastEvent.GIFT, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const giftObj = data?.gift || data?.giftDetails || {};
    const giftId = String(data?.giftId || giftObj?.id || 'rose');
    const groupId = String(data?.groupId || `${uniqueId}_${giftId}`);
    const repeatCount = Math.max(1, Number(data?.repeatCount || data?.comboCount || 1));

    const prevCount = giftComboTracker.get(groupId) || 0;
    if (repeatCount <= prevCount && data?.repeatEnd) {
      giftComboTracker.delete(groupId);
      return;
    }
    const deltaCount = Math.max(1, repeatCount - prevCount);
    giftComboTracker.set(groupId, repeatCount);
    if (giftComboTracker.size > 500) {
      const firstKey = giftComboTracker.keys().next().value;
      giftComboTracker.delete(firstKey);
    }

    const diamondCount = Math.max(1, Number(giftObj?.diamondCount || data?.diamondCount || 1));
    const totalCoins = diamondCount * deltaCount;
    const rawGiftName = giftObj?.name || data?.giftName || giftObj?.describe || 'Hoa Hồng Tâm Thành';
    const displayGiftName = deltaCount > 1 ? `${deltaCount}x ${rawGiftName}` : rawGiftName;

    console.log(`[TikTok Gift] ${user} gửi ${displayGiftName} (${totalCoins} xu)`);

    Rituals.offerGift({
      user,
      uniqueId,
      avatar,
      coins: totalCoins,
      giftName: displayGiftName,
      wish: `Thành tâm dâng ${displayGiftName} kính lễ Đức Phật A Di Đà`
    });
  });

  try {
    const roomState = await tiktokConn.connect();
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || tiktokConn?.roomId || null;
    broadcastNotification('temple.state', getPublicState());
    return state.tiktok;
  } catch (err) {
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    state.tiktok.lastError = err?.message || 'Không thể kết nối phòng Live (kiểm tra tài khoản đang phát Live chưa)';
    broadcastNotification('temple.state', getPublicState());
    throw new Error(state.tiktok.lastError);
  }
}

function disconnectTikTokLive() {
  if (tiktokConn) {
    try {
      tiktokConn.disconnect();
    } catch (_) { }
    tiktokConn = null;
  }
  state.tiktok.connected = false;
  state.tiktok.connecting = false;
  state.tiktok.viewerCount = 0;
  state.roomViewers = {};
  broadcastNotification('temple.state', getPublicState());
  return state.tiktok;
}

// ============================================================================
// 6. AUTO-SIMULATION ENGINE (CHẾ ĐỘ TỰ ĐỘNG GIẢ LẬP ĐÔNG NGƯỜI XEM)
// ============================================================================
let autoSimTimer = null;
const SIM_DEVOTEES = [
  // 6 người dùng ban đầu
  { user: 'Ngọc Anh Nguyễn', uniqueId: 'ngocanh.98', wish: 'Con thành tâm cầu cho bố mẹ luôn mạnh khỏe, bình an' },
  { user: 'Trần Minh Quân', uniqueId: 'minhquan_bds', wish: 'Cầu tháng mới công việc thuận buồm xuôi gió, tài lộc hanh thông' },
  { user: 'Diệu Thảo Tâm An', uniqueId: 'tam_an_99', wish: 'Nam Mô A Di Đà Phật, nguyện cầu thế giới hòa bình chúng sinh an lạc' },
  { user: 'Lê Hoàng Nam', uniqueId: 'hoangnam.dev', wish: 'Cầu thi cử đỗ đạt điểm cao, sự nghiệp rộng mở' },
  { user: 'Phạm Thanh Hà', uniqueId: 'thanhha.lotus', wish: 'Cầu gia đạo êm ấm, con cái ngoan ngoãn học giỏi' },
  { user: 'Vũ Đức Thịnh', uniqueId: 'ducthinh88', wish: 'Con xin gieo một quẻ cầu tài lộc đầu năm' },

  // 50 người dùng ảo bổ sung (tổng cộng 56 người)
  { user: 'Tuệ Minh Cư Sĩ', uniqueId: 'tueminh_zen', wish: 'Cầu mong thân tâm an lạc, trí tuệ sáng suốt, tai qua nạn khỏi' },
  { user: 'Nguyễn Bích Ngọc', uniqueId: 'bichngoc.hn', wish: 'Nguyện cầu cho song thân phụ mẫu sống lâu trăm tuổi' },
  { user: 'Hoàng Quốc Bảo', uniqueId: 'bao_quoc_86', wish: 'Cầu buôn may bán đắt, kinh doanh phát đạt, lộc tài như ý' },
  { user: 'Đỗ Thảo Vy', uniqueId: 'thaovy_cute', wish: 'Cầu gia đạo bình yên, vạn sự như ý, duyên lành đưa tới' },
  { user: 'Phan Tuấn Kiệt', uniqueId: 'tuankiet.design', wish: 'Cầu sự nghiệp thăng tiến, quý nhân phù trợ, thuận lợi hanh thông' },
  { user: 'Lâm Huệ An', uniqueId: 'huean_anlac', wish: 'Nam Mô Quán Thế Âm Bồ Tát cứu khổ cứu nạn ban phước lành' },
  { user: 'Đinh Hoàng Long', uniqueId: 'hoanglong_sg', wish: 'Cầu tài lộc dồi dào, gia trung hưng vượng, sức khỏe dồi dào' },
  { user: 'Võ Mai Phương', uniqueId: 'maiphuong.flower', wish: 'Cầu cho con thơ hay ăn chóng lớn, thông minh khỏe mạnh' },
  { user: 'Bùi Thế Vinh', uniqueId: 'vinh_the_bui', wish: 'Cầu mở rộng kinh doanh, đối tác tin cậy, hợp đồng suôn sẻ' },
  { user: 'Hồ Kim Chi', uniqueId: 'kimchi_lotus', wish: 'Nguyện đem công đức này hồi hướng cho khắp tất cả chúng sinh' },
  { user: 'Nguyễn Tấn Đạt', uniqueId: 'tandat.logistic', wish: 'Cầu đi đường thượng lộ bình an, công việc trôi chảy' },
  { user: 'Trương Mỹ Duyên', uniqueId: 'myduyen.95', wish: 'Cầu cho chuyện tình cảm sớm tìm được bến đỗ bình yên' },
  { user: 'Dương Văn Hùng', uniqueId: 'hung_duong_auto', wish: 'Cầu sức khỏe dẻo dai, tai ương tiêu trừ, phúc lộc trường tồn' },
  { user: 'Đặng Thục Trinh', uniqueId: 'thuctrinh_zen', wish: 'Nguyện gia đình hòa thuận, trên dưới một lòng, trong ấm ngoài êm' },
  { user: 'Tạ Minh Triết', uniqueId: 'triet_lawyer', wish: 'Cầu công danh sáng lạng, làm ăn chân chính ngày càng khởi sắc' },
  { user: 'Mai Lan Hương', uniqueId: 'lanhuong.phuongnam', wish: 'Cầu cho mẹ già mau khỏi bệnh tật, an vui tuổi già' },
  { user: 'Châu Vĩnh Khang', uniqueId: 'khang_chau_89', wish: 'Cầu buôn bán thuận buồm xuôi gió, khách đến nườm nượp' },
  { user: 'Lý Kim Ngân', uniqueId: 'kimngan_fengshui', wish: 'Cầu tài lộc như nước, tiền vào như nước sông Đà' },
  { user: 'Huỳnh Bá Thông', uniqueId: 'bathong_tech', wish: 'Cầu cho dự án thành công mỹ mãn, đồng nghiệp đoàn kết' },
  { user: 'Ngô Thanh Trúc', uniqueId: 'thanhtruc.sg', wish: 'Con xin gieo một quẻ đầu tháng cầu mọi sự hanh thông' },
  { user: 'Trịnh Quang Khải', uniqueId: 'quangkhai.mk', wish: 'Cầu vạn sự tốt lành, tránh xa tiểu nhân, gặp nhiều may mắn' },
  { user: 'Lưu Cẩm Tú', uniqueId: 'camtu_flower', wish: 'Cầu cho con cái học hành chăm chỉ, đỗ trường đại học mơ ước' },
  { user: 'Đoàn Hữu Phước', uniqueId: 'huuphuoc_danang', wish: 'Cầu phúc thọ song toàn, vạn sự bình an như ý' },
  { user: 'Tô Ánh Nguyệt', uniqueId: 'anhnguyet_yoga', wish: 'Nam Mô A Di Đà Phật, nguyện tâm thanh tịnh không phiền não' },
  { user: 'Thái Văn Hậu', uniqueId: 'vanhau_realestate', wish: 'Cầu đất lành chim đậu, đầu tư thuận lợi, gặt hái quả ngọt' },
  { user: 'Phùng Gia Hân', uniqueId: 'giahan.lotus', wish: 'Cầu cả năm may mắn, bình an khỏe mạnh, niềm vui ngập tràn' },
  { user: 'Lương Đình Trọng', uniqueId: 'trong_luong_91', wish: 'Cầu công việc ổn định, thu nhập tăng trưởng, gia đình vui vẻ' },
  { user: 'Giang Mỹ Linh', uniqueId: 'mylinh.makeup', wish: 'Cầu cho cuộc sống gặp nhiều may mắn, thiện duyên hội tụ' },
  { user: 'Từ Quang Nhật', uniqueId: 'quangnhat.solar', wish: 'Cầu gia đình bình an trước mọi sóng gió cuộc đời' },
  { user: 'Hà Diệu Linh', uniqueId: 'dieulinh_buddhism', wish: 'Cầu ánh sáng từ bi Phật Tổ che chở cho đàn con cháu' },
  { user: 'Nghiêm Đức Duy', uniqueId: 'ducduy_finance', wish: 'Cầu quản lý tài chính vững vàng, phát lộc phát tài' },
  { user: 'Khổng Minh Tâm', uniqueId: 'minhtam_tamlinh', wish: 'Cầu giải trừ mọi oan trái, gia đạo an khang thịnh vượng' },
  { user: 'Vương Tuyết Mai', uniqueId: 'tuyetmai.foodie', wish: 'Cầu buôn may bán đắt, quán xá luôn tấp nập khách quý' },
  { user: 'Phan Bách Hợp', uniqueId: 'bachhop_peace', wish: 'Nguyện cầu cho thế giới dứt sạch dịch bệnh chiến tranh' },
  { user: 'Tăng Khắc Cường', uniqueId: 'cuong_tang_gym', wish: 'Cầu thân thể tráng kiện, tinh thần minh mẫn, sống có ích' },
  { user: 'Quách Tố Như', uniqueId: 'tonhu.teacher', wish: 'Cầu cho các học trò chăm ngoan, đỗ đạt công thành danh toại' },
  { user: 'Đỗ Hùng Dũng', uniqueId: 'hungdung_driver', wish: 'Cầu đi đến nơi về đến chốn, an toàn trên mọi nẻo đường' },
  { user: 'Vi Diệu Huyền', uniqueId: 'dieuhuyen_art', wish: 'Cầu cho tâm hồn luôn rộng mở, thanh thản và an nhiên' },
  { user: 'Chu Thanh Phong', uniqueId: 'thanhphong.vlog', wish: 'Cầu kênh phát triển mạnh mẽ, mang lại nhiều giá trị tốt đẹp' },
  { user: 'Tào Thục Uyên', uniqueId: 'thucuyen_spa', wish: 'Cầu cho gia đình thuận hòa, các con ngoan ngoãn hiếu thảo' },
  { user: 'Thân Trọng Nghĩa', uniqueId: 'trongnghia.ct', wish: 'Cầu cho anh em trong nhà hòa thuận, gắn kết yêu thương' },
  { user: 'Ân Ngọc Trâm', uniqueId: 'ngoctram_gem', wish: 'Cầu phúc đức sâu dày, lộc tài vững bền theo năm tháng' },
  { user: 'Mạc Văn Khoa', uniqueId: 'vankhoa.dalat', wish: 'Cầu mùa màng bội thu, mưa thuận gió hòa, làm ăn sung túc' },
  { user: 'Diệp Hồng Nhung', uniqueId: 'hongnhung_tea', wish: 'Cầu cho một đời an yên, không sóng gió khổ đau' },
  { user: 'Nhan Thế Hào', uniqueId: 'thehao.export', wish: 'Cầu đơn hàng xuất khẩu đều đặn, buôn có bạn bán có phường' },
  { user: 'La Cẩm Vân', uniqueId: 'camvan.singer', wish: 'Cầu cho lời ca tiếng hát mang lại niềm an lạc cho muôn người' },
  { user: 'Kha Vĩnh Tiến', uniqueId: 'vinhtien.farm', wish: 'Cầu trang trại xanh tươi, cây trái trĩu cành, chăn nuôi phát triển' },
  { user: 'Ôn Thị Lệ', uniqueId: 'le_on_flower', wish: 'Cầu các cụ cao niên trong họ bách niên giai lão' },
  { user: 'Cổ Thiên Thanh', uniqueId: 'thienthanh_blue', wish: 'Cầu tâm trí bình lặng như mặt hồ sen mùa hạ' },
  { user: 'Bạch Thảo Nguyên', uniqueId: 'thaonguyen.eco', wish: 'Cầu cho vạn vật tốt tươi, nhà nhà no ấm hạnh phúc' },

  // 40 phật tử bổ sung cho 4 hàng ghế mới phía sau chánh điện (tổng cộng 96 vị phật tử)
  { user: 'Viên Như Tâm', uniqueId: 'viennhu.zen', wish: 'Nguyện tâm thanh tịnh, đoạn trừ mọi phiền não lo âu' },
  { user: 'Thích Tịnh Tâm', uniqueId: 'tinhtam.tuvi', wish: 'Cầu mong Phật pháp trường tồn, chúng sinh an lạc' },
  { user: 'Quảng Trí Dũng', uniqueId: 'quangtri.dung', wish: 'Cầu cho cha mẹ khỏe mạnh, bình an vô sự' },
  { user: 'Diệu Hạnh Hoa', uniqueId: 'dieuhanh.lotus', wish: 'Cầu gia đình hòa thuận, vạn sự cát tường như ý' },
  { user: 'Tuệ Đăng Cư Sĩ', uniqueId: 'tuedang.zen', wish: 'Cầu trí tuệ sáng soi, soi đường chỉ lối trong cuộc sống' },
  { user: 'Thiện Nhân Tâm', uniqueId: 'thiennhan.tam', wish: 'Cầu tâm thiện lành, gieo duyên lành gặp quả ngọt' },
  { user: 'An Lạc Cư Sĩ', uniqueId: 'anlac.peace', wish: 'Cầu một đời an nhiên, bình an qua ngày tháng' },
  { user: 'Minh Định Pháp', uniqueId: 'minhdinh.phap', wish: 'Cầu công danh sự nghiệp vững bền, tâm không lay động' },
  { user: 'Huệ Quang Minh', uniqueId: 'huequang.zen', wish: 'Nguyện ánh sáng từ bi xua tan bóng tối u mê' },
  { user: 'Chúc An Nhiên', uniqueId: 'annhien.chuc', wish: 'Cầu bình an may mắn đến với người thân yêu' },
  { user: 'Chân Thiện Mỹ', uniqueId: 'chanthienmy.hn', wish: 'Cầu hướng về chân thiện mỹ, tâm hồn thanh tao' },
  { user: 'Bồ Đề Tâm', uniqueId: 'bodetam.vn', wish: 'Nguyện phát bồ đề tâm, kiên cố tu tập tinh tấn' },
  { user: 'Thanh Tịnh Trúc', uniqueId: 'thanhtinh.truc', wish: 'Cầu tâm tĩnh như nước, thanh thoát như nhành trúc' },
  { user: 'Diệu Âm Cư Sĩ', uniqueId: 'dieuam.sg', wish: 'Cầu tiếng kinh cầu vang xa xoa dịu nỗi đau trần thế' },
  { user: 'Pháp Bảo Lâm', uniqueId: 'phapbao.lam', wish: 'Cầu che chở độ trì cho cả gia đạo bình an' },
  { user: 'Vạn Hạnh Thiền', uniqueId: 'vanhanh.thien', wish: 'Cầu cho muôn việc hanh thông, phước đức tròn đầy' },
  { user: 'Liễu Tri Đạt', uniqueId: 'lieutri.dat', wish: 'Cầu hiểu thấu nhân duyên, thong dong tự tại' },
  { user: 'Tịnh Độ Tâm', uniqueId: 'tinhdo.tam', wish: 'Nguyện sanh cõi tịnh độ, thân tâm luôn an nhàn' },
  { user: 'Quảng Đức Hòa', uniqueId: 'quangduc.hoa', wish: 'Cầu anh em thuận hòa, gia đạo hưng thịnh' },
  { user: 'Hạnh Nguyện An', uniqueId: 'hanhnguyen.an', wish: 'Cầu mọi ước nguyện thiện lành sớm thành hiện thực' },
  { user: 'Tùy Duyên Khởi', uniqueId: 'tuyduyen.khoi', wish: 'Tùy duyên mà an lạc, vạn sự thuận tự nhiên' },
  { user: 'Vô Lượng Quang', uniqueId: 'voluongquang.vn', wish: 'Nam Mô Vô Lượng Quang Phật chiếu rọi muôn nơi' },
  { user: 'Trí Dũng Tướng', uniqueId: 'tridung.tuong', wish: 'Cầu sức mạnh ý chí vượt qua mọi gian truân thử thách' },
  { user: 'Phổ Hiền Tâm', uniqueId: 'phohien.tam', wish: 'Nguyện noi gương Phổ Hiền thực hành đại nguyện lớn' },
  { user: 'Văn Thù Hoa', uniqueId: 'vanthu.hoa', wish: 'Cầu khai mở trí tuệ, học hành đỗ đạt cao' },
  { user: 'Quán Tự Tại', uniqueId: 'quantutai.zen', wish: 'Quán chiếu tự tại, nhìn thấu sự đời bao dung' },
  { user: 'Đại Trí Huệ', uniqueId: 'daitri.hue', wish: 'Cầu sáng suốt minh bạch trong công việc và cuộc sống' },
  { user: 'Kim Cương Tạng', uniqueId: 'kimcuong.tang', wish: 'Cầu ý chí kiên định như kim cương bất hoại' },
  { user: 'Nhật Quang Minh', uniqueId: 'nhatquang.minh', wish: 'Cầu ánh dương rạng ngời, tài lộc khởi sắc rực rỡ' },
  { user: 'Nguyệt Tịnh Không', uniqueId: 'nguyettinh.khong', wish: 'Cầu tâm hồn trong sáng vằng vặc như trăng rằm' },
  { user: 'Bảo Tích Kinh', uniqueId: 'baotich.kinh', wish: 'Cầu tích đức bồi công, phúc báo cho con cháu' },
  { user: 'Hoa Nghiêm Tâm', uniqueId: 'hoanghiem.tam', wish: 'Nguyện thế giới hoa nghiêm, muôn loài sống thái bình' },
  { user: 'Pháp Hoa Duyên', uniqueId: 'phaphoa.duyen', wish: 'Cầu kết thiện duyên lành, gặp được thầy tốt bạn hiền' },
  { user: 'Lăng Nghiêm Định', uniqueId: 'langnghiem.dinh', wish: 'Cầu tâm định tĩnh, trước giông bão chẳng lung lay' },
  { user: 'Bát Nhã Thuyền', uniqueId: 'batnha.thuyen', wish: 'Cầu qua bờ giác ngộ, rời xa bến mê lầm' },
  { user: 'Viên Thông Giác', uniqueId: 'vienthong.giac', wish: 'Cầu mọi sự hanh thông, công thành danh toại' },
  { user: 'Vô Ngại Trí', uniqueId: 'vongai.tri', wish: 'Cầu tâm không chướng ngại, tự do thanh thản' },
  { user: 'Cát Tường Như', uniqueId: 'cattuong.nhu', wish: 'Cầu bốn mùa cát tường, tám tiết bình an thịnh vượng' },
  { user: 'Như Ý Cát', uniqueId: 'nhuy.cat', wish: 'Cầu vạn sự như ý, tỷ sự như mơ' },
  { user: 'Phúc Trí Viên', uniqueId: 'phuctri.vien', wish: 'Cầu phúc trí tròn đầy, gia đình viên mãn ấm êm' }
];

function getRandomDevotee() {
  const currentKeySet = new Set();
  if (state.roomViewers) {
    for (const [k, v] of Object.entries(state.roomViewers)) {
      currentKeySet.add(k.toLowerCase());
      if (v.uniqueId) currentKeySet.add(String(v.uniqueId).toLowerCase());
      if (v.user) currentKeySet.add(String(v.user).toLowerCase());
    }
  }
  const unseated = SIM_DEVOTEES.filter(
    (d) => !currentKeySet.has(String(d.uniqueId).toLowerCase()) && !currentKeySet.has(String(d.user).toLowerCase())
  );
  if (unseated.length > 0) {
    return unseated[Math.floor(Math.random() * unseated.length)];
  }
  // Nếu đã ngồi kín toàn bộ danh sách 96 Phật tử mẫu: tạo Phật tử mới với hậu tố số ngẫu nhiên để luôn đảm bảo uniqueId duy nhất
  const base = SIM_DEVOTEES[Math.floor(Math.random() * SIM_DEVOTEES.length)];
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return {
    user: `${base.user} ${randomSuffix}`,
    uniqueId: `${base.uniqueId}_${randomSuffix}`,
    avatar: base.avatar || '',
    wish: base.wish || 'Nam Mô A Di Đà Phật'
  };
}

function runSingleSimulationStep() {
  const pick = getRandomDevotee();
  const roll = Math.random();

  // Chỉ tự động giải phóng phật tử ảo vãng lai khi chánh điện đã kín chỗ (>= 80 người xem thật)
  const currentViewerCount = Object.keys(state.roomViewers || {}).length;
  if (currentViewerCount >= 80) {
    removeRoomViewer();
  }

  if (roll < 0.20) {
    // 20% xác suất: Phật tử mới vào Chánh Điện lễ Phật (kích hoạt hoạt ảnh bước đi trên thảm đỏ)
    recordDevotee(pick.user, pick.uniqueId, '', 1, 0, 0, 'Đã vào Chánh Điện lễ Phật');
    addRoomViewer(pick.user, pick.uniqueId, '');
    broadcastNotification('temple.viewerJoined', {
      user: pick.user,
      uniqueId: pick.uniqueId,
      avatar: ''
    });
    broadcastNotification('temple.state', getPublicState());
  } else if (roll < 0.40) {
    Rituals.burnIncense({ user: pick.user, uniqueId: pick.uniqueId, count: 3, wish: pick.wish });
  } else if (roll < 0.58) {
    Rituals.sendPrayer({ user: pick.user, uniqueId: pick.uniqueId, wish: pick.wish });
  } else if (roll < 0.72) {
    Rituals.chantSutra({ user: pick.user, uniqueId: pick.uniqueId, random: true, isAutoSim: true });
  } else if (roll < 0.84) {
    Rituals.drawFortune({ user: pick.user, uniqueId: pick.uniqueId, topic: pick.wish });
  } else if (roll < 0.93) {
    Rituals.offerGift({ user: pick.user, uniqueId: pick.uniqueId, giftType: 'lotus', coins: 15, giftName: 'Hoa Sen Vàng Tinh Khiết' });
  } else {
    Rituals.ringBell({ user: pick.user, uniqueId: pick.uniqueId, count: 1, wish: pick.wish, readTts: true });
  }
}

function configureAutoSim(enabled) {
  state.settings.autoSim = Boolean(enabled);
  if (autoSimTimer) {
    clearInterval(autoSimTimer);
    autoSimTimer = null;
  }
  if (state.settings.autoSim) {
    runSingleSimulationStep();
    autoSimTimer = setInterval(runSingleSimulationStep, state.settings.autoSimIntervalMs || 9500);
  } else {
    // Khi tắt chế độ giả lập: giải phóng các phật tử ảo vãng lai để Chánh Điện trở về trạng thái thanh tịnh (chỉ 2 hàng đầu)
    state.roomViewers = {};
    broadcastNotification('temple.state', getPublicState());
  }
}

// ============================================================================
// 7. JSON-RPC 2.0 DISPATCHER
// ============================================================================
async function handleRpcCall(method, params = {}) {
  switch (method) {
    case 'temple.getState':
      return getPublicState();
    case 'temple.burnIncense':
      return Rituals.burnIncense(params);
    case 'temple.strikeWoodenFish':
      return Rituals.strikeWoodenFish(params);
    case 'temple.ringBell':
      return Rituals.ringBell(params);
    case 'temple.sendPrayer':
      return Rituals.sendPrayer(params);
    case 'temple.offerGift':
      return Rituals.offerGift(params);
    case 'temple.drawFortune':
      return Rituals.drawFortune(params);
    case 'temple.chantSutra':
      return Rituals.chantSutra(params);
    case 'temple.replaySutra':
      return Rituals.replaySutra(params);
    case 'temple.stopSutra':
      return Rituals.stopSutra();
    case 'temple.toggleAutoReplay':
      return Rituals.toggleAutoReplay(params.enabled);
    case 'temple.getSutras':
      return SUTRAS_DECK;
    case 'temple.grandCeremony':
      return Rituals.grandCeremony(params);
    case 'temple.updateSettings':
      return Rituals.updateSettings(params);
    case 'temple.resetMerit':
      return Rituals.resetMerit();
    case 'temple.clearRoomViewers':
      return Rituals.clearRoomViewers();
    case 'temple.comment': {
      const chatUser = sanitizeUserName(params.user) || 'Thí Chủ';
      const chatUniqueId = params.uniqueId || chatUser;
      const chatAvatar = params.avatar || '';
      const commentText = params.comment || 'Nam Mô A Di Đà Phật';
      addRoomViewer(chatUser, chatUniqueId, chatAvatar);
      broadcastNotification('temple.chat', {
        user: chatUser,
        uniqueId: chatUniqueId,
        avatar: chatAvatar,
        comment: commentText
      });
      return parseViewerComment(commentText, chatUser, chatUniqueId, chatAvatar);
    }
    case 'temple.speak': {
      const res = await zeroTts.synthesize(params.text, params.voice || 'maichi');
      if (res.ok && params.broadcast !== false) {
        broadcastNotification('tts.play', {
          text: params.text,
          voice: res.voice,
          url: res.url
        });
      }
      return res;
    }
    case 'temple.ttsStatus':
      return zeroTts.getStatus();
    case 'temple.getRandomDevotee':
      return getRandomDevotee();
    case 'temple.getSimDevotees':
      return SIM_DEVOTEES;
    case 'temple.viewerJoin': {
      let devotee = null;
      if (!params.user || params.random || params.user === 'BLACK' || params.user === 'B L A C K' || params.user === 'Đại Thí Chủ Minh Tâm' || params.user === 'Phật Tử Hữu Duyên') {
        devotee = getRandomDevotee();
      }
      const joinUser = (devotee ? devotee.user : sanitizeUserName(params.user)) || 'Phật Tử Hữu Duyên';
      const joinUniqueId = (devotee ? devotee.uniqueId : params.uniqueId) || joinUser;
      const joinAvatar = (devotee ? (devotee.avatar || '') : (params.avatar || ''));

      recordDevotee(joinUser, joinUniqueId, joinAvatar, 1, 0, 0, 'Đã vào Chánh Điện lễ Phật');
      addRoomViewer(joinUser, joinUniqueId, joinAvatar);
      broadcastNotification('temple.viewerJoined', {
        user: joinUser,
        uniqueId: joinUniqueId,
        avatar: joinAvatar
      });
      broadcastNotification('temple.state', getPublicState());
      return { ok: true, user: joinUser, uniqueId: joinUniqueId };
    }
    case 'temple.viewerLeave': {
      const removed = removeRoomViewer(params.uniqueId || params.user);
      return { ok: Boolean(removed), user: removed?.user || null, uniqueId: removed?.uniqueId || null };
    }
    case 'live.connect':
      return await connectTikTokLive(params.username);
    case 'live.disconnect':
      return disconnectTikTokLive();
    case 'live.setAutoSim':
      configureAutoSim(Boolean(params.enabled));
      saveState();
      broadcastNotification('temple.state', getPublicState());
      return getPublicState();
    default:
      throw new Error(`Không tìm thấy phương thức JSON-RPC: ${method}`);
  }
}

// ============================================================================
// 8. EXPRESS + WEBSOCKET SERVER
// ============================================================================
const app = express();
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/tts-cache', express.static(TTS_CACHE_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/favicon.ico', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// HTTP JSON-RPC 2.0 Endpoint
app.post('/rpc', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (!method) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: id ?? null,
      error: { code: -32600, message: 'Invalid JSON-RPC Request: thiếu method' }
    });
  }
  try {
    const result = await handleRpcCall(method, params || {});
    res.json({
      jsonrpc: jsonrpc || '2.0',
      id: id ?? null,
      result
    });
  } catch (err) {
    res.status(200).json({
      jsonrpc: jsonrpc || '2.0',
      id: id ?? null,
      error: { code: -32000, message: err.message || 'Server error' }
    });
  }
});

// ZeroTTS HTTP Endpoint (Mai Chi default)
app.all('/api/tts', async (req, res) => {
  const text = (req.body?.text || req.query?.text || '').trim();
  const voice = (req.body?.voice || req.query?.voice || state.settings.ttsVoice || 'maichi').trim();
  if (!text) {
    return res.status(400).json({ ok: false, error: 'Thiếu nội dung text cần đọc' });
  }
  const result = await zeroTts.synthesize(text, voice);
  pruneTtsCache();
  res.json(result);
});

// Giới hạn bộ đệm file âm thanh giọng đọc (tối đa 100 file và trần 35MB) để giữ ổ đĩa luôn gọn nhẹ
function pruneTtsCache() {
  try {
    if (!fs.existsSync(TTS_CACHE_DIR)) return;
    const files = fs.readdirSync(TTS_CACHE_DIR)
      .filter((f) => f.endsWith('.wav'))
      .map((f) => {
        const full = path.join(TTS_CACHE_DIR, f);
        try {
          const st = fs.statSync(full);
          return { name: f, path: full, size: st.size, time: st.mtimeMs };
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.time - a.time);

    const MAX_TTS_CACHE_FILES = 100;
    const MAX_TOTAL_BYTES = 35 * 1024 * 1024; // 35MB trần ổ đĩa tối đa

    let totalBytes = 0;
    for (let i = 0; i < files.length; i++) {
      totalBytes += files[i].size;
      if (i >= MAX_TTS_CACHE_FILES || totalBytes > MAX_TOTAL_BYTES) {
        try {
          fs.unlinkSync(files[i].path);
        } catch (_) {}
      }
    }
  } catch (_) {}
}

// Khởi chạy dọn dẹp ngay khi boot và định kỳ mỗi 5 phút một lần
pruneTtsCache();
setInterval(pruneTtsCache, 5 * 60 * 1000);

// Xóa file âm thanh voice (khi có yêu cầu dọn dẹp)
app.post('/api/tts/cleanup', (req, res) => {
  const fileOrUrl = req.body?.file || req.body?.url;
  if (!fileOrUrl) {
    return res.status(400).json({ ok: false, error: 'Thiếu file hoặc url cần dọn dẹp' });
  }
  const filename = path.basename(fileOrUrl);
  if (!filename.endsWith('.wav')) {
    return res.status(400).json({ ok: false, error: 'Chỉ chấp nhận file .wav trong tts-cache' });
  }
  const fullPath = path.join(TTS_CACHE_DIR, filename);
  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return res.json({ ok: true, deleted: filename });
    }
    return res.json({ ok: true, message: 'File đã được dọn trước đó' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/state', (_req, res) => {
  res.json(getPublicState());
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcastNotification(method, params) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params
  });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws) => {
  ws.send(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'temple.state',
      params: getPublicState()
    })
  );

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch (_) {
      return;
    }
    if (!msg || !msg.method) return;
    try {
      const result = await handleRpcCall(msg.method, msg.params || {});
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result
          })
        );
      }
    } catch (err) {
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32000, message: err.message || 'RPC Error' }
          })
        );
      }
    }
  });
});

const zeroTts = new ZeroTTSManager();

server.listen(PORT, () => {
  console.log(`============================================================`);
  console.log(`🪷 CHÙA ONLINE TIKTOK LIVE RPC ĐÃ KHỞI ĐỘNG`);
  console.log(`📺 Màn hình Live (9:16 OBS): http://localhost:${PORT}`);
  console.log(`🎛️ Bảng điều khiển RPC Admin: http://localhost:${PORT}/admin`);
  console.log(`🔌 JSON-RPC 2.0 Endpoint   : http://localhost:${PORT}/rpc (ws://localhost:${PORT}/ws)`);
  console.log(`============================================================`);

  // Tự động kết nối tới @vlex.os ngay khi khởi động server
  const defaultChannel = process.env.TIKTOK_USER || state.tiktok?.username || 'vlex.os';
  if (defaultChannel) {
    connectTikTokLive(defaultChannel).catch((err) => {
      console.warn(`[Auto-Connect @${defaultChannel}] Chưa kết nối được ngay:`, err.message);
    });
  }
});
