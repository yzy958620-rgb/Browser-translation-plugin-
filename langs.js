/* langs.js —— 目标语言列表（popup / options / background 共用） */

const LANGUAGES = {
  'zh': '简体中文 Chinese Simplified',
  'zh-TW': '繁體中文 Chinese Traditional',
  'en': '英语 English',
  'ja': '日语 Japanese',
  'ko': '韩语 Korean',
  'fr': '法语 French',
  'de': '德语 German',
  'ru': '俄语 Russian',
  'es': '西班牙语 Spanish',
  'pt': '葡萄牙语 Portuguese',
  'it': '意大利语 Italian',
  'ar': '阿拉伯语 Arabic'
};

function langName(code) {
  return LANGUAGES[code] || LANGUAGES.zh;
}

/* 短的中文名，用于菜单等空间有限的位置 */
function langShort(code) {
  return (langName(code) || '').split(' ')[0] || '中文';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LANGUAGES, langName, langShort };
}
