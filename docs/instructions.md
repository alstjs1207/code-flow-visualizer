# Code Flow Visualizer — 설계서

> **목적**: 이 문서는 Claude Code에게 프로젝트 구현을 지시하기 위한 설계서입니다.
> 모든 설계 결정의 근거와 구현 범위가 포함되어 있습니다.

---

## 1. 프로젝트 개요

### 1.1 한 줄 요약

Git 저장소의 TypeScript 백엔드 코드(Handler → Service → DAO 구조)를 분석하여, API 엔드포인트별 비즈니스 로직 분기를 인터랙티브 플로우차트로 시각화하는 웹 애플리케이션.

### 1.2 해결하려는 문제

- 백엔드 개발자가 코드 내 비즈니스 로직(특히 if/else 분기)을 팀원에게 설명할 때 매번 코드를 열어 설명해야 하는 비효율
- 코드 리뷰, 온보딩, 장애 추적 시 “이 API가 내부적으로 어떤 흐름으로 동작하는가”를 빠르게 파악하기 어려움

### 1.3 핵심 사용 시나리오

1. 개발자가 GitHub 계정으로 로그인
2. 본인의 Git 저장소 목록에서 프로젝트 선택
3. 시스템이 handler 파일들을 자동 스캔하여 API 엔드포인트 목록 생성
4. 특정 handler를 선택하면 handler → service → dao 흐름을 플로우차트로 시각화
5. 노드를 클릭/호버하면 원본 코드 위치, 조건식 상세 등을 확인 가능

---

## 2. 시스템 아키텍처

### 2.1 전체 파이프라인

```
[Git Repository]
       │
       ▼
[① Code Source] ─── GitHub OAuth → repo 목록 → 파일 트리 가져오기
       │
       ▼
[② AST Parser] ─── TypeScript Compiler API로 코드 파싱
       │               ├─ handler 파일 스캔 (라우트 함수 탐지)
       │               ├─ 함수 호출 체인 추적 (handler → service → dao)
       │               └─ 분기 구조 추출 (if/else, switch, guard, throw)
       │
       ▼
[③ IR 변환] ─── 파싱 결과를 시각화용 중간 표현(FlowGraph)으로 변환
       │               ├─ 노드 생성 (entry, condition, action, error, return)
       │               ├─ 엣지 생성 (전이 + 분기 라벨)
       │               └─ 메타데이터 (소스 위치, 레이어, 변수명)
       │
       ▼
[④ AI Labeling] ─── (선택적) 조건식/액션을 사람이 읽기 좋은 한국어 라벨로 변환
       │               └─ Claude API: AST 추출 텍스트 → 요약 라벨
       │
       ▼
[⑤ Renderer] ─── React Flow 기반 인터랙티브 플로우차트 렌더링
```

### 2.2 기술 스택

| 영역          | 기술                            | 선택 이유                                               |
| ------------- | ------------------------------- | ------------------------------------------------------- |
| **Frontend**  | Next.js 14 (App Router) + React | SSR, 라우팅, API Routes 통합                            |
| **시각화**    | React Flow                      | 노드/엣지 기반 다이어그램에 최적화, 줌/팬/인터랙션 내장 |
| **스타일링**  | Tailwind CSS                    | 빠른 프로토타이핑, 다크 테마                            |
| **AST 파싱**  | ts-morph                        | TypeScript Compiler API 래퍼, DX가 좋음                 |
| **Git 연동**  | GitHub REST API (Octokit)       | OAuth 앱 기반 repo 접근                                 |
| **AI 라벨링** | Anthropic Claude API            | 코드 컨텍스트 이해력이 뛰어남                           |
| **상태 관리** | Zustand                         | 경량, 보일러플레이트 최소                               |
| **DB**        | SQLite (Prisma)                 | MVP 단계 경량 저장 (파싱 캐시)                          |
| **배포**      | Vercel                          | Next.js 네이티브 지원                                   |

---

## 3. 핵심 데이터 모델

### 3.1 FlowGraph IR (Intermediate Representation)

파서와 렌더러 사이의 계약. 이 스키마가 시스템의 핵심입니다.

```tsx
// types/flow-graph.ts

interface FlowGraph {
  /** 메타 정보 */
  handler: string; // 핸들러 함수명 (e.g. "createEnrollment")
  method: HttpMethod; // "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  path: string; // API 경로 (e.g. "/api/enrollments")
  file: string; // 핸들러 파일 경로 (e.g. "src/handlers/enrollment.handler.ts")

  /** 그래프 구조 */
  nodes: FlowNode[];
  edges: FlowEdge[];
}

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface FlowNode {
  id: string; // 고유 ID (e.g. "n1", "s3", "d2")
  type: NodeType;
  layer: Layer; // 어느 MVC 레이어에 속하는지
  label: string; // 표시 텍스트 (코드 원문 또는 AI 요약)
  rawCode?: string; // 원본 코드 텍스트
  source?: SourceLocation; // 원본 파일 위치
  notes?: string; // 부가 설명 (호버 시 표시)
}

type NodeType =
  | "entry" // 핸들러 진입점
  | "validation" // 요청 검증
  | "condition" // if/else, switch 분기
  | "action" // 일반 실행 (함수 호출, 할당 등)
  | "error" // throw, 에러 반환
  | "return"; // 정상 응답 반환

type Layer =
  | "handler" // 라우트 핸들러 (컨트롤러)
  | "service" // 비즈니스 로직
  | "dao"; // 데이터 접근 계층

interface FlowEdge {
  from: string; // 출발 노드 ID
  to: string; // 도착 노드 ID
  label?: string; // 분기 조건 라벨 (e.g. "Yes", "No", "case: ACTIVE")
  type?: EdgeType;
}

type EdgeType =
  | "normal" // 기본 흐름
  | "true" // 조건 참
  | "false" // 조건 거짓
  | "error"; // 에러 경로

interface SourceLocation {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}
```

### 3.2 Handler 목록 스키마

```tsx
// types/handler-list.ts

interface HandlerEntry {
  id: string; // 고유 ID
  method: HttpMethod;
  path: string; // API 경로
  functionName: string; // 핸들러 함수명
  file: string; // 파일 경로
  serviceRefs: string[]; // 호출하는 서비스 메서드 목록
  complexity: number; // 분기 수 (정렬/필터용)
}

interface RepoScanResult {
  repo: string;
  branch: string;
  scannedAt: string; // ISO 8601
  handlers: HandlerEntry[];
  errors: ScanError[]; // 파싱 실패한 파일들
}
```

---

## 4. 주요 모듈 상세 설계

### 4.1 GitHub 연동 (Code Source)

### 인증 플로우

