# MajiGuard 后端结构（backend/）

可解释风险引擎工作流：`weather_observations` → 提取关键字段 → 窗口聚合特征 → 匹配阈值配置 → 规则引擎 → 持久化 `risk_evaluations`。

```text
backend/
├── app/
│   ├── db.py          # 队友的 weather_observations 原样建表 + fetch_runs + risk_evaluations
│   ├── config.py      # 阈值配置加载与结构校验
│   ├── ingest.py      # GeoCSV → 入库；越界/缺失打标 is_valid=0（不删除）
│   ├── conduit_client.py # 后端持有凭据，向 Conduit 发 POST 请求
│   ├── conduit_ingest.py # Conduit JSON → 同一张 weather_observations 表
│   ├── refresh_service.py # fetch → clean/store → evaluate 编排
│   ├── features.py    # 1h/24h/72h/7d 窗口聚合 + 数据质量指标
│   ├── engine.py      # 可解释规则引擎
│   └── pipeline.py    # 编排步骤1→5 + CLI（python -m app.pipeline）
├── config/
│   └── risk_thresholds.json   # 阈值/权重/建议模板全部集中在版本化配置（v1.0.0）
├── tests/             # 22 个 pytest 用例，全部通过 ✅
├── tools/             # inspect_csv.py（数据分布分析）、dump_last_evaluation.py
└── data/
    └── majiguard.db   # 真实数据已入库 18364 行
```

## 工作流步骤

| 步骤 | 内容 | 对应模块 |
|---|---|---|
| 1 | 提取关键字段（rg1/rg2、temp_sht、humidity_sht、wind_spd、is_valid） | `features.py` |
| 2 | 聚合特征：24h/72h 累计降雨、有雨天数、温度/湿度/阵风极值 | `features.py` |
| 3 | 匹配 JSON 阈值配置（版本化、可调优） | `config.py` + `config/risk_thresholds.json` |
| 4 | 规则引擎输出：风险分 0~100、Low/Medium/High、置信度 0~1.0、触发规则、行动建议 | `engine.py` |
| 5 | 结果持久化到 `risk_evaluations`（按 window_end + rules_version 幂等 upsert） | `pipeline.py` |

## 常用命令

```bash
# 导入官方 Conduit GeoCSV（文件或目录）
python -m app.ingest --source ../RainData

# 运行风险评估（输出 JSON 摘要并写入数据库）
python -m app.pipeline

# 指定评估时间点 / 数据库 / 配置
python -m app.pipeline --at 2026-09-15T00:00:00Z --db data/majiguard.db

# 运行单元测试
python -m pytest
```

## Conduit 实时刷新（后端专用）

不要把 Conduit API key 放进 React、浏览器请求或 Git 仓库。启动 API 的终端中设置：

```bash
export MAJIGUARD_CONDUIT_ENDPOINT='https://<official-conduit-endpoint>'
export MAJIGUARD_CONDUIT_API_KEY='[REDACTED_SECRET]'
export MAJIGUARD_CONDUIT_EMAIL='your-team-email@example.com'
python -m app.api
```

前端或 Demo 工具随后调用：

```text
POST /api/refresh?fromdate=2026-09-01&todate=2026-09-02
```

该接口依次执行 Conduit POST、JSON 校验/清洗并写入
`weather_observations`、风险评估并写入 `risk_evaluations`。本地 CSV Demo
路径仍保留：`POST /api/refresh?source=../RainData`。

## 输出示例（真实数据）

- 风险分数：35 / 风险等级：Medium
- 触发规则：`dry_72h`（72h 累计降雨 0mm）、`dry_7d_baseline`（7 天有雨天数 0）
- 置信度：0.30（数据滞后超过 12 小时，触发 staleness 硬上限）
