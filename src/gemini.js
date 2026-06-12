import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export const parseMessageWithGemini = async (text, todayDate, teamList) => {
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

    const daysKo = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const dayOfWeekIndex = (1 + (todayDate - 1)) % 7; // June 1st, 2026 is Monday (1)
    const todayDOW = daysKo[dayOfWeekIndex];

    const prompt = `
You are an AI assistant that manages a team calendar.
Analyze the user's input message and determine the correct action to take.

Context Information:
- Current Year/Month: June 2026 (2026.06)
- Today's Date: 2026.06.${todayDate} (${todayDOW}) (Use this as reference for relative dates like "오늘", "내일", "다음주", "이번주", etc.)
- Team Members list:
${JSON.stringify(teamList, null, 2)}

User Input:
"${text}"

Instructions:
Determine if the user wants to CREATE new schedules, UPDATE existing schedules, or DELETE schedules.

Return a JSON object in one of the following formats:

1. CREATE ACTION:
Use this if the user wants to add new schedules (e.g. "오늘 12시 회의 등록해줘", "내일 대신증권 투입").
Format:
{
  "action": "create",
  "schedules": [
    {
      "title": "대신증권 투입",
      "startHour": 9.0,
      "endHour": 10.0,
      "date": 15,
      "memberId": "sh",
      "isAll": false,
      "groupId": "g_123",
      "description": "상세 설명 내용"
    }
  ]
}
Values for "schedules" fields:
- "title" (string): Concise event title.
- "startHour" (number): Start time (24h format).
- "endHour" (number): End time (24h format).
- "date" (number): Day of the month in June 2026. Relative dates calculated from today's date: ${todayDate}.
  * If the schedule spans multiple days or dates (e.g., "26일 ~ 27일", "2026. 06. 26 (금) ~ 27 (토)"), you must generate one schedule object for each date in the range, and assign them all the exact same "groupId" string (e.g., "g_2627" or any random identifier starting with "g_") so they are treated as a single cohesive schedule.
  CRITICAL WEEKDAY RULES (Korean Context):
  * "다음주 [요일]" (next week [weekday]) or "[요일]" (weekday):
    - If today is Friday June 12th (12), "다음주 월요일" (next Monday) refers to June 15th (15), which is 3 days later. It must NOT refer to June 22nd. June 22nd is the Monday of the week after next.
    - Generally, if today is Friday, the upcoming Monday is "다음주 월요일" because it belongs to the next calendar week.
    - Verify your relative day calculations strictly.
- "memberId" (string): Assigned member ID (default to first member's ID: "${teamList[0]?.id || 'sh'}").
- "isAll" (boolean): true if for all members.
- "description" (string): A structured, clearly organized step-by-step or bulleted list of the tasks/details (e.g., "- 상무님 법인카드 지급 및 규정 확인\n- 비즈플레이 앱 등록\n- 과장 승인 요청") summarized concisely from the input. Strictly format it as a bulleted list using "-" for each item, separated by line breaks ("\n"). Do not write a continuous long sentence or paragraph. Provide this in Korean, without dates/times/assignees.


2. UPDATE ACTION:
Use this if the user wants to change or move existing schedules (e.g. "모든 일정의 날짜를 오늘로 변경", "15일 일정들 다 16일로 옮겨줘", "회의 일정을 15시로 변경해줘").
Format:
{
  "action": "update",
  "criteria": {
    "all": true/false, // Set to true if target is "all schedules" or "모든 일정"
    "date": 15, // Target schedules on a specific date (optional, number)
    "title": "회의" // Target schedules with a matching title keyword (optional, string)
  },
  "updates": {
    "date": 12, // New date day to apply (optional, number)
    "startHour": 15.0, // New start hour (optional, number)
    "endHour": 16.0 // New end hour (optional, number)
  }
}
Note: Calculate relative dates based on today's date: ${todayDate}. For example, "오늘" is ${todayDate}.

3. DELETE ACTION:
Use this if the user wants to remove/clear existing schedules (e.g. "15일 일정 전부 삭제해줘").
Format:
{
  "action": "delete",
  "criteria": {
    "all": true/false,
    "date": 15,
    "title": "회의"
  }
}

The output must be EXACTLY a single valid JSON object matching one of the formats above. Do not include markdown code block formatting (like \`\`\`json) inside the JSON string itself.
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    return JSON.parse(responseText);
  } catch (error) {
    console.error("Failed to parse message with Gemini", error);
    return null;
  }
};