```
[사용자] → GitHub OAuth 로그인 → Access Token 획득 → 세션 저장
```

### 구현 사항

- **GitHub OAuth App** 등록 (scope: `repo` for private, `public_repo` for public)
- **Octokit** 으로 API 호출
  - `GET /user/repos` → 저장소 목록
  - `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1` → 전체 파일 트리
  - `GET /repos/{owner}/{repo}/contents/{path}` → 개별 파일 내용
- **파일 필터링**: 아래 패턴으로 handler 후보 파일 선별
  ```
  **/*.handler.ts
  **/*.controller.ts
  **/handlers/**/*.ts
  **/controllers/**/*.ts
  **/routes/**/*.ts
  ```
- 사용자가 커스텀 glob 패턴을 설정할 수 있도록 UI 제공

### API Routes

```
POST /api/auth/github          → GitHub OAuth callback
GET  /api/repos                → 사용자의 repo 목록
GET  /api/repos/:owner/:repo/scan  → repo 스캔 시작
GET  /api/repos/:owner/:repo/handlers → 핸들러 목록
GET  /api/repos/:owner/:repo/handlers/:id/flow → 특정 핸들러 FlowGraph
```

### 4.2 AST Parser

### 역할

TypeScript 소스코드를 파싱하여 FlowGraph IR을 생성하는 핵심 모듈.

### 파싱 전략 (3단계)

**Step 1: Handler 스캔**

- 파일 내에서 라우트 등록 패턴을 탐지:

  ```tsx
  // 패턴 1: Express-style
  router.get("/api/tickets", getTickets);
  router.post("/api/enrollments", createEnrollment);

  // 패턴 2: 데코레이터 style (NestJS 등)
  @Get("/tickets")
  async getTickets() { ... }

  // 패턴 3: Next.js API Routes
  export async function GET(req: Request) { ... }
  export async function POST(req: Request) { ... }

  // 패턴 4: Fastify CrudHandler (skillflo)
  this.server.get(`${this.routePath}`, options, async (request) => { ... });
  this.server.post(`${this.routePath}/sign-up`, options, async (request) => { ... });
  ```

- ts-morph로 파일의 export된 함수와 라우트 등록 호출을 찾아 HandlerEntry 생성

**Step 2: 호출 체인 추적**

- Handler 함수 내에서 호출하는 service 메서드를 추적
- service 메서드 내에서 호출하는 dao 메서드를 추적
- `ts-morph`의 `getCallExpressions()` + `getDefinitionNodes()`로 파일 간 이동

  ```
  handler.createEnrollment()
    → this.enrollmentService.create()    // service layer
      → this.enrollmentDao.insert()      // dao layer
      → this.ticketDao.update()          // dao layer

  // Fastify/skillflo (DI Container 기반)
  handler.signUp()
    → this.mapper.bodyMapper()      // mapper (handler layer)
    → this.service.signUp()         // service layer (DI 주입)
      → this.xxxDao.save()           // dao layer (DI 주입)
      → this.otherService.method()   // service→service 호출
  ```

**Step 3: 분기 구조 추출**

- 각 함수 내에서 아래 패턴을 재귀적으로 탐색:

| AST 노드 타입                  | FlowNode 타입                  | 설명                       |
| ------------------------------ | ------------------------------ | -------------------------- |
| `IfStatement`                  | `condition`                    | if/else 분기 → Yes/No 엣지 |
| `SwitchStatement`              | `condition`                    | switch 분기 → case별 엣지  |
| `ConditionalExpression`        | `condition`                    | 삼항 연산자                |
| `ThrowStatement`               | `error`                        | throw → 에러 노드          |
| `ReturnStatement`              | `return`                       | return → 종료 노드         |
| `CallExpression` (service/dao) | `action`                       | 외부 메서드 호출           |
| Guard clause (early return)    | `condition` + `error`/`return` | if (!x) return/throw       |

### 핵심 구현 파일 구조

```
src/
  lib/
    parser/
      index.ts              # 메인 파서 엔트리
      handler-scanner.ts    # Step 1: handler 파일 스캔
      call-tracer.ts        # Step 2: 호출 체인 추적
      branch-extractor.ts   # Step 3: 분기 구조 추출
      flow-graph-builder.ts # FlowGraph IR 조립
      patterns/
        express.ts          # Express 라우트 패턴
        nestjs.ts           # NestJS 데코레이터 패턴
        nextjs.ts           # Next.js App Router 패턴
```

### 파서 인터페이스

```tsx
// lib/parser/index.ts

import { Project } from "ts-morph";

export class CodeFlowParser {
  private project: Project;

  constructor(files: Map<string, string>) {
    // ts-morph Project에 파일 추가 (인메모리, 파일시스템 불필요)
    this.project = new Project({ useInMemoryFileSystem: true });
    for (const [path, content] of files) {
      this.project.createSourceFile(path, content);
    }
  }

  /** repo 전체 스캔 → 핸들러 목록 반환 */
  scanHandlers(): HandlerEntry[] { ... }

  /** 특정 핸들러의 FlowGraph 생성 */
  buildFlowGraph(handlerEntry: HandlerEntry): FlowGraph { ... }
}
```

### 4.3 AI Labeling (선택적 기능)

### 역할

AST에서 추출한 코드 원문을 사람이 읽기 쉬운 라벨로 변환.

### 변환 예시

| AST 추출 원문                                             | AI 변환 라벨        |
| --------------------------------------------------------- | ------------------- |
| `if (ticket.status === TicketStatus.ACTIVE)`              | “수강권 유효?”      |
| `this.enrollmentDao.insert(createDto)`                    | “수강 등록 DB 저장” |
| `throw new BusinessException(ErrorCode.TICKET_EXHAUSTED)` | “에러: 횟수 소진”   |
| `ticket.remaining -= 1`                                   | “잔여 횟수 차감”    |

### 구현 방식

```tsx
// lib/ai/labeler.ts

import Anthropic from "@anthropic-ai/sdk";

interface LabelRequest {
  nodes: Array<{
    id: string;
    rawCode: string;
    type: NodeType;
    layer: Layer;
  }>;
  context: {
    functionName: string;
    filePath: string;
  };
}

export async function generateLabels(
  request: LabelRequest,
): Promise<Map<string, string>> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: `당신은 TypeScript 백엔드 코드 분석기입니다.
주어진 코드 조각들을 한국어로 된 짧은 라벨(10자 이내)로 요약하세요.
결과는 JSON으로만 반환하세요: { "노드ID": "라벨", ... }`,
    messages: [
      {
        role: "user",
        content: JSON.stringify(request),
      },
    ],
  });

  // 파싱 후 Map 반환
}
```

### AI 라벨링 정책

