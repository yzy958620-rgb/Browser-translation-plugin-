/* langs.js —— 语言列表（popup / options / background / content 共用）
   取值格式「中文名 English Name」：中文名用于界面，英文名会原样写进提示词，
   所以每个条目都必须带上准确的英文语言名，模型才认得。 */

const LANGUAGES = {
  /* 中文系 */
  'zh': '简体中文 Chinese Simplified',
  'zh-TW': '繁體中文 Chinese Traditional',
  'yue': '粤语 Cantonese',

  /* 东亚 / 东南亚 */
  'en': '英语 English',
  'ja': '日语 Japanese',
  'ko': '韩语 Korean',
  'vi': '越南语 Vietnamese',
  'th': '泰语 Thai',
  'id': '印度尼西亚语 Indonesian',
  'ms': '马来语 Malay',
  'fil': '菲律宾语 Filipino',
  'my': '缅甸语 Burmese',
  'km': '高棉语（柬埔寨语）Khmer',
  'lo': '老挝语 Lao',
  'mn': '蒙古语 Mongolian',

  /* 南亚 / 西亚 */
  'hi': '印地语 Hindi',
  'bn': '孟加拉语 Bengali',
  'ur': '乌尔都语 Urdu',
  'ta': '泰米尔语 Tamil',
  'te': '泰卢固语 Telugu',
  'mr': '马拉地语 Marathi',
  'gu': '古吉拉特语 Gujarati',
  'pa': '旁遮普语 Punjabi',
  'ne': '尼泊尔语 Nepali',
  'si': '僧伽罗语 Sinhala',
  'ar': '阿拉伯语 Arabic',
  'fa': '波斯语 Persian',
  'he': '希伯来语 Hebrew',
  'tr': '土耳其语 Turkish',
  'az': '阿塞拜疆语 Azerbaijani',
  'kk': '哈萨克语 Kazakh',
  'uz': '乌兹别克语 Uzbek',
  'hy': '亚美尼亚语 Armenian',
  'ka': '格鲁吉亚语 Georgian',

  /* 欧洲 */
  'fr': '法语 French',
  'de': '德语 German',
  'es': '西班牙语 Spanish',
  'pt': '葡萄牙语 Portuguese',
  'it': '意大利语 Italian',
  'ru': '俄语 Russian',
  'uk': '乌克兰语 Ukrainian',
  'be': '白俄罗斯语 Belarusian',
  'nl': '荷兰语 Dutch',
  'sv': '瑞典语 Swedish',
  'no': '挪威语 Norwegian',
  'da': '丹麦语 Danish',
  'fi': '芬兰语 Finnish',
  'is': '冰岛语 Icelandic',
  'pl': '波兰语 Polish',
  'cs': '捷克语 Czech',
  'sk': '斯洛伐克语 Slovak',
  'hu': '匈牙利语 Hungarian',
  'ro': '罗马尼亚语 Romanian',
  'bg': '保加利亚语 Bulgarian',
  'el': '希腊语 Greek',
  'sr': '塞尔维亚语 Serbian',
  'hr': '克罗地亚语 Croatian',
  'sl': '斯洛文尼亚语 Slovenian',
  'lt': '立陶宛语 Lithuanian',
  'lv': '拉脱维亚语 Latvian',
  'et': '爱沙尼亚语 Estonian',
  'ca': '加泰罗尼亚语 Catalan',
  'gl': '加利西亚语 Galician',
  'eu': '巴斯克语 Basque',

  /* 其他 */
  'af': '南非荷兰语 Afrikaans',
  'sw': '斯瓦希里语 Swahili',
  'am': '阿姆哈拉语 Amharic',
  'ha': '豪萨语 Hausa',
  'yo': '约鲁巴语 Yoruba',
  'zu': '祖鲁语 Zulu',
  'la': '拉丁语 Latin',
  'eo': '世界语 Esperanto'
};

/* 不使用空格分词的语言：双语拼接时不补空格 */
const TIGHT_LANGS = new Set(['zh', 'zh-TW', 'yue', 'ja']);

/* 从右向左书写的语言：译文段落用 dir="auto" 让它自己排版 */
const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur']);

function langName(code) {
  if (!code || code === 'auto') return '自动检测 Auto detect';
  return LANGUAGES[code] || LANGUAGES.zh;
}

/* 短的中文名，用于菜单等空间有限的位置 */
function langShort(code) {
  if (!code || code === 'auto') return '自动检测';
  return (LANGUAGES[code] || LANGUAGES.zh).split(' ')[0] || '中文';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LANGUAGES, TIGHT_LANGS, RTL_LANGS, langName, langShort };
}
