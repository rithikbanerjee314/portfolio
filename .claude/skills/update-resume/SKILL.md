---
name: update-resume
description: Sync the live resume PDF from the OneDrive Columbia Resume folder into this site, commit, push, and verify it actually deployed. Use when the user asks to update/refresh/swap in a new resume, or references "the resume from OneDrive"/"the Columbia Resume folder".
---

# Update resume

Replaces the whole manual loop this used to take (copy the file in twice, hand-edit a CLAUDE.md note, commit, push, and — because the GitHub→Vercel webhook has silently dropped a push before with zero error — separately confirm the live site actually picked it up) with one pass.

**Scope note:** this skill pushes to `master` and deploys to production without asking each time, by the user's own explicit request ("instantly do it every time, instead of each time having to directly write out the instruction"). That authorization covers only this specific resume-swap workflow — nothing broader.

## Steps

1. **Locate and check the source.**
   Source of truth: `C:\Users\rbane\OneDrive\Documents\Columbia\Resume\Rithik_Banerjee_Resume.pdf`.
   Compare its size/mtime against `public/resume.pdf`. If they already match, tell the user there's nothing new and stop — don't create an empty commit.
   If the file isn't at that path (moved/renamed), stop and ask — don't go searching OneDrive broadly for a replacement.

2. **Copy the file to both destinations** (neither is symlinked — always re-copy both):
   - `public/resume.pdf` — what the site actually serves, linked from `SITE.resumeHref` in `lib/content.ts`.
   - `C:\Users\rbane\dev\Summer\resume\Rithik_Banerjee_Resume.pdf` — the mirror copy documented in CLAUDE.md, kept alongside the master resume database.
   Verify the copied file starts with `%PDF` and note its size.

3. **Update the CLAUDE.md checklist note.**
   Find the `public/resume.pdf` bullet under "Placeholder checklist" (currently the line starting `- [x] \`public/resume.pdf\` — the real resume, re-copied ...`) and update the date and size to match. Keep the rest of the sentence's wording intact — it's describing an ongoing convention, not this specific edit.

4. **Commit and push directly to `master`.**
   `git add public/resume.pdf CLAUDE.md`, commit with a short message describing the resume update (include co-author trailer per this repo's normal convention), `git push origin master`. No PR — this project deploys straight off `master` and that's the established pattern for this recurring task.

5. **Verify it actually deployed — don't stop at a successful push.**
   - Wait ~20–30s, then check `vercel ls portfolio --scope rithikbanerjee314s-projects` for a new deployment timestamped after the push.
   - If nothing new shows up: link if needed (`vercel link --yes --project portfolio --scope rithikbanerjee314s-projects`), then deploy manually with `vercel --prod --scope rithikbanerjee314s-projects` from the repo root. `.vercel/` is gitignored, so this is safe to do repeatedly.
   - Finish with a hard check regardless of which path deployed it: `curl -sL https://rithikbanerjee.com/resume.pdf` and compare it byte-for-byte (`cmp`) against the local `public/resume.pdf`. Only report success once the live file matches.

## Why step 5 exists

On 2026-08-06 a push landed correctly on GitHub (`master` HEAD updated) but Vercel's GitHub integration never queued a build for it — no error anywhere, the site just quietly kept serving the previous resume. A manual `vercel --prod` deploy fixed it. Trust the live byte comparison, not the push exit code.