- **기본값은 OFF** — 코드 원문을 정리해서 표시
- 사용자가 “AI 라벨링” 토글을 켜면 활성화
- 캐시 적용 — 동일 코드에 대해 재요청 방지
- AI 라벨 옆에 원문 코드를 툴팁으로 항상 표시 (검증 가능)

### 4.4 Renderer (프론트엔드)

### 페이지 구조

```
/                         → 랜딩 (GitHub 로그인)
/repos                    → 저장소 목록
/repos/:owner/:repo       → 핸들러 목록 + 플로우 시각화 (메인 화면)
```

### 메인 화면 레이아웃

```
┌──────────────────────────────────────────────────────┐
│  [Code Flow Visualizer]     handler → service → dao  │ ← Top Bar (레이어 범례)
├──────────────┬───────────────────────────────────────┤
│              │                                       │
│  API 목록     │          플로우차트 영역               │
│              │                                       │
│  ■ POST      │     ┌─────────┐                      │
│    /enroll   │     │ Entry   │                      │
│              │     └────┬────┘                      │
│  ■ PATCH     │          ▼                           │
│    /pause    │     ◇ 조건 분기 ◇ ──→ [에러]          │
│              │          │                           │
│  ■ GET       │          ▼                           │
│    /tickets  │     ┌─────────┐                      │
│              │     │ Action  │                      │
│              │     └─────────┘                      │
│              │                                       │
├──────────────┴───────────────────────────────────────┤
│  [분기 3] [에러 2] [DB호출 4] [총 노드 12]            │ ← Stats Bar
└──────────────────────────────────────────────────────┘
```

### React Flow 노드 커스텀 디자인

| NodeType     | 모양                     | 색상             | 설명       |
| ------------ | ------------------------ | ---------------- | ---------- |
| `entry`      | 양 끝 둥근 사각형 (pill) | Cyan `#22d3ee`   | API 진입점 |
| `validation` | 사각형 (점선 테두리)     | Cyan 연한        | 요청 검증  |
| `condition`  | 다이아몬드 ◇             | Yellow `#fbbf24` | 분기 조건  |
| `action`     | 사각형                   | Purple `#a78bfa` | 실행 액션  |
| `error`      | 양 끝 둥근 사각형 (pill) | Red `#f87171`    | 에러/예외  |
| `return`     | 양 끝 둥근 사각형 (pill) | Green `#34d399`  | 정상 응답  |

### 레이어 시각적 구분

- 각 노드 좌측에 레이어 색상 점 표시
  - Handler: Cyan
  - Service: Purple
  - DAO: Yellow
- 배경에 은은한 레이어 밴드 표시 (선택적)

### 인터랙션 상세

| 인터랙션      | 동작                                           |
| ------------- | ---------------------------------------------- |
| 노드 호버     | 툴팁에 원본 코드, 파일 위치 표시               |
| 노드 클릭     | 우측 패널에 해당 코드 블록 하이라이트 (선택적) |
| 엣지 호버     | 분기 조건 상세 표시                            |
| 줌/팬         | React Flow 내장 기능 활용                      |
| 미니맵        | 복잡한 플로우에서 전체 구조 파악               |
| 경로 트레이싱 | 특정 경로(성공/에러)만 강조하는 필터           |

---

## 5. 프로젝트 디렉토리 구조

```
code-flow-visualizer/
├── .env.local                # GitHub OAuth, Anthropic API 키
├── next.config.ts
├── package.json
├── prisma/
│   └── schema.prisma         # 파싱 캐시 스키마
├── public/
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx          # 랜딩 (GitHub 로그인)
│   │   ├── repos/
│   │   │   ├── page.tsx      # 저장소 목록
│   │   │   └── [owner]/
│   │   │       └── [repo]/
│   │   │           └── page.tsx  # 메인: 핸들러 목록 + 플로우
│   │   └── api/
│   │       ├── auth/
│   │       │   └── github/
│   │       │       └── route.ts  # OAuth callback
│   │       └── repos/
│   │           └── [owner]/
│   │               └── [repo]/
│   │                   ├── scan/
│   │                   │   └── route.ts    # repo 스캔
│   │                   ├── handlers/
│   │                   │   └── route.ts    # 핸들러 목록
│   │                   └── flow/
│   │                       └── [handlerId]/
│   │                           └── route.ts  # FlowGraph 반환
│   ├── components/
│   │   ├── layout/
│   │   │   ├── TopBar.tsx
│   │   │   └── Sidebar.tsx
│   │   ├── auth/
│   │   │   └── GitHubLoginButton.tsx
│   │   ├── repo/
│   │   │   ├── RepoList.tsx
│   │   │   └── RepoCard.tsx
│   │   ├── handler/
│   │   │   ├── HandlerList.tsx
│   │   │   └── HandlerCard.tsx
│   │   └── flow/
│   │       ├── FlowCanvas.tsx          # React Flow 래퍼
│   │       ├── nodes/
│   │       │   ├── EntryNode.tsx
│   │       │   ├── ConditionNode.tsx
│   │       │   ├── ActionNode.tsx
│   │       │   ├── ErrorNode.tsx
│   │       │   └── ReturnNode.tsx
│   │       ├── edges/
│   │       │   └── ConditionalEdge.tsx
│   │       ├── FlowStats.tsx           # 분기/에러/DB호출 카운트
│   │       ├── NodeTooltip.tsx          # 호버 시 상세 정보
│   │       └── LayerLegend.tsx          # 레이어 범례
│   ├── lib/
│   │   ├── parser/
│   │   │   ├── index.ts                # CodeFlowParser 메인 클래스
│   │   │   ├── handler-scanner.ts      # handler 파일 스캔
│   │   │   ├── call-tracer.ts          # 함수 호출 체인 추적
│   │   │   ├── branch-extractor.ts     # 분기 구조 추출
│   │   │   ├── flow-graph-builder.ts   # FlowGraph IR 조립
│   │   │   └── patterns/
│   │   │       ├── express.ts
│   │   │       ├── nestjs.ts
│   │   │       ├── nextjs.ts
│   │   │       └── fastify-skillflo.ts   # Fastify/skillflo 라우트 패턴
│   │   ├── github/
│   │   │   ├── client.ts               # Octokit 래퍼
│   │   │   ├── auth.ts                 # OAuth 처리
│   │   │   └── file-fetcher.ts         # 파일 내용 가져오기
│   │   ├── ai/
│   │   │   └── labeler.ts              # AI 라벨링
│   │   └── layout/
│   │       └── dagre-layout.ts         # 노드 자동 배치 (dagre)
│   ├── stores/
│   │   ├── repo-store.ts               # 저장소/핸들러 상태
│   │   └── flow-store.ts               # 현재 FlowGraph 상태
│   └── types/
│       ├── flow-graph.ts               # FlowGraph IR 타입
│       ├── handler-list.ts             # HandlerEntry 타입
│       └── github.ts                   # GitHub API 타입
└── tests/
    ├── parser/
    │   ├── handler-scanner.test.ts
    │   ├── call-tracer.test.ts
    │   ├── branch-extractor.test.ts
    │   └── fixtures/                   # 테스트용 TS 파일들
    │       ├── simple-handler.ts
    │       ├── nested-conditions.ts
    │       └── multi-service.ts
    └── flow/
        └── flow-graph-builder.test.ts
```

