const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 5000;

// 1️⃣ [필수] CORS 설정 - 프론트엔드(React) 브라우저 차단 방지
app.use(cors());
app.use(express.json());

// 테스트용 메인 루트 라우트
app.get('/', (req, res) => {
    res.send('복지ON길 MVP 백엔드 서버가 정상 작동 중입니다!');
});

/**
 * [API 1] 거주지 및 조건 기반 복지 서비스 조회
 * POST /api/welfare/recommend
 */
app.post('/api/welfare/recommend', (req, res) => {
    const { dong, age, householdType, incomeLevel } = req.body;
    
    console.log(`[추천 요청 수신] 동: ${dong}, 연령: ${age}, 가구: ${householdType}, 소득: ${incomeLevel}`);

    // 메이커톤 데모용 Mock 데이터 (성북구 정릉동 예시)
    const mockWelfareList = [
        {
            id: 1,
            title: "어르신 돌봄 돌봄SOS서비스",
            category: "일상 돌봄",
            target: "65세 이상 거동 불편 어르신",
            description: "갑작스러운 일시적 위기 상황에 처한 취약 계층에게 가사·간병, 이동 지원 등의 맞춤형 서비스를 신속하게 제공합니다.",
            facilityName: "정릉제2동 주민센터",
            address: "서울 성북구 아리랑로19길 46"
        },
        {
            id: 2,
            title: "노인 맞춤형 식사 배달 서비스",
            category: "보건·의료/급식",
            target: "만 60세 이상 저소득 결식 우려 노인",
            description: "거동이 불편하여 스스로 식사를 준비하기 어려운 어르신 가정을 방문하여 균형 잡힌 도시락 및 밑반찬을 배달합니다.",
            facilityName: "성북노인종합복지관",
            address: "서울 성북구 종암로15길 10"
        }
    ];

    res.status(200).json({
        success: true,
        message: "조건에 맞는 복지 서비스 조회 성공",
        data: mockWelfareList
    });
});

/**
 * [API 2] 복지 시설 경로 및 교통 약자 맞춤형 길 안내
 * GET /api/navigation/route
 */
app.get('/api/navigation/route', (req, res) => {
    const { startX, startY, endX, endY } = req.query;

    console.log(`[길 안내 요청 수신] 출발지 좌표: (${startX}, ${startY}) -> 목적지 좌표: (${endX}, ${endY})`);

    // 시니어 맞춤형 고대비 및 무장애 동선 데이터 예시
    const mockRouteData = {
        destinationName: "정릉제2동 주민센터",
        totalDistance: "450m",
        totalTime: "약 8분",
        barrierFreePoints: [
            "정릉역 2번 출구 이용 권장 (엘리베이터 유)",
            "주민센터 진입로 슬로프 설치 구역 (계단 없음)"
        ],
        steps: [
            { index: 1, instruction: "정릉역 2번 출구 엘리베이터에서 나와서 직진하세요.", distance: "150m" },
            { index: 2, instruction: "⚠️ 정릉시장 입구 횡단보도는 턱이 높으니 우측 보도블록 경사로를 이용하세요.", distance: "200m" },
            { index: 3, instruction: "정릉제2동 주민센터 정문 우측의 완만한 경사로를 통해 진입하세요.", distance: "100m" }
        ]
    };

    res.status(200).json({
        success: true,
        message: "교통 약자 맞춤형 경로 조회 성공",
        data: mockRouteData
    });
});

/**
 * [API 3] 어려운 복지 용어 해설 챗봇
 * POST /api/chatbot/explain
 */
app.post('/api/chatbot/explain', (req, res) => {
    const { message } = req.body;

    console.log(`[챗봇 질문 수신] 문장: "${message}"`);

    // 간단한 키워드 매칭 기반 시니어 맞춤형 쉬운 말 답변 (메이커톤 데모용)
    let reply = "어르신, 질문하신 내용에 대해 더 쉽게 설명해 드릴게요! 혹시 복지 서비스 신청 방법이 궁금하신가요?";
    
    if (message.includes("돌봄SOS") || message.includes("돌봄")) {
        reply = "👵 '돌봄SOS서비스'는 혼자서 식사나 청소하기가 갑자기 어려워지셨을 때, 나라에서 도우미 선생님을 보내드려 집안일이나 병원 동행을 도와주는 아주 고마운 제도예요.";
    } else if (message.includes("소득인정액") || message.includes("소득")) {
        reply = "💰 '소득인정액'은 어르신이 매달 버시는 돈(월급 등)뿐만 아니라, 가지고 계신 집이나 통장의 재산까지 모두 돈으로 계산해서 합친 금액을 뜻해요.";
    } else if (message.includes("본인부담금") || message.includes("비용")) {
        reply = "💵 '본인부담금'은 복지 서비스를 받을 때 나라에서 대부분의 돈을 내주지만, 어르신이 아주 조금 직접 내셔야 하는 '내 몫의 돈'을 말해요. 형편이 어려우시면 이 돈도 안 내실 수 있어요.";
    }

    res.status(200).json({
        success: true,
        message: "챗봇 답변 생성 성공",
        data: {
            reply: reply
        }
    });
});


// 2️⃣ [필수] 서버 실행할 때 주소 개방 (0.0.0.0)
// 같은 와이파이를 쓰는 프론트팀(윤서, 윤영님)이 가빈님 노트북 IP로 접속할 수 있게 합니다.
app.listen(PORT, '0.0.0.0', () => {
    console.log(`==================================================`);
    console.log(`🚀 복지ON길 백엔드 서버가 성공적으로 켜졌습니다!`);
    console.log(`📡 포트 번호: http://localhost:${PORT}`);
    console.log(`📢 프론트엔드 연결 대기중 (0.0.0.0 개방 완료)`);
    console.log(`==================================================`);
});