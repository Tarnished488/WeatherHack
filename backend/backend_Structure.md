backend/
├── app/
│   ├── db.py          # 队友的 weather_observations 原样建表 + fetch_runs + risk_evaluations
│   ├── config.py      # 阈值配置加载与结构校验
│   ├── ingest.py      # GeoCSV → 入库；越界/缺失打标 is_valid=0（不删除）
│   ├── features.py    # 1h/24h/72h/7d 窗口聚合 + 数据质量指标
│   ├── engine.py      # 可解释规则引擎
│   └── pipeline.py    # 编排步骤1→5 + CLI（python -m app.pipeline）
├── config/risk_thresholds.json   # 阈值/权重/建议模板全部集中在版本化配置（v1.0.0）
├── tests/             # 22 个 pytest 用例，全部通过 ✅
├── tools/             # inspect_csv.py（数据分布分析）、dump_last_evaluation.py
└── data/majiguard.db  # 真实数据已入库 18364 行