---

## 6. 구현 우선순위 (단계별)

### Phase 1: MVP — AST 파서 + 정적 시각화 (1~2주)

> 핵심: “코드를 넣으면 플로우차트가 나온다”를 증명

**범위:**

- [ ] 프로젝트 초기 세팅 (Next.js + Tailwind + React Flow)
- [ ] TypeScript 타입 정의 (FlowGraph IR, HandlerEntry)
- [ ] AST 파서 구현
  - [ ] `handler-scanner.ts` — Express 패턴 우선
  - [ ] `branch-extractor.ts` — if/else, throw, return 추출
  - [ ] `call-tracer.ts` — service/dao 호출 추적
  - [ ] `flow-graph-builder.ts` — FlowGraph IR 조립
- [ ] React Flow 렌더러
  - [ ] 커스텀 노드 5종 (entry, condition, action, error, return)
  - [ ] dagre 자동 레이아웃
  - [ ] 노드 호버 툴팁
- [ ] 테스트용 하드코딩 데이터로 동작 확인
- [ ] 파서 단위 테스트 (fixtures 기반)

**이 단계에서는 GitHub 연동 없이**, 로컬 코드를 직접 붙여넣거나 fixture 파일로 테스트합니다.

### Phase 1.5: 대상 코드베이스(skillflo-api) 패턴 레퍼런스

> 핵심: AST 파서가 skillflo-api의 실제 코드를 정확히 인식할 수 있도록 패턴 명세를 정의

skillflo-api는 Express/NestJS가 아닌 **Fastify 기반 독자 패턴**을 사용합니다. 이 섹션은 파서 구현 시 반드시 참조해야 하는 패턴 레퍼런스입니다.

#### A. 아키텍처 개요

| 항목        | 값                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------- |
| 프레임워크  | Fastify                                                                                      |
| ORM         | TypeORM                                                                                      |
| DI          | Awilix (`server.diContainer.cradle`)                                                         |
| 계층        | Handler → Mapper → Service → DAO (4계층, FlowGraph에서는 handler/service/dao 3계층으로 매핑) |
| 도메인 분리 | b2e, b2m, backoffice, external                                                               |

#### B. 라우트 등록 패턴

라우트 등록은 4단계에 걸쳐 진행됩니다:

```typescript
// 1단계: server.ts에서 도메인 플러그인 등록
server.register(apiBackoffice, { prefix: '/api/backoffice' });
server.register(apiB2E, { prefix: '/api/b2e' });

// 2단계: 도메인 index.ts에서 디렉토리 자동 스캔
const IndexRoute: FastifyPluginAsync = async (server, options) => {
  for (const name of directory) {
    childServer.register(await import(`./${name}`), options);
  }
};

// 3단계: 모듈 index.ts에서 makeRoute() 팩토리
const makeRoute = () => {
  const route = async (server: FastifyInstance, options: FastifyPluginOptions) => {
    const service = server.diContainer.cradle.xxxService;    // DI에서 서비스 조회
    const mapper = new XxxMapper();                           // Mapper 직접 생성
    const handler = new XxxCrudHandler(server, options, mapper, service);
    await handler.bindRoute();
  };
  return route;
};
export default makeRoute();

// 4단계: Handler 클래스에서 라우트 바인딩
public bindRoute = () => {
  this.routePath = `/member`;
  this.find(this.schema.GET);      // GET /api/b2e/member
  this.get(this.schema.GET_ID);    // GET /api/b2e/member/:id
  this.create(this.schema.POST);   // POST /api/b2e/member
  this.signUp(SIGN_UP());          // POST /api/b2e/member/sign-up (커스텀)
};
```

#### C. 핸들러 메서드 패턴

```typescript
// 핸들러 메서드 시그니처 (Arrow Function + Fastify 라우트 등록)
signUp = (Schema: object): void => {
  this.server.post(
    `${this.routePath}/sign-up`,
    this.getOptions(Schema),
    async (request) => {
      const command = this.mapper.bodyMapper<MemberSignUpBody>(request); // Mapper로 파싱
      const { id } = await this.service.signUp(command); // Service 호출
      return { data: { id } }; // 응답 반환
    },
  );
};
```

**응답 형식:**

- 단건: `{ data: T }` 또는 `{ data: { id } }`
- 목록: `{ data: T[], meta: { total } }`
- 문자열: `'session out'`

#### D. Mapper 패턴 (BaseMapper 상속)

```typescript
export class MemberMapper extends BaseMapper {
  parseQuery(req: FastifyRequest): MemberConvertQuery {
    const { member_id, ...query } = <MemberQuery>req.query;
    return { memberId: member_id, ...query }; // snake_case → camelCase
  }
}
```

- Mapper는 FlowGraph의 **handler 레이어**에 포함 (별도 레이어 아님)

#### E. Service 패턴

```typescript
export class OrderService {
  private readonly orderDao: OrderDao;
  constructor({ orderDao }: DIContainers) {
    this.orderDao = orderDao;
  }

  async validateOrder({ id }: { id: number }) {
    const order = await this.orderDao.getById(id); // DAO 호출
    if (!order) {
      // Guard Clause
      throw new NotFoundException(`주문 정보가 존재하지 않습니다.`);
    }
  }
}
```

**Service 패턴 특징:**

- DI 생성자 주입: `constructor({ xxxDao, yyyService }: DIContainers)`
- Guard Clause: `if (!entity) throw new XxxException(msg);`
- 병렬 조회: `const [a, b] = await Promise.all([...])`
- 트랜잭션: `await AppDataSource.transaction(async (txManager) => { ... })`
- 서비스 간 호출: `this.productService.getAllProductById(productId)`

#### F. Repository(DAO) 패턴

```typescript
export class OrderDao extends BaseCrudDao<OrderExtras> {
  buildSearchQuery(
    qb: SelectQueryBuilder<Order>,
    query: Partial<OrderSearchQuery>,
  ) {
    super.buildSearchQuery.call(this, qb, query);
    if (query.field) {
      qb.andWhere("field = :field", { field: query.field });
    }
  }
}
```

