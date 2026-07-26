@echo off
REM ╔══════════════════════════════════════════════════════════════╗
REM ║  ag-provider — Bridge de Producao                          ║
REM ║  Sobe o ag-provider real (quando estiver pronto)           ║
REM ╚══════════════════════════════════════════════════════════════╝

setlocal

set "AG_PROVIDER_DIR=%~dp0..\src\ag-provider"

REM ── Verificar se esta compilado ──
if not exist "%AG_PROVIDER_DIR%\dist\index.js" (
    echo [BUILD] Compilando ag-provider...
    pushd "%AG_PROVIDER_DIR%"
    call npm run build
    popd
)

echo [BRIDGE] Iniciando ag-provider bridge...
echo.

pushd "%AG_PROVIDER_DIR%"
node dist/index.js
popd

endlocal
