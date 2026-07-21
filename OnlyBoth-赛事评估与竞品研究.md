# OnlyBoth：赛事评估、Winner Benchmark 与竞品研究

## Label-blind, attention-backed work proofs

> 研究更新：2026-07-19  
> 目标赛事：OpenAI Build Week 2026  
> 规范性产品精神：`OnlyBoth-产品精神.md`  
> 权威产品文档：`OnlyBoth-产品方案.md`

---

## 0. Override 与结论先行

本文整体替代此前基于约会、社交活动、Shared Table 与关系 Policy 的赛事判断。旧约会竞品、密码学先例、赛道选择、评分、MVP 和 Pitch 均不再代表当前产品。

OnlyBoth 当前定义为：

> **先 Seal JD 关键问题与履历标签，再由具名招聘者在看不到 Candidate Profile 或 Claim 时激活可循环 Blind Answer Review Slots。公开非 Profile 队列把每个空闲 Slot 交给下一位 Interest；每份正式 Application 必须获得 Evidence-linked Receipt，Slot 随后继续服务队列。需求方只能从完成审核的 Advancement Cohort 选择 Direct，并由公开 Seed 产生 Explore。GPT 只结构化已发生的回答证据、推荐受约束 Challenge 并压缩最终 Evidence。**

赛事结论：

| 问题 | 当前判断 |
|---|---|
| 推荐赛道 | **Work & Productivity** |
| 是否继续 | **Conditional Go** |
| 最强用户价值 | 在完整面试前暴露履历 False Positive，并让一部分履历 False Negative 获得 Evidence-first 机会 |
| 最强制度差异 | `No held blind review → No answer`；`Every submitted application → named receipt or breach`；`Every settled slot → next queued interest` |
| 最强 GPT 用法 | 需求方侧 Contract 编译、Stage A Artifact → Challenge 候选项、Evidence 压缩与引用 |
| 最大技术产品威胁 | CoderPad 已有实时 Interviewer Coach、代码感知追问与 rubric coverage |
| 最大制度产品威胁 | Koali 已有有限申请池、真人 Review SLA 与违约 Credit 退回 |
| 最大自动化路线威胁 | Alex 已有规模化、双向、自适应 AI Interviewer |
| 最大商业风险 | 招聘者不愿锁定 Review Capacity，或 Evidence Card 没有降低完整面试前的判断成本 |
| 最大产品风险 | Label Veil 没有改变选择，或候选人仍把 Human Checkpoint 感知为另一场自动测评 |
| 最大技术风险 | Challenge 难度不一致、Evidence 提取偏差、Closed Proof 的远程完整性边界被过度表述 |
| 十秒高潮 | `Résumé picked A → labels sealed → attention reserved → work evidence surfaced B` |

当前方案比原约会方向更直接地对应评委自身的招聘与技术判断视角，也更自然落入 Work & Productivity。但新方向进入了一个成熟且竞争激烈的招聘评估市场，不能把“AI 出题”“AI 面试”“面试 Copilot”“动态追问”“Sandbox”或“技能优先于履历”宣称为原创。

可防守的创新单位是以下完整制度组合：

1. 必要资格保留，但学校、前雇主品牌、姓名、照片等 Prestige labels 在 Evidence 前进入 **Label Veil**；
2. 轻量 Interest Queue 可以很大，但回答前 Employer 不获得 Candidate Profile、Claim 或 GPT rationale；
3. Candidate 只在具名 Reviewer、逐份 Answer Review SLA 与 Credit 已进入 **Attention Escrow** 后作答；
4. 候选人不能付费、竞价或 Boost Attention；可循环 Review Slot 按公开队列服务下一位，Direct 只能从已完成 Cohort 的匿名回答中产生，Explore 从同 Cohort 剩余有效回答中公开分配；
5. 候选人在平台不提供 GPT、规则禁止外部 AI、无公网、无文件导入的 **Closed Proof** 中产生岗位证据；
6. GPT 只在需求方私有侧编译 Contract、从预验证 Catalog 推荐受 Rubric 约束的 Challenge 候选项并压缩 Evidence；
7. 真人选择必须因果改变 Stage B，最终动作必须引用候选人 Evidence；
8. 上一份 Review 未履约时，同一 Slot 的下一位候选人在 Remediation Settlement 完成前不解锁；其他已结算 Slot 继续循环；Ask Back、Receipt 与 Replay 让接触双向且可追责。

---

## 1. 研究口径

本文优先使用赛事主办方、产品官网、官方帮助中心和官方项目页。所有“为什么获奖”或“产品为何有竞争力”的判断，如果官方没有公开逐项评分，均属于基于公开事实的推断。

| 证据等级 | 定义 |
|---|---|
| A | 官方规则、主办方公告、官方产品文档 |
| B | 官方项目提交、官方仓库、产品官网功能主张 |
| C | 媒体与第三方分析，只作补充 |
| 推断 | 根据公开事实进行的产品与赛事判断 |

竞品功能会持续变化。本文只能确认 2026-07-18 检索时可见的公开能力，不能证明其真实效果、市场规模或内部算法。

---

## 2. OpenAI Build Week 2026 官方事实

### 2.1 时间线