**메서드 네이밍 규칙:**

- `getById(id)` — 단일 조회 (없으면 throw)
- `selectByIds(ids)` — 배열 조회
- `search(query)` — QueryBuilder 기반 검색
- `modify(entity)` — 업데이트
- `save(entity)` — 생성

#### G. AST 파서 패턴 인식기 — Fastify(skillflo) 추가

`src/lib/parser/patterns/fastify-skillflo.ts` 패턴 인식기가 탐지해야 할 대상:

| 탐지 대상   | AST 패턴                                                        | 추출 정보            |
| ----------- | --------------------------------------------------------------- | -------------------- |
| 라우트 등록 | `this.server.get/post/put/delete(path, options, handler)`       | method, path         |
| 핸들러 진입 | `bindRoute()` 메서드 내부의 `this.xxx(Schema)` 호출             | handler 목록         |
| 서비스 호출 | `this.service.methodName()` 또는 `this.xxxService.methodName()` | service layer 전환   |
| DAO 호출    | `this.xxxDao.methodName()`                                      | dao layer 전환       |
| DI 참조     | `server.diContainer.cradle.serviceName`                         | 서비스 의존성 그래프 |

#### H. Layer 매핑 규칙

| 코드 위치                         | FlowGraph Layer | 판별 기준                    |
| --------------------------------- | --------------- | ---------------------------- |
| `*-handler.ts`, `*-mapper.ts`     | `handler`       | 파일 suffix로 판별           |
| `*-service.ts`                    | `service`       | 파일 suffix로 판별           |
| `*-dao.ts`, `repository/` 내 파일 | `dao`           | 파일 경로 또는 suffix로 판별 |

#### I. 호출 체인 추적 시 주의사항

1. **DI Container 간접 참조**: `server.diContainer.cradle.xxxService`로 주입된 서비스는 import가 아닌 DI로 연결됨 → 타입 정보(`DIContainers`)로 실제 클래스 추적 필요
2. **서비스 간 호출**: Service가 다른 Service를 주입받아 호출 (handler→service→service→dao 4단계 가능)
3. **Mapper 투과**: Mapper는 데이터 변환만 수행하므로 FlowGraph에서 별도 노드 불필요, handler 레이어에 포함
4. **BaseCrudDao 상속**: 부모 클래스의 기본 메서드(getById, search 등)도 추적 대상

#### J. 에러/분기 패턴 사전

| 에러 클래스                    | 의미               | FlowNode type |
| ------------------------------ | ------------------ | ------------- |
| `BadRequestException`          | 입력값 검증 실패   | `error`       |
| `NotFoundException`            | 데이터 미존재      | `error`       |
| `ForbiddenException`           | 권한 없음          | `error`       |
| `UnauthorizedException`        | 인증 실패          | `error`       |
| `ConflictException`            | 중복 데이터        | `error`       |
| `UnprocessableEntityException` | 비즈니스 규칙 위반 | `error`       |
| `DataException`                | 시스템 설정 오류   | `error`       |

**분기 패턴:**

- Guard Clause: `if (!x) throw new XxxException(msg);` → condition + error 노드
- 존재 체크: `if (entity) { ... } else { ... }` → condition + 분기
- Promise.all: 병렬 조회는 단일 action 노드로 축약 가능

### Phase 2: GitHub 연동 (1주)

**범위:**

- [ ] GitHub OAuth 인증 (NextAuth.js 활용)
- [ ] 저장소 목록 조회 UI
- [ ] 파일 트리 가져오기 + handler glob 필터
- [ ] repo 스캔 → 핸들러 목록 생성 파이프라인
- [ ] 사이드바: 핸들러 목록 → 선택 시 FlowGraph 생성 → 렌더링

### Phase 2.5: 2단계 스캔 아키텍처 — Scan 경량화 + On-demand 딥 스캔

> 핵심: 초기 스캔은 handler 목록만 빠르게 반환하고, handler 선택 시 필요한 service/DAO만 on-demand로 가져와 flow 생성

**문제점 (Phase 2 완료 시점):**

- Scan 엔드포인트가 handler + service + DAO 파일을 한꺼번에 fetch + parse → 대형 repo에서 느림
- handler 목록만 필요한 시점에 service/DAO까지 모두 로드 (불필요한 선행 작업)

**해결:**

- **1단계 (경량 스캔)**: handler 파일만 fetch → handler 목록 빠르게 반환
- **2단계 (온디맨드 딥 스캔)**: handler 선택 시 연결된 service/DAO만 fetch → flow 생성

#### 2단계 스캔 파이프라인

```
[1단계: 경량 스캔 — handler 목록 구성]
  Scan 버튼 클릭
    → GitHub Git Trees API로 파일 트리 가져오기
    → glob 패턴으로 handler 후보 필터링
    → handler 파일만 fetch (service/DAO는 가져오지 않음)
    → handler-scanner로 경량 파싱 (라우트 정보만 추출)
    → handler 목록 즉시 반환
    → 파일 트리 + handler 파일 캐시

[2단계: 온디맨드 딥 스캔 — flow 생성]
  handler 선택
    → 해당 handler 파일의 import 분석 → service/DAO 파일 경로 추출
    → 필요한 service/DAO 파일만 GitHub에서 fetch
    → service 파일의 import도 추적 (service → DAO, service → service)
    → handler + service + DAO 파일로 CodeFlowParser 생성
    → buildFlowGraph()로 전체 flow 생성
    → 결과 캐시
```

#### API 동작 변경

| 엔드포인트                                      | Phase 2 (현재)                                                | Phase 2.5                                                  |
| ----------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| `GET /api/repos/:owner/:repo/scan`              | handler + service + DAO 모두 fetch → 전체 파싱 → handler 목록 | handler 파일만 fetch → 경량 파싱 → handler 목록            |
| `GET /api/repos/:owner/:repo/handlers/:id/flow` | 캐시된 parser에서 buildFlowGraph()                            | service/DAO 파일 on-demand fetch → 파싱 → buildFlowGraph() |

#### 캐시 구조 변경

**Phase 2 (현재):**

```
{ parser: CodeFlowParser, handlers: HandlerEntry[] }
```

**Phase 2.5:**

```
{
  // 1단계 캐시 (scan 시 생성)
  fileTree: FileTreeEntry[],
  handlerFiles: Map<string, { content: string, sha: string }>,
  handlers: HandlerEntry[],
  accessToken: string,       // 2단계에서 GitHub fetch에 필요
  owner: string,
  repo: string,
  branch: string,

  // 2단계 캐시 (handler 선택 시 생성, handler별)
  flowCache: Map<handlerId, {
    parser: CodeFlowParser,
    flowGraph: FlowGraph,
  }>
}
```

