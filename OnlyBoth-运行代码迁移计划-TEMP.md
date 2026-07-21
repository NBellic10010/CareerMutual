# OnlyBoth 运行代码迁移计划（TEMP）

## Rolling blind-review runtime cutover

**状态：** 临时实施规格，不是新的产品权威来源；Answer/Review/AI Analyst cutover 已完成，Advancement cutover 待完成
**版本：** 0.4
**日期：** 2026-07-20  
**删除条件：** 目标纵向链路通过 PostgreSQL、角色隔离 Playwright、Replay、离线 Demo 与安全验收，并且 `HANDOFF.md` 已记录完成状态后删除或归档。  
**优先级：** 如本文与 `AGENTS.md`、`OnlyBoth-产品精神.md`、`OnlyBoth-产品方案.md`、`OnlyBoth-工程设计.md` 或 `OnlyBoth-AI工程设计.md` 冲突，以前述权威文档为准。

---

## 1. 迁移目标

历史回归代码仍保留 legacy Claim-first 顺序：

```text
Candidate Interest + Claim Snapshot
→ typed Eligibility
→ GPT buildMatchEdge
→ Sarah chooses Candidate as Direct
→ deterministic Explore
→ Attention reservation
→ Candidate Stage A
→ Challenge / Stage B
```

主 `/candidate` 与 `/employer` 入口已经切换到：

```text
persistent synthetic SessionActor
→ PostgreSQL JobPost discovery
→ free Interest / deterministic Queue
→ backed reusable AnswerReviewSlot
→ versioned declarations + Candidate Credit consume
→ server-timed rich text / Voice Memo / disclosed platform GPT
→ private Object Storage + immutable AnswerSubmission
→ earliest-only anonymous Employer review
→ evidence-linked HumanAnswerReview
→ per-Slot settlement / next-offer request
```

这条链已经通过角色隔离 Playwright、PostgreSQL 事务与 MinIO 集成验收。Candidate Credit 只在
Backed Offer Accept 时消耗，不参与排序；Employer Review SLA 超时会退还 Candidate Credit、罚没
Employer Hold、记录 reliability penalty 并退休 Slot。`/prototype` 不再是主入口或验收替代。

`buildAnswerEvidenceEdge` 已作为可选 Employer Evidence Analyst cut over 到不可变 Submission、
`AnswerProcessEvidence@2` 行为严重度、Good/Bad Answer 与语言分析、Outbox Worker 与 Employer
Review Projection。历史 `@1` 不追溯分类。尚未 cut over 的是
`ADVANCE_ELIGIBLE → Resume Reveal pagination → Advancement Allocation → Deep Proof → Challenge`；legacy Matching/Golden
Challenge 只能继续作为历史回归资产。

旧的 answer-first 迁移草案仍有一个关键错误：它把八个 Answer Review Slots 当成一次性八人名额，从二十个 Interest 中先分配八个 Invitation，其余十二人长期停在 Capacity waitlist。这虽然不按履历筛选，却仍然在 Candidate 产生证据前制造“会被看到”和“不会被看到”的分界。

本迁移改为唯一活动态产品链路：

```text
Public Opportunity discovery
→ lightweight Candidate Interest + receipt
→ deterministic hard Eligibility
→ public non-profile Interest Queue
→ Sarah activates 8 reusable Answer Review Slots
→ each AVAILABLE Slot offers the next eligible Interest
→ Candidate accepts the full sealed work packet
→ Recorded Stage A Answer / immutable Application
→ GPT drafts AnswerEvidenceEdge from recorded work
→ Sarah records one HumanAnswerReview
→ that Obligation settles and the same Slot serves the next queued Interest
→ reviewed Answer joins an 8-answer Advancement Cohort
→ Cohort barrier opens only after 8/8 Reviews
→ Sarah advances one anonymous Answer as Direct
→ public-seed code selects Explore from the same Cohort
→ Deep Proof Slots + Credit Holds + ReviewWindows
→ existing Challenge recommendation / authorization / Stage B
```

迁移不是把 `Choose as Direct` 改名，也不是把随机分配包装成公平筛选。它同时改变两个因果边界：

1. 正式 Application 只有在具名审核义务已经抵押时才允许发生；
2. Slot 是可循环并发 WIP，不是岗位生命周期内的总 Applicant cap。

---

## 2. 术语与不可混淆边界

```text
Interest
= low-cost registration + queue receipt + closure receipt
≠ Application
≠ individual human review
≠ ability judgment

Application
= submitted Answer under a held named-review obligation
= Human Review Receipt or Employer Breach

AnswerReviewSlot
= reusable concurrent debt capacity
≠ permanently assigned Candidate seat
≠ total application quota

AdvancementCohort
= reviewed Answers grouped for post-answer comparison
≠ invitation pool
≠ Slot owner
```

服务端不变量：

```text
No held blind-review obligation → No candidate answer
No recorded answer evidence → No candidate selection
No completed cohort reviews → No Direct / Explore allocation
No work evidence → No pedigree reveal
No settled human obligation → That review Slot cannot serve the next candidate
```

