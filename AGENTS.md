<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- All prototype data comes from `src/data/dataset.json` (exported from the uploaded workbook) via `src/lib/data.ts`; canonical case values live in `CANON` there. Why: every screen must reconcile to one source.
- Cross-screen workflow state (transactions, approvals, audit, exceptions) lives in the in-memory reducer `src/lib/store.tsx`, provided in `__root.tsx`. Why: proposals started on one screen continue on another; nothing is persisted or sent to real systems.