#### 재귀적 import 추적

현재 `findReferencedFiles()`는 handler → service/DAO 1단계만 추적.
Phase 2.5에서는 **재귀적 추적** 필요:

- handler → service → DAO
- handler → service → 다른 service → DAO
- 최대 깊이 3단계 제한

#### 프론트엔드 UX 변경

- **Scan 버튼 클릭**: handler 목록이 빠르게 표시됨 (첫 번째 handler 자동 선택 제거)
- **handler 선택**: "Analyzing flow..." 로딩 표시 → flow 생성 완료 시 시각화
- 2단계 진행 상태 표시: "Fetching service files..." → "Building flow graph..."

**범위:**

- [ ] Scan 엔드포인트 경량화: service/DAO fetch 제거, handler 파일만 fetch + 경량 파싱
- [ ] Flow 엔드포인트에 on-demand service/DAO fetch + 파싱 추가
- [ ] 캐시 구조 변경 (fileTree, handlerFiles, flowCache 분리)
- [ ] 재귀적 import 추적 함수 구현 (최대 깊이 3)
- [ ] 프론트엔드: 자동 선택 제거, 2단계 로딩 UX
- [ ] flow 로딩 상태 관리 (store)

**수정 대상 파일:**

| 파일                                                                  | 변경 내용                                               |
| --------------------------------------------------------------------- | ------------------------------------------------------- |
| `src/app/api/repos/[owner]/[repo]/scan/route.ts`                      | service/DAO fetch 제거, 경량 스캔만 수행                |
| `src/app/api/repos/[owner]/[repo]/handlers/[handlerId]/flow/route.ts` | on-demand service/DAO fetch + 파싱 추가                 |
| `src/lib/github/scan-cache.ts`                                        | 캐시 구조 변경 (fileTree, handlerFiles, flowCache 추가) |
| `src/lib/github/file-fetcher.ts`                                      | 재귀적 import 추적 함수 추가                            |
| `src/components/layout/GitHubSidebar.tsx`                             | 자동 선택 제거, 2단계 로딩 UX                           |
| `src/stores/repo-store.ts`                                            | flow 로딩 상태 추가                                     |

### Phase 3: UX 개선 — 경로 트레이싱 + 코드 패널 ✅

**범위:**

- [x] 경로 트레이싱 (성공/에러 경로 필터)
- [x] 미니맵
- [x] 코드 패널 (노드 클릭 시 원본 코드 표시)

**구현 완료 내용:**

| 파일 | 변경 |
|---|---|
| `src/lib/graph/path-finder.ts` | **신규**. 양방향 BFS 경로 탐색 유틸 (`findPathNodes`, `getEntryNodeId`, `getTerminalNodeIds`) |
| `src/components/flow/PathFilterBar.tsx` | **신규**. All/Success ✓/Error ✗ 필터 버튼 (FlowCanvas 좌상단 floating) |
| `src/components/flow/CodePanel.tsx` | **신규**. 노드 클릭 시 우측 코드 상세 사이드 패널 (w-80, label/layer/type/source/rawCode 표시) |
| `src/stores/flow-store.ts` | `pathFilter`, `focusedTerminalId`, `highlightedNodeIds/EdgeIds`, `selectedNodeId` 추가 |
| `src/components/flow/FlowCanvas.tsx` | dimming `useMemo`, `useEffect` 경로 계산, PathFilterBar 통합, 터미널 노드 클릭 토글, pinned tooltip 제거 |
| `src/components/flow/NodeTooltip.tsx` | `pinned`/`onClose` prop 제거, hover-only (`pointer-events-none`) 간소화 |
| `src/components/repo/RepoVisualizerPage.tsx` | CodePanel을 main 레이아웃에 추가 (FlowCanvas 우측) |
| `src/components/flow/nodes/ReturnNode.tsx` | `isFocused` 시 녹색 glow ring |
| `src/components/flow/nodes/ErrorNode.tsx` | `isFocused` 시 빨간 glow ring |
| `tests/flow/path-finder.test.ts` | **신규**. 12개 단위 테스트 (다이아몬드, 머지, 멀티레이어 그래프 등) |

**검증:** 기존 100개 + 신규 12개 = 총 112개 테스트 통과

### Phase 3.5: 사이드바 UX 개선 — Handler 그룹화 + 검색 + 로딩 UX

> 핵심: Handler 목록이 많을 때 도메인별 그룹화와 검색으로 빠르게 찾고, 로딩 상태를 명확히 인지할 수 있도록 개선

**문제점 (Phase 3 완료 시점):**

- Handler 목록이 플랫 리스트로 나열되어, handler 수가 많으면 원하는 API를 찾기 어려움
- 검색 기능이 없어 스크롤로만 탐색
- Handler 클릭 시 로딩 인디케이터가 handler 목록 상단에 위치해 스크롤 하단에서 클릭 시 로딩 확인 불가

---

#### Feature 1: Handler 목록 도메인 그룹화

**동작:**
- Handler의 URL path 기준으로 도메인 자동 추출하여 그룹화
  - 예: `/api/b2e/member/sign-up` → 도메인 `member`
  - 예: `/api/backoffice/order/:id` → 도메인 `order`
- 그룹 헤더 클릭 시 서브 리스트 토글 (접기/펼치기)
- 기본 상태: 전체 펼침

**그룹화 알고리즘:**
```
URL path에서 prefix 제거 후 첫 번째 세그먼트 추출:
  /api/{domain-prefix}/{group-name}/... → group-name
  /api/b2e/member/sign-up → "member"
  /api/backoffice/order/:id → "order"
```

**UI:**
```
┌─────────────────────┐
│ 🔍 Search handlers  │
├─────────────────────┤
│ ▼ member (3)        │
│   POST /sign-up     │
│   GET  /            │
│   GET  /:id         │
│ ▶ order (5)         │  ← 접힌 상태
│ ▼ ticket (2)        │
│   POST /            │
│   PATCH /:id/pause  │
└─────────────────────┘
```

#### Feature 2: Handler 검색

**동작:**
- 사이드바 상단에 검색 입력 필드 추가
- 실시간 필터링: path, method, functionName 대상
- 검색 시 그룹 구조 유지 (매칭 handler가 있는 그룹만 표시)
- 빈 결과 시 "No handlers found" 메시지

#### Feature 3: 로딩 UX 개선

**문제:**
- 현재 로딩 표시가 handler 목록 상단에 위치하여, 사용자가 목록 하단에서 handler를 클릭했을 때 로딩 상태를 인지하기 어려움

**해결:**
- **선택된 handler 항목 자체에 로딩 표시**: 클릭한 handler 옆에 인라인 스피너 표시
- **FlowCanvas 영역에 오버레이 로딩**: 캔버스 중앙에 로딩 인디케이터 표시
- 기존 상단 로딩 인디케이터 제거

