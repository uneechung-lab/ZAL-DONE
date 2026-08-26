import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export const parseMessageWithGemini = async (text, todayDate, teamList, year = new Date().getFullYear(), month = new Date().getMonth() + 1, currentUser = null) => {
  if (!genAI) {
    console.warn("Gemini API key is missing. Please set VITE_GEMINI_API_KEY in .env");
    return null;
  }

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
- Calendar Cheat Sheet (CRITICAL - USE THIS EXACT MAPPING FOR ALL DATES AND WEEKDAYS):
${calendarGuide}
- Team Members list:
${JSON.stringify(teamList, null, 2)}

User Input:
"${text}"

Instructions:
Determine if the user wants to CREATE new schedules, UPDATE existing schedules, or DELETE schedules.

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
      5) For "9월 두번째 화요일": 9월 8일 (date: 8).
    - "다음주 [요일]" (next week [weekday]) or "[요일]" (weekday): Verify relative day calculations strictly based on today (${year}.${monthStr}.${todayDate}).
- "startHour" (number): Start time (24h format, e.g. 9.0).
  * CRITICAL HALF-DAY & LEAVE TIME & ASSIGNEE RULES (MUST FOLLOW STRICTLY):
    1) "오후 반차" (Afternoon Half-day Leave): MUST set startHour: 14.0, endHour: 18.0 (14:00 ~ 18:00).
    2) "오전 반차" (Morning Half-day Leave): MUST set startHour: 9.0, endHour: 14.0 (09:00 ~ 14:00).
    3) "반차" (unspecified half-day): Default to startHour: 14.0, endHour: 18.0 unless "오전" is explicitly specified.
    4) "연차", "휴가", "병가" (Full-day leave): MUST set startHour: 9.0, endHour: 18.0 (09:00 ~ 18:00).
    5) LEAVE MEMBER ASSIGNMENT: For any leave/vacation ("연차", "반차", "휴가", "병가"), "memberId" MUST ALWAYS BE the current user "${currentUser?.id || 'sh'}" who is taking the leave! Even if the input mentions a manager (e.g. "조상무님한테 9월 1일 오후 반차 승인 요청"), "memberId" MUST BE "${currentUser?.id || 'sh'}" (the applicant), and "approverId" MUST BE "sangmoo"! Never assign the leave schedule memberId to the manager!
- "endHour" (number): End time (24h format, e.g. 18.0).
- "memberId" (string): Assigned member ID. CRITICAL MEMBER ASSIGNMENT & ALIAS RULES:
  1) If the input mentions assigning or delegating a task to another specific team member (e.g. "정사원한테/정다음한테/정사인한테 로그 분석 맡기고" -> memberId: "daum"), set "memberId" to that target team member's ID!
  2) Otherwise, default "memberId" to the current user "${currentUser?.name || '현재 사용자'}" (ID: "${currentUser?.id || 'sh'}").
  3) Korean Team Aliases & IDs:
     - "정다음", "정사원", "정사인", "다음", "정사원한테", "정사인한테", "정다음한테" -> ALWAYS map "memberId" to "daum" and "approverId" to "daum"!
     - "정윤희", "정부장", "윤희", "정부장한테" -> "sh" (정윤희 부장)
     - "조상무", "상무님", "조상무님", "상무님한테" -> "sangmoo" (조상무 상무)
- "isAll" (boolean): true if for all members.
- "isRequested" (boolean): Set to true if:
  1) The schedule explicitly requires manager approval ("연차", "오후 반차", "휴가", "병가", "승인 요청").
  2) The current user is assigning/delegating a task or meeting request to another colleague (e.g. "정사원한테 로그 분석 맡기고" -> isRequested: true, assigned to "daum").
  3) Otherwise, for personal work tasks performed by the logged-in user, set "isRequested": false.
- "approverId" (string): Target approver ID (e.g. if applicant is 정윤희/sh -> set to "sangmoo" (조상무 상무), otherwise set to "sh" (정윤희 부장)).
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
    const responseText = result.response.text();
    let cleanedText = responseText.trim();
    if (cleanedText.includes('```')) {
      cleanedText = cleanedText.replace(/^[\s\S]*?```(?:json)?\s*/i, '').replace(/\s*```[\s\S]*$/i, '').trim();
    }
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error("Failed to parse message with Gemini", error);
    try {
      if (typeof responseText === 'string') {
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
