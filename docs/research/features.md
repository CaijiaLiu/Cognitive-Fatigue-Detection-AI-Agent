# Feature dictionary

| Feature | Existing / planned | Definition and measurement limit |
|---|---|---|
| EAR | Existing | Aspect-corrected eye-landmark ratio; natural-open-eye baseline |
| Blink count/rate | Existing | Closed-to-open event 80–800 ms; rate per valid tracked minute; approximately 10 Hz sampling may miss short events |
| Closed time/fraction | Existing | Integrated closed intervals divided by valid tracked time; not automatically validated PERCLOS |
| Blink duration/interval | Duration existing; interval analysis planned | Milliseconds; avoid bridging tracking gaps |
| Iris x/y and variation | Existing | Normalized relative to eye width; SD combines axes; not a screen point |
| Coarse screen gaze / dwell | Planned | Calibration-backed estimate with held-out errors, confidence/quality and region definition |
| Movement amplitude/speed/frequency | Planned | Windowed coarse gaze changes; explicit units and smoothing; not precise physiological saccade frequency |
| Head rotation/movement | Existing, partial | Rotation matrix, relative angular travel per valid second; event thresholds and pitch/yaw/roll planned |
| Facial dynamics | Planned | Selected Face Landmarker blendshape scores and window change; estimated facial-action proxies, not direct muscle or emotion measurements |
| Reaction time/variability | Existing | Correct valid Go trials; ms; mean/median/sample SD; browser timing limitations |
| Omissions/false alarms | Existing | Valid Go without response / valid No-Go with response |
| Thought-probe label | Planned | On-task/off-task/unsure self-report; pre-prompt window only |
| Fatigue ratings | Existing | Session pre/post 1–10 self-report, separate from mind wandering |

Window-level features must include start/end time, valid coverage, observation count and exclusion reason. Rates use valid exposure time. Missing quality must remain missing, not zero.

Precise fixation counts, saccades and pupil diameter are future eye-tracker measurements unless separately validated. Do not label unstable gaze as proven distraction. Feature additions must follow [data-contract evolution](../architecture/data-contracts.md).