第一层 Slot Settlement 与 Cohort barrier 必须解耦。第一个 Answer Review 完成后，第一个 Slot 就服务下一位 Interest；不能等到 `8/8` 才批量释放八个 Slot。

---

## 3. 完成边界

### 3.1 本迁移必须完成

- Candidate 可以浏览公开 Opportunity、表达低成本 Interest，并获得版本化 Queue Receipt；
- 没有可用 backed Slot 时，UI 只允许 `Register interest`，不允许提交 Answer 或声称 Application 已接受；
- Employer 在 Candidate 回答前收不到 Candidate Card、Claim、Profile、MatchEdge 或 GPT rationale；
- Sarah 真实执行 `ActivateBlindReviewCommitment`，原子建立八个可循环 Answer Review Slots 与 Credit policy；
- Queue Scheduler 在不读取 Profile、Claim、Private Label、Employer preference 或 AI Output 的情况下，为每个 AVAILABLE Slot 发放一个 backed offer；
- Answer 通过真实 Application Command 进入不可变 PostgreSQL manifest 与 private Object Storage；
- `buildAnswerEvidenceEdge` 只消费已记录 Answer Evidence；
- Sarah 为每份提交的 Application 形成具名、Evidence-linked `HumanAnswerReview` Receipt；
- 第一个 Review Settlement 原子释放 Slot，并向第九位 Interest 发出新的 backed offer；
- `7/8` Cohort reviews 时服务端拒绝 Direct/Explore，`8/8` 时才允许；
- Sarah 从已盲审通过的 Answer 集合选择 Direct；Allocation DTO 只引用 Answer Evidence，不接收
  Resume score / AI rank；Explore 从同一 Cohort 剩余有效 Answer 中确定性产生；
- 两个 Deep Proof ReviewWindows、两个 Credit Holds、Allocation、Event、Outbox 和 Receipt 原子提交；
- Golden Replay 只固定 GPT、Sandbox 与 Verifier 外部输入，不预写人类授权、Review Receipt 或 Slot handoff；
- legacy `reserve-attention` Web API、Employer UI 和 active Worker composition 不再能够执行回答前 Candidate selection。

### 3.2 本迁移不借机扩大

- 不引入微服务、Kafka、向量数据库、Agent 或 WebSocket；
- 不实现 Candidate 付费 Bid、Boost 或核心 Reach；
- 不引入现金、区块链或可交易 Token；
- 不声称所有 Interest 一定在 Opportunity 关闭前获得 Slot；
- 不声称 Interest 已经获得个体人工判断；
- 不把 `compileContract`、`compressEvidence`、生产 IdP 或真实 Docker Verifier 变成本次 cutover 的前置条件；
- 不为 legacy MatchEdge 增加新功能。
- 不把 Candidate Application Credit 实现为 Bid、Boost、Employer 可见权重或队列排序输入。

---

## 4. Candidate 可见性与队列体验

Candidate 可见性使用独立 Projection，不使用一个宽 DTO 再由前端隐藏字段。

### 4.1 Public Opportunity

```text
opportunity_ref
title
organization_public_name
public_role_summary
employment_type
seniority_band
compensation_range
location_and_work_mode
public_hard_requirements
capability_area_preview
proof_format
maximum_candidate_minutes
candidate_ai_policy
human_review_sla
review_capacity_status
interest_status
```

Public Projection 不包含精确 Sealed Question、Starter Repo、Ticket、Tests、Stage B Challenge、其他 Candidate、Candidate ranking 或 GPT fit rationale。

接口：

```text
GET  /api/v1/candidate/opportunities
GET  /api/v1/candidate/opportunities/:id/public
POST /api/v1/opportunities/:id/interests
```

### 4.2 Interest Queue

Interest 只提交必要 hard facts 与 consent version，不要求 Cover Letter 或 Candidate Claim。状态：

```text
INTEREST_RECEIVED
INELIGIBLE_HARD_REQUIREMENT
WAITING_FOR_BACKED_SLOT
BACKED_OFFERED
OPPORTUNITY_PAUSED
OPPORTUNITY_CLOSED
```

Candidate 可以看到：

```text
queue_policy_version
own_queue_status
eligible_interests_ahead
commitment_status
last_status_change_at
offer_expiry_if_any
closure_receipt_if_closed
```

Candidate 看不到其他人的身份、Profile、Answer 或 Employer-only数据。`eligible_interests_ahead` 是队列解释，不是能力排名。

### 4.3 Backed Offer 与 Application

只有对应 Slot、Reviewer、SLA 和 `CreditHold=HELD` 成立后，Candidate 才在 Accept 前获得完整工作包：

```text
named reviewer
review obligation and SLA
held Credit reference
exact sealed JD question
question version and hash
allowed assumptions
starter repo / ticket
visible tests
effort limit
workspace and monitoring boundaries
Candidate AI policy
decline-without-penalty notice
```

Accept 后可以开始 Answer。Decline/Offer Expiry 返还 Hold、释放 Activity Lease，并让 Slot 服务队列下一位；不产生 Candidate Failure。

