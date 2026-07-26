@echo off
REM ╔══════════════════════════════════════════════════════════════╗
REM ║  ag-provider — Limpeza do Perfil de Teste                  ║
REM ║  Remove o perfil isolado da IDE de teste                   ║
REM ╚══════════════════════════════════════════════════════════════╝

setlocal

set "PROJECT_ROOT=%~dp0.."
set "TEST_PROFILE_DIR=%PROJECT_ROOT%\.test-ide-profile"
set "CAPTURES_DIR=%PROJECT_ROOT%\src\ag-provider\captures"

echo ╔══════════════════════════════════════════════════════════════╗
echo ║  LIMPEZA do ambiente de teste                              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

if exist "%TEST_PROFILE_DIR%" (
    echo [PERFIL] Removendo perfil de teste IDE...
    echo          %TEST_PROFILE_DIR%
    rmdir /s /q "%TEST_PROFILE_DIR%"
    echo          Removido.
) else (
    echo [PERFIL] Nenhum perfil de teste encontrado.
)

echo.

if exist "%CAPTURES_DIR%" (
    set /p "CLEAN_CAPTURES=Limpar capturas de diagnostico tambem? (S/N): "
    if /i "!CLEAN_CAPTURES!"=="S" (
        echo [CAPTURES] Removendo capturas...
        rmdir /s /q "%CAPTURES_DIR%"
        echo            Removido.
    ) else (
        echo [CAPTURES] Capturas mantidas em: %CAPTURES_DIR%
    )
) else (
    echo [CAPTURES] Nenhuma captura encontrada.
)

echo.
echo Limpeza concluida.
pause
endlocal
