/**
 * 1. **新增模型支持：** 增加对全新大模型 **AiHubMix** 的支持，进一步提升账单分析准确性与灵活性。
 * 2. **优化系统Prompt：** 全面完善分析逻辑，包括分类规则、备注处理等，确保账单识别更加智能化和精细化。
 * 3. **UI/UX优化：** 对部分界面进行了视觉和交互优化，提升用户操作体验。
 */

/**
 * 记账助手 - 自动记账工具
 * 
 * 功能简介：
 * 1. 自定义设置：可配置用于分析账单的大模型和账户信息等
 * 2. 自动识别账单信息：通过OCR技术识别账单图片，提取金额、时间、备注等信息，让AI分析，写入到钱迹/飞书APP中
 * 
 * 作者：刺猬の拥抱
 * 小红书号：227339521
 * 版本：v0.0.4
 * 最后更新：2025-03-29
 */

const scriptVersion = "v0.0.6";

importClass("okhttp3.OkHttpClient");
importClass("okhttp3.Request");
importClass("okhttp3.RequestBody");
importClass("okhttp3.MediaType");
importClass("okhttp3.Response");
importClass("java.util.concurrent.atomic.AtomicInteger");
importClass("android.graphics.Color");
importClass("android.text.style.ForegroundColorSpan");
importClass("android.text.style.AbsoluteSizeSpan");
importClass("android.text.style.CharacterStyle");
importClass("android.text.style.ImageSpan");
importClass("android.graphics.Paint");
importClass("android.widget.LinearLayout");
importClass("android.text.TextWatcher");
importClass("android.view.View");
importClass("android.text.SpannableStringBuilder");
importClass("android.text.SpannableString");
importClass("android.graphics.PorterDuff");
importClass("android.view.MotionEvent");
importClass("android.text.Spanned");
importClass("java.util.concurrent.Semaphore");
let axios = require('axios');

// ==================== 配置模块 Start ====================  
// 常量模块
const Constants = {
  sysPrompt: `
# 你是一名会计，需要将OCR对于订单的扫描结果进行分析整理，使用JSON结构示例进行输出。

## 参数解释
### \`type\`

- **描述**: 账单类型:
  - 支出
  - 收入
- **默认值**: 如果无法识别，则默认为支出。
- **示例**: 支出
- **是否必填**: 是

### \`money\`

- **描述**: 账单金额。
  - 小数点最多可以精确到2位。
  - 优先考虑负数，但输出必须取绝对值。
- **示例**: \`26.5\`
- **是否必填**: 是

### \`time\`

- **描述**: 账单时间，格式必须为 \`yyyy-MM-dd HH:mm:ss\`。
  - 如果识别不出时间，则不返回。
- **示例**: \`2020-01-31 12:30:00\`
- **是否必填**: 否

### \`remark\`

- **描述**: 交易备注remark的生成要求为：
  1. 通用备注规则：根据用户的截图，提取解析商户名称和商品名称，精炼成简洁明了的一句话。例如，"在星巴克购买冰美式咖啡" 应该简化为 "星巴克 冰美式咖啡"。
  2. 针对特殊交易（如打车）：确保记录包括出发地、目的地和平台名称（如果有）。例如，"打车"交易备注可为 "滴滴 A地-->B地"。
  3. 请只输出消费备注的内容，不要加任何标题
  4. 在最后输出交易备注前，在第一位插入一个最合适的emoji图标，帮助快速分辨这是什么消费
- **示例**: \`☕️ 星巴克 冰美式咖啡\`
- **是否必填**: 是

### \`catename\`

- **描述**: 账单分类，此参数代表分类的名称（包含一级分类和二级分类）。
  - 如果type为支出，则根据购买的商品信息返回合适的一级分类及二级分类，并用\`/::/\`符号拼接他们，如\`餐饮/::/外卖\`。以下为csv格式的支出一级分类 first_category及其对应的二级分类second_category：
  一级分类,二级分类,备注及关联参考
    一级分类,二级分类,备注及关联参考
餐饮,咖啡,如Manner、M Stand、山池、瑞幸、星巴克等咖啡品牌，包括堂食、自取或通过外卖软件（如饿了么、美团）点单的咖啡饮品
餐饮,外卖,如烧烤、快餐盒饭、便当、粥粉面线等通过外卖软件购买的餐食，关联平台如饿了么、美团外卖、微信小程序外卖等
餐饮,下厨,购买做饭食材，如米面粮油、鸡鸭鱼肉蛋奶、蔬菜水果、生鲜海鲜、葱姜蒜调料等，关联商户如叮咚买菜、美团买菜、盒马鲜生、每日优鲜等
餐饮,水果零食,购买水果及休闲食品，如苹果、香蕉、车厘子、牛肉干、猪肉脯、巧克力、饼干、坚果、薯片等零食，关联商户如百果园、良品铺子、三只松鼠、便利蜂、7-11等
餐饮,堂食,线下门店消费的餐食，如烧烤、湘菜、川菜、日料、韩料、西餐、火锅等各类餐厅堂食；便利店或超市购买的便当熟食也归于此类
餐饮,饮料,购买饮料如奶茶、果茶、咖啡类即饮饮料、汽水（可乐、雪碧等）、果汁、矿泉水等；关联商户如喜茶、奈雪、CoCo、元气森林等
购物,杂七杂八,日常购物中无法明确归类的消费，如临时购买的小物件、文具、家居饰品等
购物,生活耗品,购买日常消耗品，如洗衣液、洗手液、洗发水、纸巾、清洁剂、垃圾袋等家用补充装；关联商户如超市、屈臣氏、京东超市、天猫超市等
购物,家具,购买居家家具如桌椅、沙发、床、衣柜、柜子、置物架等，关联商户如宜家、无印良品、淘宝家具类店铺等
购物,数码产品,购买电子设备及配件，如手机、电脑、耳机、相机、充电器、充电线、硬盘等，关联商户如Apple、小米、京东、天猫数码店铺等
购物,衣服鞋包,购买服装、鞋类、包类配饰等穿戴用品，关联品牌及商户如Zara、优衣库、耐克、阿迪达斯、淘宝服饰类店铺等
购物,书籍,购买书籍、电子书或杂志，如京东图书、当当网、亚马逊Kindle电子书等
购物,护理产品,个人护理用品如洗面奶、沐浴露、牙膏牙刷、防晒霜、护肤品套装等，关联商户如屈臣氏、京东美妆、天猫旗舰店等
购物,化妆品,彩妆及化妆品，如口红、粉底、眼影、睫毛膏等，关联品牌如雅诗兰黛、兰蔻、完美日记、花西子等
购物,快递费,因网上购物或寄送物品产生的快递费用，关联服务商如顺丰、京东物流、菜鸟驿站等
住房,电费,日常居住用电费用，关联服务商如国家电网、支付宝生活缴费、微信生活缴费等
住房,水费,日常居住用水费用，关联服务商如自来水公司、支付宝、微信生活缴费等
住房,燃气费,日常居住用燃气费用，关联服务商如燃气公司、支付宝、微信生活缴费等
住房,物业费,居住物业管理费用，如物业管理公司收取的费用
住房,宽带,家庭宽带费用，如电信、移动、联通宽带
娱乐,棋牌,棋牌娱乐相关消费，如麻将馆、棋牌室等线下棋牌娱乐或线上棋牌App充值
娱乐,电影,购买电影票或线上观看电影付费，如猫眼电影、淘票票、爱奇艺付费电影等
娱乐,游戏,游戏充值或购买，如Steam游戏、腾讯游戏、网易游戏、手游充值等
娱乐,沙龙,参加线下交流沙龙或兴趣小组的报名费用，如读书会、分享会等
娱乐,踏青,户外踏青或郊游相关的费用，如公园门票、野餐用品购买等
娱乐,展览,参观展览、博物馆、美术馆等产生的门票费用
娱乐,按摩,按摩服务，如SPA、推拿、足浴店等消费
娱乐,滑雪,滑雪运动相关费用，如滑雪门票、雪场消费、装备租赁等
娱乐,旅游,旅行期间产生的住宿、景点门票、旅行团费用、民宿酒店预订等消费
娱乐,演出,观看演唱会、舞台剧、音乐会、话剧等演出活动的门票费用
娱乐,KTV,KTV唱歌消费，如纯K、K歌之王、好乐迪等娱乐场所消费
娱乐,运动健身,健身相关费用，如健身房会员费、运动课程费用、购买运动装备等
娱乐,美甲,美甲相关消费，如美甲店的美甲美睫服务费用
出行,网约车,通过滴滴出行、高德打车、Uber等平台的打车费用
出行,公共交通,公共交通出行消费，如公交卡充值、地铁票、高铁动车票、城市交通卡如深圳通、八达通充值
出行,停车费,停车场停车费用，关联如停车场、小区停车费、路边停车缴费
出行,飞机,机票及航空相关费用，如各航空公司、飞猪、携程订购机票费用
出行,高铁,高铁或动车车票费用，如12306购票、高铁管家、携程等平台购买
订阅,Apple,Apple相关订阅费用，如Apple Music、iCloud、Apple TV+等苹果官方服务
订阅,流媒体,视频音频流媒体订阅，如Spotify、腾讯视频、爱奇艺、QQ音乐、网易云音乐、Bilibili大会员等
订阅,手机套餐,手机话费充值或套餐费，如中国移动、中国联通、中国电信等运营商话费充值
订阅,其他订阅,无法明确归类为上述订阅服务的其他会员费或软件订阅
贝果,健康,宠物相关健康护理用品或保健品，如猫狗营养品、药品
贝果,贝果杂七杂八,宠物相关的难以分类的消费，如宠物衣服、配饰、其他日常用品等
贝果,玩具,宠物玩具类消费，如逗猫棒、宠物玩具球、猫抓板等
贝果,食品,宠物食品消费，如猫粮、狗粮、零食罐头等
健康,门诊挂号,医院门诊挂号费用，如医院、自助挂号机、线上医疗App挂号费
健康,身体检查,体检及医疗检查项目产生的费用，如体检中心、医院开检查单收费
健康,药品,药品购买费用，包括医院药房购药及美团、饿了么、京东健康、线上药房购买药品
健康,补剂,购买保健品和营养补剂，如维生素D、钙片、鱼油、益生菌、蛋白粉等；购买渠道包括医院开具、外卖软件购买或电商平台如京东、淘宝等
    
  - 如果type为收入，则返回[ "工资", "生活费", "收红包", "外快", "股票基金", "其它" ]中任意一个。
  - **注意**: 当type为支出或者收入时填写此参数。
- **示例**: \`餐饮/::/外卖\`
- **是否必填**: 是

### \`accountname\`

- **描述**: 账单所属资产名称（或转账的转出账户）。
- **示例**: \`浦发银行信用卡(2333)\`
- **是否必填**: 支出、收入或还款时，是，全部默认为农行国航白3951；转账时，否

## 输出JSON结构体示例：
{
  "accountname": "招行信用卡(2331)"，
  "type": "支出",
  "money": 26.6,
  "remark": "在星巴克购买咖啡",
  "catename": "咖啡",
  "time": "2020-01-31 12:30:00"
}
  
## 直接返回JSON结构，不需要其他语言描述，也不需要使用\`\`\`json\`\`\`标记。
`
  ,
  mySettingKey: "my_setting",
  recordToField: "record_to",
  feishuAppIdField: "feishu_app_id",
  feishuAppSecretField: "feishu_app_secret",
  feishuTableUrlField: "feishu_table_url",
  qianjiName:"钱迹",
  feishuName:"飞书",
  type2Catenames:{
    "支出": [
      "餐饮/::/咖啡", "餐饮/::/外卖", "餐饮/::/下厨", "餐饮/::/水果零食", "餐饮/::/堂食", "餐饮/::/饮料", "购物/::/杂七杂八", "购物/::/生活耗品", "购物/::/家具", "购物/::/数码产品", "购物/::/衣服鞋包", "购物/::/书籍", "购物/::/护理产品", "购物/::/化妆品", "购物/::/快递费", "住房/::/电费", "住房/::/水费", "住房/::/燃气费", "住房/::/物业费", "住房/::/宽带", "娱乐/::/棋牌", "娱乐/::/电影", "娱乐/::/游戏", "娱乐/::/沙龙", "娱乐/::/踏青", "娱乐/::/展览", "娱乐/::/按摩", "娱乐/::/滑雪", "娱乐/::/旅游", "娱乐/::/演出", "娱乐/::/KTV", "娱乐/::/运动健身", "娱乐/::/美甲", "出行/::/网约车", "出行/::/公共交通", "出行/::/停车费", "出行/::/飞机", "出行/::/高铁", "订阅/::/Apple", "订阅/::/流媒体", "订阅/::/手机套餐", "订阅/::/其他订阅", "贝果/::/健康", "贝果/::/贝果杂七杂八", "贝果/::/玩具", "贝果/::/食品", "健康/::/门诊挂号", "健康/::/身体检查", "健康/::/药品", "健康/::/补剂"
    ],
    "收入": [
      "工资", "生活费", "收红包", "外快", "股票基金", "其它"
    ]
  },
  type2Int: {
    "支出": 0,
    "收入": 1,
    "转账": 2,
    "还款": 3
  },
  defaultColors: [
    "#FFD54F", // 阳光黄 (活力)
    "#FFC107", // 活力橙 (醒目)
    "#FF6F61", // 珊瑚红 (热情)
    "#FF4081", // 亮粉色 (时尚)
    "#9C27B0", // 紫罗兰 (优雅)
    "#673AB7", // 深紫 (稳重)
    "#3F51B5", // 靛蓝 (专业)
    "#2196F3", // 亮蓝 (科技感)
    "#00BCD4", // 青蓝 (清新)
    "#009688", // 蓝绿色 (自然)
    "#4CAF50", // 森林绿 (健康)
    "#8BC34A", // 草绿 (活力)
    "#CDDC39", // 柠檬黄 (明亮)
    "#FFEB3B", // 金黄 (醒目)
    "#FF9800", // 橙黄 (温暖)
    "#FF5722", // 深橙 (强烈)
    "#E91E63", // 玫红 (时尚)
    "#9C27B0", // 紫罗兰 (优雅)
    "#673AB7", // 深紫 (稳重)
    "#3F51B5"  // 靛蓝 (专业)
  ],
};
// ==================== 配置模块 End ====================

// ==================== JSONParser Plugin Start ====================
const [incompleteString, unexpectedToken, incompleteNumber] = ['Incomplete string', 'Unexpected token', 'Incomplete number'];

// JSONParser构造函数
function JSONParser(strict, options) {
  this.strict = strict || false;
  this.parsers = {};
  this.onExtraToken = (options && options.onExtraToken);

  // 初始化解析器
  let self = this;
  [' ', '\r', '\n', '\t'].forEach(function (c) {
    self.parsers[c] = self.parseSpace.bind(self);
  });

  ['[', '{', '"', 't', 'f', 'n'].forEach(function (c) {
    let methodName = c === '[' ? 'Array' :
      c === '{' ? 'Object' :
        c === '"' ? 'String' :
          c === 't' ? 'True' :
            c === 'f' ? 'False' : 'Null';
    self.parsers[c] = self['parse' + methodName].bind(self);
  });

  '0123456789.-'.split('').forEach(function (c) {
    self.parsers[c] = self.parseNumber.bind(self);
  });
}