Interest 免费。Accept 还必须记录 `terms_version`、`ai_disclosure_version` 与条件 Resume Reveal
consent，并在同一事务把 Candidate Application Credit `3→2` 后创建 AnswerSession。该 Credit
不进入 Employer Projection 或 Queue policy。平台故障和 Employer Review Breach 退还；Candidate
开始后自行放弃或空白超时不退还。

当前 Answer Workspace 使用 TipTap JSON、MediaRecorder Voice Memo、两秒/失焦 autosave 与
Worker-only disclosed GPT Sidecar。Sidecar 只有在 Contract 为 `PLATFORM_ASSISTANT_ALLOWED` 时
运行；浏览器无 Key，模型无 tools/web/files/submit，完整 `GPT_TRACE` 与原始音频/派生 Transcript
一起 Seal。未披露的外部 AI 仍被禁止。

### 4.4 Submitted、reviewed 与 Deep Proof

Candidate 只能看到自己的 Answer Snapshot、Artifact refs、review deadline、Human Review Receipt、Evidence、`still_unknown` 和后续 Challenge/Outcome。Candidate 不接收 Cohort pool、其他 Answer、`DIRECT | EXPLORE`、Employer internal Candidate ref 或 Counterfactual labels。

如果 Candidate 在 Backed Offer 时接受版本化条件 Reveal，同一 Resume Snapshot 被固定并保持封存，直到：

```text
anonymous Human Answer Review complete
→ Human decision = ADVANCE_ELIGIBLE
→ Human Review Receipt + Resume Reveal Authorization committed atomically
→ reviewer-scoped, one-Candidate-per-page Resume workspace
```

`NO_FURTHER_PROOF`、`INCONCLUSIVE`、撤回、Breach 与 Platform Abort 不 Reveal。迁移 0012 和
`RecordFunctionalHumanReview` 已实现此边界：接受 Offer 时 pin Snapshot，`ADVANCE_ELIGIBLE` 时在
同一 PostgreSQL 事务写入 Reveal。后续 Deep Proof 不再是首次 Resume Reveal 的前置条件。

---

## 5. Target Contracts

在 `packages/contracts` 增加 strict、版本化 Schema：

```text
public-opportunity-projection@1
candidate-interest-command@1
candidate-interest-receipt@1
activate-blind-review-commitment-command@1
blind-review-commitment-receipt@1
backed-answer-offer@1
answer-invitation-decision-command@1
answer-invitation-decision-receipt@1
submit-blind-answer-command@1
blind-answer-submission-receipt@1
build-answer-evidence-edge-input@1
answer-evidence-edge-draft@1
human-answer-review-command@1
human-answer-review-receipt@1
answer-review-settlement-receipt@1
advancement-cohort-projection@1
allocate-post-answer-advancement-command@1
post-answer-advancement-receipt@1
employer-blind-review-projection@2
candidate-opportunity-projection@3
opportunity-closure-receipt@1
```

`HumanAnswerReview` 决策：

```text
ADVANCE_ELIGIBLE
NO_FURTHER_PROOF
INCONCLUSIVE
```

它们只描述本次 Answer 是否值得继续验证，不等于 Hire、Reject、人才分数或长期能力预测。

---

## 6. Target Domain

在 `packages/domain/src/blind-answer/` 新增纯领域模块：

```text
BlindReviewCommitment
InterestQueue
AnswerReviewSlot
AnswerReviewObligation
AnswerInvitation
AnswerSubmission
AnswerEvidenceEdge
HumanAnswerReview
AdvancementCohort
AdvancementCohortSeat
AdvancementAllocation
CandidateActivityLease
```

`BlindReviewCommitment`：

```text
DRAFT → ACTIVE ↔ PAUSED → CLOSING → CLOSED
                  └──────→ SUSPENDED
```

只有 `ACTIVE` Commitment 发出新 Offer。Pause/Close 不能取消已经进入 `ANSWER_ACTIVE | REVIEW_PENDING` 的义务。

`AnswerReviewSlot`：

```text
AVAILABLE
→ OFFERED
→ ANSWER_ACTIVE
→ REVIEW_PENDING
→ SETTLING
→ AVAILABLE

REVIEW_PENDING → BREACHED → REMEDIATING → RETIRED
OFFERED → AVAILABLE: declineOrExpiry
ANSWER_ACTIVE → AVAILABLE: withdrawalOrPlatformAbortSettlement
```

`AnswerReviewObligation` 是 Slot 与 Candidate 的一次性绑定：

```text
INVITED → ANSWER_ACTIVE → REVIEW_PENDING → REVIEWED → SETTLED
```

终止路径结构化区分 Candidate Decline、Expiry、Withdrawal、Employer Breach 与 Platform Abort。

`AdvancementCohort`：

```text
COLLECTING → REVIEWING → READY_FOR_ADVANCEMENT → ALLOCATED
                         └──────────────────────→ CLOSED_NO_ALLOCATION
```

Cohort 只引用已提交、已审核的 Answer。Cohort 状态不拥有 Answer Review Slot，不能阻止 Slot 循环。

`AdvancementCohortSeat` 在 backed Offer 创建时固定：

