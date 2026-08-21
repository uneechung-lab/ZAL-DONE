import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export const parseMessageWithGemini = async (text, todayDate, teamList, year = new Date().getFullYear(), month = new Date().getMonth() + 1) => {
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

    const prompt = `
You are an AI assistant that manages a team calendar.
Analyze the user's input message and determine the correct action to take.

Context Information:
- Current Year/Month: ${year}.${monthStr}
- Today's Date: ${year}.${monthStr}.${todayDate} (${todayDOW}) (Use this as reference for relative dates like "오늘", "내일", "다음주", "이번주", etc.)
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
  * CRITICAL WEEKDAY RULES (Korean Context):
    - "다음주 [요일]" (next week [weekday]) or "[요일]" (weekday): Verify relative day calculations strictly based on today (${year}.${monthStr}.${todayDate}).
- "startHour" (number): Start time (24h format, e.g. 9.0).
- "endHour" (number): End time (24h format, e.g. 10.0).
- "memberId" (string): Assigned member ID (default to first member's ID: "${teamList[0]?.id || 'sh'}").
- "isAll" (boolean): true if for all members.
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
    return JSON.parse(responseText);
  } catch (error) {
    console.error("Failed to parse message with Gemini", error);
    return null;
  }
};
