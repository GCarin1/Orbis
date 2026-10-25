# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version patch
append-requirement ubiquitous: The web app shall let the user write a skill in a form — name, what it does, when to use it and numbered steps — that makes its SKILL.md, keep the text a toggle away, and open as text a skill the form cannot hold.
append-criterion [verified] A skill written in the form saves the SKILL.md it makes, round-trips through Edit as text, starts from an example in the user's language, and one with headings opens as text with a note — verified by `packages/web/test/skills.test.tsx`
append-criterion [verified] In a browser a skill written in the form is saved and offered with / in a conversation — verified by `tests/e2e/skills-routines.test.ts`
```
