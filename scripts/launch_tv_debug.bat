@echo off
REM Launch TradingView Desktop on Windows with Chrome DevTools Protocol enabled
REM Usage: scripts\launch_tv_debug.bat [port]

set PORT=%1
if "%PORT%"=="" set PORT=9222

REM Kill existing TradingView instances
taskkill /F /IM TradingView.exe >nul 2>&1
timeout /t 2 /nobreak >nul

set "TV_EXE="
set "TV_MSIX_ID="

REM 1) Prefer MSIX (Windows Store) detection. Direct-launching the .exe inside
REM    C:\Program Files\WindowsApps fails (ACLs) or silently drops args (sandbox).
REM    Must launch via shell:AppsFolder\<PFN>!<AppId> instead.
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-AppxPackage *TradingView*).PackageFamilyName" 2^>nul') do set "TV_MSIX_ID=%%i"

REM 2) Fall back to classic install only if MSIX wasn't found
if "%TV_MSIX_ID%"=="" (
    if exist "%LOCALAPPDATA%\TradingView\TradingView.exe" set "TV_EXE=%LOCALAPPDATA%\TradingView\TradingView.exe"
    if exist "%PROGRAMFILES%\TradingView\TradingView.exe" set "TV_EXE=%PROGRAMFILES%\TradingView\TradingView.exe"
    if exist "%PROGRAMFILES(x86)%\TradingView\TradingView.exe" set "TV_EXE=%PROGRAMFILES(x86)%\TradingView\TradingView.exe"
    if "%TV_EXE%"=="" (
        for /f "tokens=*" %%i in ('where TradingView.exe 2^>nul') do set "TV_EXE=%%i"
    )
)

if "%TV_EXE%"=="" if "%TV_MSIX_ID%"=="" (
    echo Error: TradingView not found.
    echo Checked: MSIX/Windows Store, %%LOCALAPPDATA%%\TradingView, %%PROGRAMFILES%%\TradingView
    exit /b 1
)

if not "%TV_MSIX_ID%"=="" (
    echo Found TradingView MSIX package: %TV_MSIX_ID%
    echo Starting via shell:AppsFolder with --remote-debugging-port=%PORT%...
    powershell -NoProfile -Command "Start-Process -FilePath 'shell:AppsFolder\%TV_MSIX_ID%!TradingView.Desktop' -ArgumentList '--remote-debugging-port=%PORT%'"
) else (
    echo Found TradingView at: %TV_EXE%
    echo Starting with --remote-debugging-port=%PORT%...
    start "" "%TV_EXE%" --remote-debugging-port=%PORT%
)

echo Waiting for CDP to become available...
timeout /t 5 /nobreak >nul

set /a TRIES=0
:check
curl -s http://localhost:%PORT%/json/version >nul 2>&1
if %errorlevel% neq 0 (
    set /a TRIES+=1
    if %TRIES% geq 15 (
        echo Error: CDP did not become available on port %PORT% after ~30s.
        echo If TradingView is running but CDP is silent, the MSIX sandbox may be
        echo stripping the --remote-debugging-port arg. Try the classic build
        echo from tradingview.com/desktop instead.
        exit /b 2
    )
    echo Still waiting...
    timeout /t 2 /nobreak >nul
    goto check
)

echo.
echo CDP ready at http://localhost:%PORT%
curl -s http://localhost:%PORT%/json/version
echo.