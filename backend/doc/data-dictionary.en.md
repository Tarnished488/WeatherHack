# Conduit Weather Data Dictionary

**Applicable source:** `outputs/data/raw/conduit.response`  
**Format:** Conduit API JSON (`headers` + `data`)  
**Last updated:** 2026-09-21

## 1. Data scope and cleaning principles

- Each record represents one observation time. `ts` is the unique business key.
- The API returns numeric values as strings. Parse them as SQLite `REAL`; store an empty or unparseable value as `NULL` and record the reason in `quality_flags_json`.
- Store times as UTC ISO 8601 text, for example `2026-09-11T00:00:01Z`.
- Do not write the API key or registered email address to the database or logs.
- A repeated retrieval of the same `ts` must not create a duplicate observation.

## 2. Fields returned by the API

| API field | Clean SQLite column | Type | Unit | Meaning | Validation / usage notes |
|---|---|---:|---|---|---|
| `ts` | `observed_at_utc` | TEXT | ISO 8601 UTC | Observation time | Required and unique; store in UTC with a trailing `Z`. |
| `rg1` | `rg1` | REAL | mm | Rain gauge 1 reading | Must not be negative. |
| `rg2` | `rg2` | REAL | mm | Rain gauge 2 reading | Must not be negative. |
| `rg1tt` | `rg1tt` | REAL | mm | Rain gauge 1 “Total Today” reading | Preserve as received until its daily-reset behavior is verified. |
| `rg2tt` | `rg2tt` | REAL | mm | Rain gauge 2 “Total Today” reading | Same as above. |
| `rg1tp` | `rg1tp` | REAL | mm | Rain gauge 1 “Total Prior” reading | The source header does not define the exact prior period; do not derive rainfall from it yet. |
| `rg2tp` | `rg2tp` | REAL | mm | Rain gauge 2 “Total Prior” reading | Same as above. |
| `temp_bmx` | `temp_bmx` | REAL | °C | BMX temperature sensor 1 | Can be cross-checked against the other temperature sensors. |
| `press_bmx` | `press_bmx` | REAL | hPa | BMX atmospheric-pressure sensor 1 | Station elevation affects absolute pressure; do not reject it using sea-level values alone. |
| `temp_mcp` | `temp_mcp` | REAL | °C | MCP temperature sensor 1 | Can be cross-checked against `temp_bmx` and `temp_sht`. |
| `temp_sht` | `temp_sht` | REAL | °C | Temperature from the SHT temperature/humidity sensor | A possible primary ambient-temperature input for the product. |
| `humidity_sht` | `humidity_sht` | REAL | % | Relative humidity from the SHT sensor | Expected range: 0–100. The original CSV unit metadata conflicts with its header, so use this range for validation. |
| `si1145_vis` | `si1145_vis` | REAL | raw value | SI1145 visible-light channel reading | Do not label it as lux; use only for relative changes. |
| `si1145_ir` | `si1145_ir` | REAL | raw value | SI1145 infrared channel reading | Do not label it as irradiance; use only for relative changes. |
| `si1145_uv` | `si1145_uv` | REAL | raw value | SI1145 ultraviolet channel reading | Do not label it as a standard UV Index before calibration. |
| `wind_spd` | `wind_spd` | REAL | m/s | Wind speed | Must not be negative. |
| `wind_dir` | `wind_dir` | REAL | degrees | Wind-direction angle | Expected range: 0–360. |
| `wind_gust` | `wind_gust` | REAL | m/s | Wind-gust speed | Must not be negative. It is normally at least the regular wind speed; treat violations as soft quality warnings. |
| `wind_gust_dir` | `wind_gust_dir` | REAL | degrees (source header) | Wind-gust direction angle | **Current data anomaly: every inspected value is identical to `wind_gust`. Do not use it in direction, dispersion, or risk calculations.** |
| `heat_idx` | `heat_idx` | REAL | pending confirmation | Heat index: perceived heat stress caused by temperature and humidity | Values currently resemble a temperature scale, but source metadata does not confirm the unit. Preserve it as a derived metric. |
| `wet_bulb_temp` | `wet_bulb_temp` | REAL | °C | Wet-bulb temperature | Useful for heat-stress analysis. |
| `wet_bulb_globe_temp` | `wet_bulb_globe_temp` | REAL | °C | WBGT (Wet-Bulb Globe Temperature) | An important heat-stress input, suitable for MajiGuard high-heat and outdoor-activity guidance. |

## 3. Fields present in the original CSV but absent from the API response

| Original CSV field | Meaning | Current handling |
|---|---|---|
| `Health` | Device health status | Not returned by the API; do not include it in the API-cleaning table. |
| `Battery Voltage` | Battery-related reading | Not returned by the API; the CSV unit metadata is not sufficiently reliable. |
| `Battery charge status` | Battery charging status | Not returned by the API. |
| `Cell signal strength` | Cellular signal strength | Not returned by the API. |

## 4. Recommended quality flags

Store `quality_flags_json` as a JSON string array. Example:

```json
["humidity_out_of_range", "wind_gust_direction_unreliable"]
```

| Flag | Trigger |
|---|---|
| `invalid_timestamp` | `ts` cannot be parsed as a UTC timestamp. |
| `non_numeric_<field>` | A numeric field is empty or cannot be parsed as a number. |
| `humidity_out_of_range` | `humidity_sht` is outside 0–100. |
| `negative_<field>` | A rainfall, wind-speed, or wind-gust field is negative. |
| `wind_direction_out_of_range` | `wind_dir` is outside 0–360. |
| `wind_gust_direction_unreliable` | Add this flag for now: source `wind_gust_dir` equals `wind_gust`. |
| `temperature_sensor_disagreement` | The maximum difference among the three temperature sensors exceeds a team-defined threshold. |

## 5. Currently verified data characteristics

- The inspected API payload contains 475 records and 22 fields, with no duplicate timestamps or empty fields.
- It covers about five days. The median sample interval is about 15 minutes, with slight timing jitter and a small number of gaps.
- Backend queries should sort by the latest `observed_at_utc`; they must not assume a record always arrives exactly on a 15-minute boundary.

## 6. Derivations that must wait

Until field definitions are confirmed or multi-day behavior is validated, do not:

1. calculate precise rainfall from `rg1tt`, `rg2tt`, `rg1tp`, or `rg2tp`;
2. call `si1145_vis` illuminance (lux), or call `si1145_uv` a standard UV Index;
3. use `wind_gust_dir` for wind direction, dispersion, or warning logic;
4. fabricate real-time device-health, battery, or signal fields that the API does not provide.