```text
OPEN → RESERVED → ANSWER_SUBMITTED → REVIEWED
         └──────→ OPEN: declineOrOfferExpiryBeforeAnswer
```

前八个 Offer 进入 Cohort 1；第一个 Review 结算后，第九位 Interest 的新 Offer 必须进入 Cohort 2，即使 Cohort 1 尚未 `8/8`。Submitted 后 Seat、Obligation 与 Cohort 不可变，保证 Worker 完成顺序不改变比较组。

目标 `ReviewWindow` 从回答后的 Deep Proof 开始：

```text
RESERVED
→ CHECKPOINT_PENDING: selected Candidate accepts Deep Proof
→ STAGE_B_ACTIVE: Sarah selects Challenge
```

它 pin：

```text
answer_submission_id
answer_evidence_edge_id
stage_a_snapshot_id
advancement_cohort_id
contract_version_id
label_policy_version_id
proof_template_version_id
challenge_catalog_version_id
reviewer_id
```

---

## 7. PostgreSQL Migration

新增 `packages/db/migrations/0003_blind_answer_first.sql` 与显式 down migration；不改写已经执行的 `0001/0002`。

新增表：

```text
blind_review_commitments
answer_review_slots
answer_review_obligations
answer_invitations
answer_sessions
answer_submissions
answer_evidence_edges
human_answer_reviews
advancement_cohorts
advancement_cohort_seats
advancement_allocations
candidate_activity_leases
public_opportunity_projections
employer_blind_review_projections
candidate_answer_projections
blind_review_command_receipts
opportunity_closure_receipts
```

扩展：

- `candidate_interests` 增加 eligibility/queue timestamps、status、closure ref；
- `hiring_intelligence_requests` 增加 `buildAnswerEvidenceEdge`、Commitment、Cohort、Question 和 Answer pins；
- `stage_a_evidence` 支持 `answer_submission_ref`；
- `review_windows` 增加 Cohort、Allocation、AnswerSubmission 和 AnswerEvidenceEdge refs；
- `credit_holds` 增加 `ANSWER_REVIEW | DEEP_PROOF` purpose 与 subject ref；
- `attention_commitments` 增加 Answer Review WIP、Queue policy、review SLA、per-answer Credit 和 status。

数据库约束：

- 一个 Slot 同时最多一个未结算 Obligation；
- 一个 Invitation 最多一个 immutable AnswerSubmission；
- 一个 Answer 最多一个当前 HumanAnswerReview；
- AnswerSubmission、AnswerEvidenceEdge、HumanAnswerReview、submitted Cohort Seat membership 与 AdvancementAllocation immutable；
- 一个 Candidate 跨岗位最多一个 Active Answer 或 ReviewWindow；
- 一个 Answer 最多进入一个当前 AdvancementAllocation；
- Slot 从 `SETTLING` 回到 `AVAILABLE` 与 Settlement Receipt、Credit return、Event、Outbox 在一个事务；
- Cohort READY 不得锁定 Slot 行；
- legacy ReviewWindow refs 与 target Answer-first refs 使用明确二选一 CHECK；
- Event、Aggregate、Credit、Outbox、Projection 与 Command Receipt 全成或全败。

Demo Credit Policy：

```text
1 Credit × 8 concurrent reusable Answer Review Slots
10 Credits × 2 Deep Proof Windows
```

第一层 Credit 按 Obligation 结算并立即循环，不等待 Cohort。Deep Proof 使用独立 Hold，不复用尚未结算的 Answer Review Hold。

---

## 8. Queue Policy

默认版本：

```text
onlyboth.interest-queue@1

eligible candidates =
  hard eligible
  + status WAITING_FOR_BACKED_SLOT
  - active CandidateActivityLease
  - expired or withdrawn Interest

order =
  ascending eligible_at
  then ascending interest_created_at
  then ascending sha256(seed | opportunity_ref | candidate_ref)
  then ascending candidate_ref
```

Scheduler 禁止读取 Candidate Claim、Profile、Private Label、MatchEdge、AI Output、Referral 或 Employer preference。公开 seed、policy version、input snapshot hash 与 selected opaque Candidate ref 写入事件。

Queue 不承诺每个 Interest 在岗位关闭前一定获得 Slot。它承诺：Opportunity 保持 ACTIVE 时，每个结算 Slot 继续处理下一位；Employer 不能挑选、插队或静默停止。关闭需要显式 `CloseOpportunityIntake` Command 与等待者 Closure Receipts。

---

## 9. Application Commands 与事务

### 9.1 `SubmitCandidateInterest`

验证 Opportunity 接受 Interest、Candidate Session、hard-fact Schema 与 consent；原子写 Interest、Eligibility Job、Event、Outbox 与 Candidate Projection。Interest 不创建 Answer Session，也不调用 GPT。

### 9.2 `ActivateBlindReviewCommitment`

