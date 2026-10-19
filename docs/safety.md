# Safety and wording rules

Source of truth for user-facing safety copy and for what the app may claim. `npm run check:copy` enforces the banned-term list.

## What the app is

An audio tool for listening and experimentation. It is not a medical device and does not diagnose, treat or prevent any condition.

## Wording rules

1. No disease, symptom or treatment terms.
2. Never claim that a frequency produces a physiological or cognitive effect. Describe what the user hears ("two tones 10 Hz apart: a quick, even shimmer").
3. Scene names (Study, Deep work, Night) name a listening situation. Their descriptions state only the tuning and the sounds.
4. Research is cited with its real strength: mixed, small-to-medium average effects, not specific to a band.
5. EEG band names are conventions, not measurements of the listener.

## Consent flow

The first Play opens one dialog: stereo headphones, start quiet, epilepsy or seizure history, heart rhythm condition or implanted device, pregnancy, driving and machinery, stop if unwell, plus an explicit checkbox. A headphone left/right check is offered. The acknowledgement is versioned (`SAFETY_VERSION` in `src/app/storage.ts`, currently 1); bump it when the text changes, so every user sees the new text once.

## Level policy

- Default tone level is -30 dBFS; soundscape layers start around -36 to -50 dB RMS.
- A user-set ceiling (default -18 dB, maximum -9 dB) bounds every level control, share links and the engine itself.
- A smooth saturator at -3 dBFS bounds the output. It is not reached at policy-compliant settings.
- Fades in and out default to 4 s. Levels are relative to full scale, not calibrated sound pressure, and the UI says so.

## Open items (need a human)

- Clinician review of the contraindication wording (en and pt-BR).
- Trademark search for "neural.freq".
- Measuring real output on two headphone types (loopback or coupler).
