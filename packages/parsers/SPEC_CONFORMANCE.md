# Spec conformance — STDF V4, STDF V4-2007, ATDF

A record-by-record check of `testdata-parser` (and the tsmap fixture generators that
feed its tests) against the published specifications. Started 2026-09-11 after the
file filter showed an ATDF file's job name disagreeing with its STDF twin.

## Sources

| Spec | Copy used | Notes |
| --- | --- | --- |
| STDF V4 (Teradyne) | [kanwoda.com mirror](https://www.kanwoda.com/wp-content/uploads/2015/05/std-spec.pdf) | Full text extracted and read directly. |
| STDF V4-2007 | [roos.com mirror](https://www.roos.com/roos/documentation.nsf/3d6a93a7e05462cf85256a9c007dcaf3/92102f712ce51df48825783800832332/$FILE/STDF%20Spec%20V4%202007.pdf) | Full text extracted and read directly. |
| ATDF V5.00.00_flx (Teradyne) | [silo.tips copy](https://silo.tips/download/atdf-table-of-contents-table-of-contents) | **Preview only** — text stops partway through PTR (after *Limit Compare*); no FTR table. The page scrape also misorders some table rows (HBR/SBR/PCR list Head/Site before the header), so every ATDF order below is checked against the spec's own sample record too. |
| Cross-check (not a spec) | [Semi-ATE/STDF](https://github.com/Semi-ATE/STDF) `to_atdf()` | Used only where the ATDF copy is truncated (PTR tail, FTR). Its MIR order matches the ATDF text exactly, which is why it is trusted for those gaps. |

**ATDF field order is its own.** ATDF does not follow the STDF binary order — MIR,
WRR and WCR all differ. Never derive an ATDF layout from the STDF table.

## Findings

Status: ❌ wrong · ✅ matches spec · 🔧 fixed (date) · ⚠️ unverified (spec copy incomplete) · 🔍 not yet checked

### ATDF parser (`src/parse_atdf.rs`)

| Record | Status | Spec order (ATDF) | Was / impact |
| --- | --- | --- | --- |
| MIR | 🔧 2026-09-11 | LOT_ID, PART_TYP, JOB_NAM, NODE_NAM, TSTR_TYP, SETUP_T, START_T, OPER_NAM, MODE_COD, STAT_NUM, SBLOT_ID, TEST_COD, RTST_COD, JOB_REV, EXEC_TYP, EXEC_VER, PROT_COD, CMOD_COD, BURN_TIM, TST_TEMP, USER_TXT, AUX_FILE, PKG_TYP, FAMLY_ID, DATE_COD, FACIL_ID, FLOOR_ID, PROC_ID, OPER_FRQ, SPEC_NAM, SPEC_VER, FLOW_ID, SETUP_ID, DSGN_REV, ENG_ID, ROM_COD, SERL_NUM, SUPR_NAM. Sample: `MIR:A3002B\|80386\|80386HOT\|akbar\|J971\|8:14:59 23-JUL-1992\|8:23:02 23-JUL-1992\|Sandy\|P\|1\|2B\|HOT\|N\|3.1.2\|…` | Right for fields 1–5 only; from 6 on it had `TSTR_SN, SUPR_NAM, JOB_REV, …`, so times, operator, sublot, test code, temperature, revision and exec fields came from the wrong slots. |
| WRR | 🔧 2026-09-11 | HEAD_NUM, FINISH_T, PART_CNT, WAFER_ID, SITE_GRP, RTST_CNT, ABRT_CNT, GOOD_CNT, FUNC_CNT, FABWF_ID, FRAME_ID, MASK_ID, USR_DESC, EXC_DESC | Had no `RTST_CNT` and a bogus `WAFER_ID2`: good count read from the abort-count slot, every later field shifted. |
| WCR | 🔧 2026-09-11 | WF_FLAT, POS_X, POS_Y, WAFR_SIZ, DIE_HT, DIE_WID, WF_UNITS, CENTER_X, CENTER_Y (no head/site group). Sample: `WCR:D\|R\|D\|5\|.3\|.25\|1\|23\|19` | Used the STDF order with a `HEAD_NUM, SITE_GRP` prefix — wafer size, die size, flat and axis directions all misread. |
| PTR | ⚠️ | Fields 1–9 from the spec: TEST_NUM, HEAD_NUM, SITE_NUM, RESULT, pass/fail, alarm flags, TEST_TXT, ALARM_ID, limit compare. 10–20 per Semi-ATE: UNITS, LO_LIMIT, HI_LIMIT, C_RESFMT, C_LLMFMT, C_HLMFMT, LO_SPEC, HI_SPEC, RES_SCAL, LLM_SCAL, HLM_SCAL | Parser matches both. (The generators did not — see below.) |
| FTR | ⚠️ | Pass/fail is field 4 (spec sample `FTR:27\|2\|1\|P\|…`; Semi-ATE agrees) | Parser reads fields 1–4 only; matches. |
| PRR | ✅ | HEAD_NUM, SITE_NUM, PART_ID, NUM_TEST, pass/fail, HARD_BIN, SOFT_BIN, X_COORD, Y_COORD, retest, abort, TEST_T, PART_TXT, PART_FIX | Matches. |
| PIR, WIR, HBR, SBR | ✅ | per spec tables and samples | Match. |
| SDR | ✅ | HEAD_NUM, SITE_GRP, SITE_NUM (array), HAND_TYP, … | First four fields (all the parser reads) match. |

Regression guard: `spec_sample_records_parse_to_the_right_fields` parses the spec's own
MIR and WCR sample records (plus a spec-shaped WRR). Every earlier ATDF test used helpers
written to the parser's own layouts, so they could never catch a wrong order.

### STDF parser (`src/parse_stdf.rs`)

| Record | Status | Notes |
| --- | --- | --- |
| MIR | ✅ | 15-byte fixed prefix, then the Cn run in V4 order. |
| WCR | 🔧 2026-09-11 | Spec: WAFR_SIZ, DIE_HT, DIE_WID, WF_UNITS, WF_FLAT, CENTER_X, CENTER_Y, POS_X, POS_Y (20 bytes) — no `HEAD_NUM`/`SITE_GRP`. `wcr_fields` expected both and read every field 2 bytes late, so a real file's wafer size, die size, flat and axis directions were garbage. The fixture generator (`generate_stdf_corner_lot.py`) wrote the same prefix, which is why `pvt_lot_05_has_wcr_fields` passed. |
| PTR | 🔧 2026-09-11 | Layout ✅ (TEST_NUM, HEAD, SITE, TEST_FLG, PARM_FLG, RESULT, TEST_TXT, ALARM_ID, OPT_FLAG, 3 × scale, LO_LIMIT, HI_LIMIT, UNITS). OPT_FLAG handling was incomplete: bits 4/5 (limit invalid *in this record* — use the first PTR's default) were ignored, only 6/7 (no limit) honoured, so the unused bytes of a bit-4/5 record were read as a real limit. Now both mask the limit; only 6/7 still count as "no limit". Test: `ptr_limits_flagged_invalid_are_not_read_as_limits`. |
| FTR | ✅ | TEST_NUM, HEAD, SITE, TEST_FLG, OPT_FLAG; 26-byte fixed block; RTN/PGM index and state arrays (U*2 / nibble-packed N*1); FAIL_PIN (D*n); VECT_NAM, TIME_SET, OP_CODE; TEST_TXT. |
| WIR | ✅ | HEAD_NUM, SITE_GRP, START_T @2, WAFER_ID @6. |
| WRR | ✅ | PART_CNT @6, RTST/ABRT @10/14, GOOD_CNT @18, FUNC_CNT @22, Cn run from @26. |
| PIR, PRR | ✅ | PRR: PART_FLG @2, NUM_TEST @3, HARD_BIN @5, SOFT_BIN @7, X/Y @9/11, TEST_T @13, PART_ID @17. |
| HBR, SBR | ✅ | BIN_NUM @2, BIN_CNT @4, BIN_PF @8, BIN_NAM @9. |
| SDR | ✅ | HEAD_NUM, SITE_GRP, SITE_CNT, SITE_NUM array from @3. |
| Unknown records | ✅ | Every dispatch ends `_ => {}`, so records it doesn't know (incl. all V4-2007 additions) are skipped, not errors. |

Every STDF dispatch (full parse, filtered parse, first-pass scan, file-meta scan) reads
fields through these same helpers, so each fix applies to all four paths.
`sample_data/PVT-LOT-05.stdf` was patched in place (the WCR record's 2 stray bytes
removed, REC_LEN 22 → 20); it was not regenerated because the current generator no longer
reproduces the checked-in file byte for byte.

### STDF V4-2007

- Layouts of MIR, WIR, WRR, PIR, PRR and SDR are **unchanged** from V4 (tables compared).
  2007 changes how some of their fields are *used* and adds new records: **VUR** (0·30,
  `UPD_NAM` = `"V4-2007"`), PSR, NMR, CNR, SSR, SCR and STR (scan-fail data).
- 🔧 2026-09-11: the VUR is read (`vur_fields`) and `UPD_NAM` emitted as the file-level
  field `updNam` (tsmap labels it "STDF revision"), in the full parse, the filtered parse
  and the file-meta scan. V4-2007 puts VUR *before* the MIR, so it is kept apart from the
  MIR's fields everywhere — the file-meta scan assigns the MIR's fields outright and would
  otherwise have overwritten it. Test `v4_2007_file_loads_and_reports_its_revision` builds
  FAR – VUR – MIR plus two 2007-only records (PSR, STR) and checks both paths.
- Scan-fail records (PSR, NMR, CNR, SSR, SCR, STR) are skipped, not decoded — out of scope
  until something needs them. ATDF has no VUR equivalent in the V5.00.00_flx spec.

### Fixture generators (tsmap `scripts/`)

| Generator | Problem | Status |
| --- | --- | --- |
| `generate_stdf_coordinateless.py` | STDF MIR had 12 stray bytes ahead of LOT_ID and JOB_NAM in the wrong slot. | 🔧 2026-09-11 — `COORDLESS-LOT-01.stdf` regenerated (die data unchanged). |
| `generate_sample_files.py` | ATDF MIR hardcoded `test_program`/`node-01`/`Tester-1` in five fields, ignoring `LOT_META`, so ATDF/STDF twins disagreed. ATDF PTR had one extra blank field. ATDF WRR used the parser's old layout. | 🔧 2026-09-11 — writes the full ATDF MIR from `LOT_META` (`atdf_mir`), PTR and WRR in spec order. |
| `generate_test_suite.py` | Same PTR and WRR problems. | 🔧 2026-09-11 |
| `generate_stdf_corner_lot.py` | STDF WCR with the head/site-group prefix. | 🔧 2026-09-11 — prefix removed; `PVT-LOT-05.stdf` patched in place. |

The PTR shift was silent in the parser, not an error. Before the fix, parsing
`sample_data/CLUST-LOT-03_W01.atdf` and its STDF twin gave:

```text
ATDF  test 1001: name "1001", no units, no loLimit, hiLimit 0.5
STDF  test 1001: name "leakage", units "nA", loLimit 0.5, hiLimit 5.5
```

The blank TEST_TXT fell back to the test number, `nA` in the LO_LIMIT slot failed to
parse and became "no limit", and the real low limit was taken as the high limit.

**Fixtures.** The existing `.atdf` files in `sample_data/` and `testdata/` were rewritten
in place — MIR, PTR and WRR lines only (36 MIR, 2,565 PTR, 86 WRR), die data untouched.
The sample files were not regenerated: their source CSVs (wafermap's `docs/examples/data`)
have since changed, so regeneration would replace the die data too. Evidence the rewrite
is right: regenerating `testdata/` with the fixed generator reproduces all 16 files byte for
byte, and `CLUST-LOT-03_W01.atdf` now parses identically to its STDF twin (lot fields, test
names/units/limits, die and good counts). The generators' bare `0` in ATDF WIR `START_T`
and WRR `FINISH_T` (valid in STDF as "not recorded", not a valid ATDF time) was blanked too
(85 + 85 lines). Scanning every STDF/ATDF pair in `sample_data/` through tsmap's file
filter, 35 of 36 now agree on every column; the exception, `COORDLESS-LOT-01`, is a
hand-written ATDF that was never a twin of its STDF (different part, job, wafer count).

## Plan

1. ~~**ATDF parser + fixtures.**~~ Done 2026-09-11 (all 180 parser tests pass).
2. ~~**STDF parser.**~~ Done 2026-09-11: WCR layout and PTR OPT_FLAG bits 4/5 fixed,
   every other record checked against the V4 tables (181 parser tests pass).
3. ~~**V4-2007.**~~ Done 2026-09-11: VUR read, `updNam` surfaced (182 parser tests pass).
4. Bump `testdata-parser` (minor — output changes for real files), publish, then
   `parser:unlink` and re-pin in tsmap.
