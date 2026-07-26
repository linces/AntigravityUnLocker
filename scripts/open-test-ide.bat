@echo off
REM ╔══════════════════════════════════════════════════════════════╗
REM ║  ag-provider — IDE Teste Isolada (sem proxy)               ║
REM ║  Abre uma instancia limpa do Antigravity IDE               ║
REM ╚══════════════════════════════════════════════════════════════╝

setlocal

set "PROJECT_ROOT=%~dp0.."
set "TEST_PROFILE_DIR=%PROJECT_ROOT%\.test-ide-profile"
set "IDE_EXE=%LOCALAPPDATA%\Programs\Antigravity IDE\Antigravity IDE.exe"

if not exist "%IDE_EXE%" (
    echo [ERRO] Antigravity IDE nao encontrado.
    pause
    exit /b 1
)

if not exist "%TEST_PROFILE_DIR%" mkdir "%TEST_PROFILE_DIR%"

echo [IDE] Abrindo Antigravity IDE com perfil de teste isolado...
echo       Perfil: %TEST_PROFILE_DIR%
echo       Producao: INTOCADA
echo.

start "" "%IDE_EXE%" --user-data-dir="%TEST_PROFILE_DIR%" --new-window

echo Pronto. Feche esta janela quando quiser.
endlocal