// 解析任意类型
JSONParser.prototype.parseAny = function (s) {
  if (!s) return [null, '', null];
  let parser = this.parsers[s[0]];
  if (!parser) return [null, s, new Error(unexpectedToken)];
  return parser(s);
};

// 解析空格
JSONParser.prototype.parseSpace = function (s) {
  return this.parseAny(s.trim());
};

// 解析数组
JSONParser.prototype.parseArray = function (s) {
  s = s.slice(1).trim();
  let acc = [];
  let err = null;

  while (s) {
    if (s[0] === ']') {
      s = s.slice(1);
      break;
    }

    let parseResult = this.parseAny(s);
    let res = parseResult[0];
    let remaining = parseResult[1];
    let parseErr = parseResult[2];

    if (parseErr) {
      if (parseErr.message === incompleteString) {
        err = null;
      }
      s = remaining.trim();
      break;
    }

    acc.push(res);
    s = remaining.trim();
    if (s.indexOf(',') === 0) {
      s = s.slice(1).trim();
    }
  }

  return [acc.length ? acc : null, s, err];
};

// 解析对象
JSONParser.prototype.parseObject = function (s) {
  s = s.slice(1).trim();
  let acc = {};
  let err = null;

  while (s) {
    if (s[0] === '}') {
      s = s.slice(1);
      break;
    }

    if (!this.strict && !this.containCompleteKey(s)) {
      break;
    }

    let keyResult = this.parseAny(s);
    let key = keyResult[0];
    let remaining = keyResult[1];
    let parseErr = keyResult[2];

    if (parseErr) {
      if (parseErr.message === incompleteString) {
        err = null;
      }
      s = remaining.trim();
      break;
    }

    if (typeof key !== 'string') {
      s = remaining.trim();
      err = new Error(unexpectedToken);
      break;
    }

    s = remaining.trim();
    if (!s || s[0] === '}') {
      acc[key] = null;
      break;
    }
    if (s[0] !== ':') {
      err = new Error(unexpectedToken);
      break;
    }

    s = s.slice(1).trim();
    if (!s || s[0] === '}') {
      acc[key] = null;
      break;
    }

    let valueResult = this.parseAny(s);
    let value = valueResult[0];
    let remainingValue = valueResult[1];
    let valueErr = valueResult[2];

    if (valueErr) {
      if (valueErr.message === incompleteString) {
        acc[key] = null;
        err = null;
      }
      s = remainingValue.trim();
      break;
    }

    acc[key] = value;
    s = remainingValue.trim();
    if (s.indexOf(',') === 0) {
      s = s.slice(1).trim();
    }
  }

  return [acc, s, err];
};

JSONParser.prototype.containCompleteKey = function (s) {
  s = s.trim();
  let end = s.indexOf('"', 1);

  while (end > 0 && s[end - 1] === '\\') {
    let nextEnd = s.indexOf('"', end + 1);
    if (nextEnd >= 0) {
      end = nextEnd;
    } else {
      return false;
    }
  }

  return end > 0;
};

JSONParser.prototype.parseString = function (s) {
  let end = s.indexOf('"', 1);

  while (end > 0 && s[end - 1] === '\\') {
    let nextEnd = s.indexOf('"', end + 1);
    if (nextEnd >= 0) {
      end = nextEnd;
    } else {
      if (!this.strict) {
        return [s.slice(1), '', null];
      }
      return [null, '', new Error(incompleteString)];
    }
  }

  if (end === -1) {
    if (!this.strict) {
      return [s.slice(1), '', null];
    }
    return [null, '', new Error(incompleteString)];
  }

  let strVal = s.slice(0, end + 1);
  s = s.slice(end + 1);

  try {
    let result = JSON.parse(strVal);
    return [result, s, null];
  } catch (e) {
    return [null, s, e];
  }
};

JSONParser.prototype.parseNumber = function (s) {
  let i = 0;
  if (s[i] === '-') i++;

  let hasDigits = false;
  while (i < s.length && /\d/.test(s[i])) {
    hasDigits = true;
    i++;
  }

  if (s[i] === '.') {
    i++;
    while (i < s.length && /\d/.test(s[i])) {
      hasDigits = true;
      i++;
    }
  }

  if (!hasDigits) {
    return [null, s, new Error(incompleteNumber)];
  }

  if (s[i] === 'e' || s[i] === 'E') {
    i++;
    if (s[i] === '-' || s[i] === '+') i++;

    let hasExponent = false;
    while (i < s.length && /\d/.test(s[i])) {
      hasExponent = true;
      i++;
    }

    if (!hasExponent) {
      return [null, s, new Error(incompleteNumber)];
    }
  }

  let numStr = s.slice(0, i);
  let remaining = s.slice(i);

  try {
    let num = parseFloat(numStr);
    return [num, remaining, null];
  } catch (e) {
    return [null, s, new Error(incompleteNumber)];
  }
};

JSONParser.prototype.parseTrue = function (s) {
  if (s.indexOf('true') === 0) {
    return [true, s.slice(4), null];
  }
  return [null, s, new Error(unexpectedToken)];
};

JSONParser.prototype.parseFalse = function (s) {
  if (s.indexOf('false') === 0) {
    return [false, s.slice(5), null];
  }
  return [null, s, new Error(unexpectedToken)];
};

JSONParser.prototype.parseNull = function (s) {
  if (s.indexOf('null') === 0) {
    return [null, s.slice(4), null];
  }
  return [null, s, new Error(unexpectedToken)];
};

JSONParser.prototype.defaultOnExtraToken = function (text, data, remaining) {
  logWithLine('Parsed JSON with extra tokens. text: ' + text +
    ', data: ' + JSON.stringify(data) +
    ', remaining: ' + remaining);
};

JSONParser.prototype.parse = function (s) {
  let result = this.parseAny(s);
  let data = result[0];
  let remaining = result[1];
  let err = result[2];

  if (this.onExtraToken && remaining && remaining.trim()) {
    this.onExtraToken(s, data, remaining);
  }

  return [data, remaining, err];
};

JSONParser.prototype.ensureJSON = function (s) {
  let parseResult = this.parse(s);
  let data = parseResult[0];
  let err = parseResult[2];
  if (err) throw err;
  return data;
};
// ==================== JSONParser Plugin End ====================

// ==================== Sqlite Start ====================
function LLMDatabase() {
  let path = files.join(engines.myEngine().cwd(), 'database.sqlite');
  this.dbPath = path;
}

LLMDatabase.prototype.open = function () {
  return sqlite.open(this.dbPath);
};

