@echo off
REM ╔══════════════════════════════════════════════════════════════╗
REM ║  ag-provider — Test Lab Launcher                           ║
REM ║  Sobe o proxy de diagnostico + IDE isolada pra captura     ║
REM ╚══════════════════════════════════════════════════════════════╝

setlocal EnableDelayedExpansion

set "PROJECT_ROOT=%~dp0.."
set "AG_PROVIDER_DIR=%PROJECT_ROOT%\src\ag-provider"
set "TEST_PROFILE_DIR=%PROJECT_ROOT%\.test-ide-profile"
set "IDE_EXE=%LOCALAPPDATA%\Programs\Antigravity IDE\Antigravity IDE.exe"
set "PROXY_PORT=50051"

REM ── Verificar se o IDE existe ──
if not exist "%IDE_EXE%" (
    echo [ERRO] Antigravity IDE nao encontrado em:
    echo        %IDE_EXE%
    echo.
    echo Verifique a instalacao ou edite IDE_EXE neste script.
    pause
    exit /b 1
)

REM ── Verificar se o ag-provider esta compilado ──
if not exist "%AG_PROVIDER_DIR%\dist\diagnosticProxy.js" (
    echo [BUILD] Compilando ag-provider...
    pushd "%AG_PROVIDER_DIR%"
    call npm run build
    popd
    if not exist "%AG_PROVIDER_DIR%\dist\diagnosticProxy.js" (
        echo [ERRO] Build falhou. Verifique erros do TypeScript.
        pause
        exit /b 1
    )
)

REM ── Criar perfil de teste se nao existir ──
if not exist "%TEST_PROFILE_DIR%" (
    echo [SETUP] Criando perfil de teste isolado...
    mkdir "%TEST_PROFILE_DIR%"
)

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║              ag-provider — TEST LAB                        ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║  1. Subindo proxy de diagnostico na porta %PROXY_PORT%          ║
echo ║  2. Abrindo IDE de teste com perfil isolado                ║
echo ║                                                            ║
echo ║  IMPORTANTE: Na IDE de teste, configure settings.json:    ║
echo ║    "antigravity.agentHostAddress": "http://127.0.0.1:%PROXY_PORT%"║
echo ║                                                            ║
echo ║  Depois envie uma mensagem no chat e observe o terminal.  ║
echo ║  Pressione Ctrl+C para encerrar o proxy.                  ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

REM ── Abrir IDE de teste (em background com env vars) ──
echo [IDE] Abrindo Antigravity IDE com perfil de teste...
set "AGENT_HOST_ADDRESS=http://127.0.0.1:50051"
set "ANTIGRAVITY_AGENT_HOST_ADDRESS=http://127.0.0.1:50051"
cmd /c start "" "%IDE_EXE%" --user-data-dir="%TEST_PROFILE_DIR%" --new-window

REM ── Esperar 2 segundos pra IDE abrir ──
timeout /t 2 /nobreak >nul

REM ── Subir proxy (foreground — mostra capturas no terminal) ──
echo [PROXY] Iniciando proxy de diagnostico...
echo.
pushd "%AG_PROVIDER_DIR%"
node dist/diagnosticProxy.js
popd

endlocal
