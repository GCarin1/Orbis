import { useLang, useT, type Lang } from "../i18n.js";

export function LanguageSwitch() {
  const t = useT();
  const { lang, setLang } = useLang();
  return (
    <label className="lang-switch">
      <span className="sr-only">{t("lang.label")}</span>
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t("lang.label")}>
        <option value="pt-BR">Português (BR)</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