**UI:**
```
┌─────────────────────┬──────────────────────────┐
│ ▼ member (3)        │                          │
│   POST /sign-up     │                          │
│   GET  /        ◌   │ ← 선택된 항목에 스피너    │
│   GET  /:id         │    ⟳ Analyzing flow...   │ ← 캔버스 중앙 로딩
│ ▼ order (5)         │                          │
└─────────────────────┴──────────────────────────┘
```

---

#### 수정 대상 파일

| 파일 | 변경 |
|---|---|
| `src/components/layout/GitHubSidebar.tsx` | 그룹화 로직, 접기/펼치기, 검색 입력, 인라인 로딩 스피너 |
| `src/components/flow/FlowCanvas.tsx` | 로딩 중 오버레이 표시 |
| `src/stores/repo-store.ts` | 로딩 중인 handler ID 상태 추가 (필요 시) |

#### 구현 순서

1. Handler 그룹화 유틸 함수 (URL path → 도메인 그룹 추출)
2. `GitHubSidebar` 리팩토링 — 그룹 UI + 접기/펼치기
3. 검색 입력 필드 + 실시간 필터링
4. 로딩 UX 개선 — 인라인 스피너 + 캔버스 오버레이
5. 기존 상단 로딩 인디케이터 제거

#### 검증

1. Handler 목록이 도메인별로 올바르게 그룹화되는지 확인
2. 그룹 헤더 클릭 시 서브 리스트 토글 동작 확인
3. 검색어 입력 시 실시간 필터링 확인 (path, method, functionName)
4. Handler 클릭 시 해당 항목에 스피너 표시 확인
5. FlowCanvas에 로딩 오버레이 표시 확인
6. 기존 112개 테스트 통과 확인

### Phase 4: 확장

- [ ] 상태 머신 시각화 (enum 기반 상태 전이)
- [ ] 여러 핸들러 간 공통 서비스 호출 관계도
- [ ] Webhook으로 push 시 자동 재분석
- [ ] 팀 공유 (공유 링크 생성)
- [ ] Claude API 연동 (AI 라벨링 모듈)
- [ ] 라벨링 ON/OFF 토글 UI
- [ ] 파싱 결과 캐시 (SQLite) — Phase 2.5의 in-memory 캐시를 persistent 저장소로 전환
- [ ] 증분 분석 (변경된 파일만 재파싱) — Phase 2.5 캐시의 blob SHA 비교 활용

---

## 7. 설계 원칙

| 원칙                    | 설명                                                       |
| ----------------------- | ---------------------------------------------------------- |
| **Handler 단위**        | 파일이 아닌 API 엔드포인트(handler 함수) 기준으로 시각화   |
| **레이어 구분**         | handler / service / dao 3계층을 시각적으로 명확히 구분     |
| **소스맵 보존**         | 모든 노드에 원본 코드 위치(파일, 라인, 컬럼) 매핑          |
| **증분 분석**           | 변경된 파일만 재파싱하여 성능 최적화                       |
| **플러그인 구조**       | 라우트 패턴 인식기(Express, NestJS 등)를 플러그인으로 확장 |
| **AI는 보조**           | AST 파싱이 메인, AI 라벨링은 선택적 enhancement            |
| **코드 원문 접근 가능** | AI 라벨이 있어도 항상 원본 코드를 확인할 수 있어야 함      |

---

## 8. 환경 변수

```
# .env.local

# GitHub OAuth
GITHUB_ID=
GITHUB_SECRET=
NEXTAUTH_SECRET=

# Anthropic (AI 라벨링용, 선택)
ANTHROPIC_API_KEY=

# DB
DATABASE_URL="file:./dev.db"
```

---

## 9. 참고: Handler 코드 예시와 기대 파싱 결과

### 입력 코드

```tsx
// enrollment.handler.ts
export async function createEnrollment(req: Request, res: Response) {
  const { ticketId, userId, scheduleId } = req.body;

  // validation
  if (!ticketId || !userId || !scheduleId) {
    throw new BadRequestError("필수 파라미터 누락");
  }

  const result = await enrollmentService.create({
    ticketId,
    userId,
    scheduleId,
  });
  return res.status(201).json(result);
}

// enrollment.service.ts
export class EnrollmentService {
  async create(dto: CreateEnrollmentDto) {
    const ticket = await this.ticketDao.findById(dto.ticketId);

    if (ticket.status !== TicketStatus.ACTIVE) {
      throw new BusinessException("유효하지 않은 수강권");
    }

    if (ticket.remaining <= 0) {
      throw new BusinessException("횟수 소진");
    }

    const conflict = await this.scheduleDao.checkConflict(
      dto.userId,
      dto.scheduleId,
    );
    if (conflict) {
      throw new BusinessException("스케줄 충돌");
    }

    ticket.remaining -= 1;
    await this.ticketDao.update(ticket);

    const enrollment = await this.enrollmentDao.insert(dto);

    if (ticket.remaining === 0) {
      await this.ticketDao.updateStatus(ticket.id, TicketStatus.EXHAUSTED);
    }

    return enrollment;
  }
}
```

### 기대 출력 (FlowGraph IR)