```text
lock Opportunity + AttentionCommitment + CreditAccount
→ authenticate named Reviewer
→ validate expected versions
→ create/update ACTIVE BlindReviewCommitment
→ create 8 reusable AVAILABLE AnswerReviewSlots
→ reserve Slot Credit policy
→ append BlindReviewCommitmentActivated
→ enqueue OfferNextQueuedInterest once per AVAILABLE Slot
→ persist Receipt
```

Demo reset 不得预写 Commitment、Slots、Holds 或 Invitations。

### 9.3 `OfferNextQueuedInterest`

Worker 使用 Queue Policy 选择下一位。事务：

```text
lock one AVAILABLE Slot
→ lock next eligible Interest under policy snapshot
→ reserve the earliest OPEN AdvancementCohortSeat; create the next Cohort if needed
→ acquire CandidateActivityLease
→ create AnswerReviewObligation + CreditHold + Invitation
→ transition Slot AVAILABLE → OFFERED
→ transition Interest WAITING_FOR_BACKED_SLOT → BACKED_OFFERED
→ append Event + Outbox + projections
```

没有候选人时 Slot 保持 AVAILABLE；不是错误。

### 9.4 `AcceptAnswerInvitation` / `DeclineAnswerInvitation`

Accept 验证 Reviewer、Slot、SLA、Hold、deadline 与 `Q_i=1`，创建 AnswerSession。Decline/Expiry 原子返还 Hold、释放 Lease、恢复 Slot，并 enqueue 下一位 Offer；不产生 Candidate Failure。

### 9.5 `SubmitBlindAnswer`

```text
AnswerInvitationAccepted
→ AnswerSession
→ Replay/Docker Sandbox
→ SubmitBlindAnswer
→ immutable AnswerSubmission + Stage A Evidence
→ AnswerSubmitted
→ buildAnswerEvidenceEdge Outbox
```

Sandbox 重试耗尽执行 `PlatformAbortAnswer`，返还资源且不记录 Employer Breach 或 Candidate Failure。

### 9.6 `RecordHumanAnswerReview`

每张匿名 Answer Card 独立执行：

```text
authenticate Sarah + CSRF
→ lock Obligation + Slot + Hold
→ validate expected versions and deadline
→ validate Evidence refs belong to this Answer
→ create immutable HumanAnswerReview
→ settle Obligation and return Credit
→ transition Slot to AVAILABLE
→ append HumanAnswerReviewed + AnswerReviewSettled
→ enqueue OfferNextQueuedInterest for this Slot
→ mark the Invitation's pinned AdvancementCohortSeat REVIEWED
→ update projections + Receipt
```

同一事务不得直接替下一位创建 Invitation，以避免同时锁定 Review 与 Queue 大集合；Outbox Worker 幂等执行下一位 Offer。业务上 Slot 已 AVAILABLE，不受 Cohort barrier 影响。下一位 Offer 预留下一个 Cohort Seat，因此 Candidate 09 属于 Cohort 2，不会因 Cohort 1 尚未完成而进入错误比较组。

不提供 bulk review endpoint。Page view、scroll、AI Draft、默认选择或通用模板不能完成 Command。

### 9.7 `AllocatePostAnswerAdvancement`

事务验证：

- Cohort 为 `READY_FOR_ADVANCEMENT`；
- Direct 属于该 Cohort、已提交、已审核且 `ADVANCE_ELIGIBLE`；
- Explore pool 只包含该 Cohort 剩余 `ADVANCE_ELIGIBLE` Answer；
- Candidate 没有其他 Active lease；
- 两个 Deep Proof Slots 与 Credits 可用。

随后原子创建 Allocation、Decisions、两个 Deep Proof Holds、两个 ReviewWindows、Activity Leases、Events、Outbox、Projections 与 Receipt。

### 9.8 `PauseBlindReviewCommitment` / `CloseOpportunityIntake`

Pause 只停止新 Offer。Close 必须：

```text
show queued Interest count to Employer
→ require explicit expected version and closure reason
→ stop new Interest and Offer creation
→ preserve every active Obligation
→ create one Closure Receipt per still-waiting Interest
→ make Candidate Projection explicit: no Application was submitted, no ability judgment exists
```

---

## 10. AI Runtime Cutover

主 `HiringIntelligencePort`：

```ts
interface HiringIntelligencePort {
  compileContract(input: CompileContractInput): Promise<ContractDraft>;
  buildAnswerEvidenceEdge(
    input: BuildAnswerEvidenceEdgeInputV1,
  ): Promise<AnswerEvidenceEdgeDraftV1>;
  recommendChallenges(input: RecommendChallengesInput): Promise<ChallengeRecommendation>;
  compressEvidence(input: CompressEvidenceInput): Promise<EvidenceCardDraft>;
}
```

`buildMatchEdge` 移入 `legacy/`；active Worker 不创建 `MatchEdgeWorker`。

当前 `buildAnswerEvidenceEdge` Assembler 只读取 Sealed Contract/Question/Review Criteria、不可变
最终 Answer、Voice Transcript、披露式 GPT Trace，以及 Policy 为 `ANSWER_PLUS_PROCESS` 时的
确定性 Process Evidence。Composition root 不注入 Candidate Claim、Focus Activity Repository、
Résumé 或 Private Label Repository。AI Request 在 `REVIEW_PENDING` 创建；Human Review 已存在时
直接 `SUPERSEDED`，且不能阻塞 Slot settlement。

