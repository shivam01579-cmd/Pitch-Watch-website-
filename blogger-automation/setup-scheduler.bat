@echo off
:: ============================================================
:: Pitch Watch — Task Scheduler Setup (Run as Administrator!)
:: ============================================================
:: RIGHT-CLICK this file → "Run as Administrator"
:: ============================================================

net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Please RIGHT-CLICK this file and select "Run as Administrator"!
    echo.
    pause
    exit /b 1
)

set "NODE=C:\Program Files\nodejs\node.exe"
set "WORKDIR=c:\Users\shiva\Videos\News Website\blogger-automation"
set "WORKFLOW=%WORKDIR%\workflow.js"
set "MONITOR=%WORKDIR%\health-monitor.js"

echo.
echo ============================================================
echo   Pitch Watch - Task Scheduler Setup
echo ============================================================
echo.

:: Delete old tasks if they exist
schtasks /delete /tn "PitchWatchWorkflow" /f >nul 2>&1
schtasks /delete /tn "PitchWatchMonitor"  /f >nul 2>&1

:: ── Task 1: Workflow every 30 minutes ──
echo [1/2] Creating PitchWatchWorkflow (every 30 min)...

schtasks /create /tn "PitchWatchWorkflow" ^
  /tr "\"%NODE%\" \"%WORKFLOW%\"" ^
  /sc MINUTE /mo 30 ^
  /st 00:00 ^
  /rl HIGHEST ^
  /ru SYSTEM ^
  /f

if %ERRORLEVEL% equ 0 (
    echo      [OK] PitchWatchWorkflow created!
) else (
    echo      [WARN] SYSTEM account failed. Trying current user...
    schtasks /create /tn "PitchWatchWorkflow" ^
      /tr "\"%NODE%\" \"%WORKFLOW%\"" ^
      /sc MINUTE /mo 30 ^
      /rl HIGHEST ^
      /f
    if %ERRORLEVEL% equ 0 (
        echo      [OK] PitchWatchWorkflow created (current user)!
    ) else (
        echo      [ERROR] Failed to create workflow task!
    )
)

:: ── Task 2: Health Monitor every 2 hours ──
echo.
echo [2/2] Creating PitchWatchMonitor (every 2 hours)...

schtasks /create /tn "PitchWatchMonitor" ^
  /tr "\"%NODE%\" \"%MONITOR%\"" ^
  /sc HOURLY /mo 2 ^
  /st 00:00 ^
  /rl HIGHEST ^
  /ru SYSTEM ^
  /f

if %ERRORLEVEL% equ 0 (
    echo      [OK] PitchWatchMonitor created!
) else (
    echo      [WARN] SYSTEM account failed. Trying current user...
    schtasks /create /tn "PitchWatchMonitor" ^
      /tr "\"%NODE%\" \"%MONITOR%\"" ^
      /sc HOURLY /mo 2 ^
      /rl HIGHEST ^
      /f
    if %ERRORLEVEL% equ 0 (
        echo      [OK] PitchWatchMonitor created (current user)!
    ) else (
        echo      [ERROR] Failed to create monitor task!
    )
)

:: ── Verify ──
echo.
echo ============================================================
echo   Verifying created tasks...
echo ============================================================
schtasks /query /tn "PitchWatchWorkflow" /fo LIST 2>nul | findstr /C:"Task Name" /C:"Status" /C:"Next Run"
schtasks /query /tn "PitchWatchMonitor"  /fo LIST 2>nul | findstr /C:"Task Name" /C:"Status" /C:"Next Run"

echo.
echo ============================================================
echo   DONE! Both tasks are now running automatically.
echo   Check Telegram for alerts if anything breaks.
echo ============================================================
echo.
pause
