---
name: feedback-verify-not-guess
description: "Maysam — verify before presenting; don't guess-then-revise. Validate computations before wiring/deploying."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 7e69c21b-9c99-4c8f-9cb9-f9607dfe621e
---

Maysam pushed back hard ("never guess again and again") after a pattern of me presenting an interpretation/number, then walking it back a message later.

**Why:** repeated guess-then-revise erodes trust and wastes his time. His standing rules are "I want what is correct" and "dont ever guess in this chat." A confident wrong answer is worse than a verified one.

**How to apply:**
- Before stating a number, definition, or methodology as fact, VERIFY it — run the query, read the source, check the schema. Don't present a guess as fact.
- For any metric BUILD: validate the computation with a standalone test query FIRST (does it reproduce known values / look sensible?), THEN wire it into the proc and deploy. Never deploy an unverified computation.
- When something is genuinely ambiguous (a reconstructed note, a methodology choice), state the assumption explicitly and confirm the ONE pivotal point up front — don't build on a guess and revise after.
- After any production change, verify with a query (and for panel columns, confirm INFORMATION_SCHEMA ordinal = the SRC position) before calling it done.

Concrete wins from doing this: caught that "recognized RRX ≈ gross" was a broken-fx artifact (not a real finding); caught that my from-scratch sold_rate "live" (0.75) was a rougher recompute, NOT a reason to overwrite the validated mart 0.81. See [[feedback-always-give-queries]] and [[me-rr-family-and-fx-fix]].

**STRONGER (Jun 2026) - "dont invent anything from ur end at all" / "dont add metrics from ur head - stick to what jad provided":** Do NOT choose metric names, labels, definitions, thresholds, groupings, or values myself - not even "reasonable" ones, and not even by promoting text already in the file (e.g. promoting a block's `title` to the displayed label counts as inventing). When a rename or new metric is requested WITHOUT the exact wording, ASK for the exact string rather than picking one. Removed `true_sold_committed_kitchens` (my addition) on this basis. Only user/Jad-provided wording or mart-sourced values go in.