后置校验：

- 每条 sealed Criterion 恰好一个四态 Finding；
- output refs 全部属于 input allowlist，exact quote 在冻结 Source 中唯一解析；
- Summary、Good/Bad Verdict、Language Finding 与 Criterion 不得引用 Process Source；
- Contract、Question、Answer Submission pins 未变化；
- 无 Candidate-wide score、rank、Hire/Reject、Direct/Explore、Queue decision、推进建议、
  作弊/诚信/人格推断或可执行内容；允许仅针对当前 sealed Answer 的 Good/Bad Verdict 与四项
  source-linked language findings。

AI Output 不能更新 Queue、Slot、Review、Cohort barrier 或 Allocation。LIVE 失败绝不切换 Golden。

---

## 11. API 与 Role Projections

新增：

```text
GET  /api/v1/candidate/opportunities
GET  /api/v1/candidate/opportunities/:id/public
POST /api/v1/opportunities/:id/interests
POST /api/v1/opportunities/:id/blind-review-commitments/activate
POST /api/v1/opportunities/:id/blind-review-commitments/pause
POST /api/v1/opportunities/:id/intake/close
GET  /api/v1/employer/opportunities/:id/blind-review-commitment
POST /api/v1/answer-invitations/:id/accept
POST /api/v1/answer-invitations/:id/decline
POST /api/v1/answer-invitations/:id/submit
POST /api/v1/answer-review-obligations/:id/review
POST /api/v1/advancement-cohorts/:id/allocate
```

继续复用现有 ReviewWindow Challenge APIs。所有 Command 使用角色 Session、CSRF、Idempotency-Key、expected version、数据库时间与版本化 Receipt。

Employer pre-answer Projection：

```text
20 hard eligible Interests
8 reusable review Slots
8 backed offers active
12 waiting for next backed Slot
0 accepted Applications without a review Hold
Candidate profiles unavailable
Queue policy onlyboth.interest-queue@1
```

回答后显示匿名 Answer Cards、每 Slot settlement/handoff 和 Cohort progress：

```text
Slot 1 review settled → next queued Interest offered
7/8 cohort reviews — selection locked
8/8 cohort reviews — selection unlocked
```

CTA 是 `Advance this anonymous answer`。必须移除 `Choose as Direct`、`Proofable Candidate`、`Validated MatchEdge` 和 pre-answer Candidate cards。

Candidate Projection V3：

```text
INTEREST_RECEIVED
WAITING_FOR_BACKED_SLOT
BACKED_OFFERED
ANSWER_ACTIVE
REVIEW_PENDING
REVIEWED
DEEP_PROOF_RESERVED
CHECKPOINT_PENDING
STAGE_B_ACTIVE
OPPORTUNITY_PAUSED
OPPORTUNITY_CLOSED
RELEASED
PLATFORM_ABORT
```

---

## 12. Challenge Chain、Worker 与 Replay

回答后 Allocation 创建 ReviewWindow，pin AnswerSubmission、AnswerEvidenceEdge、Cohort 与 Stage A Snapshot。Deep Proof Accept 后复用：

```text
RESERVED
→ CHECKPOINT_PENDING
→ recommendChallenges
→ Sarah SelectHumanChallenge
→ STAGE_B_ACTIVE
```

Worker 顺序：

```text
EligibilityWorker
→ InterestQueueWorker
→ BlindAnswerReplayWorker / SandboxWorker
→ AnswerEvidenceEdgeWorker
→ AnswerReviewSlaWorker
→ AdvancementCohortProjector
→ ChallengeRecommendationWorker
→ StageBReplayWorker
→ Settlement / Remediation Worker
```

新 `demo:reset:matching` 只创建起始事实：Opportunity、sealed Contract/Question/Policy、Attention policy、Credit Account、20 Interests/hard facts、Interest Events/Outbox 与 Judge-only synthetic labels。

Reset 不得创建 Commitment、Slot、Hold、Invitation、Answer、Review、Cohort、Allocation、ReviewWindow 或 HumanChallenge。

Golden 可以预加载 Candidate Answer、GPT、Sandbox 与 Verifier 外部结果，但以下必须现场执行：

```text
ActivateBlindReviewCommitment
BackedAnswerOfferCreated
Candidate Accept / Submit
HumanAnswerReviewed
AnswerReviewSettled
NextQueuedInterestOffered
AdvancementAllocation
HumanChallengeSelected
```

默认 Demo 目标：

```text
20 hard eligible Interests
8 reusable Answer Review Slots
first 8 backed offers
12 WAITING_FOR_BACKED_SLOT initially
8 immutable Answers in Cohort 1
8 HumanAnswerReview Receipts
after first Receipt: Candidate 09 receives the recycled Slot offer
Direct  → Blind Answer 42
Explore → Blind Answer 17
Answer 42 → Redis failover
Answer 17 → Duplicate webhook
```

---

## 13. Legacy Cutover

采用 additive migration + single active path：

