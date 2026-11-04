@echo off
chcp 65001 >nul
echo ====================================================================
echo   🪷 KHỞI ĐỘNG CHÙA LINH ỨNG ONLINE (DOCKER CONTAINER)
echo ====================================================================
echo.

where docker >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [LỖI] Không tìm thấy Docker trên máy!
    echo Vui lòng tải và cài đặt Docker Desktop từ: https://www.docker.com/products/docker-desktop/
    echo Sau khi cài đặt, hãy đảm bảo Docker Desktop đang bật.
    echo.
    pause
    exit /b 1
)

echo Đang build và khởi động container...
docker compose up -d --build

if %ERRORLEVEL% equ 0 (
    echo.
    echo ====================================================================
    echo   ✅ SERVER ĐANG CHẠY TRONG DOCKER THÀNH CÔNG!
    echo   - Giao diện Live + Dock: http://localhost:3000
    echo   - OBS Browser Source 9:16: http://localhost:3000/?obs=1
    echo   - Bảng điều khiển Admin: http://localhost:3000/admin
    echo ====================================================================
    start "" http://localhost:3000
) else (
    echo [LỖI] Không thể khởi động Docker container.
    echo Hãy kiểm tra xem Docker Desktop đã được mở chưa.
)

pause

