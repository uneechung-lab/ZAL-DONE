import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export const parseMessageWithGemini = async (text, todayDate, teamList, year = new Date().getFullYear(), month = new Date().getMonth() + 1, currentUser = null) => {
  if (!genAI) {
    console.warn("Gemini API key is missing. Please set VITE_GEMINI_API_KEY in .env");
    return null;
  }

  let responseText = '';
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const now = new Date(year, month - 1, todayDate);
    const daysKo = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const todayDOW = daysKo[now.getDay()];
    const monthStr = month < 10 ? `0${month}` : `${month}`;

    const monthMentionMatch = text.match(/(\d{1,2})\s*월/);
    const targetMonthNum = monthMentionMatch ? parseInt(monthMentionMatch[1]) : month;

    const buildCalendarGuide = (y, m) => {
      const daysInM = new Date(y, m, 0).getDate();
      const list = [];
      for (let d = 1; d <= daysInM; d++) {
        const dow = daysKo[new Date(y, m - 1, d).getDay()];
        list.push(`${d}일(${dow})`);
      }
      return `${y}년 ${m}월 달력: ` + list.join(', ');
    };

    const calendarGuide = [
      buildCalendarGuide(year, month),
      targetMonthNum !== month ? buildCalendarGuide(year, targetMonthNum) : ''
    ].filter(Boolean).join('\n');

    const prompt = `
You are an AI assistant that manages a team calendar.
Analyze the user's input message and determine the correct action to take.

Context Information:
- Current Year/Month: ${year}.${monthStr}
- Today's Date: ${year}.${monthStr}.${todayDate} (${todayDOW}) (Use this as reference for relative dates like "오늘", "내일", "다음주", "이번주", etc.)
- Current Logged-in User: ${currentUser ? `${currentUser.name} (${currentUser.role || '멤버'}, ID: "${currentUser.id}")` : '정윤희 (부장, ID: "sh")'}
- Calendar Cheat Sheet (CRITICAL - USE THIS EXACT MAPPING FOR ALL DATES AND WEEKDAYS):
${calendarGuide}
- Team Members list:
${JSON.stringify(teamList, null, 2)}

User Input:
"${text}"

Instructions:
Determine if the user wants to CREATE new schedules, UPDATE existing schedules, or DELETE schedules.

CRITICAL COMPOUND SENTENCE & MULTI-SCHEDULE EXTRACTION RULE:
When the user's message contains MULTIPLE events, meetings, briefings, conferences, reports, or delegated tasks connected in a complex sentence (e.g. connected by "~갔다가", "~복귀해서", "~들어갈 거고", "~전에", "~보고받고", "~라고 해", "~하고", "~하며", commas, etc.):
- You MUST extract EVERY SINGLE DISTINCT ACTIVITY as a separate schedule object in the "schedules" array!
- Do NOT merge or compress multiple separate tasks into a single schedule!
- Determine the correct startHour/endHour, title, and memberId for each distinct activity:
  * Example 1: "11시 대신증권 본사 미팅 나갔다가" -> title: "대신증권 본사 미팅", startHour: 11.0, endHour: 12.0, memberId: "${currentUser?.id || 'sangmoo'}", isRequested: false
  * Example 2: "2시까지 사내 보안 감사 지적사항 조치 결과 보고받고" -> title: "사내 보안 감사 지적사항 조치 결과 보고", startHour: 13.0, endHour: 14.0, memberId: "${currentUser?.id || 'sangmoo'}", isRequested: false
  * Example 3: "3시에 정부장 브리핑 들어갈 거고" -> title: "정부장 브리핑", startHour: 15.0, endHour: 16.0, memberId: "${currentUser?.id || 'sangmoo'}", isRequested: false
  * Example 4: "4시 반에 부서장 결산 회의" -> title: "부서장 결산 회의", startHour: 16.5, endHour: 17.5, memberId: "${currentUser?.id || 'sangmoo'}", isRequested: false
  * Example 5: "정다음 사원한테 오늘 야근자 파악해서 저녁 식대 신청 일정 잡으라고 해" -> title: "야근자 파악 및 저녁 식대 신청 일정", startHour: 18.0, endHour: 19.0, memberId: "daum", isRequested: true, approverId: "daum"

CRITICAL SINGLE-TASK DELEGATION RULE:
When the input describes an unexpected system incident and a delegated task together (e.g. "아침부터 인증 서버 지연 이슈 떠서 정사인한테 로그 분석 맡기고"):
- Extract TWO SEPARATE schedule items:
  1. The incident issue itself: title "인증 서버 지연 이슈", memberId: "${currentUser?.id || 'sangmoo'}", isIssue: true, isRequested: false (this belongs to the current user!)
  2. The delegated task: title "로그 분석", memberId: "daum", isIssue: false, isRequested: true, approverId: "daum" (delegated to daum)
- NEVER combine them into a single item!
- The incident issue ALWAYS belongs to the CURRENT USER, not daum!
- The delegated log analysis task ALWAYS belongs to daum!

CRITICAL TITLE EXTRACTION RULES:
- Remove trailing connective words from titles: "~떠서", "~해서", "~하고", "~이후", "~맡기고", "~잡으라고", "~들어갈 거고" etc.
- "아침부터 인증 서버 지연 이슈 떠서" -> title: "인증 서버 지연 이슈" (NOT "인증 서버 지연 이슈 떠서")
- "정사원한테 로그 분석 맡기고" -> title: "로그 분석" (NOT "정사원한테 로그 분석 맡기고")
- "11시에 회의실B에서 긴급 대책 회의 들어감" -> title: "긴급 대책 회의" (NOT include 들어감, 회의실B)
- "오후엔 경영진 보고서 쓰고" -> title: "경영진 보고서 작성" (NOT "경영진 보고서 쓰고")
- "조상무님한테 9월 1일 오후 반차 승인 요청도 올려놔" -> title: "오후 반차", month: 9, date: 1, startHour: 14.0, endHour: 18.0, memberId: "${currentUser?.id || 'sh'}", isRequested: true, approverId: "sangmoo"

Return a JSON object in one of the following formats:

1. CREATE ACTION:
Use this if the user wants to add new schedules (e.g. "오늘 12시 회의 등록해줘", "9월 14일 대외 오픈일", "내일 대신증권 투입").
Format:
{
  "action": "create",
  "schedules": [
    {
      "title": "대외 오픈일",
      "year": ${year},
      "month": 9,
      "date": 14,
      "startHour": 9.0,
      "endHour": 10.0,
      "memberId": "sh",
      "isAll": false,
      "groupId": "g_123",
      "description": "상세 설명 내용"
    }
  ]
}
Values for "schedules" fields:
- "title" (string): Concise event title.
- "year" (number): Year of the schedule (e.g. ${year}). Default to current year ${year} unless another year is specified.
- "month" (number): Month of the schedule (1 ~ 12). CRITICAL: If the user input mentions a specific month number (e.g. "9월 14일" -> month: 9, "9월 4일" -> month: 9, "10월 5일" -> month: 10), you MUST set "month" to that exact month number! Do NOT default to ${month} if a specific month (e.g. "9월") is written in the user input.
- "date" (number): Day of the month (1 ~ 31). Relative dates calculated from today's date: ${todayDate}.
  * CRITICAL DATE RANGE & "까지" / "목표" / "마감" RULES:
    1) If the phrase uses "까지", "목표", "마감", "전까지" (e.g., "9월 4일까지", "9월 4일 목표", "차주 말까지", "내일까지", "27일까지"):
       - The start date of the range MUST ALWAYS BE Today (${year}.${monthStr}.${todayDate}).
       - The end date is the target date specified (e.g., 9월 4일 or 차주 금요일).
       - You MUST generate one schedule object for EVERY SINGLE DATE from Today (${year}.${monthStr}.${todayDate}) up to the end date (including all intermediate dates).
       - Assign ALL schedules in this range the EXACT SAME "groupId" string (e.g., "g_until_0904") so they form a continuous schedule bar from Today to the target date.
    2) If the phrase specifies an explicit range (e.g. "26일 ~ 27일" or "8월 21일 ~ 9월 4일"):
       - Generate one schedule object for each date in the range, and assign them all the exact same "groupId" string (e.g., "g_range_2627").
  * CRITICAL NTH WEEKDAY RULES (Korean Context):
    - When the user specifies phrases like "[Month] [N]번째 [요일]" or "[Month] [N]째주 [요일]" (e.g., "9월 첫번째 화요일", "9월 둘째주 목요일", "10월 3번째 금요일"):
      1) Look up the EXACT date from the Calendar Cheat Sheet above for that month.
      2) Find the N-th date that falls on that specific [요일].
      3) FOR EXAMPLE: In 2026년 9월, 1일 is 화요일. So "9월 첫번째 화요일" is 9월 1일 (date: 1)! Do NOT calculate 9월 2일 (which is 수요일)!
      4) For "9월 첫번째 수요일": 9월 2일 (date: 2).
- "endHour" (number): End time (24h format, e.g. 18.0).
- "memberId" (string): Assigned member ID. CRITICAL MEMBER ASSIGNMENT & ALIAS RULES:
  1) For approval/leave requests ("신청", "승인", "반차", "연차"), ALWAYS set memberId to "${currentUser?.id || 'sh'}".
  2) If the input mentions assigning or delegating a task to another specific team member (e.g. "정사원한테/정다음한테 로그 분석 맡기고" -> memberId: "daum"), set "memberId" to that target team member's ID!
  3) Otherwise, default "memberId" to the current user "${currentUser?.name || '현재 사용자'}" (ID: "${currentUser?.id || 'sh'}").
  4) Korean Team Aliases & IDs:
     - "정다음", "정사원", "정사인", "다음", "정사원한테", "정사인한테", "정다음한테" -> "daum"
     - "정윤희", "정부장", "윤희", "정부장한테" -> "sh" (정윤희 부장)
     - "조상무", "상무님", "조상무님", "상무님한테" -> "sangmoo" (조상무 상무)
- "isAll" (boolean): true if for all team members (e.g. "팀 전체 회식", "전체 회의", "전체 워크숍").
- "isRequested" (boolean): Set to true if:
  1) The schedule explicitly requires manager approval ("연차", "오후 반차", "오전 반차", "휴가", "병가", "승인 요청", "신청", "식대 신청").
  2) The current user is assigning/delegating a task, meeting, dinner, or schedule to another colleague or team-wide (e.g. "정사원한테 로그 분석 맡기고", "팀 전체 회식", "전체 미팅" -> isRequested: true).
  3) ANY schedule that involves other members (delegation or team-wide) MUST require recipient acceptance, so set "isRequested": true.
  4) ONLY for strictly personal solo tasks performed alone by the logged-in user, set "isRequested": false.
- "approverId" (string): Target approver ID.
  - If applicant explicitly specifies who should approve (e.g. "조상무님한테 결재 올려줘", "상무님 결재" -> "sangmoo"; "정부장님한테 결재", "정윤희 부장님 결재" -> "sh"; "정다음 사원한테" -> "daum"), set to that specified person's ID!
  - If no specific approver is mentioned: for "daum" -> "sh", for "sh" -> "sangmoo", for "sangmoo" -> "sh".
- "isIssue" (boolean): CRITICAL ISSUE CLASSIFICATION RULE:
  Set to true ONLY if the specific task itself is an unexpected incident, system error, bug, or emergency debugging ("긴급 디버깅", "장애 파기", "이슈 처리", "버그 수정").
  Regular work tasks such as writing reports/documents ("경영진 보고서 작성", "보고서 작성", "자료 작성", "문서 작성"), meetings ("회의", "대책 회의", "리뷰"), and development ("API 연동", "개발", "점검") MUST ALWAYS HAVE "isIssue": false!
- "description" (string): A structured, clearly organized step-by-step or bulleted list of the tasks/details summarized concisely from the input. Strictly format it as a bulleted list using "-" for each item, separated by line breaks ("\n"). Do not write a continuous long sentence or paragraph. Provide this in Korean, without dates/times/assignees. IMPORTANT: This description must ONLY contain the sub-tasks or detailed steps belonging specifically to this individual schedule. If there are no specific sub-tasks, detailed notes, or action items for this schedule in the input, you must leave this field empty ("").


2. UPDATE ACTION:
Use this if the user wants to change or move existing schedules.
Format:
{
  "action": "update",
  "criteria": {
    "all": true/false,
    "month": 9,
    "date": 15,
    "title": "회의"
  },
  "updates": {
    "month": 9,
    "date": 12,
    "startHour": 15.0,
    "endHour": 16.0
  }
}

3. DELETE ACTION:
Use this if the user wants to remove/clear existing schedules.
Format:
{
  "action": "delete",
  "criteria": {
    "all": true/false,
    "month": 9,
    "date": 15,
    "title": "회의"
  }
}

The output must be EXACTLY a single valid JSON object matching one of the formats above. Do not include markdown code block formatting (like \`\`\`json) inside the JSON string itself.
`;

    const result = await model.generateContent(prompt);
    responseText = result.response.text();
    let cleanedText = responseText.trim();
    if (cleanedText.includes('```')) {
      cleanedText = cleanedText.replace(/^[\s\S]*?```(?:json)?\s*/i, '').replace(/\s*```[\s\S]*$/i, '').trim();
    }
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error("Failed to parse message with Gemini", error);
    try {
      if (typeof responseText === 'string' && responseText) {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }
    } catch (innerErr) {
      console.error("Fallback regex JSON extraction also failed:", innerErr);
    }
    return null;
  }
};