LLMDatabase.prototype.initLLMData = function () {
  this.createScriptVersion();
  let currentVersion = this.getCurrentScriptVersion();
  if (currentVersion === scriptVersion) {
    return ;
  }else{
    logWithLine("init data by scriptVersion: " + scriptVersion);
    this.insertScriptVersion(scriptVersion);
  }

  this.createLLMTable();
  this.createMyLLMTable();
  this.createMonthlyAccountingTable();
  this.createAcountnameTable();
  this.createSettingTable();

  // AiHubMix
  this.insertLLM('aihubmix', 'https://aihubmix.com/v1/chat/completions', 'gpt-4.1');
  this.insertLLM('aihubmix', 'https://aihubmix.com/v1/chat/completions', 'gpt-4o-2024-11-20');
  this.insertLLM('aihubmix', 'https://aihubmix.com/v1/chat/completions', 'claude-3-7-sonnet-20250219');

  // deepseek
  this.insertLLM('deepseek', 'https://api.deepseek.com/v1/chat/completions', 'deepseek-chat');

  // 千问
  this.insertLLM('qwen', 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', 'qwen-max-latest');
  this.insertLLM('qwen', 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', 'qwen-max-2025-01-25');
  this.insertLLM('qwen', 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', 'qwen-plus-latest');
  this.insertLLM('qwen', 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', 'qwen-plus-2025-01-25');
  this.insertLLM('qwen', 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', 'qwen-turbo-latest');

  // kimi
  this.insertLLM('kimi', 'https://api.moonshot.cn/v1/chat/completions', 'moonshot-v1-128k');
  this.insertLLM('kimi', 'https://api.moonshot.cn/v1/chat/completions', 'moonshot-v1-32k');
  this.insertLLM('kimi', 'https://api.moonshot.cn/v1/chat/completions', 'moonshot-v1-8k');

  // 豆包
  this.insertLLM('doubao', 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', 'deepseek-v3-241226');
  this.insertLLM('doubao', 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', 'doubao-1-5-pro-256k-250115');
  this.insertLLM('doubao', 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', 'doubao-1-5-pro-32k-250115');
  this.insertLLM('doubao', 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', 'doubao-1-5-lite-32k-250115');

  // 混元
  this.insertLLM('hunyuan', 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions', 'hunyuan-turbos-latest');
  this.insertLLM('hunyuan', 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions', 'hunyuan-turbo-latest');
  this.insertLLM('hunyuan', 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions', 'hunyuan-large');
  this.insertLLM('hunyuan', 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions', 'hunyuan-standard-256K');
  this.insertLLM('hunyuan', 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions', 'hunyuan-standard');
  this.insertLLM('hunyuan', 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions', 'hunyuan-lite');

  // 智谱
  this.insertLLM('glm', 'https://open.bigmodel.cn/api/paas/v4/chat/completions', 'glm-4-plus');
  this.insertLLM('glm', 'https://open.bigmodel.cn/api/paas/v4/chat/completions', 'glm-4-air');
  this.insertLLM('glm', 'https://open.bigmodel.cn/api/paas/v4/chat/completions', 'glm-4-airx');
  this.insertLLM('glm', 'https://open.bigmodel.cn/api/paas/v4/chat/completions', 'glm-4-flashx');
  this.insertLLM('glm', 'https://open.bigmodel.cn/api/paas/v4/chat/completions', 'glm-4-flash');

  // 阶跃星辰
  this.insertLLM('step', 'https://api.stepfun.com/v1/chat/completions', 'step-2-16k');
  this.insertLLM('step', 'https://api.stepfun.com/v1/chat/completions', 'step-2-16k-202411');
  this.insertLLM('step', 'https://api.stepfun.com/v1/chat/completions', 'step-2-mini');
  this.insertLLM('step', 'https://api.stepfun.com/v1/chat/completions', 'step-1-256k');
  this.insertLLM('step', 'https://api.stepfun.com/v1/chat/completions', 'step-1-128k');
  this.insertLLM('step', 'https://api.stepfun.com/v1/chat/completions', 'step-1-32k');
  this.insertLLM('step', 'https://api.stepfun.com/v1/chat/completions', 'step-1-8k');
  this.insertLLM('step', 'https://api.stepfun.com/v1/chat/completions', 'step-1-flash');

  // 星火
  this.insertLLM('spark', 'https://spark-api-open.xf-yun.com/v1/chat/completions', '4.0Ultra');
  this.insertLLM('spark', 'https://spark-api-open.xf-yun.com/v1/chat/completions', 'generalv3.5');
  this.insertLLM('spark', 'https://spark-api-open.xf-yun.com/v1/chat/completions', 'generalv3');
  this.insertLLM('spark', 'https://spark-api-open.xf-yun.com/v1/chat/completions', 'lite');

  // 百川
  this.insertLLM('baichuan', 'https://api.baichuan-ai.com/v1/chat/completions', 'Baichuan4-Turbo');
  this.insertLLM('baichuan', 'https://api.baichuan-ai.com/v1/chat/completions', 'Baichuan4-Air');
  this.insertLLM('baichuan', 'https://api.baichuan-ai.com/v1/chat/completions', 'Baichuan4');
  this.insertLLM('baichuan', 'https://api.baichuan-ai.com/v1/chat/completions', 'Baichuan3-Turbo-128k');
  this.insertLLM('baichuan', 'https://api.baichuan-ai.com/v1/chat/completions', 'Baichuan3-Turbo');
  this.insertLLM('baichuan', 'https://api.baichuan-ai.com/v1/chat/completions', 'Baichuan2-Turbo');

  // 默认账户
  this.insertAccountname('农行国航白3951');
  this.insertAccountname('招行经典白5841');
  this.insertAccountname('中信银行白金6158');
  this.insertAccountname('建行大山白');
  this.insertAccountname('招行储蓄卡0826');
  this.insertAccountname('建行储蓄卡2889');

  // 默认记账到
  let setting = this.getSetting();
  if (!setting || !setting.record_to) {
    if (!setting) setting = {};
    setting.record_to = "钱迹";
    setting[Constants.recordToField] = Constants.qianjiName;
    this.insertSetting(Constants.mySettingKey, setting);
  }
};

LLMDatabase.prototype.createScriptVersion = function () {
  let db = this.open();
  db.execSQL('CREATE TABLE IF NOT EXISTS script_version (id INTEGER PRIMARY KEY AUTOINCREMENT, version TEXT NOT NULL, UNIQUE (version))');
  db.close();
}

LLMDatabase.prototype.getCurrentScriptVersion = function () {
  let db = this.open();
  let cursor = db.rawQuery('SELECT version FROM script_version ORDER BY id DESC LIMIT 1', []);
  let version = null;
  if (cursor.moveToNext()) {
    version = cursor.getString(0);
  }
  db.close();
  return version;
}

LLMDatabase.prototype.insertScriptVersion = function (version) {
  let db = this.open();
  db.execSQL('INSERT OR REPLACE INTO script_version (version) VALUES (?)', [version]);
  db.close();
}

LLMDatabase.prototype.createLLMTable = function () {
  let db = this.open();
  db.execSQL('CREATE TABLE IF NOT EXISTS llm (id INTEGER PRIMARY KEY AUTOINCREMENT, supplier TEXT NOT NULL, url TEXT NOT NULL, model_name TEXT NOT NULL, updated_at INTEGER NOT NULL, UNIQUE (supplier, model_name))');
  db.close();
};

LLMDatabase.prototype.createMyLLMTable = function () {
  let db = this.open();
  db.execSQL('CREATE TABLE IF NOT EXISTS my_llm (id INTEGER PRIMARY KEY AUTOINCREMENT, supplier TEXT NOT NULL, model_name TEXT NOT NULL, key TEXT NOT NULL, picked_at INTEGER NOT NULL, UNIQUE (supplier))');
  db.close();
};

LLMDatabase.prototype.createMonthlyAccountingTable = function () {
  let db = this.open();
  db.execSQL('CREATE TABLE IF NOT EXISTS monthly_accounting (id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER NOT NULL, month INTEGER NOT NULL, accounting_count INTEGER DEFAULT 0, UNIQUE (year, month))');
  db.close();
}

LLMDatabase.prototype.createAcountnameTable = function () {
  let db = this.open();
  db.execSQL('CREATE TABLE IF NOT EXISTS accountname (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, UNIQUE (name))');
  db.close();
}

LLMDatabase.prototype.createSettingTable = function () {
  let db = this.open();
  db.execSQL('CREATE TABLE IF NOT EXISTS setting (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, value TEXT NOT NULL, UNIQUE (key))');
  db.close();
}

LLMDatabase.prototype.insertSetting = function (key, value) {
  let db = this.open();
  db.execSQL('INSERT OR REPLACE INTO setting (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
  db.close();
}

LLMDatabase.prototype.getSetting = function (key) {
  let db = this.open();
  let cursor = db.rawQuery('SELECT value FROM setting WHERE key = ? LIMIT 1', [key]);
  let value = null;
  if (cursor.moveToNext()) {
    value = cursor.getString(0);
  }
  db.close();
  
  return value ? JSON.parse(value) : null;
}

LLMDatabase.prototype.insertAccountname = function (name) {
  let db = this.open();
  db.execSQL('INSERT OR REPLACE INTO accountname (name) VALUES (?)', [name]);
  db.close();
}

LLMDatabase.prototype.removeAccountname = function (name) {
  let db = this.open();
  db.execSQL('DELETE FROM accountname WHERE name = ?', [name]);
  db.close();
}

LLMDatabase.prototype.listAccountnames = function () {
  let db = this.open();
  // 使用SQL的LENGTH函数在查询时直接排序
  let cursor = db.rawQuery('SELECT name FROM accountname ORDER BY LENGTH(name) ASC', []);
  let accountnames = [];
  while (cursor.moveToNext()) {
    let name = cursor.getString(0);
    accountnames.push(name);
  }
  db.close();

  return accountnames;
}

LLMDatabase.prototype.incrMonthlyAccounting = function (year, month) {
  let db = this.open();
  db.execSQL('INSERT INTO monthly_accounting (year, month, accounting_count) VALUES (?, ?, 1) ON CONFLICT(year, month) DO UPDATE SET accounting_count = accounting_count + 1', [year, month]);
  db.close();
}

LLMDatabase.prototype.getMonthlyAccounting = function (year, month) {
  let db = this.open();
  let cursor = db.rawQuery('SELECT accounting_count FROM monthly_accounting WHERE year = ? AND month = ? LIMIT 1', [year, month]);
  let count = 0;
  if (cursor.moveToNext()) {
    count = cursor.getLong(0);
  }
  db.close();
  return count;
}

LLMDatabase.prototype.insertLLM = function (supplier, url, model_name) {
  let db = this.open();
  let updatedAt = Date.now() / 1000;
  db.execSQL('INSERT OR REPLACE INTO llm (supplier, url, model_name, updated_at) VALUES (?, ?, ?, ?)', [supplier, url, model_name, updatedAt]);
  db.close();
};

LLMDatabase.prototype.insertMyLLM = function (supplier, model, key) {
  let db = this.open();
  let pickedAt = Date.now() / 1000;
  db.execSQL('INSERT OR REPLACE INTO my_llm (supplier, model_name, key, picked_at) VALUES (?, ?, ?, ?)', [supplier, model, key, pickedAt]);
  db.close();
};

LLMDatabase.prototype.getLlmData = function (supplier, model) {
  let db = this.open();
  let cursor = db.rawQuery('SELECT supplier, url, model_name FROM llm WHERE supplier = ? AND model_name = ? LIMIT 1', [supplier, model]);
  let llmData = null;
  if (cursor.moveToNext()) {
    let supplier = cursor.getString(0);
    let url = cursor.getString(1);
    let model = cursor.getString(2);
    llmData = { supplier, url, model };
  }
  db.close();
  return llmData;
};

LLMDatabase.prototype.listLlmDatas = function () {
  let db = this.open();
  let cursor = db.rawQuery('SELECT supplier, url, model_name FROM llm ORDER BY updated_at ASC', []);
  let llmDatas = [];
  while (cursor.moveToNext()) {
    let supplier = cursor.getString(0);
    let url = cursor.getString(1);
    let model = cursor.getString(2);
    llmDatas.push({ supplier, url, model });
  }
  db.close();
  return llmDatas;
};

LLMDatabase.prototype.listLlmDatasBySuplier = function (supplier) {
  let db = this.open();
  let cursor = db.rawQuery('SELECT supplier, url, model_name FROM llm WHERE supplier = ? ORDER BY updated_at ASC', [supplier]);
  let llmDatas = [];
  while (cursor.moveToNext()) {
    let supplier = cursor.getString(0);
    let url = cursor.getString(1);
    let model = cursor.getString(2);
    llmDatas.push({ supplier, url, model });
  }
  db.close();
  return llmDatas;
};

LLMDatabase.prototype.listMyLlmDatas = function () {
  let db = this.open();
  let cursor = db.rawQuery('SELECT supplier, model_name, key, picked_at FROM my_llm', []);
  let myLlmDatas = [];
  while (cursor.moveToNext()) {
    let supplier = cursor.getString(0);
    let model = cursor.getString(1);
    let key = cursor.getString(2);
    let pickedAt = cursor.getLong(3);
    myLlmDatas.push({ supplier, model, key, pickedAt });
  }
  db.close();
  return myLlmDatas;
};

LLMDatabase.prototype.getLastPickedMyLlm = function () {
  let db = this.open();
  let cursor = db.rawQuery('SELECT supplier, model_name, key, picked_at FROM my_llm ORDER BY picked_at DESC LIMIT 1', []);
  let myLlmData = null;
  if (cursor.moveToNext()) {
    let supplier = cursor.getString(0);
    let model = cursor.getString(1);
    let key = cursor.getString(2);
    let pickedAt = cursor.getLong(3);
    myLlmData = { supplier, model, key, pickedAt };
  }
  db.close();
  return myLlmData;
}

LLMDatabase.prototype.getLastPickedMyLlmBySupplier = function (supplier) {
  let db = this.open();
  let cursor = db.rawQuery('SELECT supplier, model_name, key, picked_at FROM my_llm WHERE supplier = ? ORDER BY picked_at DESC LIMIT 1', [supplier]);
  let myLlmData = null;
  if (cursor.moveToNext()) {
    let supplier = cursor.getString(0);
    let model = cursor.getString(1);
    let key = cursor.getString(2);
    let pickedAt = cursor.getLong(3);
    myLlmData = { supplier, model, key, pickedAt };
  }
  db.close();
  return myLlmData;
}
// ==================== Sqlite End ====================

// ==================== Common utils Start ====================
let metrics = context.getResources().getDisplayMetrics();
// 屏幕密度比例
let density = metrics.density;

// dp 转 px
function dpToPx(dp) {
  return dp * density;
}

// sp 转 px
function spToPx(sp) {
  return sp * density;
}

// dx 转 px
function dxToPx(dx) {
  return dx * density;
}

function px2dp(px) {
  return px / density;
}

// 获取屏幕宽高
let screenWidth = device.width;
let screenHeight = device.height;
let contentWidth = screenWidth * 4 / 5

function getTextWidth(text, textSize) {
  // 创建一个 Paint 对象用于绘制和测量文字
  let paint = new Paint();
  // 设置文字大小
  paint.setTextSize(spToPx(textSize));
  // 使用 measureText 方法测量文字宽度
  let width = paint.measureText(text);

  return width; // 返回测量到的文字宽度
}

function isValidDateTimeFormat(dateTimeStr) {
  // 定义正则表达式
  const regex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

  // 使用正则表达式测试字符串
  return regex.test(dateTimeStr);
}

// 添加日期格式化函数
function formatDate(date, format) {
  const pad = (n) => n < 10 ? '0' + n : n;
  return format
    .replace('yyyy', date.getFullYear())
    .replace('MM', pad(date.getMonth() + 1))
    .replace('dd', pad(date.getDate()))
    .replace('hh', pad(date.getHours()))
    .replace('mm', pad(date.getMinutes()))
    .replace('ss', pad(date.getSeconds()));
}

function getIncrementalDiff(obj1, obj2) {
  const diff = {};

  for (let key in obj2) {
    let value1 = obj1[key];
    let value2 = obj2[key];

    if (isZeroValue(value2)) continue;

    // 如果值不同，直接赋值
    if (value2 !== value1) {
      diff[key] = value2;
    }
  }

  return diff;
}

function isZeroValue(value) {
  if (value == null) return true;
  if (typeof value === 'boolean') return false;
  if (typeof value === 'number') {
    return Number(value) === 0;
  }
  if (typeof value === 'string') {
    return value === "";
  }
  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.length === 0;
    if (value instanceof Object) return Object.keys(value).length === 0;
  }
  return false;
}

// 收入或支出 qianji://publicapi/addbill?&type=0&money=26.5&time=2020-01-31 12:30:00&remark=在星巴克购买咖啡&catename=咖啡&accountname=微信&bookname=日常账本
// 转账或信用卡还款 qianji://publicapi/addbill?&type=2&money=26.5&time=2020-01-31 12:30:00&remark=在星巴克购买咖啡&accountname=微信&&accountname2=招行信用卡&bookname=日常账本
// 转账或信用卡还款（带手续费）qianji://publicapi/addbill?&type=2&money=26.5&accountname=微信&accountname2=招行信用卡&fee=.05
function sendToQianJi(orderDetail) {
  orderDetail.type = Constants.type2Int[orderDetail.type];

  let url = buildQianJiUrl(orderDetail);
  logWithLine("url: " + url);
  app.startActivity({
    action: "VIEW",
    data: url
  });
}

function buildQianJiUrl(orderDetail) {
  let url = "qianji://publicapi/addbill?";
  for (let key in orderDetail) {
    url += `${key}=${orderDetail[key]}&`;
  }
  return url;
}

function getTableIdFromUrl(tableUrl) {
  // 处理格式：https://xxx.com?table=xxxx&other=yyy
  const queryPart = tableUrl.split('?')[1];
  if (!queryPart) return null;
  
  const params = queryPart.split('&');
  for (let param of params) {
    const [key, value] = param.split('=');
    if (key === 'table') {
      return value;
    }
  }
  return null;
}

// https://cq0wwlrbnbj.feishu.cn/base/AlFNb19IFaCEZlskQs?table=tblHuB6KU&view=vewqPYOM9N
function getFeishuAddRecordUrl(tableUrl){
  // 从URL中提取appToken和tableId
  let urlParts = tableUrl.split('/');
  let appToken = urlParts[urlParts.length - 1].split('?')[0];
  let tableId = getTableIdFromUrl(tableUrl);
  
  let url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`
  return url;
}

function getFeishuAccessToken(appId, appSecret) {
  let url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
  
  return axios.post(url, {
    app_id: appId,
    app_secret: appSecret
  }, {
    headers: { "Content-Type": "application/json" }
  }).then(response => {
    if (response.data.code === 0) {
      return response.data.tenant_access_token;
    } else {
      return Promise.reject(response.data);
    }
  }).catch(error => {
    throw(error);
  });
}

function sendToFeishu(feishuConfig, orderDetail) {
  return getFeishuAccessToken(feishuConfig.appId, feishuConfig.appSecret)
    .then(accessToken => {
      let url = getFeishuAddRecordUrl(feishuConfig.tableUrl);

      let fields = {
        "备注": orderDetail.remark || "",
        "收支渠道": orderDetail.accountname || "",
        "收支类型": orderDetail.type,
        "日期": new Date(orderDetail.time.replace(" ", "T")).getTime(),
        "流水": orderDetail.type === "收入" ? orderDetail.money : -orderDetail.money,
        "类别": orderDetail.catename || "",
        "账本": "默认账本",
        "金额": orderDetail.money
      };

      logWithLine(url, fields);
      return axios.post(url, { fields }, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        }
      });
    })
    .then(response => {
      if (response.data.code === 0) {
        return true;
      } else {
        logWithLine("飞书接口返回错误信息:", response.data.msg || "未知错误");
        return false;
      }
    })
    .catch(error => {
      logWithLine("请求飞书接口失败:", JSON.stringify(error));
      return false;
    });
}

function logWithLine(...args) {
  // const stack = new Error().stack.split("\n")[2]; // 获取当前行的调用栈信息
  // const [file, line] = stack.split(":").slice(-2); // 提取文件名、行号
  const msg = args.map(arg => typeof arg === "object" ? JSON.stringify(arg) : arg).join(" ");
  // console.log(`[${scriptVersion}:${file}:${line}]`+ msg);
  console.log(`[${scriptVersion}]`+msg);
}

function toastLogWithLine(msg, isLong) {
  // const stack = new Error().stack.split("\n")[2]; // 获取当前行的调用栈信息
  // const [file, line] = stack.split(":").slice(-2); // 提取文件名、行号
  toast(msg, isLong, true);
  // console.log(`[${scriptVersion}:${file}:${line}]`+ msg);
  console.log(`[${scriptVersion}]`+msg);
}

// ==================== Common utils End ====================

// ==================== UI Manager start ====================
// 分类按钮的文字内容
let paidCatenameBtnData = [
  // 餐饮类 - 橙黄色系(温暖、食物相关)
  { text: "餐饮/::/咖啡", color: "#FFA000" },      // 琥珀金
  { text: "餐饮/::/外卖", color: "#FFB300" },      // 温暖橙
  { text: "餐饮/::/下厨", color: "#FFC107" },      // 金黄色
  { text: "餐饮/::/水果零食", color: "#FFCA28" },   // 柠檬黄
  { text: "餐饮/::/堂食", color: "#FFD54F" },      // 浅黄色
  { text: "餐饮/::/饮料", color: "#FFE082" },      // 柔和黄
  
  // 购物类 - 紫色系(高级感、消费相关)
  { text: "购物/::/杂七杂八", color: "#9C27B0" },   // 深紫色
  { text: "购物/::/生活耗品", color: "#AB47BC" },   // 紫罗兰
  { text: "购物/::/家具", color: "#BA68C8" },      // 中紫色
  { text: "购物/::/数码产品", color: "#CE93D8" },   // 淡紫色
  { text: "购物/::/衣服鞋包", color: "#D1C4E9" },   // 薰衣草
  { text: "购物/::/书籍", color: "#E1BEE7" },      // 浅薰衣草
  { text: "购物/::/护理产品", color: "#EDE7F6" },   // 薄雾紫
  { text: "购物/::/化妆品", color: "#F3E5F5" },     // 柔光紫
  { text: "购物/::/快递费", color: "#B39DDB" },     // 石英紫
  
  // 住房类 - 蓝绿色系(稳定、家庭相关)
  { text: "住房/::/电费", color: "#00897B" },      // 深青绿
  { text: "住房/::/水费", color: "#26A69A" },      // 中青绿
  { text: "住房/::/燃气费", color: "#4DB6AC" },    // 浅绿松石
  { text: "住房/::/物业费", color: "#80CBC4" },    // 薄荷绿
  { text: "住房/::/宽带", color: "#B2DFDB" },      // 浅薄荷
  
  // 出行类 - 蓝色系(自由、移动相关)
  { text: "出行/::/网约车", color: "#1976D2" },    // 湖泊蓝
  { text: "出行/::/公共交通", color: "#42A5F5" },   // 天空蓝
  { text: "出行/::/停车费", color: "#64B5F6" },    // 浅蓝色
  { text: "出行/::/飞机", color: "#90CAF9" },      // 婴儿蓝
  { text: "出行/::/高铁", color: "#BBDEFB" },      // 淡蓝色
  
  // 订阅类 - 绿色系(持续、生长)
  { text: "订阅/::/Apple", color: "#43A047" },     // 森林绿
  { text: "订阅/::/流媒体", color: "#66BB6A" },    // 鲜绿色
  { text: "订阅/::/手机套餐", color: "#81C784" },   // 浅绿色
  { text: "订阅/::/其他订阅", color: "#A5D6A7" },   // 薄荷绿
  
  // 贝果类 - 橙色系(活力、儿童相关)
  { text: "贝果/::/健康", color: "#FB8C00" },      // 暖橙色
  { text: "贝果/::/贝果杂七杂八", color: "#FFA726" }, // 明亮橙
  { text: "贝果/::/玩具", color: "#FFB74D" },      // 柔和橙
  { text: "贝果/::/食品", color: "#FFCC80" },      // 桃子橙

  // 健康类 - 草绿色系(健康、滋养)
  { text: "健康/::/门诊挂号", color: "#7CB342" },   // 苹果绿
  { text: "健康/::/身体检查", color: "#9CCC65" },   // 嫩叶绿
  { text: "健康/::/药品", color: "#AED581" },      // 浅绿色
  { text: "健康/::/补剂", color: "#C5E1A5" },       // 薄荷绿

  // 娱乐类 - 粉红色系(愉悦、娱乐相关)
  { text: "娱乐/::/棋牌", color: "#E91E63" },      // 深玫瑰红
  { text: "娱乐/::/电影", color: "#EC407A" },      // 玫瑰红
  { text: "娱乐/::/游戏", color: "#F06292" },      // 粉红色
  { text: "娱乐/::/沙龙", color: "#F48FB1" },      // 浅粉色
  { text: "娱乐/::/踏青", color: "#F8BBD0" },      // 柔粉色
  { text: "娱乐/::/展览", color: "#FCE4EC" },      // 薄雾粉
  { text: "娱乐/::/按摩", color: "#FF80AB" },      // 亮粉色
  { text: "娱乐/::/滑雪", color: "#FF4081" },      // 明亮粉
  { text: "娱乐/::/旅游", color: "#F50057" },      // 鲜艳粉
  { text: "娱乐/::/演出", color: "#D81B60" },      // 深桃红
  { text: "娱乐/::/KTV", color: "#C2185B" },       // 覆盆子红
  { text: "娱乐/::/运动健身", color: "#AD1457" },   // 洋红色
  { text: "娱乐/::/美甲", color: "#880E4F" }      // 勃艮第红
];

let incomeCatenameBtnData = [
  { text: "工资", color: "#4CAF50" },       // 工资
  { text: "生活费", color: "#FFC107" },     // 生活费
  { text: "收红包", color: "#E91E63" },     // 收红包
  { text: "外快", color: "#2196F3" },       // 外快
  { text: "股票基金", color: "#9C27B0" },   // 股票基金
  { text: "其它", color: "#9E9E9E" }        // 其它
];

let typeBtnData = [
  { text: "支出", color: "#A5D6A7" },        // 阳光黄 (主色)
  { text: "收入", color: "#81C784" },        // 活力橙
  { text: "转账", color: "#4CAF50" },        // 琥珀橙 
  { text: "还款", color: "#388E3C" }         // 深琥珀
]

// 创建可复用的ButtonGrid组件
function createButtonGrid(container, buttonData, options) {
  // 移除监听事件
  for (let i = 0; i < container.getChildCount(); i++) {
    let row = container.getChildAt(i);
    for (let j = 0; j < row.getChildCount(); j++) {
      let button = row.getChildAt(j);
      button.setOnClickListener(null);
      button.setOnLongClickListener(null);
    }
  }

  container.removeAllViews();
  const defaultOptions = {
    textSize: 14,
    padding: 12,
    margin: 13,
    textColor: "#F5F5F5"
  };
  let config = {};
  for (let key in defaultOptions) {
    config[key] = defaultOptions[key];
  }
  for (let key in options) {
    config[key] = options[key];
  }


  // 创建新行
  function createNewRow() {
    return ui.inflate(<linear orientation="horizontal" margin="0" padding="0" />);
  }

  // 创建单个按钮
  function createButton(data, index) {
    return (
      <button
        id={`btn_${index}`}
        text={data.text}
        textSize={config.textSize}
        backgroundTint={data.color}
        margin="0"
        textColor={config.textColor}
        gravity="center"
        textAllCaps="false"
        singleLine="true"
      />
    );
  }

  // 计算按钮宽度
  function calculateButtonWidth(text) {
    let textWidth = getTextWidth(text, config.textSize);
    return textWidth + dpToPx(config.padding * 2);
  }

  // 初始化
  let currentRow = createNewRow();
  container.addView(currentRow);
  let currentRowWidth = 0;

  // 创建按钮网格
  buttonData.forEach((data, index) => {
    let button = ui.inflate(createButton(data, index));
    let buttonWidth = calculateButtonWidth(data.text);

    // 如果当前行宽度加上新按钮宽度超过屏幕宽度，则换行
    if (currentRowWidth + buttonWidth > (orderContentWidth - dpToPx(config.margin * 2))) {
      currentRow = createNewRow();
      container.addView(currentRow);
      currentRowWidth = 0;
    }

    currentRowWidth += buttonWidth;
    currentRow.addView(button);

    // 设置按钮布局参数
    let rowParams = new LinearLayout.LayoutParams(
      buttonWidth,
      LinearLayout.LayoutParams.WRAP_CONTENT
    );
    button.setLayoutParams(rowParams);
  });
}

let iconWidthDp = 28, iconHeightDp = 28, iconOffsetDp = 6;
let orderContentWidth = contentWidth - dpToPx(iconWidthDp);

// UI管理对象
const OrderUI = {
  win: null,
  statusTag: null,
  time: null,
  spannableProcessor: null,
  llmDB: null,
  subSettingViewList: null,
  subOrderViewList: null,
  mainViewList: null,
  moveCount: 0,
  viewToIconVisibility: {
    "@+id/loadingContainer": {
      visibleList: ['settingBtn', 'moveBtn', 'cancelBtn'],
      goneList: ["addBtn", 'confirmBtn']
    },
    "@+id/addAccountnameContainer": {
      visibleList: ['moveBtn', 'cancelBtn', 'confirmBtn'],
      goneList: ['settingBtn', 'addBtn']
    },
    "@+id/accountnameSettingContainer": {
      visibleList: ['moveBtn', 'cancelBtn', 'addBtn', 'confirmBtn'],
      goneList: ['settingBtn']
    },
    "@+id/settingContainer": {
      visibleList: ['moveBtn', 'cancelBtn', 'confirmBtn'],
      goneList: ['settingBtn', "addBtn"]
    },
    "@+id/settingContentContainer": {
      visibleList: ['moveBtn', 'cancelBtn', 'confirmBtn'],
      goneList: ['settingBtn', "addBtn"]
    },
    "@+id/supplierSettingContainer": {
      visibleList: ['moveBtn', 'cancelBtn'],
      goneList: ['confirmBtn', 'settingBtn', "addBtn"]
    },
    "@+id/modelSettingContainer": {
      visibleList: ['moveBtn', 'cancelBtn'],
      goneList: ['confirmBtn', 'settingBtn', "addBtn"]
    },
    "@+id/orderContainer": {
      visibleList: ['settingBtn', 'moveBtn', 'cancelBtn', 'confirmBtn'],
      goneList: ["addBtn"]
    },
    "@+id/summaryContainer": {
      visibleList: ['settingBtn', 'moveBtn', 'cancelBtn', 'confirmBtn'],
      goneList: ["addBtn"]
    },
    "@+id/catenameContainer": {
      visibleList: ['moveBtn', 'cancelBtn'],
      goneList: ['confirmBtn', 'settingBtn', "addBtn"]
    },
    "@+id/typeContainer": {
      visibleList: ['moveBtn', 'cancelBtn'],
      goneList: ['confirmBtn', 'settingBtn', "addBtn"]
    },
    "@+id/timeContainer": {
      visibleList: ['moveBtn', 'cancelBtn', 'confirmBtn'],
      goneList: ['settingBtn', "addBtn"]
    },
    "@+id/moneyContainer": {
      visibleList: ['moveBtn', 'cancelBtn', 'confirmBtn'],
      goneList: ['settingBtn', "addBtn"]
    },
    "@+id/remarkContainer": {
      visibleList: ['moveBtn', 'cancelBtn', 'confirmBtn'],
      goneList: ['settingBtn', "addBtn"]
    },
    "@+id/accountnameContainer": {
      visibleList: ['moveBtn', 'cancelBtn'],
      goneList: ['settingBtn', "addBtn", 'confirmBtn']
    },
    "@+id/accountname2Container": {
      visibleList: ['moveBtn', 'cancelBtn', 'confirmBtn'],
      goneList: ['settingBtn', "addBtn"]
    },
  },

  destroy: function () {
    // 释放SpannableProcessor资源
    if (this.spannableProcessor) {
      this.spannableProcessor.destroy();
      this.spannableProcessor = null;
    }

    this.removeAllListeners();
    if (this.win.summaryContent) {
      // 清除SpannableStringBuilder内容
      this.win.summaryContent.setText("");
    }

    this.win = null;
    this.time = null;
    this.subSettingViewList = null;
    this.subOrderViewList = null;
    this.mainViewList = null;
  },

  init: function (llmDB, statusTag) {
    // init database
    this.llmDB = llmDB;
    // init status tag
    this.statusTag = statusTag;

    // 初始化UI代码
    ui.run(() => {
      this.drawWindow();
    });
    // 初始化SpannableProcessor
    this.spannableProcessor = Object.create(SpannableProcessor).init();
    // 绑定事件处理
    this.bindEvents();
  },

  setTimeValue: function (dateTimeStr) {
    let parts = dateTimeStr.split(/[- :]/);
    if (parts.length !== 6) {
      let now = new Date();
      parts = [
        now.getFullYear().toString(),
        (now.getMonth() + 1).toString().padStart(2, '0'),
        now.getDate().toString().padStart(2, '0'),
        now.getHours().toString().padStart(2, '0'),
        now.getMinutes().toString().padStart(2, '0'),
        now.getSeconds().toString().padStart(2, '0')
      ];
    }

    this.time.year.setText(parts[0]);
    this.time.month.setText(parts[1]);
    this.time.day.setText(parts[2]);
    this.time.hour.setText(parts[3]);
    this.time.minute.setText(parts[4]);
    this.time.second.setText(parts[5]);
  },

  getTimeValue: function () {
    let { year, month, day, hour, minute, second } = {
      year: this.time.year.text(),
      month: this.time.month.text(),
      day: this.time.day.text(),
      hour: this.time.hour.text(),
      minute: this.time.minute.text(),
      second: this.time.second.text()
    };

    // 对输入数值进行范围校正
    if (Number(month) > 12) month = "12";
    else if (Number(month) < 1 && month) month = "1";

    if (Number(day) > 31) day = "31";
    else if (Number(day) < 1 && text) day = "1";
    if (Number(hour) > 23) hour = "23";

    if (Number(minute) > 59) minute = "59";
    if (Number(second) > 59) second = "59";
    
    // 构造时间字符串
    let timeStr = `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}`;
    
    // **新增判断逻辑**：如果 LLM 返回的时间年份小于 2025 (即 parseInt(year) < 2025)，则重置为当前时间
    if (parseInt(year) < 2025) {
        let now = new Date();
        timeStr = formatDate(now, "yyyy-MM-dd hh:mm:ss");
    }

    return timeStr;
  },

  createBtnDatas: function (texts) {
    let datas = [];
    texts.forEach((text, index) => {
      datas.push({ color: Constants.defaultColors[index % Constants.defaultColors.length], text });
    });

    return datas;
  },

  setVisibility: function (view, visibility) {
    let currentVisibility = view.getVisibility();
    // logWithLine(`befroe setVisibility: ${view.attr('id')} -> ${visibility}`);
    if (currentVisibility === visibility) return;

    view.setVisibility(visibility);
    // logWithLine(`after setVisibility: ${view.attr('id')} ${currentVisibility} --> ${visibility}`);
  },

  isViewActiveInFront: function (view) {
    return view.getVisibility() === View.VISIBLE;
  },

  moveViewToFront: function (view) {
    this.setVisibility(view,View.VISIBLE);

    let viewToIconVisibility = this.viewToIconVisibility[view.attr('id')];
    if (viewToIconVisibility) {
      viewToIconVisibility.visibleList.forEach(id => {
        this.setVisibility(this.win[id], View.VISIBLE);
      });

      viewToIconVisibility.goneList.forEach(id => {
        this.setVisibility(this.win[id], View.GONE);
      });
    }

    if (this.mainViewList.includes(view)) {
      this.win.disableFocus();
      this.mainViewList.filter(v => v !== view).forEach(v => this.setVisibility(v, View.GONE));

      if (view === this.win.settingContainer) {
        this.win.summaryContainer.setVisibility(View.GONE);
        this.subOrderViewList.forEach(v => this.setVisibility(v, View.GONE));
      }
      return;
    }

    let mainOrderView = this.win.summaryContainer;
    if (view === mainOrderView) {
      this.win.disableFocus();
      this.subOrderViewList.forEach(v => this.setVisibility(v, View.GONE));
      return;
    }
    if (this.subOrderViewList.includes(view)) {
      this.setVisibility(mainOrderView, View.GONE);
      return;
    }

    let mainSettingView = this.win.settingContentContainer
    if (view === mainSettingView) {
      this.subSettingViewList.forEach(v => this.setVisibility(v, View.GONE));
      this.win.disableFocus();
      return;
    }
    if (this.subSettingViewList.includes(view)) {
      this.setVisibility(mainSettingView, View.GONE);
      this.subSettingViewList.filter(v => v !== view).forEach(v => this.setVisibility(v, View.GONE));
      return;
    }
  },

  removeAllListeners: function () {
    let allCliableView = [
      this.win.settingBtn,
      this.win.moveBtn, 
      this.win.cancelBtn,
      this.win.confirmBtn,
      this.win.addBtn,
      this.win.money,
      this.win.year,
      this.win.month,
      this.win.day,
      this.win.hour,
      this.win.minute,
      this.win.second,
      this.win.remark,
      this.win.accountname2,
      this.win.apiKey,
      this.win.newAccountname,
      this.win.editAccountnameBtn,
      this.win.contactAuthorBtn,
      this.win.recordToQianjiBtn,
      this.win.recordToFeishuBtn,
      this.win.tableUrl,
      this.win.appId,
      this.win.appSecret,
    ];

    allCliableView.forEach(view => {
      view.setOnClickListener(null);
    });

    this.win.confirmBtn.setOnLongClickListener(null);

    // let orderTime = [this.win.year, this.win.month, this.win.day, this.win.hour, this.win.minute, this.win.second];
    // orderTime.forEach(view => {
      
    // });
  },

  drawWindow: function () {
    // 获取当月记账次数
    let currentDate = new Date();
    let currentYear = currentDate.getFullYear();
    let currentMonth = currentDate.getMonth() + 1;
    let count = this.llmDB.getMonthlyAccounting(currentYear, currentMonth);
    this.win = floaty.rawWindow(
      <horizontal
        width={px2dp(contentWidth)}
        background="#F5F5F5"
        id="uiContainer"
        visibility="gone"
      >
        <vertical id="mainContainer"
          gravity="center"
          layout_weight="1"
          marginTop="10dp"
          visibility="visible"
        >
          <vertical id="loadingContainer" background="#F5F5F5" padding="10" visibility="visible">
            <!-- 图标和文本 -->
            <horizontal gravity="center">
              // <img src="@drawable/ic_sentiment_very_satisfied_black_48dp" tint="#FFD740" layout_gravity="center" w="36dp" h="36dp" />
              <text text="🤖 AI正在分析订单..." textColor="#333333" textStyle="bold" textSize="18sp" marginLeft="12" />
            </horizontal>

            <!-- 间距 -->
            <view h="20" />

            <!-- 进度条 -->
            <progressbar
              indeterminate="true"
              style="@style/Widget.AppCompat.ProgressBar.Horizontal"
              tint="#FFD740"
              layout_width="match_parent"
              layout_height="8dp"
            />

            <!-- 间距 -->
            <view h="18" />
            <horizontal gravity="center">
              <text
                text="本月已记账"
                textSize="18sp"
                textColor="#707070"
                textStyle="bold" />
              <text
                text={count}
                textSize="18sp"
                textColor="#FFD740"
                textStyle="bold" />
              <text
                text="次"
                textSize="18sp"
                textColor="#707070"
                textStyle="bold"
                marginRight="8dp" />
              <img
                src="@drawable/ic_thumb_up_black_48dp"
                tint="#FFD740"
                width="24dp"
                height="24dp" />
            </horizontal>
          </vertical>

          <vertical id="settingContainer" padding="0" visibility="gone">
            <vertical id="settingContentContainer" background="#F5F5F5" visibility="gone">
              <text
                layout_width="match_parent"
                text="--- 完成基础配置 ---"
                textStyle="bold"
                textSize="17sp"
                textColor="#444444"
                gravity="center"
                margin="10dp"
              />

              <horizontal gravity="center" >
                <button id="recordToQianjiBtn" text={Constants.qianjiName} textColor="#FFFFFF" backgroundTint="#FBC02D" textSize="14sp" width="wrap_content" />
                <button id="recordToFeishuBtn" text={Constants.feishuName} textColor="#FFFFFF" backgroundTint="#BDBDBD" textSize="14sp" width="wrap_content" />
              </horizontal>

              <view bg="#EEEEEE" h="2" margin="8 0" />


              <horizontal gravity="center" padding="8">
                <img src="@drawable/ic_sentiment_satisfied_black_48dp" tint="#FFB74D" w="23dp" h="23dp" margin="2" />
                <text textSize="16sp" textColor="#333333" text="厂商：" textStyle="bold" />
                <text id="supplier" text="qwen" layout_weight="1" textSize="16sp" textColor="#444444" />
                <img id="supplierSpinner" src="@drawable/ic_arrow_drop_down_black_48dp" tint="#9E9E9E" w="23dp" h="23dp" />
              </horizontal>
              <view bg="#EEEEEE" h="1" margin="8 0" />

              <horizontal gravity="center" padding="8">
                <img src="@drawable/ic_sentiment_very_satisfied_black_48dp" tint="#FFB74D" w="23dp" h="23dp" margin="2" />
                <text textSize="16sp" textColor="#333333" text="模型：" textStyle="bold" />
                <text id="model" text="qwen-max-latest" layout_weight="1" textSize="16sp" textColor="#444444" />
                <img id="modelSpinner" src="@drawable/ic_arrow_drop_down_black_48dp" tint="#9E9E9E" w="23dp" h="23dp" />
              </horizontal>

              <view bg="#EEEEEE" h="1" margin="8 0" />

              <horizontal gravity="center" padding="8" >
                <img src="@drawable/ic_sentiment_very_dissatisfied_black_48dp" tint="#FFB74D" w="23dp" h="23dp" margin="2" />
                <text
                  layout_height="wrap_content"
                  text="API Key："
                  textSize="16sp"
                  textColor="#333333"
                  gravity="center"
                  textStyle="bold"
                />
                <input id="apiKey" gravity="center" hint="sk-d0724..." textSize="16sp" layout_weight="1" padding="4" bg="#FAFAFA" maxLines="1"/>
              </horizontal>

              <view bg="#EEEEEE" h="2" margin="8 0" />

              <horizontal gravity="center" padding="8" >
                <img src="@drawable/ic_brightness_4_black_48dp" tint="#FFAE39" w="23dp" h="23dp" margin="2" />
                <text
                  layout_height="wrap_content"
                  text="多维表格："
                  textSize="16sp"
                  textColor="#333333"
                  gravity="center"
                  textStyle="bold"
                />
                <input id="tableUrl" gravity="center" hint="https://..." textSize="16sp" layout_weight="1" padding="4" bg="#FAFAFA"  maxLines="1" />
              </horizontal>

              <horizontal gravity="center" padding="8" >
                <img src="@drawable/ic_brightness_6_black_48dp" tint="#FFAE39" w="23dp" h="23dp" margin="2" />
                <text
                  layout_height="wrap_content"
                  text="App Id："
                  textSize="16sp"
                  textColor="#333333"
                  gravity="center"
                  textStyle="bold"
                />
                <input id="appId" gravity="center|center_vertical" hint="cli_a724..." textSize="16sp" layout_weight="1" padding="4" bg="#FAFAFA" maxLines="1" />
              </horizontal>

              <view bg="#EEEEEE" h="1" margin="8 0" />

              <horizontal gravity="center" padding="8" >
                <img src="@drawable/ic_brightness_5_black_48dp" tint="#FFAE39" w="23dp" h="23dp" margin="2" />
                <text
                  layout_height="wrap_content"
                  text="App Secret："
                  textSize="16sp"
                  textColor="#333333"
                  gravity="center"
                  textStyle="bold"
                />
                <input id="appSecret" gravity="center" hint="HyJs9i02..." textSize="16sp" layout_weight="1" padding="4" bg="#FAFAFA" maxLines="1" />
              </horizontal>


              <view bg="#EEEEEE" h="2" margin="8 0" />

              <horizontal gravity="left|center" padding="8">
                <img src="@drawable/ic_account_box_black_48dp" tint="#64B5F6" w="23dp" h="23dp" margin="2" />
                <button id="editAccountnameBtn" text="管理账户" textColor="#FFFFFF" backgroundTint="#64B5F6" textSize="14sp" width="wrap_content" padding="4dp" />

                <view bg="#EEEEEE" w="2dp" h="match_parent" margin="4dp" />

                <img src="@drawable/ic_directions_black_48dp" tint="#E64F1F" w="23dp" h="23dp" margin="2" />
                <button id="contactAuthorBtn" text="联系开发者" textColor="#FFFFFF" backgroundTint="#E64F1F" textSize="14sp" width="wrap_content" padding="4dp" />
              </horizontal>
            </vertical>

            <horizontal id="supplierSettingContainer" background="#F5F5F5" visibility="gone">
              <vertical layout_width="match_parent">
                <text
                  layout_height="wrap_content"
                  text="--- 选择厂商 ---"
                  textStyle="bold"
                  textSize="17sp"
                  textColor="#444444"
                  gravity="center"
                  margin="10dp"
                />
                <vertical id="supplierGrid" margin="0" padding="0" />
              </vertical>
            </horizontal>

            <horizontal id="modelSettingContainer" background="#F5F5F5" visibility="gone">
              <vertical layout_width="match_parent">
                <text
                  layout_height="wrap_content"
                  text="--- 选择大模型 ---"
                  textStyle="bold"
                  textSize="17sp"
                  textColor="#444444"
                  gravity="center"
                  margin="10dp"
                />
                <vertical id="modelGrid" margin="0" padding="0" />
              </vertical>
            </horizontal>

            <!-- 新增转出账户 -->
            <horizontal id="addAccountnameContainer" background="#F5F5F5" padding="10" visibility="gone">
              <vertical layout_width="match_parent">
                <text
                  layout_height="wrap_content"
                  text="--- 新增账户 ---"
                  textStyle="bold"
                  textSize="17sp"
                  textColor="#444444"
                  gravity="center"
                  margin="10dp"
                />
                <horizontal margin="0 5" gravity="center">
                  <input id="newAccountname" gravity="center" hint="微信零钱通" textSize="16sp" layout_weight="1" />
                </horizontal>
              </vertical>
            </horizontal>

            <horizontal id="accountnameSettingContainer" background="#F5F5F5" visibility="gone">
              <vertical layout_width="match_parent">
                <text
                  layout_height="wrap_content"
                  text="--- 管理账户 ---"
                  textStyle="bold"
                  textSize="17sp"
                  textColor="#444444"
                  gravity="center"
                  margin="10dp"
                />
                <vertical id="accountnameSettingGrid" margin="0" padding="0" />
              </vertical>
            </horizontal>
          </vertical>

          <vertical id="orderContainer" background="#F5F5F5" padding="0" visibility="gone">
            <horizontal id="summaryContainer" visibility="gone">
              <vertical>
                <text id="summaryContent"
                  singleLine="false"
                  margin="10dp"
                  gravity="center"
                  padding="0"
                />
              </vertical>
            </horizontal>

            <!-- 分类 -->
            <horizontal id="catenameContainer" background="#F5F5F5" padding="10" visibility="gone">
              <vertical layout_height="wrap_content">
                <text
                  layout_width="match_parent"
                  text="--- 选择一个分类 ---"
                  textStyle="bold"
                  textSize="17sp"
                  textColor="#444444"
                  gravity="center"
                  margin="10dp"
                />
                <vertical id="catenameGrid" margin="0" padding="0" />
              </vertical>
            </horizontal>

            <!-- 类型 -->
            <horizontal id="typeContainer" background="#F5F5F5" padding="10" visibility="gone">
              <vertical layout_width="match_parent">
                <text
                  layout_height="wrap_content"
                  text="--- 选择订单类型 ---"
                  textStyle="bold"
                  textSize="17sp"
                  textColor="#444444"
                  gravity="center"
                  margin="10dp"
                />
                <vertical id="typeGrid" margin="0" padding="0" />
              </vertical>
            </horizontal>


            <!-- 时间 -->
            <horizontal id="timeContainer" background="#F5F5F5" padding="10" visibility="gone">
              <vertical layout_width="match_parent">
                <text
                  layout_height="wrap_content"
                  text="--- 修改订单时间 ---"
                  textStyle="bold"
                  textSize="17sp"
                  textColor="#444444"
                  gravity="center"
                  margin="10dp"
                />
                <horizontal margin="0 5">
                  <input id="year" textColor="black" textSize="16sp" layout_weight="1" hint="0000" maxLength="4" inputType="number" />
                  <text text="-" textColor="black" textSize="16sp" margin="2dp" />
                  <input id="month" textColor="black" textSize="16sp" layout_weight="1" hint="00" maxLength="2" inputType="number" />
                  <text text="-" textColor="black" textSize="16sp" margin="2dp" />
                  <input id="day" textColor="black" textSize="16sp" layout_weight="1" hint="00" maxLength="2" inputType="number" />
                  <text text=" " textColor="black" textSize="16sp" margin="2dp" />
                  <input id="hour" textColor="black" textSize="16sp" layout_weight="1" hint="00" maxLength="2" inputType="number" />
                  <text text=":" textColor="black" textSize="16sp" margin="2dp" />
                  <input id="minute" textColor="black" textSize="16sp" layout_weight="1" hint="00" maxLength="2" inputType="number" />
                  <text text=":" textColor="black" textSize="16sp" margin="2dp" />
                  <input id="second" textColor="black" textSize="16sp" layout_weight="1" hint="00" maxLength="2" inputType="number" />
                </horizontal>
              </vertical>
            </horizontal>

            <!-- 金额 -->
            <horizontal id="moneyContainer" background="#F5F5F5" padding="10" visibility="gone">
              <vertical layout_width="match_parent">
                <text
                  layout_height="wrap_content"
                  text="--- 输入正确金额 ---"
                  textStyle="bold"
                  textSize="17sp"
                  textColor="#444444"
                  gravity="center"
                  margin="10dp"
                />
                <horizontal margin="0 5" gravity="center">
                  <linear id="moneyGrid" orientation="horizontal" margin="0" padding="0" />
                  <input id="money" gravity="center" inputType="number" hint="666" textSize="16sp" />
                </horizontal>
              </vertical>
            </horizontal>


            <!-- 备注 -->
            <horizontal id="remarkContainer" background="#F5F5F5" padding="10" visibility="gone">
              <vertical layout_width="match_parent">
                <text
                  layout_height="wrap_content"
                  text="--- 修改备注信息 ---"
                  textStyle="bold"
                  textSize="17sp"
                  textColor="#444444"
                  gravity="center"
                  margin="10dp"
                />
                <horizontal margin="0 5" gravity="center">
                  <input id="remark" gravity="center" hint="在星巴克购买咖啡" textSize="16sp" layout_weight="1" />
                </horizontal>
              </vertical>
            </horizontal>

            <horizontal margin="0 5" gravity="center_vertical" visibility="gone" background="#F5F5F5" padding="10">
              <img src="@drawable/ic_looks_6_black_48dp" tint="#607D8B" layout_gravity="center" w="36dp" h="36dp" />
              <text textSize="16sp" color="#333333" textStyle="bold" margin="12 0">资产</text>
            </horizontal>

            <!-- 转出账户 -->
            <horizontal id="accountnameContainer" background="#F5F5F5" padding="10" visibility="gone">
              <vertical layout_width="match_parent">
                <text
                  layout_height="wrap_content"
                  text="--- 选择账户 ---"
                  textStyle="bold"
                  textSize="17sp"
                  textColor="#444444"
                  gravity="center"
                  margin="10dp"
                />
                <vertical id="accountnameGrid" margin="0" padding="0" />
              </vertical>
            </horizontal>

            <!-- 转入账户 -->
            <horizontal id="accountname2Container" background="#F5F5F5" padding="10" visibility="gone">
              <vertical layout_width="match_parent">
                <text
                  layout_height="wrap_content"
                  text="--- 修改转入账户 ---"
                  textStyle="bold"
                  textSize="17sp"
                  textColor="#444444"
                  gravity="center"
                  margin="10dp"
                />
                <horizontal margin="0 5" gravity="center">
                  <input id="accountname2" gravity="center" text="招行信用卡" textSize="16sp" layout_weight="1" />
                </horizontal>
              </vertical>
            </horizontal>
          </vertical>
        </vertical>
        <vertical id="btnContainer" layout_gravity="center">
          <button
            id="settingBtn"
            background="@drawable/ic_settings_black_48dp"
            bgTint="#9E9E9E"
            width={iconWidthDp}
            height={iconHeightDp}
            margin={iconOffsetDp}
            visibility="visible"
          />

          <button
            id="moveBtn"
            background="@drawable/ic_swap_vert_black_48dp"
            bgTint="#4A90E2"
            width={iconWidthDp}
            height={iconHeightDp}
            margin={iconOffsetDp}
            visibility="visible"
          />

          <button
            id="cancelBtn"
            background="@drawable/ic_cancel_black_48dp"
            bgTint="#9E9E9E"
            width={iconWidthDp}
            height={iconHeightDp}
            margin={iconOffsetDp}
            visibility="visible"
          />

          <button
            id="addBtn"
            background="@drawable/ic_add_circle_black_48dp"
            bgTint="#FFA740"
            width={iconWidthDp}
            height={iconHeightDp}
            margin={iconOffsetDp}
            visibility="gone"
          />

          <button
            id="confirmBtn"
            background="@drawable/ic_check_circle_black_48dp"
            bgTint="#4CAF50"
            width={iconWidthDp}
            height={iconHeightDp}
            margin={iconOffsetDp}
            visibility="gone"
          />
        </vertical>
      </horizontal>
    );

    let mySetting = this.llmDB.getSetting(Constants.mySettingKey);
    if (mySetting[Constants.recordToField] == Constants.qianjiName) {
      this.win.recordToQianjiBtn.attr("backgroundTint", "#FBC02D");
      this.win.recordToFeishuBtn.attr("backgroundTint", "#BDBDBD");
    } 
    
    if (mySetting[Constants.recordToField] == Constants.feishuName) {
      this.win.recordToQianjiBtn.attr("backgroundTint", "#BDBDBD");
      this.win.recordToFeishuBtn.attr("backgroundTint", "#FBC02D");
    }

    if (mySetting[Constants.feishuAppIdField]){
      this.win.appId.setText(mySetting[Constants.feishuAppIdField]);
    }
    if (mySetting[Constants.feishuAppSecretField]){
      this.win.appSecret.setText(mySetting[Constants.feishuAppSecretField]);
    }
    if (mySetting[Constants.feishuTableUrlField]){
      this.win.tableUrl.setText(mySetting[Constants.feishuTableUrlField]);
    }

    this.moveCount = 1;
    this.win.setPosition((screenWidth - contentWidth) / 2, screenHeight / 4);

    // 赋值
    this.time = {
      year: this.win.year,
      month: this.win.month,
      day: this.win.day,
      hour: this.win.hour,
      minute: this.win.minute,
      second: this.win.second
    };
    this.mainViewList = [this.win.loadingContainer, this.win.settingContainer, this.win.orderContainer];
    this.subSettingViewList = [this.win.supplierSettingContainer, this.win.modelSettingContainer, this.win.addAccountnameContainer, this.win.accountnameSettingContainer];
    this.subOrderViewList = [this.win.catenameContainer, this.win.typeContainer, this.win.timeContainer, this.win.moneyContainer, this.win.remarkContainer, this.win.accountnameContainer, this.win.accountname2Container];

    // 构造订单类型框
    createButtonGrid(this.win.typeGrid, typeBtnData, {
      textSize: 14,  // 可选的配置项
      padding: 15,
      margin: 13,
    });

    let supplierList = [];
    let uniqueSuppliers = new Set();
    let llmDatas = this.llmDB.listLlmDatas();
    llmDatas.forEach((data) => {
      if (!uniqueSuppliers.has(data.supplier)) {
        supplierList.push(data.supplier);
        uniqueSuppliers.add(data.supplier);
      }
    });
    if (supplierList.length > 0) {
      supplierBtnData = this.createBtnDatas(supplierList);
      createButtonGrid(this.win.supplierGrid, supplierBtnData, {
        textSize: 14,  // 可选的配置项
        padding: 15,
        margin: 13,
      });

      let firstSupplier = supplierList[0];
      let lastPickedLlm = this.llmDB.getLastPickedMyLlm();
      if (lastPickedLlm) {
        firstSupplier = lastPickedLlm.supplier;
        this.win.supplier.setText(lastPickedLlm.supplier);
        this.win.model.setText(lastPickedLlm.model);
        this.win.apiKey.setText(lastPickedLlm.key);
      } else {
        this.moveViewToFront(this.win.settingContainer);
        this.moveViewToFront(this.win.settingContentContainer);
      }

      modelList = llmDatas.filter(data => data.supplier == firstSupplier).map(data => data.model);
      modelBtnData = this.createBtnDatas(modelList);
      createButtonGrid(this.win.modelGrid, modelBtnData, {
        textSize: 14,  // 可选的配置项
        padding: 15,
        margin: 13,
      });
    }

    // 初始化账户列表
    let accountnameList = this.llmDB.listAccountnames();
    if (accountnameList.length > 0) {
      accountnameBtnData = this.createBtnDatas(accountnameList);
      createButtonGrid(this.win.accountnameSettingGrid, accountnameBtnData, {
        textSize: 14,  // 可选的配置项
        padding: 15,
        margin: 13,
      });
    }

    // exitOnClose
    this.win.exitOnClose();
  },

  showOrderDetail: function (data) {
    // ... 显示订单详情界面 ...      
    if (this.win.settingContainer.getVisibility() !== View.VISIBLE) {
      this.moveViewToFront(this.win.orderContainer);
      this.moveViewToFront(this.win.summaryContainer);
    }

    if (data["money"]) this.win.money.setText(String(data["money"]));
    if (data["time"]) this.setTimeValue(data["time"]);
    if (data["remark"]) this.win.remark.setText(data["remark"]);
    return;
  },

  bindEvents: function () {
    // 联系开发者
    this.win.contactAuthorBtn.setOnClickListener(view => {
      app.openUrl('https://www.xiaohongshu.com/user/profile/5c4da61d0000000012011b5d?xsec_token=YBfaQr-_9yNao7PiPIJa6g0QByH4CyhxkHl8B2VHWITtY%3D&xsec_source=app_share&xhsshare=CopyLink&appuid=5c4da61d0000000012011b5d&apptime=1742229965&share_id=23b93287e4a04e08a24eb842b03f3c90&share_channel=copy_link');
    });
    // 设置按钮点击事件
    this.win.settingBtn.setOnClickListener(view => {
      if (this.win.settingContainer.getVisibility() === View.VISIBLE) {
        return;
      }

      this.moveViewToFront(this.win.settingContainer);
      this.moveViewToFront(this.win.settingContentContainer);

      this.win.setPosition((screenWidth - contentWidth) / 2, screenHeight / 8);
    });

    this.win.recordToQianjiBtn.setOnClickListener(view => {
      let text = this.win.recordToQianjiBtn.text();

      let mySetting = this.llmDB.getSetting(Constants.mySettingKey);
      if (!mySetting){
        mySetting = {}
      }
      mySetting[Constants.recordToField] = text;
      this.llmDB.insertSetting(Constants.mySettingKey, mySetting)

      this.win.recordToQianjiBtn.attr("backgroundTint","#FBC02D");
      this.win.recordToFeishuBtn.attr("backgroundTint","#BDBDBD");
    });

    this.win.recordToFeishuBtn.setOnClickListener(view => {
      let text = this.win.recordToFeishuBtn.text();

      let mySetting = this.llmDB.getSetting(Constants.mySettingKey);
      let tableUrl = mySetting[Constants.feishuTableUrlField], appId = mySetting[Constants.appId], appSecret = mySetting[Constants.appSecret];
      if (!(tableUrl && appId && appSecret)){
        if (this.win.appId){
          appId = this.win.appId.text();
        }
        if (this.win.appSecret){
          appSecret = this.win.appSecret.text();
        }
        if (this.win.table_url){
          tableUrl = this.win.table_url.text();
        }

        if (!(tableUrl && appId && appSecret)){
          toastLogWithLine("请先完成飞书多维表格相关配置~", true);
          return ;
        }else{
          mySetting[Constants.feishuTableUrlField] = tableUrl;
          mySetting[Constants.feishuAppIdField] = appId;
          mySetting[Constants.feishuAppSecretField] = appSecret;
        }
      }

      mySetting[Constants.recordToField] = text;
      this.llmDB.insertSetting(Constants.mySettingKey, mySetting)

      this.win.recordToQianjiBtn.attr("backgroundTint","#BDBDBD");
      this.win.recordToFeishuBtn.attr("backgroundTint","#FBC02D");      
    });

    // 移动按钮点击事件
    this.win.moveBtn.setOnClickListener(view => {
      this.moveCount++;
      let yPosition = screenHeight / ((this.moveCount % 2 + 1) * 2);
      this.win.setPosition((screenWidth - contentWidth) / 2, yPosition);
    });

    // 取消按钮
    this.win.cancelBtn.setOnClickListener(view => {
      let win = this.win;
      this.destroy();
      win.close();
    })

    // 配置输入验证和焦点切换
    let order = [this.win.year, this.win.month, this.win.day, this.win.hour, this.win.minute, this.win.second];
    order.forEach((field, index) => {
      field.addTextChangedListener(new TextWatcher({
        afterTextChanged: (text) => {
          // 自动跳转焦点
          if (text.length() >= field.attr("maxLength") && index < order.length - 1) {
            order[index + 1].requestFocus();
          }

          validateField(field, text);
        },
        beforeTextChanged: (text, start, count, after) => { },
        onTextChanged: (text, start, before, count) => { }
      }));
    });

    // 编辑账户界面的新增按钮
    this.win.addBtn.setOnClickListener(view => {
      if (this.isViewActiveInFront(this.win.accountnameSettingContainer)) {
        this.moveViewToFront(this.win.addAccountnameContainer);
        return;
      }
    });



    // 设置界面和订单界面的确认按钮
    const handleConfirmClick = (isLongClick = false) => {
      let orderSubView = this.subOrderViewList.find(v => this.isViewActiveInFront(v));
      if (orderSubView) {
        switch (orderSubView.attr('id')) {
          case "@+id/timeContainer":
            let timeText = this.getTimeValue();
            this.spannableProcessor.modifySpanContent("time", timeText);
            this.win.summaryContent.setText(this.spannableProcessor.getSpannableString());
            this.moveViewToFront(this.win.summaryContainer);
            break
          case "@+id/moneyContainer":
            let moneyText = this.win.money.text();
            this.spannableProcessor.modifySpanContent("money", moneyText);
            this.win.summaryContent.setText(this.spannableProcessor.getSpannableString());
            this.moveViewToFront(this.win.summaryContainer);
            break
          case "@+id/remarkContainer":
            let remarkText = this.win.remark.text();
            this.spannableProcessor.modifySpanContent("remark", remarkText);
            this.win.summaryContent.setText(this.spannableProcessor.getSpannableString());
            this.moveViewToFront(this.win.summaryContainer);
            break
          case "@+id/accountname2Container":
            let accountname2Text = this.win.accountname2.text();
            this.spannableProcessor.modifySpanContent("accountname2", accountname2Text);
            this.win.summaryContent.setText(this.spannableProcessor.getSpannableString());
            this.moveViewToFront(this.win.summaryContainer);
            break
          default:
            break
        }
        return;
      }

      if (this.isViewActiveInFront(this.win.addAccountnameContainer)) {
        let newAccountname = this.win.newAccountname.text().trim();
        if (newAccountname !== "") {
          this.llmDB.insertAccountname(newAccountname);
          let accountnames = this.llmDB.listAccountnames();
          accountnameBtnData = this.createBtnDatas(accountnames);
          createButtonGrid(this.win.accountnameSettingGrid, accountnameBtnData, {
            textSize: 14,
            padding: 15,
            margin: 13,
          });

          for (let i = 0; i < this.win.accountnameSettingGrid.getChildCount(); i++) {
            let row = this.win.accountnameSettingGrid.getChildAt(i);
            for (let j = 0; j < row.getChildCount(); j++) {
              let button = row.getChildAt(j);
              button.setOnLongClickListener(view => {
                let accountname = view.getText();
                this.llmDB.removeAccountname(accountname);
                row.removeView(view);
                toastLogWithLine(`已将账户: ${accountname} 删除`);
                return true;
              });
            }
          }

          this.win.newAccountname.setText("");
        }
        this.moveViewToFront(this.win.accountnameSettingContainer);
        return;
      }

      if (this.isViewActiveInFront(this.win.accountnameSettingContainer)) {
        this.moveViewToFront(this.win.settingContentContainer);
        return;
      }

      if (this.isViewActiveInFront(this.win.summaryContainer)) {
        if (this.statusTag.get() !== 2){
          toastLogWithLine("AI正在分析订单，请稍后再试~");
          return ;
        }

        let moneyText = this.spannableProcessor.getTextById("money");
        let timeText = this.spannableProcessor.getTextById("time");
        let remarkText = this.spannableProcessor.getTextById("remark");
        let accountnameText = this.spannableProcessor.getTextById("accountname");
        let typeText = this.spannableProcessor.getTextById("type");
        let catenameText = this.spannableProcessor.getTextById("catename");
        let accountname2Text = this.spannableProcessor.getTextById("accountname2");
        let data = {
          "type": typeText,
          "money": Number(moneyText),
          "time": timeText,
          "remark": remarkText,
          "catename": catenameText,
          "accountname": accountnameText,
          "accountname2": accountname2Text
        }

        let currentDate = new Date();
        let currentYear = currentDate.getFullYear();
        let currentMonth = currentDate.getMonth() + 1;
        let mySetting = this.llmDB.getSetting(Constants.mySettingKey);
        if (mySetting[Constants.recordToField] == Constants.qianjiName){
          sendToQianJi(data);
          this.llmDB.incrMonthlyAccounting(currentYear, currentMonth);
        }else if (mySetting[Constants.recordToField] == Constants.feishuName){
          let feishuConfig = {
            tableUrl: mySetting[Constants.feishuTableUrlField],
            appId: mySetting[Constants.feishuAppIdField],
            appSecret: mySetting[Constants.feishuAppSecretField],
          }

          let sendStartAt = new Date();
          let semaphore = new Semaphore(0);
          sendToFeishu(feishuConfig, data)
          .then(success => {
            if (success) {
              let sendEndAt = new Date();
              logWithLine(`飞书数据同步成功，耗时: ${sendEndAt - sendStartAt}ms`);
              this.llmDB.incrMonthlyAccounting(currentYear, currentMonth);
              if (isLongClick) {
                app.startActivity({
                  packageName: "com.ss.android.lark",
                  className: "com.ss.android.lark.main.app.MainActivity",
                  flags: ["ACTIVITY_NEW_TASK"]
                });      
              }
                
              toastLogWithLine("已记录到飞书表格~");
            }else{
              toastLogWithLine("记录失败，请重试或联系开发者~");  
            }
            semaphore.release();
          })

          semaphore.acquire();
        }
        
        this.win.disableFocus();
        let win = this.win;
        this.destroy();
        win.close();
        return;
      }

      if (this.isViewActiveInFront(this.win.settingContentContainer)) {
        let supplier = this.win.supplier.text(), model = this.win.model.text(), key = this.win.apiKey.text();
        if (key !== "") {
          this.llmDB.insertMyLLM(supplier, model, key);
        }
        let tableUrl = this.win.tableUrl.text(), appId = this.win.appId.text(), appSecret = this.win.appSecret.text();
        if (tableUrl || appId || appSecret) {
          let mySetting = this.llmDB.getSetting(Constants.mySettingKey);
          mySetting[Constants.feishuTableUrlField] = tableUrl;
          mySetting[Constants.feishuAppIdField] = appId;
          mySetting[Constants.feishuAppSecretField] = appSecret;
          this.llmDB.insertSetting(Constants.mySettingKey, mySetting);
        }
        if (this.statusTag.get() === 0) {
          this.moveViewToFront(this.win.loadingContainer)
        } else {
          this.moveViewToFront(this.win.orderContainer)
          this.moveViewToFront(this.win.summaryContainer);
        }

        this.win.apiKey.attr("maxLines", "1");
        this.win.appId.attr("maxLines", "1"); 
        this.win.appSecret.attr("maxLines", "1");
        this.win.tableUrl.attr("maxLines", "1");

        let yPosition = screenHeight / ((this.moveCount % 2 + 1) * 2);
        this.win.setPosition((screenWidth - contentWidth) / 2, yPosition);
        return;
      }
    };

    this.win.confirmBtn.setOnLongClickListener(view => {
      try {
        handleConfirmClick(true);
      } catch (e) {
      }
      return true;
    });

    this.win.confirmBtn.setOnClickListener(view => {
      handleConfirmClick(false);
    });

    // 为所有输入框添加点击事件
    const inputFields = [
      this.win.money,
      this.win.year,
      this.win.month,
      this.win.day,
      this.win.hour,
      this.win.minute,
      this.win.second,
      this.win.remark,
      this.win.accountname2,
      this.win.newAccountname,
    ];

    inputFields.forEach(input => {
      input.on('click', () => {
        this.win.requestFocus();
      });
    });

    [ this.win.apiKey,
      this.win.tableUrl,
      this.win.appId,
      this.win.appSecret].
      forEach(input => {
        input.on('click', () => {
          input.attr("maxLines", "100");
          this.win.requestFocus();
        });
      });


    // 修改点击事件处理
    this.win.summaryContent.setOnTouchListener(new View.OnTouchListener({
      onTouch: (view, event) => {
        try {
          if (event.getAction() === MotionEvent.ACTION_DOWN) {
            const x = event.getX();
            const y = event.getY();

            let layout = this.win.summaryContent.getLayout();
            let line = layout.getLineForVertical(y);
            let offset = layout.getOffsetForHorizontal(line, x);

            const span = this.spannableProcessor.spanIdMap.find(s => offset >= s.start && offset <= s.end);
            if (span) {
              switch (span.id) {
                case "catename":
                  this.moveViewToFront(this.win.catenameContainer);
                  break;
                case "type":
                  this.moveViewToFront(this.win.typeContainer);
                  break;
                case "time":
                  this.moveViewToFront(this.win.timeContainer);
                  break;
                case "money":
                  this.moveViewToFront(this.win.moneyContainer);
                  break;
                case "remark":
                  this.moveViewToFront(this.win.remarkContainer);
                  break;
                case "accountname":
                  let accountnameList = this.llmDB.listAccountnames();
                  if (accountnameList) {
                    accountnameBtnData = this.createBtnDatas(accountnameList);
                    createButtonGrid(this.win.accountnameGrid, accountnameBtnData, {
                      textSize: 14,  // 可选的配置项
                      padding: 15,
                      margin: 13,
                    });

                    for (let i = 0; i < this.win.accountnameGrid.getChildCount(); i++) {
                      let row = this.win.accountnameGrid.getChildAt(i);
                      for (let j = 0; j < row.getChildCount(); j++) {
                        let button = row.getChildAt(j);
                        button.setOnClickListener(view => {
                          let text = view.getText()
                          this.spannableProcessor.modifySpanContent("accountname", text);
                          this.win.summaryContent.setText(this.spannableProcessor.getSpannableString());
                          this.moveViewToFront(this.win.summaryContainer);
                        });
                      }
                    }
                  }
                  this.moveViewToFront(this.win.accountnameContainer);
                  break;
                case "accountname2":
                  this.moveViewToFront(this.win.accountname2Container);
                  break;
                default:
                  // 默认处理逻辑
                  // toast("未知的span.id: " + span.id);
                  break;
              }

              return true;
            }
          }
        } catch (e) {
          logWithLine(e);
        }
        return false;
      }
    }));

    // 绑定订单类型框按钮点击事件
    for (let i = 0; i < this.win.typeGrid.getChildCount(); i++) {
      let row = this.win.typeGrid.getChildAt(i);
      for (let j = 0; j < row.getChildCount(); j++) {
        let button = row.getChildAt(j);
        button.setOnClickListener(view => {
          let text = view.getText()
          this.spannableProcessor.modifySpanContent("type", text);
          this.win.summaryContent.setText(this.spannableProcessor.getSpannableString());
          this.moveViewToFront(this.win.summaryContainer);

          let btnData = {}
          switch (text) {
            case "支出":
              btnData = paidCatenameBtnData
              if (this.spannableProcessor.getGroupById('accountname2')) {
                this.spannableProcessor.removeById('accountname2');
                this.win.summaryContent.setText(this.spannableProcessor.getSpannableString());
              }
              break;
            case "收入":
              if (this.spannableProcessor.getGroupById('accountname2')) {
                this.spannableProcessor.removeById('accountname2');
                this.win.summaryContent.setText(this.spannableProcessor.getSpannableString());
              }
              btnData = incomeCatenameBtnData
              break;
            default:
              if (this.spannableProcessor.getGroupById('catename')) {
                this.spannableProcessor.removeById("catename");
                this.win.summaryContent.setText(this.spannableProcessor.getSpannableString());
              }

              if (!this.spannableProcessor.getGroupById('accountname2')) {
                this.spannableProcessor.addElements(groupById['accountname2']);
                this.win.summaryContent.setText(this.spannableProcessor.getSpannableString());
              }

              return;
          }

          if (!this.spannableProcessor.getGroupById('catename')) {
            this.spannableProcessor.addElements(groupById['catename']);
            this.win.summaryContent.setText(this.spannableProcessor.getSpannableString());
          }

          // 构造分类框
          ui.run(() => {
            createButtonGrid(this.win.catenameGrid, btnData, {
              textSize: 14,  // 可选的配置项
              padding: 15,
              margin: 13,
            });
          })

          // 绑定分类框按钮点击事件
          for (let i = 0; i < this.win.catenameGrid.getChildCount(); i++) {
            let row = this.win.catenameGrid.getChildAt(i);
            for (let j = 0; j < row.getChildCount(); j++) {
              let button = row.getChildAt(j);
              button.setOnClickListener(view => {
                let text = view.getText()
                this.spannableProcessor.modifySpanContent("catename", text);
                this.win.summaryContent.setText(this.spannableProcessor.getSpannableString());
                this.moveViewToFront(this.win.summaryContainer);
              });
            }
          }
        });
      }
    }

    // 绑定供应商按钮点击事件
    for (let i = 0; i < this.win.supplierGrid.getChildCount(); i++) {
      let row = this.win.supplierGrid.getChildAt(i);
      for (let j = 0; j < row.getChildCount(); j++) {
        let button = row.getChildAt(j);
        button.setOnClickListener(view => {
          let text = view.getText()
          this.win.supplier.setText(text);
          this.moveViewToFront(this.win.settingContentContainer);

          let modelList = this.llmDB.listLlmDatasBySuplier(text).map(data => data.model);

          let lastPickedLlm = this.llmDB.getLastPickedMyLlmBySupplier(text);
          let firstModel = lastPickedLlm ? lastPickedLlm.model : modelList[0];
          this.win.model.setText(firstModel);

          if (lastPickedLlm) {
            this.win.apiKey.setText(lastPickedLlm.key);
          } else {
            this.win.apiKey.setText("");
          }

          let modelBtnData = this.createBtnDatas(modelList);
          ui.run(() => {
            createButtonGrid(this.win.modelGrid, modelBtnData, {
              textSize: 14,  // 可选的配置项
              padding: 15,
              margin: 13,
            });
          });

          // 绑定模型按钮点击事件
          for (let i = 0; i < this.win.modelGrid.getChildCount(); i++) {
            let row = this.win.modelGrid.getChildAt(i);
            for (let j = 0; j < row.getChildCount(); j++) {
              let button = row.getChildAt(j);
              button.setOnClickListener(view => {
                let text = view.getText()
                this.win.model.setText(text);
                this.moveViewToFront(this.win.settingContentContainer);
              });
            }
          }
        });
      }
    }

    // 绑定模型按钮点击事件
    for (let i = 0; i < this.win.modelGrid.getChildCount(); i++) {
      let row = this.win.modelGrid.getChildAt(i);
      for (let j = 0; j < row.getChildCount(); j++) {
        let button = row.getChildAt(j);
        button.setOnClickListener(view => {
          let text = view.getText()
          this.win.model.setText(text);
          this.moveViewToFront(this.win.settingContentContainer);
        });
      }
    }

    // 绑定账户点击事件
    for (let i = 0; i < this.win.accountnameSettingGrid.getChildCount(); i++) {
      let row = this.win.accountnameSettingGrid.getChildAt(i);
      for (let j = 0; j < row.getChildCount(); j++) {
        let button = row.getChildAt(j);
        button.setOnLongClickListener(view => {
          let accountname = view.getText();
          this.llmDB.removeAccountname(accountname);
          row.removeView(view);
          toastLogWithLine(`已将账户: ${accountname} 删除`);
          return true;
        });
      }
    }

    // 厂商修改按钮
    [this.win.supplier, this.win.supplierSpinner].forEach(view => {
      view.on('click', () => {
        this.moveViewToFront(this.win.supplierSettingContainer);
      });
    });

    // 模型修改按钮
    [this.win.model, this.win.modelSpinner].forEach(view => {
      view.on('click', () => {
        this.moveViewToFront(this.win.modelSettingContainer);
      });
    });

    // 账户编辑按钮
    this.win.editAccountnameBtn.setOnClickListener(view => {
      this.moveViewToFront(this.win.accountnameSettingContainer);
    });
  }
};

function validateField(field, text) {
  let value = Number(text) || 0;
  switch (field.attr('id')) {
    case "@+id/month":
      if (value > 12) field.setText("12");
      break;
    case "@+id/day":
      if (value > 31) field.setText("31");
      break;
    case "@+id/hour":
      if (value > 23) field.setText("23");
      break;
    case "@+id/minute":
    case "@+id/second":
      if (value > 59) field.setText("59");
      break;
  }
}

const groupById = {
  "welcome": [
    { type: 'text', content: '本次', color: Color.BLACK, id: 'welcome' },
  ],
  "accountname": [
    { type: 'text', content: '通过', color: Color.BLACK },
    { type: 'img', src: '@drawable/ic_account_box_black_48dp', color: Color.RED },
    { type: 'text', content: '招商银行储蓄卡(2333)', color: Color.RED, id: "accountname" }
  ],
  "type": [
    { type: 'img', src: '@drawable/ic_poll_black_48dp', color: '#4CAF50' },
    { type: 'text', content: '支出', color: '#4CAF50', id: 'type' }
  ],
  "money": [
    { type: 'img', src: '@drawable/ic_attach_money_black_48dp', color: '#2196F3' },
    { type: 'text', content: '0', color: '#2196F3', id: 'money' },
    { type: 'text', content: '元', color: Color.BLACK }
  ],
  "remark": [
    { type: 'text', content: '，用于', color: Color.BLACK },
    { type: 'img', src: '@drawable/ic_mode_edit_black_48dp', color: '#FF5722' },
    { type: 'text', content: '二维码付款-给汉味鸭脖|天河店', color: '#FF5722', id: 'remark' }
  ],
  "catename": [
    { type: 'text', content: '，已划入', color: Color.BLACK, id: "a" },
    { type: 'img', src: '@drawable/ic_event_note_black_48dp', color: '#FF9800', id: "b" },
    { type: 'text', content: '零食', color: '#FF9800', id: 'catename' },
    { type: 'text', content: '分类', color: Color.BLACK, id: "c" }
  ],
  "time": [
    { type: 'text', content: '，订单时间：', color: Color.BLACK },
    { type: 'img', src: '@drawable/ic_access_alarms_black_48dp', color: '#9C27B0' },
    { type: 'text', content: '2025-03-08 18:10:31', color: '#9C27B0', id: 'time' }
  ],
  "accountname2": [
    { type: 'text', content: '，已转入', color: Color.BLACK, id: "d" },
    { type: 'img', src: '@drawable/ic_portrait_black_48dp', color: "#FFA740", id: "e" },
    { type: 'text', content: '默认账户', color: "#FFA740", id: "accountname2" }
  ],
};

const defaultTextSize = 16;

const SpannableProcessor = {
  init: function () {
    this.builder = new SpannableStringBuilder();
    this.spanIdMap = [];
    this.currentPosition = 0;
    this.groupById = new Map();
    this.elementById = new Map();
    return this;
  },

  destroy: function () {
    // 释放SpannableStringBuilder
    if (this.builder) {
      this.builder.clearSpans(); // 清除所有的 Span
      this.builder.clear();
      this.builder = null;
    }

    // 释放Drawable资源
    this.spanIdMap.forEach(span => {
      if (span.type === 'img') {
        let drawable = span.drawable;
        if (drawable) {
          drawable.setCallback(null); // 移除回调
          drawable = null;
        }
      }
    });

    // 清空Map和数组
    this.spanIdMap = [];
    this.groupById.clear();
    this.elementById.clear();
    this.currentPosition = 0;
  },

  addElements: function (elements) {
    if (!Array.isArray(elements)) {
      throw new Error('Elements must be an array');
    }

    // 记录group和element信息
    elements.forEach(element => {
      if (element.id) {
        this.groupById.set(element.id, elements);
        this.elementById.set(element.id, element);
      }
    });

    // 添加元素
    elements.forEach(element => this.addElement(element));
  },

  addElement: function (element) {
    if (!element || !element.type) {
      throw new Error('Invalid element: must have type property');
    }
  
    let result;
    switch (element.type) {
      case 'img':
        result = this._buildImageSpan(element);
        this._recordSpanPosition(element, result.spannableString);
        this.builder.append(result.spannableString);
        this.currentPosition += result.spannableString.length();
        // 存储Drawable引用
        this.spanIdMap.push({
          id: element.id,
          type: 'img',
          drawable: result.drawable,
          start: this.currentPosition - result.spannableString.length(),
          end: this.currentPosition
        });
        break;
      case 'text':
        let spannableString = this._buildTextSpan(element);
        this._recordSpanPosition(element, spannableString);
        this.builder.append(spannableString);
        this.currentPosition += spannableString.length();
        break;
      default:
        throw new Error(`Unsupported element type: ${element.type}`);
    }
  },

  _buildImageSpan: function (element) {
    const drawable = context.getResources().getDrawable(
      context.getResources().getIdentifier(
        element.src.replace('@drawable/', ''),
        'drawable',
        context.getPackageName()
      )
    );
    if (typeof element.color === 'string' && element.color[0] === '#') {
      element.color = Color.parseColor(element.color);
    }
    drawable.setColorFilter(
      element.color || Color.BLACK,
      PorterDuff.Mode.SRC_IN
    );
    drawable.setBounds(0, 0, dpToPx(element.width || defaultTextSize * 1.25), dpToPx(element.height || defaultTextSize * 1.25));
  
    const imageSpan = new ImageSpan(drawable);
  
    const spannableString = new SpannableString(" ");
    spannableString.setSpan(
      imageSpan,
      0, 1,
      Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
    );
  
    // 存储Drawable引用
    return {
      spannableString,
      drawable
    };
  },

  _buildTextSpan: function (element) {
    const spannableString = new SpannableString(element.content);

    // 设置字体大小
    const textSizeSpan = new AbsoluteSizeSpan(
      element.size || defaultTextSize, true
    );
    spannableString.setSpan(
      textSizeSpan,
      0, spannableString.length(),
      Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
    );

    // 设置文本颜色
    if (typeof element.color === 'string' && element.color[0] === '#') {
      element.color = Color.parseColor(element.color);
    }

    const textColorSpan = new ForegroundColorSpan(
      element.color || Color.BLACK
    );
    spannableString.setSpan(
      textColorSpan,
      0, spannableString.length(),
      Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
    );

    return spannableString;
  },

  _recordSpanPosition: function (element, spannableString) {
    if (element.id) {
      this.spanIdMap.push({
        id: element.id,
        start: this.currentPosition,
        end: this.currentPosition + spannableString.length()
      });
    }
  },

  getSpannableString: function () {
    return this.builder;
  },

  getSpanIdMap: function () {
    return this.spanIdMap;
  },

  getGroupById: function (spanId) {
    return this.groupById.get(spanId);
  },

  getTextById: function (spanId) {
    let span = this.spanIdMap.find(s => s.id === spanId);
    if (span) {
      return this.builder.toString().substring(span.start, span.end);
    }

    return "";
  },

  removeById: function (spanId) {
    let span = this.spanIdMap.find(s => s.id === spanId);
    if (!span) {
      logWithLine(`Span with id ${spanId} not found`);
      return;
    }
  
    this.getGroupById(spanId).forEach(element => {
      if (element.id) {
        let span = this.spanIdMap.find(s => s.id === element.id);
        if (span) {
          // 如果是图片，释放Drawable资源
          if (element.type === 'img' && span.drawable) {
            span.drawable.setCallback(null);
            span.drawable = null;
          }
  
          // 更新SpannableStringBuilder
          let lengthDiff = - (span.end - span.start);
          this.builder.replace(span.start, span.end, "");
  
          // 更新spanIdMap
          this.spanIdMap = this.spanIdMap.filter(s => s.id !== element.id);
          this.elementById.delete(element.id);
          this.groupById.delete(element.id);
  
          // 更新后续span的位置
          this.spanIdMap.forEach(s => {
            if (s.start > span.start) {
              s.start += lengthDiff;
              s.end += lengthDiff;
            }
          });
  
          // 更新当前位置
          this.currentPosition += lengthDiff;
        }
      }
    });
  },

  modifySpanContent: function (spanId, newText) {
    let span = this.spanIdMap.find(s => s.id === spanId);
    if (!span) {
      logWithLine(`Span with id ${spanId} not found`);
      return;
    }

    // 获取原有span的样式
    const oldSpans = this.builder.getSpans(span.start, span.end, CharacterStyle.class);

    // 计算长度变化
    let lengthDiff = newText.length - (span.end - span.start);

    // 检查替换范围是否有效
    if (span.start > this.builder.length() || span.end > this.builder.length()) {
      logWithLine(`Invalid span range: start=${span.start}, end=${span.end}, length=${this.builder.length()}, newText=${newText}, builder=${this.builder}`);
      return;
    }

    // 移除原有span的样式
    if (oldSpans) {
      oldSpans.forEach(oldSpan => {
        this.builder.removeSpan(oldSpan);
      });
    }
 
    // 替换文本
    this.builder.replace(span.start, span.end, newText);

    // 更新当前span
    span.end = span.start + newText.length;

    // 更新后续span的位置
    this.spanIdMap.forEach(s => {
      if (s.start > span.start) {
        s.start += lengthDiff;
        s.end += lengthDiff;
      }
    });
    // 更新当前位置
    this.currentPosition += lengthDiff;

    // 重新添加样式
    let color = this._getSpanColor(spanId);
    if (color) {
      this.builder.setSpan(
        new ForegroundColorSpan(color),
        span.start, span.end,
        Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
      );
    }

    // 重新添加字体大小
    let size = this._getSpanTextSize(spanId);
    if (size) {
      this.builder.setSpan(
        new AbsoluteSizeSpan(size, true),
        span.start, span.end,
        Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
      );
    }
  },

  _getSpanColor: function (spanId) {
    const element = this.elementById.get(spanId);
    if (!element) {
      return Color.BLACK; // 默认颜色
    }

    if (typeof element.color === 'string' && element.color[0] === '#') {
      return Color.parseColor(element.color);
    }
    return element.color || Color.BLACK;
  },

  _getSpanTextSize: function (spanId) {
    let element = this.elementById.get(spanId);
    if (element) {
      return element.size || defaultTextSize;
    }

    logWithLine(`Element with id ${spanId} not found`);
    return defaultTextSize;
  }
};

// ==================== UI Manager end ====================


// ==================== Processor Logic start ====================
// 业务逻辑对象
const OrderProcessor = {
  llmDB: null,
  parser: null,
  statusTag: null,

  init: function () {
    // init parser
    this.parser = new JSONParser(false);
    // init LLMDatabase
    this.llmDB = new LLMDatabase();
    this.llmDB.initLLMData();
    // init statusTag
    this.statusTag = new AtomicInteger(0);
    // init UI
    OrderUI.init(this.llmDB, this.statusTag);
    // process order
    this.processOrder();
  },

  destroy: function () {
    this.parser = null;
    this.llmDB = null;
    this.OrderUI = null;
    this.analyzeOrder.promise = null;
    this.analyzeOrder = null;
    this.processOrder = null;
  },

  processOrder: function () {
    // ui.run(() => {
    //   OrderUI.setVisibility(OrderUI.win.uiContainer, View.VISIBLE);
    // });  
    // return ; 

    // 1. 截图
    let captStart = new Date();
    // logWithLine("开始截图...");
    let capt = automator.captureScreen();
    this.statusTag.getAndIncrement();
    ui.run(() => {
      OrderUI.setVisibility(OrderUI.win.uiContainer, View.VISIBLE);
    });
    let captEnd = new Date();
    // logWithLine("截图耗时:", captEnd - captStart, "ms");

    // 2. OCR识别
    let ocrResult = this.performOCR(capt);
    capt.recycle();
    capt = null;

    let myLlmData = OrderProcessor.llmDB.getLastPickedMyLlm();
    if (!myLlmData) {
      toastLogWithLine("请先设置供应商和模型~");
      // OrderUI.win.close();
      return;
    }
    let llmData = OrderProcessor.llmDB.getLlmData(myLlmData.supplier, myLlmData.model);
    if (!llmData) {
      toastLogWithLine("功能异常，请重试或联系开发者~");
      
      let win = OrderUI.win;
      OrderUI.destroy()
      win.close();
      return;
    }

    const { supplier, model, key } = myLlmData;
    const { url } = llmData;

    let parseredOcrResult = [];
    Object.entries(ocrResult).forEach(([key, value]) => {
      // 提取label和confidence
      let label = value.label;
      let confidence = value.confidence;

      parseredOcrResult.push({
        label: label,
        confidence: confidence
      });
    });

    // logWithLine("OCR识别结果:", JSON.stringify(parseredOcrResult));
    let accountnames = this.llmDB.listAccountnames();

    let mySetting = this.llmDB.getSetting(Constants.mySettingKey);
    let lastData = {}
    // 3. AI分析
    OrderProcessor.analyzeOrder(url, model, key, parseredOcrResult)
      .onData((dataStr) => {
        dataStr = dataStr.replace(/```json/g, "");
        dataStr = dataStr.replace(/```/g, "");
        let data = this.parser.ensureJSON(dataStr);
        if (data && data.accountname && mySetting[Constants.recordToField] == Constants.qianjiName){
          data.accountname = data.accountname.replaceAll('（','(');
          data.accountname = data.accountname.replaceAll('）',')');
          if (accountnames.indexOf(data.accountname) === -1) {
            logWithLine(`${data.accountname}不在账户列表中，重置为空`);
            data.accountname = "";
          }
        }
        if (data && JSON.stringify(data) !== JSON.stringify(lastData)) {
          let diffData = getIncrementalDiff(lastData, data);
          lastData = data;

          // 4. 显示部分结果
          ui.run(() => {
            OrderUI.showOrderDetail(data);
          });


          ui.run(() => {
            if (!OrderUI.spannableProcessor.getGroupById('welcome')) {
              OrderUI.spannableProcessor.addElements(groupById['welcome']);
            }

            // 遍历diffData，更新UI
            for (let key in diffData) {
              let spanId = key;
              if (!groupById[spanId]) {
                continue;
              }

              if (!OrderUI.spannableProcessor.getGroupById(spanId)) {
                OrderUI.spannableProcessor.addElements(groupById[spanId]);
              }

              let text = diffData[key] === null ? "" : String(diffData[key]);
              OrderUI.spannableProcessor.modifySpanContent(spanId, text);
            }
            let text = OrderUI.spannableProcessor.getSpannableString();
            OrderUI.win.summaryContent.setText(text);
          });

          if (diffData["type"]) {
            let text = String(OrderUI.spannableProcessor.getTextById("type"));
            let btnData = {}
            if (text === "支出") {
              btnData = paidCatenameBtnData
            } else if (text === "收入") {
              btnData = incomeCatenameBtnData
            } else {
              return;
            }

            // 构造分类框
            ui.run(() => {
              createButtonGrid(OrderUI.win.catenameGrid, btnData, {
                textSize: 14,  // 可选的配置项
                padding: 15,
                margin: 13,
              });
            })

            // 绑定分类框按钮点击事件
            for (let i = 0; i < OrderUI.win.catenameGrid.getChildCount(); i++) {
              let row = OrderUI.win.catenameGrid.getChildAt(i);
              for (let j = 0; j < row.getChildCount(); j++) {
                let button = row.getChildAt(j);
                button.setOnClickListener(view => {
                  let text = view.getText();
                  OrderUI.spannableProcessor.modifySpanContent("catename", text);
                  OrderUI.win.summaryContent.setText(OrderUI.spannableProcessor.getSpannableString());
                  OrderUI.moveViewToFront(OrderUI.win.summaryContainer);
                });
              }
            }
          }
        }
      })
      .then((data) => {
        // logWithLine("Final result:", data);

        let summaryContentUpdate = false;
        // 如果分类不在分类列表中，改为其它
        if (data.type && data.catename) {
          let catenameList = Constants.type2Catenames[data.type];
          if ( catenameList && catenameList.indexOf(data.catename) === -1) {
            logWithLine(`${data.catename}不在分类列表中，重置为其它`);
            data.catename = "其它";
            OrderUI.spannableProcessor.modifySpanContent('catename', data.catename);
            summaryContentUpdate = true;
          }
        }

        if (!data.time) {
          logWithLine(`时间不存在，重置为当前时间`);
          OrderUI.spannableProcessor.addElements(groupById['time']);
          data.time = formatDate(new Date(), "yyyy-MM-dd hh:mm:ss");
          OrderUI.spannableProcessor.modifySpanContent('time', data.time);
          summaryContentUpdate = true;
        } else if (!isValidDateTimeFormat(data.time)) {
          // 如果time字段存在，且格式不合法，设置为当前时间
          logWithLine(`${data.time}时间格式不合法，重置为当前时间`);
          data.time = formatDate(new Date(), "yyyy-MM-dd hh:mm:ss");
          OrderUI.spannableProcessor.modifySpanContent('time', data.time);
          summaryContentUpdate = true;
        }

        if (summaryContentUpdate) {
          ui.run(() => {
            let text = OrderUI.spannableProcessor.getSpannableString();
            OrderUI.win.summaryContent.setText(text);
          });
        }
        
        // 4. 显示AI支持
        toastLogWithLine(`由${model}提供智能分析`, true)

        this.statusTag.getAndIncrement();
      })
      .catch((error) => {
        this.statusTag.getAndIncrement();
        logWithLine("Error:", error);
        toastLogWithLine("AI解析失败，请重试或联系开发者~");
        // OrderUI.win.close();
      });
    ;
  },

  performOCR: function (capt) {
    // ocr.mode = 'mlkit';
    ocr.mode = 'rapid';
    let useSlim = false;
    let cpuThreadNumn = 4;

    let ocrStart = new Date();
    let ocrResult = ocr.detect(capt, { useSlim, cpuThreadNumn });
    let ocrEnd = new Date();
    logWithLine("OCR耗时:", ocrEnd - ocrStart, "ms");
    return ocrResult;
  },

  analyzeOrder: function (url, model, key, input) {
    let onDataCallback = null;

    // 先定义onData方法
    const promiseWithOnData = {
      onData: function (callback) {
        onDataCallback = callback;
        return this; // 返回promise以支持链式调用
      },
      then: function (onFulfilled, onRejected) {
        // 延迟创建Promise直到onData被调用
        if (!this.promise) {
          this.promise = createPromise();
        }
        return this.promise.then(onFulfilled, onRejected);
      },
      catch: function (onRejected) {
        if (!this.promise) {
          this.promise = createPromise();
        }
        return this.promise.catch(onRejected);
      }
    };

    function createPromise() {
      return new Promise((resolve, reject) => {
        try {
          let client = new OkHttpClient();

          // 准备请求体
          let requestBody = JSON.stringify({
            "messages": [
              {
                "content": Constants.sysPrompt,
                "role": "system"
              },
              {
                "content": JSON.stringify(input),
                "role": "user"
              }
            ],
            "model": model,
            "max_tokens": 1024,
            "response_format": {
              "type": "json_object"
            },
            "temperature": 0.7,
            "top_p": 0.7,
            "stream": true
          });

          // 创建请求
          let request = new Request.Builder()
            .url(url)
            .post(RequestBody.create(requestBody, MediaType.parse("application/json")))
            .header("Authorization", "Bearer " + key)
            .build();

          let reqStartAt = new Date();
          // 发送请求并获取响应
          let response = client.newCall(request).execute();

          if (response.isSuccessful()) {
            let responseBody = response.body();
            let source = responseBody.source();
            let buffer = new okio.Buffer();
            let jsonBuffer = "";

            try {
              while (!source.exhausted()) {
                let chunk = source.read(buffer, 8192);
                if (chunk !== -1) {
                  let chunkStr = buffer.readUtf8();
                  // 处理SSE格式数据
                  let lines = chunkStr.split("\n\n");
                  for (let line of lines) {
                    if (line.startsWith("data: ")) {
                      let data = line.substring(6).trim();
                      if (data === "[DONE]") {
                        let reqEndAt = new Date();
                        logWithLine("请求耗时:", reqEndAt - reqStartAt, "ms");
                        // 流结束，返回最终结果
                        resolve(JSON.parse(jsonBuffer));
                        return;
                      } else {
                        // 解析chunk数据
try {
  let chunkData = JSON.parse(data);
  
  // 安全地处理可能的token信息
  try {
    if (chunkData.usage && chunkData.usage.total_tokens) {
      logWithLine("cost tokens:", chunkData.usage.total_tokens);
    } else if (chunkData.choices && chunkData.choices[0].usage && chunkData.choices[0].usage.total_tokens) {
      logWithLine("cost tokens:", chunkData.choices[0].usage.total_tokens);
    }
  } catch (tokenError) {
    // 在token信息处理错误时，记录详细信息和完整的chunkData
    console.error("获取token信息时出错:", tokenError.message);
    console.log("出错时的完整chunkData:", JSON.stringify(chunkData, null, 2));
    console.log("继续处理内容...");
  }
  
  // 处理内容更新
  if (chunkData.choices && chunkData.choices[0].delta) {
    if (chunkData.choices[0].delta.content) {
      jsonBuffer += chunkData.choices[0].delta.content;
      
      // 如果有onData回调，则调用
      if (onDataCallback) {
        onDataCallback(jsonBuffer);
      }
    }
  }
} catch (e) {
  // 主解析错误时的详细日志
  console.error("处理数据块时出错:", e.message);
  console.log("问题数据:", data);
  // 继续处理，不中断流
}

                      }
                    }
                  }
                }
              }
            } finally {
              buffer.close();
              responseBody.close();
            }
          } else {
            reject(new Error("请求失败: " + response.code()));
          }
        } catch (e) {
          reject(e);
        }
      });
    }

    return promiseWithOnData;
  }
};
// ==================== Processor Logic end ====================


// 主程序
function main() {
  OrderProcessor.init();

  // 在脚本退出时清理
  events.on('exit', function() {
    OrderProcessor.destroy();
    OrderProcessor = null;
  });
}

main();
cleanupInterval = setInterval(() => {
  // 清理无障碍相关缓存
  auto.clearCache();
  // 手动触发垃圾回收
  java.lang.System.gc();
}, 2000);