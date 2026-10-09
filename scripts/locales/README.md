# Translations

English and Bengali live in [`../locales.py`](../locales.py). Every other language gets one JSON file
in this folder, named after its [Chrome locale code](https://developer.chrome.com/docs/extensions/reference/api/i18n#locales),
for example `es.json`, `pt_BR.json` or `zh_CN.json`.

```bash
python3 scripts/locales.py --new es    # creates scripts/locales/es.json with every string to translate
# edit es.json: fill in "message" and leave "en" as it is (it's only there for reference)
python3 scripts/locales.py             # writes extension/_locales/es/messages.json
python3 scripts/locales.py --status    # how much of each language is done
npm run test:unit                      # checks placeholders, store limits and that files are regenerated
```

- **Partial translations are fine.** Empty `"message"` entries are skipped, and Chrome shows English for them.
- Keep `$1`, `$2` … exactly as in English. They are filled in at runtime.
- The `extName` (≤ 75 chars), `extShortName` (≤ 12) and `extDescription` (≤ 132, one plain sentence
  with no lists of features or file formats) entries appear in the Chrome Web Store.
- When English strings are added or changed, `python3 scripts/locales.py --update` adds the new keys to
  every file here and refreshes the `en` reference text, keeping existing translations.
- To try it, set the browser language (for example `chrome://settings/languages` → *Display Google Chrome
  in this language*) and reload the extension.
