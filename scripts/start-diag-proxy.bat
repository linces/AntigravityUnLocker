@echo off
REM ╔══════════════════════════════════════════════════════════════╗
REM ║  ag-provider — Proxy de Diagnostico (standalone)           ║
REM ║  Sobe apenas o proxy de captura na porta 50051             ║
REM ╚══════════════════════════════════════════════════════════════╝

setlocal

set "AG_PROVIDER_DIR=%~dp0..\src\ag-provider"

REM ── Verificar se esta compilado ──
if not exist "%AG_PROVIDER_DIR%\dist\diagnosticProxy.js" (
    echo [BUILD] Compilando ag-provider...
    pushd "%AG_PROVIDER_DIR%"
    call npm run build
    popd
)

echo [PROXY] Iniciando proxy de diagnostico...
echo         Porta: 50051 (HTTP/1.1) + 50052 (HTTP/2 h2c)
echo         Capturas: %AG_PROVIDER_DIR%\captures\
echo.

pushd "%AG_PROVIDER_DIR%"
node dist/diagnosticProxy.js
popd

endlocal
