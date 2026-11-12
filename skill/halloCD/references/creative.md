# 文案与配色：怎么把「送张 CD 给妈妈」变成一组参数

这一页给 agent 看。目标是：**不要产出平庸的默认参数**。默认参数是安全的，但平庸 —— 一张所有人生日 CD 都长得一样的唱片，没有人会为它拍照。

---

## 三个决定质量的点

| 环节 | 平庸 | 好 |
|---|---|---|
| 腰封 | `Happy Birthday` | `MUM, 47` 或 `生日快乐，妈妈` |
| 碟色 | 场景默认色 | 按用户描述的温度感调一档 |
| 信纸 | `祝你生日快乐` | 一句只有这两个人之间才成立的话 |

**腰封是竖排的**，10 字以内。想说的话放信纸，腰封只留一个钩子。

---

## 例 1：给妈妈的生日

> 用户：「我妈下个月生日，想寄张 CD 给她，她喜欢安静一点的设计。」

```json
{
  "productId": "birthday",
  "receiver": { "name": "妈妈" },
  "design": {
    "discColor": "#E9DFD2",
    "caseTint": "",
    "spineText": "给妈妈",
    "spineFont": "song",
    "spineTheme": "light",
    "spineTextColor": "#1C2329",
    "showObi": true,
    "obiText": "生日快乐",
    "obiFont": "song",
    "obiTheme": "light",
    "obiTextColor": "#8B5852",
    "paperSkin": "p02"
  },
  "letter": {
    "text": "妈妈，生日快乐。\n\n这一年你好像又瘦了，饭还是没好好吃吧。\n我攒了点事想说，等我回去当面讲给你听。",
    "fontSize": 14,
    "color": "#333333",
    "signature": "—— 你的孩子"
  }
}
```

拆解：用户说「安静」→ 碟色选暖米 `#E9DFD2` 而不是默认的米杏；腰封用宋体 + 豆沙字色，整体压低；信纸换成 `p02`（手作感，不是蛋糕）；信纸正文里塞了一个**具体的关心**（瘦了 / 没好好吃饭），而不是祝福套话。

---

## 例 2：给伴侣的纪念日

> 用户：「想给我老婆寄一张纪念日的 CD，我们的纪念日是 3 月 14 日。」

```json
{
  "productId": "anniversary",
  "deliveryDate": "2027-03-14",
  "receiver": { "name": "老婆" },
  "design": {
    "discColor": "#8B5852",
    "spineText": "To My Love",
    "spineFont": "serif",
    "spineTheme": "glass",
    "spineTextColor": "#1C2329",
    "showObi": true,
    "obiText": "GOLDEN, AGAIN",
    "obiFont": "serif",
    "obiTheme": "light",
    "obiTextColor": "#1C2329",
    "paperSkin": "p05"
  },
  "letter": {
    "text": "又一年了。\n\n去年今天你说想去海边，今年我们还是没去成。\n没关系，明年一定。",
    "fontSize": 15,
    "color": "#3A2C26",
    "signature": "—— 你的先生"
  }
}
```

拆解：腰封沿用场景自带的 `GOLDEN, AGAIN`（这个场景就是它自己的语言）；信纸 `p05` 牛皮胶带更质朴，衬「又一年了」这种不煽情的口吻；**信纸里留了一个小遗憾**（没去成海边），比「我爱你永远在一起」真实得多。

---

## 例 3：给自己

> 用户：「随便弄一张吧，就当记录一下今天。」

```json
{
  "productId": "everyday",
  "receiver": { "name": "自己" },
  "design": {
    "discColor": "#EFEBE2",
    "spineText": "Ordinary",
    "spineFont": "mono",
    "spineTheme": "glass",
    "spineTextColor": "#9AA3A8",
    "showObi": false,
    "paperSkin": "p08"
  },
  "letter": {
    "text": "今天没什么特别的事。\n\n但窗外那棵树的叶子又黄了一点，我还挺喜欢这个季节。",
    "fontSize": 13,
    "color": "#555555",
    "signature": "—— 我"
  }
}
```

拆解：`everyday` 是「日常」场景，本来就不该热闹 —— 所以 `showObi: false`（不贴腰封）、字色用银灰、字用等宽。这是**减法**，不是默认值。

---

## 文案的三条硬规则

1. **不写空话。** 「亲爱的」「爱你的」「永远幸福」这类词删掉不损失任何信息。
2. **写细节，不写形容。** 「今天天气很好」是形容；「窗外那棵树的叶子又黄了一点」是细节。
3. **第二人称。** 信纸是写给一个人的，不是写给「寿星」的。

---

## 落款

`signature` 是关系，不是形容词。

| 场景 | 好的落款 | 差的落款 |
|---|---|---|
| 给妈妈的生日 | `—— 你的孩子` | `—— 爱你的` |
| 给伴侣 | `—— 你的先生` | `—— 永远` |
| 给老朋友 | `—— 老周` | `—— 你的朋友` |
| 给自己 | `—— 我` | `—— 一个孤独的人` |

---

## 不确定怎么办

| 情况 | 处理 |
|---|---|
| 用户没说收件人 | `receiver.name` 填「收件人」，但要在回复里问一句 |
| 用户没说日期 | 今天 + 7 天，并告诉用户「默认按一周后送达，可以改」 |
| 用户没说数量 | 1 张 |
| 用户描述模糊（「随便」「都行」） | 用 `everyday` + 场景默认配色 + 一句不像套话的短文，别自己硬造风格 |
| 用户要贴图 / 录音 | 明确告知 API 暂不支持，请去 `/make` 页面完成，agent 这边先把文案与配色定好 |