```json
{
  "handler": "createEnrollment",
  "method": "POST",
  "path": "/api/enrollments",
  "file": "enrollment.handler.ts",
  "nodes": [
    {
      "id": "h1",
      "type": "entry",
      "layer": "handler",
      "label": "POST /api/enrollments"
    },
    {
      "id": "h2",
      "type": "validation",
      "layer": "handler",
      "label": "!ticketId || !userId || !scheduleId"
    },
    {
      "id": "h3",
      "type": "error",
      "layer": "handler",
      "label": "throw BadRequestError"
    },
    {
      "id": "s1",
      "type": "action",
      "layer": "service",
      "label": "enrollmentService.create()"
    },
    {
      "id": "d1",
      "type": "action",
      "layer": "dao",
      "label": "ticketDao.findById()"
    },
    {
      "id": "s2",
      "type": "condition",
      "layer": "service",
      "label": "ticket.status !== ACTIVE"
    },
    {
      "id": "s3",
      "type": "error",
      "layer": "service",
      "label": "throw: 유효하지 않은 수강권"
    },
    {
      "id": "s4",
      "type": "condition",
      "layer": "service",
      "label": "ticket.remaining <= 0"
    },
    {
      "id": "s5",
      "type": "error",
      "layer": "service",
      "label": "throw: 횟수 소진"
    },
    {
      "id": "d2",
      "type": "action",
      "layer": "dao",
      "label": "scheduleDao.checkConflict()"
    },
    {
      "id": "s6",
      "type": "condition",
      "layer": "service",
      "label": "conflict"
    },
    {
      "id": "s7",
      "type": "error",
      "layer": "service",
      "label": "throw: 스케줄 충돌"
    },
    {
      "id": "s8",
      "type": "action",
      "layer": "service",
      "label": "ticket.remaining -= 1"
    },
    {
      "id": "d3",
      "type": "action",
      "layer": "dao",
      "label": "ticketDao.update()"
    },
    {
      "id": "d4",
      "type": "action",
      "layer": "dao",
      "label": "enrollmentDao.insert()"
    },
    {
      "id": "s9",
      "type": "condition",
      "layer": "service",
      "label": "ticket.remaining === 0"
    },
    {
      "id": "d5",
      "type": "action",
      "layer": "dao",
      "label": "ticketDao.updateStatus(EXHAUSTED)"
    },
    { "id": "r1", "type": "return", "layer": "handler", "label": "201 Created" }
  ],
  "edges": [
    { "from": "h1", "to": "h2" },
    { "from": "h2", "to": "h3", "label": "Yes", "type": "true" },
    { "from": "h2", "to": "s1", "label": "No", "type": "false" },
    { "from": "s1", "to": "d1" },
    { "from": "d1", "to": "s2" },
    { "from": "s2", "to": "s3", "label": "Yes", "type": "true" },
    { "from": "s2", "to": "s4", "label": "No", "type": "false" },
    { "from": "s4", "to": "s5", "label": "Yes", "type": "true" },
    { "from": "s4", "to": "d2", "label": "No", "type": "false" },
    { "from": "d2", "to": "s6" },
    { "from": "s6", "to": "s7", "label": "Yes", "type": "true" },
    { "from": "s6", "to": "s8", "label": "No", "type": "false" },
    { "from": "s8", "to": "d3" },
    { "from": "d3", "to": "d4" },
    { "from": "d4", "to": "s9" },
    { "from": "s9", "to": "d5", "label": "Yes", "type": "true" },
    { "from": "s9", "to": "r1", "label": "No", "type": "false" },
    { "from": "d5", "to": "r1" }
  ]
}
```

### 참고: skillflo-api 스타일 코드 예시와 기대 파싱 결과

#### 입력 코드

```typescript
// member-handler.ts (Fastify CrudHandler 패턴)
export class MemberCrudHandler extends BaseCrudHandler<
  MemberService,
  MemberMapper
> {
  bindRoute = () => {
    this.routePath = `/member`;
    this.signUp(SIGN_UP());
  };

  signUp = (Schema: object): void => {
    this.server.post(
      `${this.routePath}/sign-up`,
      this.getOptions(Schema),
      async (request) => {
        const command = this.mapper.bodyMapper<MemberSignUpBody>(request);
        const { id } = await this.service.signUp(command);
        return { data: { id } };
      },
    );
  };
}

// member-service.ts (DI 주입 패턴)
export class MemberService {
  private readonly memberDao: MemberDao;
  private readonly customerService: CustomerService;
  constructor({ memberDao, customerService }: DIContainers) {
    this.memberDao = memberDao;
    this.customerService = customerService;
  }

  async signUp(command: MemberSignUpBody) {
    const existing = await this.memberDao.getByEmail(command.email);
    if (existing) {
      throw new ConflictException("이미 등록된 이메일입니다.");
    }

    const customer = await this.customerService.getActiveCustomer(
      command.customerId,
    );
    if (!customer) {
      throw new NotFoundException("고객사 정보가 존재하지 않습니다.");
    }

    const member = await this.memberDao.save({
      email: command.email,
      name: command.name,
      customerId: customer.id,
    });

    return { id: member.id };
  }
}
```

#### 기대 출력 (FlowGraph IR)

```json
{
  "handler": "signUp",
  "method": "POST",
  "path": "/api/b2e/member/sign-up",
  "file": "member-handler.ts",
  "nodes": [
    {
      "id": "h1",
      "type": "entry",
      "layer": "handler",
      "label": "POST /api/b2e/member/sign-up"
    },
    {
      "id": "h2",
      "type": "action",
      "layer": "handler",
      "label": "mapper.bodyMapper<MemberSignUpBody>()"
    },
    {
      "id": "s1",
      "type": "action",
      "layer": "service",
      "label": "service.signUp()"
    },
    {
      "id": "d1",
      "type": "action",
      "layer": "dao",
      "label": "memberDao.getByEmail()"
    },
    {
      "id": "s2",
      "type": "condition",
      "layer": "service",
      "label": "existing"
    },
    {
      "id": "s3",
      "type": "error",
      "layer": "service",
      "label": "throw ConflictException: 이미 등록된 이메일"
    },
    {
      "id": "s4",
      "type": "action",
      "layer": "service",
      "label": "customerService.getActiveCustomer()"
    },
    {
      "id": "s5",
      "type": "condition",
      "layer": "service",
      "label": "!customer"
    },
    {
      "id": "s6",
      "type": "error",
      "layer": "service",
      "label": "throw NotFoundException: 고객사 정보 미존재"
    },
    {
      "id": "d2",
      "type": "action",
      "layer": "dao",
      "label": "memberDao.save()"
    },
    {
      "id": "r1",
      "type": "return",
      "layer": "handler",
      "label": "{ data: { id } }"
    }
  ],
  "edges": [
    { "from": "h1", "to": "h2" },
    { "from": "h2", "to": "s1" },
    { "from": "s1", "to": "d1" },
    { "from": "d1", "to": "s2" },
    { "from": "s2", "to": "s3", "label": "Yes", "type": "true" },
    { "from": "s2", "to": "s4", "label": "No", "type": "false" },
    { "from": "s4", "to": "s5" },
    { "from": "s5", "to": "s6", "label": "Yes", "type": "true" },
    { "from": "s5", "to": "d2", "label": "No", "type": "false" },
    { "from": "d2", "to": "r1" }
  ]
}
```

---

## 10. Claude Code 실행 지침

이 설계서를 기반으로 구현할 때 아래 순서를 따르세요:

1. **Phase 1부터 순차적으로 진행**하세요. Phase 2, 3은 Phase 1이 완료된 후 진행합니다.
2. **타입 정의를 먼저** 작성하세요 (`src/types/` 디렉토리).
3. **파서에 대한 단위 테스트를 먼저** 작성하고, 테스트가 통과하도록 파서를 구현하세요.
4. **테스트 fixture**는 Section 9의 예시 코드를 활용하세요.
5. React Flow 렌더링은 파서가 안정된 후 연결하세요.
6. 커밋은 모듈 단위로 나눠주세요 (parser, renderer, github-auth, ai-labeling).
