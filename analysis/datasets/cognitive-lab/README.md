# Cognitive Fatigue — public numeric evidence subset

Real published research records, **not synthetic fixtures**. This is a selected subset,
not the full study, a validated training cohort, or Focus Lab measurements.

## Attribution and redistribution

Rui Varandas, Inês Silveira and Hugo Gamboa (2025), *Cognitive Fatigue*, version 3,
Figshare. DOI: https://doi.org/10.6084/m9.figshare.28188143.v3

Source: https://figshare.com/articles/dataset/Cognitive_Fatigue/28188143/3
Metadata: https://api.figshare.com/v2/articles/28188143/versions/3

Dataset license: **Creative Commons Attribution 4.0 International (CC BY 4.0)**:
https://creativecommons.org/licenses/by/4.0/ — this permits sharing/adaptation with
appropriate attribution, license link and indication of changes. No endorsement is implied.
This notice applies to these third-party data, not a new license for the whole repository.

Changes: selected all 20 results-board JSON files; added exactly one trailing LF to
each Git text copy. All JSON keys/values are unchanged. `manifest.json` identifies
every source file ID, download URL, original byte size, upstream MD5 and source SHA256.
The loader verifies source bytes after removing the single added LF. Retrieved 2026-10-23.

Only published source aliases S1–S10 and numeric board counts are included. No demographics,
screenshots, keyboard/mouse logs, videos, photographs, biosignals, local Focus Lab sessions,
or credentials are redistributed. The records are not linked to our participants.

## Important scientific limits

- The source description reports 10 recruited participants and one exclusion for insufficient
  recording. These 20 files include ten aliases; the eligible analysis cohort cannot be
  determined from this subset. Do not claim an accepted N=10 analysis dataset.
- The authors describe board fields as task results. Preserve their naming: a board number
  is not an independently verified fatigue condition, and a filename is not enough to infer
  a standardized task definition. No pooled accuracy denominator is introduced here.
- Missing entries in the sparse `incorrect` map remain absent, not zero-filled.
- The source study's fatigue interpretation uses early/late baseline periods. Those labels,
  timing records and biosignals are **not** imported, and no new fatigue label is manufactured.
- No webcam features, PVT RTs, or our Go/No-Go outcomes are present. This cannot validate
  our app, camera accuracy, visual/behavioral fusion or a fatigue predictor.
- This is a source-reading/agent-evidence starter, not model training or fine-tuning.
  Future modeling needs suitable independent outcomes, an approved analysis cohort,
  participant-grouped evaluation and a documented modality/protocol compatibility review.

## Use (Node.js only, no install or API key needed)

From repository root:

```sh
node scripts/public-data-agent.mjs overview
node scripts/public-data-agent.mjs board D2_S1_results_corsi_block_board_1.json
node scripts/public-data-agent.mjs fatigue
node --test tests/public-data-cognitive-lab.test.mjs
```

The first two commands return versioned, source-cited evidence; the last query abstains.
The response contains `instructions` and `evidence` for an AI coding/research agent to read.
It makes no network or LLM call and changes no model weights. CLI output is reproducible.

The new contract is `public-research-evidence/0.1`, intentionally separate from V1
`agent-tools/0.1`. It is **not** fed into the existing `/research-agent` synthetic demo,
whose metric allowlist is unchanged. No export is relabeled as a Focus Lab session.
No unmerged PR #19/#20/#21 code is copied or merged.

An AI agent using this branch should read this file, `manifest.json`, then run the commands.
It may report exact source values with citations and list limitations. It must not infer
fatigue scores, diagnosis, absent measurements, or model accuracy from these records.
