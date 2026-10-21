@echo off
chcp 65001 >nul
title Caminho dos Trilhos - Demo 3D
cd /d "%~dp0"
echo.
echo  Caminho dos Trilhos - Experiencia Urbana 2D + 3D
echo  ------------------------------------------------
echo  Iniciando servidor local... o navegador abrira em instantes.
echo  Para encerrar, feche esta janela.
echo.
if not exist "dist\index.html" (
  echo  Gerando build pela primeira vez...
  call npm run build
)
start "" http://localhost:4173/
call npx vite preview --port 4173 --strictPort
