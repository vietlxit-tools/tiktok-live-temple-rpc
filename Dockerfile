# ============================================================================
# Dockerfile: Chùa Linh Ứng Online — TikTok Live RPC
# Đóng gói chuẩn môi trường Node.js 20 + Python 3.11 + ZeroTTS AI + FFmpeg
# ============================================================================
FROM node:20-bookworm-slim

LABEL maintainer="vietlx.it@gmail.com"
LABEL description="TikTok Live RPC Interactive Buddhist Temple with ZeroTTS & Express"

# Cài đặt Python 3, venv, ffmpeg và thư viện âm thanh hệ thống
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    libsndfile1 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Tạo môi trường ảo Python và cài đặt ZeroTTS + Pillow
RUN python3 -m venv /app/.venv && \
    /app/.venv/bin/pip install --no-cache-dir --upgrade pip && \
    /app/.venv/bin/pip install --no-cache-dir zerotts pillow

# Cài đặt Node.js dependencies
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Sao chép toàn bộ mã nguồn vào container
COPY . .

# Đảm bảo thư mục lưu trữ dữ liệu tồn tại
RUN mkdir -p /app/data/tts-cache /app/data/.hf_cache

# Cấu hình biến môi trường
ENV NODE_ENV=production \
    PORT=3000 \
    PYTHON_PATH=/app/.venv/bin/python \
    HF_HOME=/app/data/.hf_cache \
    OMP_NUM_THREADS=4 \
    OMP_WAIT_POLICY=PASSIVE

EXPOSE 3000

# Khởi chạy server
CMD ["node", "server.js"]