以 [Official Rules](https://openai.devpost.com/rules) 为最高优先级：

| 事项 | 太平洋时间 |
|---|---|
| 注册 | 7月9日10:00—7月21日17:00 |
| 提交 | 7月13日09:00—7月21日17:00 |
| 评审 | 7月22日10:00—8月5日17:00 |
| Winner 公布 | 约8月12日14:00 |

截至 2026-07-18，本届赛事仍未截止，因此不存在可核验的本届 Winner。

### 2.2 推荐赛道

赛事设置：

1. Apps for Your Life；
2. Work & Productivity；
3. Developer Tools；
4. Education。

新 OnlyBoth 应选择 **Work & Productivity**：直接购买方是招聘者、Hiring Manager、投资团队或高成本人才市场运营者，产品目标是提高筛选、验证和人类注意力分配效率。

### 2.3 强制技术要求

[官方 FAQ](https://openai.devpost.com/details/faqs)要求对 Codex 与 GPT-5.6 进行有意义的使用。

OnlyBoth 推荐职责：

| 组件 | 负责者 | 评审证据 |
|---|---|---|
| JD/Ticket/Repo → Capability Contract | GPT-5.6 + Schema | 岗位风险、决策不确定性、能力维度、用户确认 |
| Label Veil 建议 | GPT-5.6 + 结构化规则 | 建议自由文本中的 Prestige proxy；必要资格由规则保留 |
| Eligibility、Invitation 与 WIP | 确定性程序 | 资格边、非 Profile Answer Invitation、容量约束与公开 Seed |
| Closed Proof | 确定性程序 | 无候选人侧 GPT、无公网、无文件导入、事件记录 |
| Proof Verification | 确定性工具 | 代码测试、状态不变量、Challenge 版本、Replay |
| Stage A → Challenge 候选项 | GPT-5.6 + 版本化 Catalog | 私下向 Reviewer 推荐三个 Evidence-anchored Scenario ID；确定性程序负责加载 |
| Causal Human Checkpoint | 真人 | 选择或修改一个 Challenge；选择结果实际改变 Stage B |
| Evidence Extraction | GPT-5.6 | 将事件、Diff 与测试压缩；每项 Evidence 链接原始来源 |
| Escrow/Backpressure/Receipt | 确定性状态机 | SLA、Review Credit、违约、下一位解锁与审计轨迹 |
| 构建与测试 | Codex | commits、测试、README、主 Session |

GPT-5.6 不能只生成问题或总结答案。它必须在运行时完成“需求方不确定性编译 → 根据 Stage A Artifact 从预验证 Catalog 推荐受约束 Challenge ID → 证据压缩”闭环；但 GPT 不得帮助候选人答题、生成并执行任意 Sandbox 代码、自动选择 Challenge、冒充真人动作或自动录用/拒绝。

候选人在 Closed Proof 中不得使用 GPT 或其他外部模型。平台能保证的是受控工作区无公网、无候选人侧模型、无文件导入并记录服务端事件；它不能证明房间里没有手机或第二台设备，也不得把结果标记为“Proven AI-free”。

### 2.4 必交材料

根据[赛事主页](https://openai.devpost.com/)、[规则](https://openai.devpost.com/rules)与[FAQ](https://openai.devpost.com/details/faqs)：

- 可运行且与视频一致的 working project；
- 一个赛道；
- 不超过3分钟、公开可访问、有音频旁白的 Demo；
- 说明 Codex 与 GPT-5.6 的真实使用；
- 可供评审测试的代码仓库；
- README、安装、测试、样例数据与架构说明；
- 主要构建线程 `/feedback` Session ID；
- 免费可测试实例或明确测试账号；
- 非英文材料需要英文版本。

当前工作区仍只有文档，没有可运行产品；如果以当前状态提交，将无法满足 working project 门槛。

---

## 3. 官方评审框架下的新方案

赛事 Stage Two 采用四项等权标准：Technological Implementation、Design、Potential Impact、Quality of Idea。来源：[Official Rules](https://openai.devpost.com/rules)。

### 3.1 Pass/Fail

| 门槛 | 新方案要求 |
|---|---|
| 一句话可懂 | 延迟履历标签；真人注意力先于候选人劳动；工作证据决定下一次接触 |
| GPT 必要 | GPT 在需求方侧编译真实岗位风险、依据 Stage A Artifact 从预验证 Catalog 推荐 Challenge 候选项并压缩 Evidence |
| 可运行 | 两个合成候选人、一个具名 Reviewer、Label Veil、Attention Escrow、Closed Proof 与确定性测试 |
| 三分钟状态变化 | Résumé 选择 A，工作证据浮现 B；Reviewer 为两人各改变 Stage B，并完成两个最终 Outcome 后下一位才解锁 |
| Impact 可量化 | Reviewer UI 的 Evidence 前 Prestige label 暴露=0、Unbacked Proof=0、平台 Candidate GPT 调用=0、WIP、SLA、Review 时长、Explore yield |
| 证据可重放 | Contract、Label policy、seed、sandbox events、tests、Challenge choice、Human Outcome、Receipt |

### 3.2 暂定评分

以下只是产品计划在完整交付后的内部潜力，不是当前仓库得分：

| 官方维度 | 暂定潜力 | 主要条件 |
|---|---:|---|
| Technological Implementation | 22/25 | GPT runtime、Label Veil、Escrow、sandbox、tests、Causal Checkpoint 与 Receipt 必须真实运行 |
| Design | 21/25 | Label、Interest、Reserved Proof 与 Human Action 的信息顺序必须一眼可懂 |
| Potential Impact | 18/25 | 必须验证 Reviewer 时间、候选人感知与 Explore 价值，不能只讲公平 |
| Quality of Idea | 20/25 | 协议组合有辨识度，但 AI assessment、Copilot 与 Review guarantee 均已有直接先例 |
| **总潜力** | **约81/100** | 有真实 MVP 后再重估 |

结论为 **Conditional Go**：

- 如果只有 AI Interviewer、面试 Copilot、Sandbox 或 Scorecard：No-Go；
- 如果只有 Attention Token 动画，没有 Label Veil、真人因果动作和 Backpressure：No-Go；
- 如果能完整跑通 `Label Veil → Attention Escrow → Closed Proof A → Human Checkpoint → Closed Proof B → Evidence Outcome → Next Candidate`：Go；
- 如果不能在三分钟内说明与 CoderPad 的技术组件、Alex 的自动化路线和 Koali 的 Review guarantee 有何制度差异：No-Go。

---

## 4. 其他 AI Hackathon Winner Benchmark

### 4.1 OpenAI Open Model Hackathon 2025

#### RoboChef — Best Overall

自然语言指令被模型转成动作计划，再由机器人真实执行，状态 UI 显示当前和下一步。[项目页](https://devpost.com/software/robochef-gpt-oss-powered-kitchen-assistant)

**对 OnlyBoth 的启示（推断）：** GPT 输出必须形成结构化 Contract 或可执行 Challenge 候选项，不能只是生成一段看起来聪明的面试反馈；真正改变 Candidate Proof 的动作必须由真人选择。

#### A Printer for Smell — Best in Robotics

GPT 将偏好、时间和安全约束编译成严格 `plan.json`，确定性硬件执行结果。[项目页](https://devpost.com/software/a-printer-for-smell-ai-scent-songs)

**启示（推断）：** 最接近的结构是 `LLM compiler → strict IR → human approval → deterministic runtime → visible result`。OnlyBoth 应把 Contract、Challenge option、Human Choice、test 和 Receipt 串在同一可见链路中。

#### Memory Palace — Best Local Agent + For Humanity

面向记忆障碍者的本地家庭记忆系统，隐私通过局域网与完整产品架构实现。[项目页](https://devpost.com/software/memory-palace-qyat7g)

**启示（推断）：** 隐私与人类授权不能只写在政策页，应由 Label Veil 直接决定哪些背景字段在 Evidence 前封存、哪些必要资格始终可见，以及候选人如何预览和申诉。

官方获奖列表见 [OpenAI Winner 公告](https://openai2025.devpost.com/updates/37529-and-the-winners-are)。

### 4.2 Google Gemini API Developer Competition 2024

- **Jayu — Best Overall：** 看懂屏幕并控制应用；
- **Vite Vere — Most Impactful + People’s Choice：** 为认知障碍者提供现实任务指导；
- **Outdraw AI — Most Creative：** 人画出人类看懂、AI 猜不到的图。

来源：[Google 官方公告](https://developers.googleblog.com/announcing-the-winners-of-the-gemini-api-developer-competition/)。

**对 OnlyBoth 的启示（推断）：** 借鉴点不是让候选人与 GPT 对抗，而是把抽象机制变成无需旁白的可见反转：履历预测选择 A，Label-blind 工作证据却浮现 B。

### 4.3 GibberLink — ElevenLabs 全球冠军

两个语音 Agent 识别彼此后，从英语瞬间切换为机器协议。[官方公告](https://elevenlabs.io/blog/announcing-the-winners-of-the-elevenlabs-worldwide-hackathon)、[项目页](https://devpost.com/software/gibber-link)。

**启示（推断）：** 十秒高潮必须不依赖旁白。`Candidate work locked → Sarah reserves review → Proof unlocks` 与 `Résumé picked A → Work evidence surfaced B` 是当前最清楚的状态跃迁。

### 4.4 RiskWise — Microsoft AI Agents Hackathon Best Overall

自然语言问题经过数据、Agent 和确定性计算，最后形成风险地图、引用、报告与审计轨迹。[Microsoft Winner 页](https://microsoft.github.io/AI_Agents_Hackathon/winners/)。

**启示（推断）：** Evidence Card 必须链接 transcript、操作和测试；Auditor/Replay 是主证据，不是附属调试页。

### 4.5 CertPrep — Microsoft Agents League Reasoning Winner

多 Agent 流程外围有确定性时间分配、边界校验、模型 fallback、mock mode 和大量测试。[官方公告](https://techcommunity.microsoft.com/blog/azuredevcommunityblog/agents-league-meet-the-winners/4507503)。

**启示（推断）：** 固定场景、Mock GPT、Schema、自动测试和一键 Replay 是黑客松可靠性的核心。

### 4.6 Winner 共性

| Winner 共性 | OnlyBoth 必须做到 |
|---|---|
| 一句话可懂 | “Hide the labels. Stake the attention. Test the work.” |
| AI 导致可见状态变化 | GPT 生成可执行 Challenge 候选项；真人选择后 Sandbox 与 Stage B 实际改变 |
| 完整闭环 | Label Veil → Escrow → Stage A → Human Choice → Stage B → Outcome |
| 工程证据 | Schema、sandbox、tests、human-gated events、Receipt、Replay |
| 用户具体 | Hiring Manager 与非标准背景技术候选人 |
| 难忘符号 | 被 Seal 的 Prestige labels、锁定的 Proof、`Résumé picked A / Work evidence surfaced B` |

---

## 5. 竞品与相邻产品

### 5.1 Upwork：价格化可见性

Upwork 官方说明：Connects 用于提交 Proposal；Boosted Proposals 允许 Freelancer 额外竞价 Connects，进入客户列表顶部的 Boosted 位置。Boost 提高被看到的机会，但官方并不保证客户会阅读或继续互动。来源：[Upwork Connects](https://support.upwork.com/hc/en-us/articles/211062898-Understanding-and-using-Connects)、[Boosted Proposals](https://support.upwork.com/hc/en-us/articles/4406541109011-What-are-Boosted-Proposals-on-Upwork)、[Boost 机制](https://support.upwork.com/hc/en-us/articles/4406395531795-How-to-boost-your-proposal)。

需要准确区分：

- Upwork 的普通 Proposal 本身需要 Connects；
- 额外 Boost 是否退还取决于竞价结果和客户互动；
- Boost 是提高可见性的拍卖，不是人工 Review 担保；
- 客户仍拥有完整决定权。

OnlyBoth 不与 Upwork 竞争完整零工市场、支付、合同或信誉系统。它只挑战一个机制：

> 应征方是否应该在需求方尚未承诺注意力时，为曝光和高成本 Proposal 付费？

### 5.2 CoderPad：最直接的技术产品先例

CoderPad 的官方 AI Interview Coach 已经提供：

- 嵌入真人技术面试的实时 Coaching；
- 根据候选人进度、代码质量与时间发出提示；
- 分析候选人 Solution 并生成定制 Follow-up；
- 跟踪 Evaluation Rubric、检查 Codebase 并提示 Coverage Gap。

CoderPad AI Interview Designer 还能把 JD 转成角色相关、真实工作式的 Assessment。来源：[AI Interview Coach](https://coderpad.io/features/ai-interview-coach/)与[AI Interview Designer](https://coderpad.io/features/ai-interview-designer/)。

因此，“GPT 坐在面试官背后”“代码感知实时追问”“JD 编译成角色任务”都不能作为 OnlyBoth 的原创主张。OnlyBoth 必须把差异放在面试工具之外：Label Veil、Proof 前 Attention Escrow、只限制 Active Proof 的 Backpressure，以及真人选择因果改变 Candidate Proof。

### 5.3 Alex：自动 AI Interviewer 路线

Alex 官方平台提供视频、电话、SMS 与 WhatsApp 的个性化双向 AI Interview，能够提出智能 Follow-up、全天候运行，并把结果交给招聘团队。来源：[Alex Platform](https://www.alex.com/platform)。

Alex 证明“自适应 AI 面试能规模化覆盖候选人”不是市场空白。OnlyBoth 选择相反边界：GPT 不冒充 Reviewer，也不帮助 Candidate；GPT 私下准备招聘者判断，而候选人看到的下一步必须来自真人的显式选择。

### 5.4 Koali：最直接的制度机制先例

Koali 官方公开机制包括：

- 每个岗位的申请池有硬上限；
- Recruiter 经过验证；
- 每份申请由真人 Review，并在 10 个工作日内得到回复；
- 候选人以 Application Credit 申请，并可获得 Priority Placement；
- 超时未回复时，Credit 自动退回。

来源：[Koali](https://www.koali.ca/)。

因此，OnlyBoth 不能声称“第一次限制申请池”“第一次保证 Recruiter Review”或“第一次用 SLA/信用后果反制 Ghosting”。差异是：Koali 限制整个付费 Application Pool；OnlyBoth 保持轻量 Interest Queue 可大，把 Review WIP 做成需求方付费且可循环的并发容量，不向候选人出售 Attention；每个 submitted Application 必审，未履约只冻结对应 Slot，直到通知、补偿、WIP 惩罚与旧 Slot retire 完成。

### 5.5 HackerRank：AI-native 技术评估

HackerRank 官方产品已经提供：

- 真实代码仓库和 Agentic IDE；
- 候选人与 AI 协作；
- 面试官观察 AI 交互；
- transcript、代码和测试支持的 Scorecard Assist；
- 技术 Screen 与真人 Interview；
- integrity signals。

来源：[HackerRank Interview](https://www.hackerrank.com/products/interview)与[Developer Skills Platform](https://www.hackerrank.com/products/developer-skills-platform)。

因此 OnlyBoth 不能宣称“第一次在真实 Repo/IDE 中观察候选人”“第一次用代码、测试和 Transcript 形成面试证据”。OnlyBoth 的 Candidate AI Policy 刻意相反：Closed Proof 内候选人侧 AI 禁止；这是一项验证边界，不是创新主张。

剩余差异是：

- Proof 之前是否已有 Review-backed Attention Slot；
- 高成本任务是否受 WIP 约束；
- 候选人是否需要为曝光竞价；
- 是否存在 Direct/Explore 分配；
- Proof 后是否强制候选人特定的人类动作；
- 是否有 Ask Back、SLA、Review Credit、Backpressure 和 Attention Receipt。

### 5.6 CodeSignal：AI Interviewer 与技能平台

CodeSignal 官方资料已经公开：

- 角色和上下文定制的 AI Interviewer；
- 自适应追问和结构化结果；
- 技能测评与 Live Tech Interview；
- AI-assisted coding assessment；
- 招聘团队使用的 assessment/interview credits。

来源：[CodeSignal 官方首页](https://codesignal.com/)、[AI-assisted assessment 公告](https://codesignal.com/newsroom/press-releases/codesignal-launches-ai-assisted-coding-assessments-and-interviews-redefining-technical-hiring-in-the-ai-era/)、[定价与产品范围](https://codesignal.com/pricing/)。

CodeSignal 进一步证明“角色定制、自适应 AI Interview 与结构化 Evidence”本身不足以构成差异。OnlyBoth 必须证明：

> Prestige labels 在 Evidence 前被延迟；需求方注意力先被显式容量化并通过公开队列循环；候选人的正式劳动只在该担保存在时发生；真人选择必须因果改变后续 Proof，未履约时对应 Slot 的下一位不能解锁。

### 5.7 功能边界矩阵

“●”表示公开核心能力；“△”表示部分或不明确；“○”表示本文官方资料中未发现。

| 产品 | 候选人付费增曝光/申请 | Evidence 前 Label Veil | AI Interview/技能评估 | 需求方侧 AI Challenge/Coach | Proof 前真人承诺 | 只限制 Active Proof WIP | 真人选择因果改变 Proof | Employer Backpressure/Receipt |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Upwork | ● | ○ | △ | ○ | ○ | ○ | ○ | ○ |
| CoderPad | ○ | ○ | ● | ● | △ | ○ | △ | ○ |
| Alex | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ |
| Koali | ● | ○ | ○ | ○ | ● | △ | ○ | △ |
| HackerRank | ○ | ○ | ● | △ | △ | ○ | △ | ○ |
| CodeSignal | ○ | ○ | ● | △ | ○ | ○ | ○ | ○ |
| **OnlyBoth 目标设计** | **○** | **●** | **●** | **●** | **●** | **●** | **●** | **●** |

OnlyBoth 行表示目标方案，不代表已经实现。矩阵也不能证明市场上绝无类似产品，只用于界定当前检索中最需要守住的制度差异。

---

## 6. 可防守的产品差异

### 6.1 六层协议

1. **Capability / Attention Contract**  
   GPT 将 JD、真实 Ticket、Repo 与最昂贵失败编译成需求方确认的决策不确定性、能力维度、Proof 与 Label Policy。

2. **Label Veil 与 Lightweight Interest Map**  
   必要资格保留；姓名、照片、学校、前雇主品牌、Warm Intro、材料包装和 Candidate Claim 在回答前的 Employer 选择面封存。Interest 只表达意向与确定性硬条件，不消耗高成本劳动。

3. **Blind Answer Review Escrow**  
   Employer 在看不到 Candidate Profile 或 Claim 时先激活可循环 Review Slots、SLA 与 Credit；公开 Queue Scheduler 才能按 Slot 发放 Answer Invitations。

4. **Closed Answer 与回答后分配**  
   平台候选人端不提供 GPT，规则禁止外部 AI；候选人回答已 Seal 的岗位问题。具名 Reviewer 逐份形成 Evidence-linked Receipt 后，才允许 answer-only Direct 与 public-seed Explore。

5. **Demand-side GPT + Causal Human Checkpoint**  
   GPT 私下根据 Stage A Evidence 从预验证 Catalog 推荐三个 Rubric-bound Scenario ID；真人必须选择或在允许参数内修改一个，确定性系统才改变 Stage B 并继续流程。

6. **Evidence / Attention Receipt**  
   GPT 压缩但不评分；最终 Advance、Clarify 或 Close 必须引用 Evidence；Ask Back、违约、Token 与下一位解锁均可重放。

### 6.2 最稳健的市场空白主张

可以说：

> CoderPad 已有真人面试中的实时 AI Coach，Alex 已有自适应 AI Interviewer，Koali 已有限申请池、真人响应保证与违约 Credit 退回。本文核验的公开机制中，尚未发现它们把 Evidence-first Label Veil、Employer-side Attention Escrow、仅限制高成本 Active Proof、候选人无付费竞价、Causal Human Checkpoint、Progressive Reveal 与下一位访问 Backpressure 组合成同一招聘协议。

不要说：

- 市场上没有类似产品；
- 我们发明了 AI 面试；
- 我们发明了面试 Copilot、动态追问或真实代码 Sandbox；
- 我们发明了有限申请池或真人响应 SLA；
- 我们能检测候选人是否使用 AI；
- GPT 可以客观判断人才；
- 每个申请者都会获得注意力；
- 雇主没有损失任何选择权或承担任何新义务。

### 6.3 核心竞争定位

> **AI interview products automate or coach evaluation; Koali guarantees responses by capping paid applications. OnlyBoth changes the order of information and commitment: pedigree is sealed until work evidence exists, a named human review is reserved before formal proof begins, and the next candidate stays locked until the reviewer both changes the proof through a causal checkpoint and records an evidence-linked outcome.**

---

## 7. MVP 与 Demo 建议

### 7.1 只做技术招聘

必须做：

- 需求方自然语言 → Capability Contract；
- 20 人合成 Interest Queue；
- Label Veil：必要资格可见，Prestige labels 在 Evidence 前封存；
- Eligibility Map；
- 8 个可循环 Blind Answer Review Slots 与非 Profile Queue Scheduler；
- 逐份 Human Answer Review Receipt、per-Slot recycling 与 Advancement Cohort barrier；
- 回答后的 1 Direct + 1 Explore Slot；
- Attention Escrow、Answer/Deep WIP、Review Credits、SLA 与 Backpressure；
- 两个平台不提供 Candidate GPT、规则禁止外部 AI 的 Closed Proof；
- 支付重试故障、Stage A 与确定性隐藏测试；
- 一个招聘者私有 GPT Challenge 面板；
- 一个会实际改变 Stage B 的 Human Checkpoint；
- Stage A Evidence Brief 与最终 Evidence Card；
- Ask Back；
- Evidence-linked Advance / Clarify / Close；
- 只对 Mutual Advance 的候选人 Progressive Label Reveal；Close 后标签对 Reviewer 保持封存；
- Receipt 与 Replay。

不做：

- 完整 ATS 或 Marketplace；
- 生产真钱 Bond；MVP 只使用平台 Review Credits；
- AI 作弊概率、绝对第二设备检测或摄像头判断；
- 通用人才分；
- 自动录用/拒绝；
- 完整融资产品；
- 真实敏感招聘数据；
- 把所有 Interest 声称为已获真人 Review；只有 backed Slot 下提交的 Application 获得逐份审核义务。

### 7.2 三分钟证据闭环

| 时间 | 画面 | 证明 |
|---|---|---|
| 0:00–0:07 | Judge-only Counterfactual：传统排序会让强履历 A 获面试、非标准履历 B 被拒；明确标注 Sarah 从未看到此层 | Resume-first 同时产生两类 Prediction error risk |
| 0:07–0:12 | 切入 Sarah 第一次真实访问：姓名、照片、学校、雇主品牌已预先 Seal，只留硬资格 | Label Veil 在 Reviewer Access 前生效，而不是看后再遮 |
| 0:12–0:18 | Sarah 看不到 Candidate Profile，先激活 8 个可循环 Blind Review Slots；公开 Queue Scheduler 才能发出 backed offer | 注意力先于候选人劳动和选择 |
| 0:18–0:30 | 第一份 Review 结算后 Slot 立即服务第9位；加速展示 `8/8 cohort reviewed` 与两个代表性 Deep Proof | 十秒证据反转 + 申请池没有被8个WIP截断 |
| 0:30–0:50 | Rewind：Sarah 提供 JD、Ticket、Repo，GPT 编译 Contract | GPT 在需求方侧减少真实岗位不确定性 |
| 0:50–1:10 | 20 eligible、8 reusable Slots、8 backed offers、12 waiting for next Slot、0 Profile cards | Queue 与有限并发 Review WIP 并存 |
| 1:10–1:45 | 8份匿名 Stage A Answers 与逐份 Review Receipts；Slot 按次循环；Cohort `7/8` 时选择锁定，`8/8` 时解锁 | 每份正式Application必审，Slot不是总名额 |
| 1:45–2:15 | GPT 从预验证 Catalog 为两人分别推荐 Evidence-anchored Scenario ID；Sarah 各选择一个，确定性 Orchestrator 改变两个 Stage B | 每个 Window 都经过真人因果推进 |
| 2:15–2:40 | 两份 Evidence-linked Outcome；Ask Back；仅 Mutual Advance 的候选人 Progressive Reveal | 真人结果与双向互动；Closed Candidate 标签不泄露 |
| 2:40–3:00 | `2 checkpoints + 2 outcomes fulfilled` 后 Token released、Next candidate unlocked、Replay | Escrow、Backpressure 与完整状态闭环 |

### 7.3 Demo 可靠性

- 固定一个支付重试任务和六个测试；
- 保存三个版本化、经验证、难度带固定的 Challenge Catalog Scenario；
- Candidate A 与 B 使用不同但固定的行为路径；
- 两个真实客户端和一个 Reviewer 客户端；
- 所有状态可一键重置；
- 模型失败时加载已验证事件轨迹，但保留真实 API 路径；
- Contract、seed、test run、human action 都有 ID 和时间戳；
- 核心分配和测试可离线重放。

---

## 8. Impact 与验证指标

### 8.1 MVP 能严格证明

| 指标 | 证明方式 |
|---|---|
| Evidence 前在 Reviewer UI 暴露的 Prestige label = 0 | Label policy、Seal event 与 UI 测试；Judge-only 合成 Counterfactual 不属于招聘界面 |
| Unbacked formal proofs = 0 | 没有 Slot 就无法创建 Proof Session |
| WIP 不超发 | 分配约束与状态测试 |
| 每个 Proof 有 Reviewer/SLA/Review Credit | Contract 与 Slot 记录 |
| 平台记录中的 Candidate-side GPT 调用 = 0 | Workspace policy 与网络调用日志；不等于证明房间内无第二设备 |
| Checkpoint 与 Outcome 都是候选人特定的 | Challenge 引用 Evidence ID，Human Choice 决定 Stage B；最终 Outcome 再引用 Evidence |
| Evidence 可验证 | 每项结论引用事件、Diff 或确定性测试 |
| 未履约时下一位在 Remediation Settlement 前不解锁 | Backpressure、通知、补偿、WIP 惩罚与 Slot retire 状态测试 |
| 分配可重放 | Contract、eligible edges、seed、result |
| Candidate 不为 Slot 付费 | 数据模型无 candidate bid |

### 8.2 真实产品仍需验证

- Evidence Card 是否能在几十秒内审阅；
- Reviewer 是否愿意承诺 SLA；
- 候选人是否真的感到获得真人互动；
- Explore Slot 是否发现 Direct 选择会错过的人；
- Label Veil 是否在不隐藏必要资格的前提下改变初始选择；
- 三个 Human-approved Challenge 是否处于同一能力维度和难度带；
- 是否减少无效真人面试；
- Review Credit 与 Backpressure 是否提高履约而不赶走需求方；
- Ask Back 是否增加信任而不过度增加负担。

未经实验不得公布节省比例、准确率或偏见改善数字。

---

## 9. 关键风险

| 风险 | 判断与缓解 |
|---|---|
| 雇主失去海量筛选权 | 不截断 Interest Queue，只限制并循环 Active WIP |
| 流程比扫简历慢 | 优化 time-to-valid-signal，不与五秒钟粗略拒绝比较 |
| 与 CoderPad/Alex/CodeSignal/HackerRank 重叠 | GPT、AI Interview 和 Sandbox 只作组件；主线是 Label Veil、Escrow、Causal Checkpoint 与 Backpressure |
| Koali 已有有限池和真人回复保证 | 不声称发明 Review SLA；强调只限制 Active Proof、候选人不付费、两个真人动作、违约补偿后降低 WIP；避免永久死锁 |
| 候选人仍觉得是做题 | 必须出现真人选择的 Follow-up 与 Ask Back |
| Checkpoint 或 Outcome 被机械点击 | 中途选择必须改变 Stage B；最终动作必须引用 Candidate Evidence；候选人可见、抽样审计 |
| GPT Challenge 难度不一致 | 固定能力 Contract、模板、能力带、测试版本、人工批准与 Replay |
| GPT 证据提取有偏差 | 不输出总分；引用原始行为；人工展开复核 |
| Candidate Prompt Injection | system/rubric/tool 隔离，输入视为不可信 |
| 第二设备 AI 无法完全阻止 | 只保证受控 Workspace 无公网、文件导入与 Candidate GPT；明确 assurance label，不声称 Proven AI-free |
| Label Veil 隐藏有效信息 | 必要资格、诚信事实与实质风险保留；候选人预览、纠错与申诉 |
| Review Credit 增加雇主摩擦 | MVP 使用平台 Credits；按时审核不产生净成本 |
| 就业自动化高风险 | 合成数据、人类决定、正式上线前专业合规审查 |
| 产品过度泛化 | MVP 只做技术招聘，融资只做映射 |

---

## 10. 最终推荐

### 10.1 继续做

1. 使用 Work & Productivity 赛道；
2. 以 Hiring Manager 为主要叙事视角；
3. 以非标准技术候选人作为 Explore 结果；
4. 前 30 秒先展示 `Résumé picked A / Work evidence surfaced B`；
5. 把 Label Veil、Attention Escrow 与“平台不提供 AI、规则禁止外部 AI”的 Closed Proof 做成真实状态；
6. GPT 只在需求方私有侧编译 Contract、从预验证 Catalog 推荐 Challenge 候选项并压缩 Evidence；
7. 把真人选择做成 Stage B 发生的必要因果门；
8. 保留完整 Interest Queue，WIP 只作用于并发正式 Application，并在逐份结算后循环；
9. 公开承认 CoderPad、Alex、Koali、HackerRank 与 CodeSignal 已覆盖相邻原语；
10. 用 Backpressure、Ask Back、Evidence/Attention Receipt 守住协议组合差异。

### 10.2 停止做

1. 不再引用约会、Shared Table、Future Ticket；
2. 不宣传“AI 面试是新发明”；
3. 不宣传“面试 Copilot、动态追问、Sandbox 或真人回复保证是新发明”；
4. 不让 Candidate 在 Closed Proof 中使用 GPT；
5. 不宣传能证明绝对无外部 AI 或第二设备；
6. 不让 GPT 输出人才总分、冒充 Human Action 或自动决策；
7. 不保证所有 Interest 都获真人注意；
8. 不限制需求方完整发现池；
9. 不在主 Demo 同时讲招聘和融资；
10. 不在无实验时虚构时间节省、准确率或偏见改善。

### 10.3 最终 Pitch

> **OnlyBoth hides pedigree until work evidence exists and makes employers reserve a named human review before candidates are allowed to prove themselves. GPT privately recommends a versioned challenge and compresses the evidence; it never supplies the candidate’s answer or impersonates the reviewer. No reserved reviewer, no candidate labor. No completed checkpoint and outcome, no next candidate.**

---

## 11. 来源索引

### OpenAI Build Week

- [赛事主页](https://openai.devpost.com/)
- [Official Rules](https://openai.devpost.com/rules)
- [Official FAQ](https://openai.devpost.com/details/faqs)

### Winner Benchmark

- [OpenAI Open Model Hackathon Winners](https://openai2025.devpost.com/updates/37529-and-the-winners-are)
- [RoboChef](https://devpost.com/software/robochef-gpt-oss-powered-kitchen-assistant)
- [A Printer for Smell](https://devpost.com/software/a-printer-for-smell-ai-scent-songs)
- [Memory Palace](https://devpost.com/software/memory-palace-qyat7g)
- [Google Gemini Competition Winners](https://developers.googleblog.com/announcing-the-winners-of-the-gemini-api-developer-competition/)
- [ElevenLabs Worldwide Hackathon Winners](https://elevenlabs.io/blog/announcing-the-winners-of-the-elevenlabs-worldwide-hackathon)
- [Microsoft AI Agents Hackathon Winners](https://microsoft.github.io/AI_Agents_Hackathon/winners/)
- [Microsoft Agents League Winners](https://techcommunity.microsoft.com/blog/azuredevcommunityblog/agents-league-meet-the-winners/4507503)

### 新竞品

- [Upwork Connects](https://support.upwork.com/hc/en-us/articles/211062898-Understanding-and-using-Connects)
- [Upwork Boosted Proposals](https://support.upwork.com/hc/en-us/articles/4406541109011-What-are-Boosted-Proposals-on-Upwork)
- [Upwork Boost 机制](https://support.upwork.com/hc/en-us/articles/4406395531795-How-to-boost-your-proposal)
- [CoderPad AI Interview Coach](https://coderpad.io/features/ai-interview-coach/)
- [CoderPad AI Interview Designer](https://coderpad.io/features/ai-interview-designer/)
- [Alex Platform](https://www.alex.com/platform)
- [Koali](https://www.koali.ca/)
- [HackerRank Interview](https://www.hackerrank.com/products/interview)
- [HackerRank Developer Skills Platform](https://www.hackerrank.com/products/developer-skills-platform)
- [CodeSignal](https://codesignal.com/)
- [CodeSignal AI-assisted Assessment](https://codesignal.com/newsroom/press-releases/codesignal-launches-ai-assisted-coding-assessments-and-interviews-redefining-technical-hiring-in-the-ai-era/)
- [CodeSignal Pricing and Product Scope](https://codesignal.com/pricing/)

---

## 附录 A：评审问答

### “这不就是 Upwork？”

Upwork 允许 Freelancer 使用 Connects 提交和 Boost Proposal，提高进入客户视野的机会。OnlyBoth 不建立完整零工市场，也不让应征方购买排序；它要求需求方先预留 Review-backed Active Window，正式 Proof 才能发生，并要求中途 Checkpoint 与最终 Evidence-linked Outcome 都完成后才正常释放 Slot。

### “这不就是 CoderPad？”

CoderPad 已经把实时 AI Coach、代码感知提示、Tailored Follow-up 和 Rubric Coverage 放进真人技术面试；这些都不是 OnlyBoth 的原创。OnlyBoth 处理的是进入评估之前和之后的协议：Prestige labels 在 Evidence 前封存，正式 Proof 前锁定具名 Reviewer，真人选择必须实际改变 Stage B；最终 Outcome 完成后 Window 才正常结算，违约则必须先完成 Remediation Settlement。

### “这不就是 Alex 或 CodeSignal 的 AI Interviewer？”

Alex 与 CodeSignal 已证明自适应 AI Interview、角色定制和结构化结果可以规模化。OnlyBoth 不让 GPT 代替 Reviewer，也不让 GPT 帮 Candidate 作答；GPT 私下准备需求方判断，真人选择才会成为候选人可见、会推进状态的动作。

### “这不就是 Koali？”

Koali 已有有限申请池、真人 Review、响应 SLA 和违约 Credit 退回。OnlyBoth 不声称发明这些原语：Koali 限制整个付费 Application Pool；OnlyBoth 保持轻量 Interest Queue 可大，让需求方的 Review Slot 按次结算并循环，候选人不能购买 Attention；中途真人动作必须因果改变 Candidate Proof，违约会在 Remediation Settlement 前冻结对应 Slot 并降低后续 WIP。

### “这不就是 HackerRank？”

HackerRank 已经能做真实 Repo、Agentic IDE、技术 Screen、真人 Interview、Integrity Signal 和结构化报告。OnlyBoth 不把评估环境本身当原创；Closed Proof 只是验证组件，主张仍是 Label Veil、Attention Escrow、Causal Human Checkpoint 与 Backpressure 的组合。

### “雇主是否失去候选池和筛选权？”

Employer 保留最终录用权，也保留在匿名回答证据中的 Direct 选择权；但它明确放弃回答前基于 Profile、Claim 或材料包装挑选 Candidate 或重排 Queue 的权力。Interest Queue 可以很大；每个可循环 Slot 只接受一份已经有 Review Credit 支撑的 Application，结算后服务下一位，避免候选人劳动无限堆积又避免把WIP变成总申请上限。

### “如何证明需求方真的看过？”

打开页面不算。每份已抵押并提交的匿名回答都必须由具名 Reviewer 提交引用当前 Evidence 的 `HumanAnswerReview` Receipt；每个 Receipt 结算后对应 Slot 服务下一位。当前 Advancement Cohort 的全部必需 Receipts 完成前 Direct / Explore 锁定。进入 Stage B 后，需求方还必须选择会实际改变 Proof 的 Challenge，最终 Outcome 也必须引用 Evidence。动作、时间、Evidence ID、Challenge ID 和结果进入 Attention Receipt。

### “候选人偷偷使用外部 AI 怎么办？”

Closed Proof 内 Candidate-side AI 禁止。平台可以保证受控 Workspace 无公网、无 Candidate GPT、无文件导入，并记录代码、命令、Diff 与测试；纯远程环境不能证明房间里没有手机或第二台设备。因此产品只标记“在已披露策略的受控远程工作区完成”，不标记“Proven AI-free”，也不输出 AI 作弊概率。

### “GPT 会不会产生偏见或乱打分？”

GPT 不输出人才总分，也不做最终决定。能力维度由需求方确认；Evidence 必须引用行为或工具；Prestige labels 在 Evidence 前封存，必要资格与实质风险保留；真人可以展开原始证据复核。

### “为什么 Direct 与 Explore 要并存？”

Direct 与 Explore 都发生在回答之后。Direct 保留需求方根据匿名工作证据主动选择的权力；Explore 从同批剩余有效回答中按公开 Seed 选择，用更深 Proof 检查一次人类回答判断可能遗漏的信号。两者都不能读取履历标签或 Candidate Claim。

### “为什么不保证所有人都获得注意力？”

真人注意力是有限资源。产品能保证的是：没有预留 Review 就不要求高成本 Proof；一旦进入 Proof，就必须获得有期限、可追责的人类动作。

### “为什么 Demo 只做招聘，不同时做融资？”

当前 MVP 只做技术招聘，因为真实 Ticket、Repo、受控 Closed Proof 与确定性测试能形成最强三分钟闭环。融资不是当前主产品或 Demo 主张；只有招聘机制成立后，才评估是否能迁移同一注意力协议。
