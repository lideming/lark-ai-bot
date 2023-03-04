export function mdEscape(text: string) {
  return text.replaceAll(/[_~\*\[\]\\#]/g, (x) => "\\" + x);
}

export function createI18nCard<T>(
  i18nMap: Record<string, string>,
  func: (I: (text: string) => string) => T,
) {
  return {
    config: {
      wide_screen_mode: true,
      update_multi: true,
    },
    i18n_elements: Object.fromEntries(
      ["en_us", "zh_cn"]
        .map((lang) => [
          lang,
          func(getTranslater(i18nMap, lang)),
        ]),
    ),
  };
}

export const getTranslater =
  (i18nMap: Record<string, string>, lang: string) => (text: string) => {
    if (lang == "en_us") return text;
    else return i18nMap[text] || text;
  };
