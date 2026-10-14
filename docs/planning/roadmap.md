# Roadmap and implementation steps

Strategic research questions, scientific guardrails and workstreams A–G are defined in [Research North Star](research-north-star.md). This roadmap remains the dependency-ordered implementation source of truth; the North Star is a plan, not evidence of implemented capabilities.

V1/V2/V3 are milestones, not separate code directories. Work in dependency order; release tags follow acceptance, not calendar dates. The modular base has been extracted. Research-step acceptance gates remain open; see implementation-status.md.

| Step | Milestone | Deliverable | Acceptance gate |
|---|---|---|---|
| 1 | V1 stabilization | Verify existing collection on real devices; establish measurement and timing QA | Real camera session/export on target browsers; annotated blink comparison; actual sampling/gap statistics; missing data handled; limitations recorded |
| 2 | V2 tracking/features | Extract shared feature modules; add selected facial blendshapes and head events | Units/semantics defined; dropout tests; versioned local/export/cloud fields; measured performance; no psychological labels inferred |
| 3 | V2 gaze | Multi-point calibration with independent validation; coarse gaze regions, dwell and movement proxy | Held-out target errors and usable coverage reported; low-quality gaze suppressed; calibration invalidated after drift/setup change |
| 4 | V2 protocols | Phase engine, practice/baseline/task/post, thought probes and confounder form | Probe timing excludes interrupted trials; pre-probe windows only; unsure stays separate; every phase/export timestamp verified |
| 5 | V2 integration | Multimodal timelines, quality-aware summaries and compatible cloud storage | End-to-end real session has ocular/facial/head/task/probe data; old sessions readable; consent/allowlist/export/withdrawal tests pass |
| 6 | V3 statistics | Offline export reader, window builder, exploratory fatigue/mind-wandering analyses and report | One reproducible command/config; synthetic fixture; exclusions, uncertainty and repeated-measure handling reported; negative findings retained |
| 7 | V3 models | Baselines + Logistic Regression, then Random Forest/Bagging comparison | Grouped participant/session-safe splits; preprocessing inside folds; imbalance/uncertainty disclosed; insufficient labels blocks performance claims |
| 8 | Extensions | Video task adapter, then interview behavior adapter | Shared pipeline reused; media/session sync tested; gaze quality shown; no unsupported comprehension or hiring judgments |
| 9 | Long-term research | Attention/ADHD-related literature-driven protocol, optional eye-tracker adapter | Protocol and evaluation reviewed with appropriate research expertise; no diagnostic claims; formal participant study requirements addressed |

## Step details and dependencies

1. Validate before adding interpretation. Capture anonymous/synthetic engineering evidence; never commit participant video. Existing EAR calibration is not gaze calibration.
2. Introduce feature/tracking modules around existing core.js and Worker contracts. Choose a small documented facial subset; features represent model-estimated actions.
3. Test whether ordinary webcams achieve useful coarse regions; if they do not, retain iris variation and report gaze unavailable. Do not force heatmap output.
4. Protocol durations and probe schedules are versioned experimental choices. Start with a pilot; a longer session does not guarantee fatigue.
5. Update client serialization, server sanitizer and export readers together. Preserve the V1 task-only and simulation paths.
6. Start with exploratory questions and individual trajectories, not an arbitrary attention/fatigue score.
7. Training depends on adequate independent participants, labels and class coverage. If these are insufficient, continue descriptive research rather than manufacture accuracy.
8. Extensions can proceed after the shared feature/protocol interfaces are stable; they need not wait for a successful predictive model.
9. Precise saccades/pupil measurement are an optional hardware research track, not promises for the current webcam.

## Handoff checklist per step

Record changed paths, schema/protocol impact, completed checks, pending real-device/research verification, and the next concrete task in implementation-status.md. Record a branch/commit or PR reference when available. A contributor must read the current Git state before beginning work; chat context is not a shared task queue.

Module extraction in Step 2 is complete; this does not complete the facial-feature or validation work in Step 2.

## Immediate sequence after the mission preview review

Keep Steps 1–9 as stable research milestones. Execute this bounded integration track before expanding V2 features:

| Order | Work | Completion gate |
|---|---|---|
| 1A | Stabilize preview boundaries | Reject pre-task frames; independent calibration deadline; delayed/missing-frame tests |
| 1B | Verify mission experience | Full and demo journeys in camera/task-only/simulated modes; interruption, export, history and responsive layout checks |
| 1C | Port into canonical modules | Shared feature/tracking engine; reusable PVT and Go/No-Go adapters; no duplicate algorithm ownership |
| 1D | Integrate data contracts | Versioned multi-task records and three ratings; V1 read compatibility; optional cloud consent/allowlist/export tests |
| 1E | Complete Step 1 measurement QA | Annotated real-device detection checks, sampling/timing quality and recorded limitations |

1C's minimal multi-task orchestration is engineering groundwork for Step 4, not completion of its baseline/probe/confounder requirements. 1D does not complete Step 5's facial/gaze/probe integration.

The preview is already implemented on its branch; porting, scientific validation and deployment are separate statuses. See [detailed integration plan](mission-integration.md).
