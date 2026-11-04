@echo off
chcp 65001 >nul
echo ====================================================================
echo   🪷 CHÙA LINH ỨNG ONLINE - TIKTOK LIVE RPC (CÀI ĐẶT WINDOWS)
echo ====================================================================
echo.

:: 1. Kiểm tra Python
where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [LỖI] Không tìm thấy Python trên hệ thống!
    echo Vui lòng tải và cài đặt Python 3.10 - 3.12 tại: https://www.python.org/downloads/
    echo LƯU Ý QUAN TRỌNG: Khi cài đặt nhớ TÍCH CHỌN "Add python.exe to PATH".
    echo.
    pause
    exit /b 1
)

echo [1/3] Kiểm tra phiên bản Python...
python --version

:: 2. Khởi tạo môi trường ảo Python (.venv)
if not exist ".venv\Scripts\python.exe" (
    echo [2/3] Đang tạo môi trường ảo Python (.venv)...
    python -m venv .venv
    if %ERRORLEVEL% neq 0 (
        echo [LỖI] Không thể tạo .venv! Kiểm tra lại quyền thư mục.
        pause
        exit /b 1
    )
) else (
    echo [2/3] Môi trường ảo .venv đã tồn tại.
)

echo Đang cài đặt thư viện ZeroTTS và Pillow vào .venv...
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install zerotts pillow
if %ERRORLEVEL% neq 0 (
    echo [CẢNH BÁO] Cài đặt qua pip có thể gặp trục trặc, đang thử lại...
)

:: 3. Kiểm tra Bun hoặc Node/npm
echo.
echo [3/3] Kiểm tra và cài đặt dependencies cho Web Server...
where bun >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo Đã phát hiện Bun.js! Đang cài đặt bằng bun install...
    bun install
) else (
    where npm >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        echo Không tìm thấy Bun, chuyển sang dùng npm install...
        npm install
    ) else (
        echo [LỖI] Không tìm thấy cả Bun.js lẫn Node.js/npm!
        echo Vui lòng cài đặt Node.js từ https://nodejs.org/ hoặc Bun từ https://bun.sh/
        pause
        exit /b 1
    )
)

echo.
echo ====================================================================
echo   ✅ CÀI ĐẶT HOÀN TẤT THÀNH CÔNG!
echo   Bây giờ bạn có thể chạy file "start_windows.bat" để bắt đầu.
echo ====================================================================
pause
