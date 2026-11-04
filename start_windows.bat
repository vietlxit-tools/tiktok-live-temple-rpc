@echo off
chcp 65001 >nul
echo ====================================================================
echo   🪷 KHỞI ĐỘNG CHÙA LINH ỨNG ONLINE (TIKTOK LIVE RPC)
echo ====================================================================
echo.

:: 1. Kiểm tra môi trường .venv
if not exist ".venv\Scripts\python.exe" (
    echo [CẢNH BÁO] Chưa tìm thấy môi trường Python .venv!
    echo Đang tự động chạy setup_windows.bat...
    call setup_windows.bat
)

:: 2. Khởi chạy Server
echo [1/2] Đang khởi động Server...
where bun >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo Runtime: Bun.js
    start "" http://localhost:3000
    bun run server.js
) else (
    where node >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        echo Runtime: Node.js
        start "" http://localhost:3000
        node server.js
    ) else (
        echo [LỖI] Không tìm thấy Bun.js hoặc Node.js trên máy!
        echo Vui lòng cài Node.js (https://nodejs.org/) hoặc Bun (https://bun.sh/).
        pause
        exit /b 1
    )
)

pause