1. 新 Domain、Schema、migration 与测试先和 legacy 并存；
2. 新 vertical 未验收前，README/HANDOFF 明确 runtime legacy；
3. 通过后一次性切换 Routes、Worker composition 与 role projections；
4. active runtime 不用 feature flag 同时开放两种产品语义；
5. legacy MatchEdge data 暂时只读用于 regression；
6. 删除旧 Employer E2E 行为期望，保留安全与原子性覆盖；
7. 后续 cleanup 删除无读取者代码。

Cutover 条件：

```text
Web has no ReserveMatchedAttentionHandler dependency
Worker has no active MatchEdgeWorker composition
Primary HiringIntelligencePort has no buildMatchEdge method
Employer routes cannot return pre-answer Candidate cards
Legacy reserve-attention endpoint cannot mutate business state
No target code treats initial Slot WIP as total Candidate cap
```

---

## 14. 实施批次

### Batch 0：Contract tests 与版本锁定

- 增加 Interest/Application distinction、reusable Slot、no-pre-answer payload、no-pre-answer AI、first-settlement queue handoff、`7/8` Cohort barrier 与 legacy endpoint cutover tests；
- 修正 AI 文档的 `AnswerSubmitted → buildAnswerEvidenceEdge → HumanReview` 顺序；
- 冻结 Event、Command、Projection、Queue Policy 与 migration version map。

### Batch 1：Discovery、Queue、Contracts 与 Domain（完成）

- 实现 PublicOpportunityProjection、Interest API 与 Candidate queue visibility；
- 实现 BlindReviewCommitment、InterestQueue、AnswerReviewSlot、Obligation、Cohort 与 ActivityLease；
- 实现 `onlyboth.interest-queue@1` pure policy。

### Batch 2：PostgreSQL 与 rolling Attention Escrow（完成）

- 增加 `0003` migration/down；
- 实现 Activate、Offer、Accept/Decline/Expiry、per-Slot Hold 与 Closure Receipt；
- 验证 fresh migration、八 Slot 原子激活、无 Hold 禁止 Answer、Q_i 与并发。

### Batch 3：Recorded Answer 与 Answer Evidence AI（完成；LIVE eval 因无 Key 阻塞）

- 将 Stage A Sandbox Worker 改为 Answer subject；
- 实现 immutable AnswerSubmission；
- 已实现 `buildAnswerEvidenceEdge` Prompt、Validator、显式 Synthetic/LIVE Adapter 与 Worker；
- 回答前 Candidate matching AI call count 必须为零；Backed ACTIVE Session 内允许披露式 Sidecar。

### Batch 4：Human Review、Slot recycling 与 Cohort Allocation（Review/SLA 完成，Allocation 待完成）

- 实现独立 Human Review Command/Receipt；
- 实现 Credit return、Breach/Remediation、Slot recycle 与 Queue handoff；
- 实现 Advancement Cohort barrier、blind-pass-first Direct 与 public-seed Explore；
- Gate：第1份 Review 后 Candidate 09 获得 Offer；`7/8` allocation 返回 422；`8/8` 精确产生 Answer 42 / Answer 17。

### Batch 5：UI、Challenge reuse 与 runtime cutover

- 替换 Employer Matching Panel；
- 更新 Candidate Discovery、Queue、Offer、Answer 与 Deep Proof UI；
- 两个 Answer 接入 Challenge/Sandbox；
- 移除 active MatchEdge Worker、旧 API 与旧 UI；
- 更新 Cold Open、Replay Manifest、README 与 HANDOFF。

### Batch 6：验收与 cleanup

- 运行 PostgreSQL、Playwright、Replay、offline Demo、evals 与 build；
- 扫描 payload、日志、错误与截图中的 sealed data；
- 清理 legacy source；
- 保存测试日志并更新 HANDOFF；
- 完成后删除或归档本文。

---

## 15. Test Plan

### Unit

- Interest/Application 术语与状态边界；
- Queue FIFO、hash tie-break、Employer skip 禁止、空 Queue；
- Slot Offer、Accept、Decline、Expiry、Review、Settlement、Reuse、Breach、Retire；
- Commitment Pause/Close 与 active Obligation preservation；
- Cohort membership、`7/8` barrier、Direct membership、Explore seed；
- no-Hold Answer rejection、Q_i、Credit 与 version races；
- AI schema/ref/policy/refusal/incomplete/stale。

### PostgreSQL

- fresh `0001 → 0002 → 0003` 与 down compatibility；
- Activate + 8 reusable Slots + Event + Outbox + Receipt 全事务；
- Queue lease/Inbox duplicate handling；
- first Review Settlement + Slot AVAILABLE + next-offer Outbox 原子一致；
- first Review 后 Candidate 09 的 Offer pin Cohort 2，Cohort 1 membership 不随 completion order 漂移；
- 并发 Workers 不能把一个 Slot 发给两人或跳过 Queue head；
- immutable Answer/Edge/Review/submitted Cohort Seat/Allocation；
- Deep Windows/Holds/Decisions 全成或全败；
- stale、double click、SLA race、cross-opportunity `Q_i=1`；
- Pause/Close 与 Closure Receipts；
- Breach notice、forfeit、compensation、WIP penalty 与 retired Slot。

