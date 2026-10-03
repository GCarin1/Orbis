# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version patch
replace-requirement event 20: When the user opens Add members, the web app shall list the visible bots outside the group with a search field, allow picking bots up to the room the group's limit leaves, and say when every bot is already in the group (offering a new bot) or the group holds its limit (naming ORBIS_MAX_GROUP_SIZE).
```
