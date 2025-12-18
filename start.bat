@echo off
echo ===========================================
echo Starting Leonardo Bulk Studio
echo ===========================================

cd backend
start "Leonardo Backend" cmd /k "..\venv312\Scripts\activate && uvicorn app.main:app --reload"

cd ..\frontend
start "Leonardo Frontend" cmd /k "npm run dev"

echo Services started in separate windows.
echo Frontend: http://localhost:5173
echo Backend: http://localhost:8000