### Security

- Employer pre-answer payload Candidate Card/Claim/MatchEdge/Profile/GPT rationale 数量为零；
- pre-answer OpenAI Candidate matching request 数量为零；
- Candidate Sidecar 只能在 ACTIVE backed Session 运行，Trace 必须 Seal 并向 Reviewer 披露；
- Queue Scheduler 依赖图无 Claim/Private Label/AI repository；
- Candidate 不能读取其他 Candidate、Cohort pool、Direct/Explore 或 Employer Edge；
- Employer 不能重排或 skip Queue；
- Prompt Injection 不改变 Prompt、Queue、Eligibility、Review 或 Allocation；
- logs/errors 无 raw Answer、labels、Cookie、key 或 database URL。

### Replay / Playwright

1. Candidate 浏览 Opportunity 并表达 Interest；
2. 没有 backed Slot 时不能提交 Application；
3. Sarah 回答前看不到 Candidate cards；
4. Sarah 激活八个 reusable Slots；
5. 前八位获得 backed offers，后十二位显示等待而非 Reject；
6. 八份 Answer 经 Application Commands 提交；
7. 第一份 Human Review 结算后，第九位在 2 秒内获得 Offer；
8. 八次独立 Human Review Command；
9. `7/8` UI/API 锁定 Allocation，Slot recycling 已继续；
10. `8/8` 后 Direct Answer 42 / Explore Answer 17；
11. Candidate 42/17 不看到 allocation kind；
12. 两个 Challenge branch 精确一致；
13. stale、duplicate、legacy endpoint 不产生额外 Event；
14. Opportunity Close 为等待者产生 Closure Receipt；
15. 外部断网、无 OpenAI key 时 Golden 全链通过。

### LIVE eval

- 6 个正常 Answer Evidence、3 个证据不足、3 个 Prompt Injection；
- 12/12 通过 Schema/ref/version/no-label/no-score hard gates；
- 缺少 key 记录 `BLOCKED`，不能用 Golden 替代。

---

## 16. 最终验收矩阵

| Gate | Required result |
|---|---|
| Employer pre-answer Candidate cards | `0` |
| Pre-answer Candidate matching AI requests | `0` |
| Candidate Sidecar traces missing from submitted Artifact manifest | `0` |
| Reusable Answer Review Slots | `8` |
| Slot WIP treated as total applicant cap | `0` |
| Accepted Applications without held Review | `0` |
| Immutable Cohort 1 Answer Submissions | `8` |
| Named Human Answer Review Receipts | `8` |
| Candidate 09 offer after first Review Settlement | present before Cohort `8/8` |
| Allocation at Cohort `7/8` | rejected |
| Allocation at Cohort `8/8` | accepted |
| Direct source | Blind Answer 42 Evidence only |
| Explore source | Blind Answer 17 by public seed |
| Deep Proof Windows | `2`, atomic |
| Candidate Direct/Explore fields | `0` |
| Waiting Interest closure receipts | `100%` on explicit close |
| Legacy reserve endpoint mutations | `0` |
| External requests in offline demo | `0` |
| Sealed-label leakage hard gates | `100%` |

必须运行并保存实际输出：

```text
pnpm check
pnpm build
TEST_DATABASE_URL=<redacted> pnpm test:postgres
TEST_DATABASE_URL=<redacted> pnpm test:e2e
pnpm test:evals
pnpm replay:verify
pnpm demo:offline
git diff --check
rg -n "\.(only|skip)\(" tests apps packages
```

---

## 17. 删除检查

本文只能在以下问题全部回答“是”后删除或归档：

1. Candidate 是否能浏览岗位、表达低成本 Interest，并清楚知道 Interest 不是 Application？
2. 没有 backed Slot 时是否无法提交 Answer？
3. Slot 是否为可循环 WIP，而非二十人中一次选择八人的总名额？
4. 第一个 Review Settlement 后是否立即触发第九位 Offer，而不等待 `8/8`？
5. Employer 是否不能读取或重排 pre-answer Candidate Queue？
6. 每份 submitted Application 是否都有 Receipt 或 Breach？
7. Employer pre-answer payload 是否无法表示 Candidate Card、Claim 或 GPT rationale？
8. `buildMatchEdge` 是否已从主 Port 与 active Worker 移除？
9. `7/8` Cohort 是否仍拒绝 Allocation？
10. Direct/Explore 是否只引用同一 reviewed Cohort 的匿名 Evidence？
11. ReviewWindow 是否 pin AnswerSubmission、AnswerEvidenceEdge 与 Cohort？
12. Candidate 是否看不到 Direct/Explore 与其他 Candidate？
13. Opportunity Close 是否通知所有仍在等待的人且不生成能力结论？
14. Golden 是否只固定外部输入而没有预写真人动作或 Slot handoff？
15. PostgreSQL、Playwright、Replay、offline Demo、安全测试与报告是否全部完成？

任何一项为“否”，运行代码迁移尚未完成。
