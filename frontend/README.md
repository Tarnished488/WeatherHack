# MajiGuard 前端

React + TypeScript + Vite Dashboard，直连 FastAPI。

## 启动

先在 `backend/` 导入数据并启动 API：

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn
python -m app.ingest --source ../RainData
python -m app.pipeline
python -m app.api
```

再启动前端：

```bash
cd frontend
npm install
npm run dev
```

Vite 会把 `/api` 代理到 `http://127.0.0.1:8000`。
