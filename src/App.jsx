import { useState, useEffect, useRef } from 'react';
import './index.css';
import { appwriteService, isConfigured } from './appwrite';
import { parseMessageWithGemini } from './gemini';

const TEAM = [
  { id: 'sh', name: '정윤희', role: '나(부장)', avatar: '윤희', avatarPic: '/pic1_thumb.png', color: '#6366f1', subtext: '기획 일정' },
  { id: 'daeum', name: '정다음', role: '정다음(사원)', avatar: '다음', avatarPic: '/pic2_thumb.png', color: '#10b981', subtext: '개인 일정' }
];

// ─── Initial schedules ──────────────────────────────────────────────────────────
const INITIAL_SCHEDULES = [];

// Helper to get mini-calendar days dynamically for any year and month
function getMonthDays(year, month) {
  const days = [];
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0: Sun, 1: Mon, ...
  const totalDays = new Date(year, month, 0).getDate();
  const prevMonthTotalDays = new Date(year, month - 1, 0).getDate();

  // Padding days from previous month
  for (let i = firstDay - 1; i >= 0; i--) {
    days.push({ dayNum: prevMonthTotalDays - i, isCurrentMonth: false });
  }
  // Days of current month
  for (let i = 1; i <= totalDays; i++) {
    days.push({ dayNum: i, isCurrentMonth: true });
  }
  // Padding days for next month to complete 7-day grid rows
  const remaining = (7 - (days.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    days.push({ dayNum: i, isCurrentMonth: false });
  }
  return days;
}

// Helper to check if a schedule belongs to the target year and month (defaults to 2026.06 for legacy data)
function isScheduleInMonth(s, year, month) {
  if (!s) return false;
  let schedYear = s.year;
  let schedMonth = s.month;

  if (!schedYear || !schedMonth) {
    if (s.description) {
      const match = s.description.match(/\[YM:(\d{4})\.(\d{1,2})\]/);
      if (match) {
        schedYear = parseInt(match[1]);
        schedMonth = parseInt(match[2]);
      }
    }
  }

  schedYear = schedYear || 2026;
  schedMonth = schedMonth || 6;
  return schedYear === year && schedMonth === month;
}

function getMemberAvatarPic(member, index) {
  if (!member) return '/pic1_thumb.png';
  if (member.id === 'daeum' || member.name === '정다음' || member.avatar === '다음' || index === 1) return '/pic2_thumb.png';
  return '/pic1_thumb.png';
}

function getMemberRoleText(member, index) {
  if (!member) return '나(부장)';
  if (member.id === 'daeum' || member.name === '정다음' || member.avatar === '다음' || index === 1) return '정다음(사원)';
  return '나(부장)';
}

function getMemberAvatarStyle(member, index) {
  return {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center center',
    borderRadius: '50%',
    display: 'block'
  };
}

// Helper to check if a message is from today
function isTodayMessage(msg) {
  if (!msg) return false;
  if (msg.id === 0) return true; // Initial greeting is always shown for today
  if (!msg.createdAt) return false; // Legacy messages without createdAt timestamp belong to previous history
  try {
    const msgDate = new Date(msg.createdAt);
    const now = new Date();
    return (
      msgDate.getFullYear() === now.getFullYear() &&
      msgDate.getMonth() === now.getMonth() &&
      msgDate.getDate() === now.getDate()
    );
  } catch (e) {
    return false;
  }
}

// Helper to parse schedules from AI text reply for cancel buttons
function parseSchedulesFromText(text) {
  if (!text) return [];
  const schedulesList = [];
  const blocks = text.split(/📅?\s*일정 \d+:\s*/);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const titleMatch = block.match(/"([^"]+)"/);
    const title = titleMatch ? titleMatch[1] : '';
    
    const dateRangeMatch = block.match(/📅?\s*날짜:\s*\d{4}\.\d{2}\.(\d{2})\s*~\s*(?:\d{4}\.\d{2}\.)?(\d{2})/);
    let dates = [];
    if (dateRangeMatch) {
      const startD = parseInt(dateRangeMatch[1]);
      const endD = parseInt(dateRangeMatch[2]);
      for (let d = startD; d <= endD; d++) {
        dates.push(d);
      }
    } else {
      const dateMatch = block.match(/📅?\s*날짜:\s*\d{4}\.\d{2}\.(\d{2})/);
      if (dateMatch) {
        dates.push(parseInt(dateMatch[1]));
      }
    }
    
    const timeMatch = block.match(/⏰?\s*시간:\s*(\d{2}):\d{2}\s*~\s*(\d{2}):\d{2}/);
    const startHour = timeMatch ? parseInt(timeMatch[1]) : null;
    const endHour = timeMatch ? parseInt(timeMatch[2]) : null;
    
    if (title && dates.length > 0 && startHour !== null && endHour !== null) {
      schedulesList.push({ title, dates, startHour, endHour });
    }
  }
  return schedulesList;
}

function getTimeSlot() {
  const h = new Date().getHours();
  if (h < 12)  return 'morning';
  if (h < 14)  return 'afternoon';
  if (h < 18)  return 'evening';
  return 'night';
}

function formatTime(date) {
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function formatHour(h) {
  const hr = Math.floor(h);
  const min = h % 1 === 0 ? '00' : '30';
  return `${hr < 10 ? '0' : ''}${hr}:${min}`;
}

function getGreetingMsg(name, slot) {
  const greets = {
    morning:   `안녕하세요, ${name}님. 🌅\n좋은 아침입니다!\n오늘 진행하실 업무나 일정을 아래 입력창에 편하게 입력해 주세요.\n(예: "오늘 14시 B사 미팅", "내일 대신증권 투입")`,
    afternoon: `안녕하세요, ${name}님. ☀️\n점심은 맛있게 드셨나요?\n오늘 진행하실 업무나 일정을 아래 입력창에 편하게 입력해 주세요. 타임라인에 자동으로 등록해 드립니다!\n(예: "오늘 14시 B사 미팅", "26일 ~ 27일 워크숍")`,
    evening:   `안녕하세요, ${name}님. ✨\n오늘 하루도 수고하셨습니다.\n완료된 업무나 내일 등록할 일정을 아래 입력창에 남겨주세요!`,
    night:     `안녕하세요, ${name}님. 🌙\n늦은 시간까지 수고 많으셨어요.\n기록해두실 일정이나 업무 내용을 입력해 주세요!`,
  };
  return greets[slot];
}

// ─── Mock AI parser ───────────────────────────────────────────────────────────
function normalizeHour(h, ampm) {
  let hr = parseFloat(h);
  if (ampm === '오후') {
    if (hr < 12) hr += 12;
  } else if (ampm === '오전') {
    if (hr === 12) hr = 0;
  } else {
    if (hr >= 1 && hr <= 7) {
      hr += 12;
    }
  }
  return hr;
}

function parseMessageToSchedules(text, selectedDate, teamList = TEAM) {
  let lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  // Clean year/month in lines
  lines = lines.map(line => {
    return line.replace(/20\d{2}\s*[\./-]\s*\d{1,2}\s*[\./-]?\s*/g, '').replace(/20\d{2}\s*년?\s*(?:\d{1,2}\s*월?)?\s*/g, '');
  });

  const results = [];
  let currentDate = selectedDate;
  let currentMonthNum = null;
  let lastSchedule = null;

  const isItinerary = lines.length > 3;

  const processedLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const timeOnlyRegex = /^(?:오전|오후)?\s*\d{1,2}(?::\d{2}|\s*시\s*(?:반|30분)?)$/;
    if (timeOnlyRegex.test(line) && i + 1 < lines.length) {
      const nextLine = lines[i+1];
      const dateRegex = /(?:\d{1,2}\s*월\s*)?\d{1,2}\s*일|DAY\s*\d+/i;
      const nextTimeRegex = /^(?:오전|오후)?\s*\d{1,2}/;
      if (!dateRegex.test(nextLine) && !nextTimeRegex.test(nextLine)) {
        processedLines.push(line + ' ' + nextLine);
        i++;
        continue;
      }
    }
    processedLines.push(line);
  }

  const messageGroupId = `g_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  processedLines.forEach(line => {
    let temp = line;

    const dateKoRegex = /(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일/;
    const koDateMatch = dateKoRegex.exec(temp);
    
    const dateSimpleRegex = /(\d{1,2})\s*[\./-]\s*(\d{1,2})/;
    const simpleDateMatch = dateSimpleRegex.exec(temp);

    const rangeRegex = /(\d{1,2})\s*(?:\([^)]+\))?\s*(?:일)?\s*[-~]\s*(\d{1,2})\s*(?:\([^)]+\))?\s*(?:일)?/;
    const rangeMatch = rangeRegex.exec(temp);

    const dateMmddRegex = /(?:^|\b)(0?6)(\d{2})(?:_|\b|\])/;
    const mmddMatch = dateMmddRegex.exec(temp);

    if (rangeMatch) {
      const startDay = parseInt(rangeMatch[1]);
      currentDate = startDay;
    } else if (koDateMatch) {
      if (koDateMatch[1]) {
        currentMonthNum = parseInt(koDateMatch[1]);
      }
      currentDate = parseInt(koDateMatch[2]);
    } else if (simpleDateMatch) {
      currentMonthNum = parseInt(simpleDateMatch[1]);
      currentDate = parseInt(simpleDateMatch[2]);
    } else if (mmddMatch) {
      currentDate = parseInt(mmddMatch[2]);
    }

    let matched = false;
    let startHour = 10;
    let endHour = 11;
    let matchedString = '';

    const rangeTimeRegex = /(오전|오후)?\s*(\d{1,2}):(\d{2})\s*[-~]\s*(오전|오후)?\s*(\d{1,2}):(\d{2})/i;
    let match = rangeTimeRegex.exec(temp);
    if (match) {
      const h1 = parseInt(match[2]);
      const m1 = parseInt(match[3]);
      const h2 = parseInt(match[5]);
      const m2 = parseInt(match[6]);
      startHour = normalizeHour(h1, match[1]) + (m1 === 30 ? 0.5 : 0);
      endHour = normalizeHour(h2, match[4] || match[1]) + (m2 === 30 ? 0.5 : 0);
      matchedString = match[0];
      matched = true;
    }

    if (!matched) {
      const rangeKoRegex = /(오전|오후)?\s*(\d{1,2})\s*시\s*(30분|반)?\s*[-~]\s*(오전|오후)?\s*(\d{1,2})\s*시\s*(30분|반)?/;
      match = rangeKoRegex.exec(temp);
      if (match) {
        const h1 = parseInt(match[2]);
        const m1 = match[3];
        const h2 = parseInt(match[5]);
        const m2 = match[6];
        startHour = normalizeHour(h1, match[1]) + (m1 === '반' || m1 === '30분' ? 0.5 : 0);
        endHour = normalizeHour(h2, match[4] || match[1]) + (m2 === '반' || m2 === '30분' ? 0.5 : 0);
        matchedString = match[0];
        matched = true;
      }
    }

    if (!matched) {
      const singleTimeRegex = /(오전|오후)?\s*(\d{1,2}):(\d{2})/;
      match = singleTimeRegex.exec(temp);
      if (match) {
        const h = parseInt(match[2]);
        const m = parseInt(match[3]);
        startHour = normalizeHour(h, match[1]) + (m === 30 ? 0.5 : 0);
        endHour = Math.min(startHour + 1, 19.5);
        matchedString = match[0];
        matched = true;
      }
    }

    if (!matched) {
      const singleKoRegex = /(오전|오후)?\s*(\d{1,2})\s*시\s*(30분|반)?/;
      match = singleKoRegex.exec(temp);
      if (match) {
        const h = parseInt(match[2]);
        const m = match[3];
        startHour = normalizeHour(h, match[1]) + (m === '반' || m === '30분' ? 0.5 : 0);
        endHour = Math.min(startHour + 1, 19.5);
        matchedString = match[0];
        matched = true;
      }
    }

    const clean = (str) => {
      let s = str
        .replace(/모두에게/g, '')
        .replace(/전체에게/g, '')
        .replace(/전원에게/g, '')
        .replace(/모두/g, '')
        .replace(/전체/g, '')
        .replace(/전원/g, '')
        .replace(/오늘/g, '')
        .replace(/내일/g, '')
        .replace(/모레/g, '');
      
      s = s
        .replace(/\b에\b/g, '')
        .replace(/시\s*반에/g, '시 반')
        .replace(/시에/g, '시')
        .replace(/까지/g, '')
        .replace(/부터/g, '')
        .replace(/\(\s*[-~,]*\s*\)/g, '')
        .trim();
        
      return s;
    };

    if (isItinerary) {
      if (matched) {
        let title = clean(temp.replace(matchedString, ''));
        title = title.replace(/^(?:0?6\s*[\./-]?\s*\d{1,2}\s*[_\]\s-]*|0?6\d{2}\s*[_\]\s-]*|\d{1,2}\s*일\s*[_\]\s-]*)/, '');
        title = title.replace(/^[\-~,\s\(\)\]]+/, '').replace(/[\-~,\s\(\)\]]+$/, '').trim();
        if (!title) title = '새로운 일정';
        if (title.length > 20) title = title.substring(0, 20) + '...';

        lastSchedule = {
          title,
          startHour,
          endHour,
          line,
          date: currentDate,
          groupId: messageGroupId,
          description: ''
        };
        results.push(lastSchedule);
      } else {
        if (lastSchedule && !line.includes('6월') && !line.includes('DAY')) {
          lastSchedule.description = (lastSchedule.description ? lastSchedule.description + '\n' : '') + line;
        }
      }
    } else {
      let title = matched ? clean(temp.replace(matchedString, '')) : clean(temp);
      title = title.replace(/^(?:0?6\s*[\./-]?\s*\d{1,2}\s*[_\]\s-]*|0?6\d{2}\s*[_\]\s-]*|\d{1,2}\s*일\s*[_\]\s-]*)/, '');
      title = title.replace(/^[\-~,\s\(\)\]]+/, '').replace(/[\-~,\s\(\)\]]+$/, '').trim();
      
      if (!matched) {
        if (temp.includes('연차') || temp.includes('휴가') || temp.includes('반차')) {
          startHour = 9;
          endHour = 18;
        } else {
          startHour = 0;
          endHour = 24;
        }
      }

      if (!title) title = '새로운 일정';
      if (title.length > 20) title = title.substring(0, 20) + '...';

      let parsedDates = [currentDate];
      if (rangeMatch) {
        parsedDates = [];
        const startDay = parseInt(rangeMatch[1]);
        const endDay = parseInt(rangeMatch[2]);
        for (let d = startDay; d <= endDay; d++) {
          parsedDates.push(d);
        }
      }

      const gId = parsedDates.length > 1 ? `g_${Date.now()}_${Math.floor(Math.random() * 1000)}` : undefined;
      parsedDates.forEach(d => {
        results.push({ title, startHour, endHour, line, year: currentYear, month: currentMonthNum || currentMonth, date: d, groupId: gId });
      });
    }
  });

  results.forEach(res => {
    let memberId = 'sh';
    let isAll = false;
    if (
      res.line.includes('모두에게') || 
      res.line.includes('전체에게') || 
      res.line.includes('전원에게') || 
      res.line.includes('모두') || 
      res.line.includes('전체')
    ) {
      isAll = true;
    } else {
      let targetMember = null;
      for (const member of teamList) {
        const roleKeyword = member.role.split(' ')[0];
        if (
          res.line.includes(member.name) || 
          res.line.includes(member.avatar) || 
          res.line.includes(roleKeyword) ||
          res.title.includes(member.name) || 
          res.title.includes(member.avatar) ||
          res.title.includes(roleKeyword)
        ) {
          targetMember = member;
          break;
        }
      }

      if (targetMember && targetMember.id !== 'sh') {
        const isRequestIndicator = res.line.includes('요청') || res.line.includes('부탁') || res.line.includes('의뢰') || res.line.includes('검토') || res.line.includes('확인') || res.line.includes('전달');
        const isMyActionIndicator = res.line.includes('회신') || res.line.includes('작성') || res.line.includes('송부') || res.line.includes('제출') || res.line.includes('준비') || res.line.includes('보내');
        
        if (isRequestIndicator || !isMyActionIndicator) {
          memberId = targetMember.id;
        } else {
          memberId = 'sh';
        }
      }
    }
    res.memberId = memberId;
    res.isAll = isAll;
  });

  return results;
}

function getSchedulesWithTracks(memberSchedules) {
  const sorted = [...memberSchedules].sort((a, b) => a.startHour - b.startHour);
  const tracks = [];

  sorted.forEach(s => {
    let assignedTrackIndex = -1;
    for (let i = 0; i < tracks.length; i++) {
      const trackSchedules = tracks[i];
      const overlap = trackSchedules.some(ts => {
        return s.startHour < ts.endHour && ts.startHour < s.endHour;
      });
      if (!overlap) {
        assignedTrackIndex = i;
        break;
      }
    }

    if (assignedTrackIndex === -1) {
      tracks.push([s]);
    } else {
      tracks[assignedTrackIndex].push(s);
    }
  });

  const scheduleTrackMap = {};
  tracks.forEach((track, index) => {
    track.forEach(s => {
      scheduleTrackMap[s.id] = index;
    });
  });

  return {
    trackMap: scheduleTrackMap,
    totalTracks: Math.max(tracks.length, 1),
  };
}

function parseScheduleDescription(description = '') {
  let groupId = '';
  let detail = '';
  let memo = '';

  const groupMatch = description.match(/\[그룹 ID\]\s*(g_\w+)/);
  if (groupMatch) {
    groupId = groupMatch[1];
  }

  let remaining = description
    .replace(/\[YM:\d{4}\.\d{2}\]\s*\|?\s*/g, '')
    .replace(/\[그룹 ID\]\s*g_\w+\s*\|?\s*/g, '')
    .trim();

  const detailMatch = remaining.match(/\[상세\]\s*(.*?)(?=\s*\|\s*\[메모\]|\s*\[메모\]|$)/s);
  const memoMatch = remaining.match(/\[메모\]\s*(.*)$/s);

  if (detailMatch) {
    detail = detailMatch[1].trim();
  }
  if (memoMatch) {
    memo = memoMatch[1].trim();
  }

  if (!detailMatch && !memoMatch && remaining) {
    detail = remaining;
  }

  return { groupId, detail, memo };
}

function formatScheduleDescription(groupId, detail, memo, year = null, month = null) {
  let parts = [];
  if (year && month) {
    parts.push(`[YM:${year}.${month < 10 ? '0' : ''}${month}]`);
  }
  if (groupId) {
    parts.push(`[그룹 ID] ${groupId}`);
  }
  if (detail) {
    parts.push(`[상세] ${detail}`);
  }
  if (memo) {
    parts.push(`[메모] ${memo}`);
  }
  return parts.join(' | ');
}

function isSameScheduleRange(s1, s2) {
  if (!s1 || !s2) return false;
  const g1 = s1.description && s1.description.match(/\[그룹 ID\]\s*(g_\w+)/)?.[1];
  const g2 = s2.description && s2.description.match(/\[그룹 ID\]\s*(g_\w+)/)?.[1];
  if (g1 && g2 && g1 === g2) return true;
  return s1.title === s2.title && s1.startHour === s2.startHour && s1.endHour === s2.endHour && (s1.memberId === s2.memberId || JSON.stringify(s1.memberIds) === JSON.stringify(s2.memberIds));
}

export default function App() {
  const slot = getTimeSlot();

  // Auth States
  const [user, setUser] = useState(null);
  const [authEmailId, setAuthEmailId] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authRole, setAuthRole] = useState('사원');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authLoading, setAuthLoading] = useState(isConfigured);
  const [authError, setAuthError] = useState('');

  // Fallback virtual user state for non-configured environment
  const [virtualUser, setVirtualUser] = useState(() => {
    return TEAM[0] || { id: 'sh', name: '정윤희', role: '나(부장)', avatar: '윤희', avatarPic: '/pic1_thumb.png', color: '#6366f1', subtext: '기획 일정' };
  });

  // Dynamic active team members list
  const [activeTeam, setActiveTeam] = useState(() => {
    return isConfigured ? [] : TEAM;
  });

  // Extract display name and role from the stored name format "이름 직급" or fallback
  const parseStoredName = (fullName) => {
    if (!fullName) return { name: '정윤희', role: '나(부장)' };
    const trimmed = fullName.trim();
    const validRoles = [
      '웹 기획자', '기획자', '디자이너', '개발자',
      '사원', '대리', '과장', '차장', '부장', '이사', '상무', '전무', '대표'
    ];
    for (const role of validRoles) {
      if (trimmed.endsWith(role)) {
        const namePart = trimmed.slice(0, -role.length).trim();
        if (namePart) {
          return { name: namePart, role: role };
        }
      }
    }
    const isYoonhee = trimmed.includes('정윤희');
    return { name: trimmed, role: isYoonhee ? '나(부장)' : '사원' };
  };

  const parsedUser = user ? parseStoredName(user.name) : { name: '정윤희', role: '나(부장)' };
  const isCurrentUserYoonhee = user && parsedUser.name === '정윤희';

  const ME = isConfigured ? (user ? { id: 'sh', name: parsedUser.name, role: parsedUser.role, avatar: '나', avatarPic: '/pic1_thumb.png', color: '#6366f1' } : { id: 'sh', name: '정윤희', role: '나(부장)', avatar: '나', avatarPic: '/pic1_thumb.png', color: '#6366f1' }) : virtualUser;
  const initMsg = { id: 0, from: 'ai', text: getGreetingMsg(ME.name, slot), time: formatTime(new Date()), createdAt: new Date().toISOString() };

  // UI States
  const [messages, setMessages] = useState(() => {
    const defaultMsg = { id: 0, from: 'ai', text: getGreetingMsg(isConfigured ? '사용자' : (TEAM[0]?.name || '정윤희'), getTimeSlot()), time: formatTime(new Date()), createdAt: new Date().toISOString() };
    const savedMsg = localStorage.getItem('zal_messages');
    if (savedMsg) {
      try {
        const parsed = JSON.parse(savedMsg);
        const filtered = parsed.filter(msg => 
          !(msg.from === 'ai' && (msg.text.includes('좋은 아침') || msg.text.includes('점심은 맛있게') || msg.text.includes('고생 많으셨습니다') || msg.text.includes('수고하셨어요')))
        );
        return [defaultMsg, ...filtered];
      } catch (e) {
        return [defaultMsg];
      }
    }
    return [defaultMsg];
  });
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true); // Default to expanded/open
  const [showPreviousMessages, setShowPreviousMessages] = useState(false);

  // Scheduler States
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth() + 1); // 1-indexed (1-12)
  const [selectedDate, setSelectedDate] = useState(() => new Date().getDate());
  const [searchQuery, setSearchQuery] = useState('');
  const [includeSubOrg, setIncludeSubOrg] = useState(true);
  const [activeLeftTab, setActiveLeftTab] = useState('schedule'); // schedule | facility

  useEffect(() => {
    localStorage.setItem('zal_selected_date', selectedDate.toString());
  }, [selectedDate]);
  
  const [dashboardTab, setDashboardTab] = useState('members'); // members | personal
  const [timeViewTab, setTimeViewTab] = useState('daily'); // daily | weekly

  // Schedule Data
  const [schedules, setSchedules] = useState(() => {
    const savedSched = localStorage.getItem('zal_schedules');
    return savedSched ? JSON.parse(savedSched) : INITIAL_SCHEDULES;
  });

  // Event modal dialog
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMember, setModalMember] = useState(null);
  const [modalStartHour, setModalStartHour] = useState(9);
  const [newTitle, setNewTitle] = useState('');

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedDetailEvent, setSelectedDetailEvent] = useState(null);

  const [editTitle, setEditTitle] = useState('');
  const [editMemberIds, setEditMemberIds] = useState([]);
  const [editStartHour, setEditStartHour] = useState(9);
  const [editEndHour, setEditEndHour] = useState(11);
  const [editDescription, setEditDescription] = useState('');
  const [editDetail, setEditDetail] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [editStartDateStr, setEditStartDateStr] = useState('');
  const [editEndDateStr, setEditEndDateStr] = useState('');

  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReasonInput, setRejectReasonInput] = useState('');

  const [isReRequesting, setIsReRequesting] = useState(false);
  const [reRequestMsgInput, setReRequestMsgInput] = useState('');

  const isDetailEditable = selectedDetailEvent
    ? (selectedDetailEvent.requesterId === 'sh' || 
       (selectedDetailEvent.memberIds ? selectedDetailEvent.memberIds.includes('sh') : selectedDetailEvent.memberId === 'sh'))
    : false;

  const openDetailModal = (event) => {
    setSelectedDetailEvent(event);
    setEditTitle(event.title);
    setEditMemberIds(event.memberIds ? event.memberIds : [event.memberId]);
    setEditStartHour(event.startHour);
    setEditEndHour(event.endHour);
    setEditDescription(event.description || '');
    const parsedDesc = parseScheduleDescription(event.description || '');
    setEditDetail(parsedDesc.detail);
    setEditMemo(parsedDesc.memo);

    const matchGroupId = event.description && event.description.match(/\[그룹 ID\]\s*(g_\w+)/);
    const groupId = matchGroupId ? matchGroupId[1] : null;
    let startY = event.year || currentYear;
    let startM = event.month || currentMonth;
    let startD = event.date;
    let endY = event.year || currentYear;
    let endM = event.month || currentMonth;
    let endD = event.date;

    if (groupId) {
      const groupSchedules = schedules.filter(s => s.description && s.description.includes(`[그룹 ID] ${groupId}`));
      if (groupSchedules.length > 0) {
        groupSchedules.sort((a, b) => {
          const ya = a.year || currentYear, yb = b.year || currentYear;
          if (ya !== yb) return ya - yb;
          const ma = a.month || currentMonth, mb = b.month || currentMonth;
          if (ma !== mb) return ma - mb;
          return a.date - b.date;
        });
        const first = groupSchedules[0];
        const last = groupSchedules[groupSchedules.length - 1];
        startY = first.year || currentYear;
        startM = first.month || currentMonth;
        startD = first.date;
        endY = last.year || currentYear;
        endM = last.month || currentMonth;
        endD = last.date;
      }
    }

    const fmt = (y, m, d) => `${y}-${m < 10 ? '0' : ''}${m}-${d < 10 ? '0' : ''}${d}`;
    setEditStartDateStr(fmt(startY, startM, startD));
    setEditEndDateStr(fmt(endY, endM, endD));

    setIsRejecting(false);
    setRejectReasonInput('');
    setIsReRequesting(false);
    setReRequestMsgInput('');
    setIsDetailModalOpen(true);
  };

  const saveEventEdits = async () => {
    if (!editTitle.trim()) return;
    if (editMemberIds.length === 0) {
      alert('최소 한 명 이상의 담당자를 지정해야 합니다.');
      return;
    }
    if (!editStartDateStr || !editEndDateStr) {
      alert('시작일과 종료일을 지정해야 합니다.');
      return;
    }
    if (editStartDateStr > editEndDateStr) {
      alert('시작일은 종료일보다 이전이어야 합니다.');
      return;
    }

    const dStart = new Date(editStartDateStr + 'T00:00:00');
    const dEnd = new Date(editEndDateStr + 'T00:00:00');
    
    const dateList = [];
    const curr = new Date(dStart.getTime());
    while (curr <= dEnd) {
      dateList.push({
        year: curr.getFullYear(),
        month: curr.getMonth() + 1,
        date: curr.getDate()
      });
      curr.setDate(curr.getDate() + 1);
    }

    const prevMemberIds = selectedDetailEvent.memberIds ? selectedDetailEvent.memberIds : [selectedDetailEvent.memberId];
    const hasAssigneeChanged = editMemberIds.length !== prevMemberIds.length || !editMemberIds.every(id => prevMemberIds.includes(id));
    
    let newStatus = selectedDetailEvent.status || 'accepted';
    let newRequesterId = selectedDetailEvent.requesterId || 'sh';
    
    if (hasAssigneeChanged) {
      const isAssignedToSelfOnly = editMemberIds.length === 1 && editMemberIds.includes('sh');
      newStatus = isAssignedToSelfOnly ? 'accepted' : 'requested';
      newRequesterId = 'sh';
    }

    const matchGroupId = selectedDetailEvent.description && selectedDetailEvent.description.match(/\[그룹 ID\]\s*(g_\w+)/);
    const oldGroupId = matchGroupId ? matchGroupId[1] : null;
    
    let oldTargets = [];
    if (oldGroupId) {
      oldTargets = schedules.filter(s => s.description && s.description.includes(`[그룹 ID] ${oldGroupId}`));
    }
    if (oldTargets.length === 0) {
      oldTargets = [selectedDetailEvent];
    }

    if (isConfigured) {
      for (const t of oldTargets) {
        try {
          await appwriteService.deleteSchedule(t.id);
        } catch (e) {
          console.error("Appwrite delete error:", e);
        }
      }
    }

    const newGroupId = dateList.length > 1 ? (oldGroupId || `g_${Date.now()}_${Math.floor(Math.random() * 1000)}`) : null;
    const colors = ['purple', 'blue', 'green', 'orange'];
    const randomColor = selectedDetailEvent.color || colors[Math.floor(Math.random() * colors.length)];

    const createdSchedules = [];
    for (let idx = 0; idx < dateList.length; idx++) {
      const item = dateList[idx];
      const newDesc = formatScheduleDescription(newGroupId, editDetail.trim(), editMemo.trim(), item.year, item.month);

      const schedObj = {
        id: `s_${Date.now()}_${idx}`,
        year: item.year,
        month: item.month,
        date: item.date,
        title: editTitle.trim(),
        memberIds: editMemberIds,
        memberId: editMemberIds[0],
        startHour: parseFloat(editStartHour),
        endHour: parseFloat(editEndHour),
        color: randomColor,
        description: newDesc,
        status: newStatus,
        requesterId: newRequesterId,
      };

      if (isConfigured) {
        let dbSched = { ...schedObj };
        if (isCurrentUserYoonhee) {
          dbSched.memberId = schedObj.memberId === 'sh' ? 'yoonhee' : (schedObj.memberId === 'yoonhee' ? 'sh' : schedObj.memberId);
          dbSched.memberIds = schedObj.memberIds.map(id => id === 'sh' ? 'yoonhee' : (id === 'yoonhee' ? 'sh' : id));
          dbSched.requesterId = schedObj.requesterId === 'sh' ? 'yoonhee' : (schedObj.requesterId === 'yoonhee' ? 'sh' : schedObj.requesterId);
        }
        try {
          const result = await appwriteService.createSchedule(dbSched);
          createdSchedules.push(result ? { ...schedObj, id: result.id } : schedObj);
        } catch (e) {
          console.error("Appwrite create error:", e);
          createdSchedules.push(schedObj);
        }
      } else {
        createdSchedules.push(schedObj);
      }
    }

    const oldIds = oldTargets.map(t => t.id);
    setSchedules(prev => [...prev.filter(s => !oldIds.includes(s.id)), ...createdSchedules]);
    setIsDetailModalOpen(false);
  };

  const getEndHourOptions = () => {
    const options = [];
    for (let h = parseFloat(editStartHour) + 0.5; h <= 19.5; h += 0.5) {
      options.push(h);
    }
    return options;
  };

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const getInitialMsgId = () => {
    const saved = localStorage.getItem('zal_messages');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0) {
          const maxId = Math.max(...parsed.map(m => m.id));
          return isNaN(maxId) ? 1 : maxId + 1;
        }
      } catch (e) {}
    }
    return 1;
  };
  const msgId = useRef(getInitialMsgId());

  useEffect(() => {
    if (isDrawerOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, isDrawerOpen]);

  // Auth checking and data fetching initialization
  useEffect(() => {
    if (isConfigured) {
      async function checkAuthAndFetch() {
        try {
          let currentUser = await appwriteService.getCurrentUser();
          if (currentUser) {
            // Auto-update check: if name does not contain a valid role, update it on Appwrite!
            const trimmed = currentUser.name.trim();
            const validRoles = [
              '웹 기획자', '기획자', '디자이너', '개발자',
              '사원', '대리', '과장', '차장', '부장', '이사', '상무', '전무', '대표'
            ];
            let hasRole = false;
            let baseName = trimmed;
            for (const role of validRoles) {
              if (trimmed.endsWith(role)) {
                hasRole = true;
                baseName = trimmed.slice(0, -role.length).trim();
                break;
              }
            }
            if (!hasRole || !baseName) {
              const defaultRole = trimmed.includes('정윤희') ? '웹 기획자' : '사원';
              const newFullName = `${trimmed} ${defaultRole}`;
              try {
                await appwriteService.updateName(newFullName);
                currentUser = await appwriteService.getCurrentUser();
              } catch (err) {
                console.error('Failed to auto-update user name with role', err);
              }
            }
            if (!user || user.$id !== currentUser.$id || user.name !== currentUser.name) {
              setUser(currentUser);
            }
            
            const getDeterministicColor = (str) => {
              const colors = ['#6366f1', '#4f8ef7', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
              let hash = 0;
              for (let i = 0; i < str.length; i++) {
                hash = str.charCodeAt(i) + ((hash << 5) - hash);
              }
              const index = Math.abs(hash) % colors.length;
              return colors[index];
            };

            const parsed = parseStoredName(currentUser.name);
            const userColor = getDeterministicColor(parsed.name);
            const isCurrentUserYoonhee = parsed.name === '정윤희';

            const memberYoonhee = {
              id: 'sh',
              name: '정윤희',
              role: '나(부장)',
              avatar: '윤희',
              avatarPic: '/pic1_thumb.png',
              color: '#6366f1',
              subtext: '기획 일정'
            };

            const memberDaeum = {
              id: 'daeum',
              name: '정다음',
              role: '정다음(사원)',
              avatar: '다음',
              avatarPic: '/pic2_thumb.png',
              color: '#10b981',
              subtext: '개인 일정'
            };

            const loggedInMember = {
              id: 'sh',
              name: '정윤희',
              role: '나(부장)',
              avatar: '나',
              avatarPic: '/pic1_thumb.png',
              color: userColor,
              subtext: '기획 일정'
            };

            setActiveTeam([loggedInMember, memberDaeum]);
            
            // Fetch database records
            const dbSchedules = await appwriteService.getSchedules();
            if (dbSchedules !== null) {
              let mapped = [];
              if (isCurrentUserYoonhee) {
                mapped = dbSchedules.map(s => {
                  const memberId = s.memberId === 'sh' ? 'yoonhee' : (s.memberId === 'yoonhee' ? 'sh' : s.memberId);
                  const memberIds = s.memberIds.map(id => id === 'sh' ? 'yoonhee' : (id === 'yoonhee' ? 'sh' : id));
                  const requesterId = s.requesterId === 'sh' ? 'yoonhee' : (s.requesterId === 'yoonhee' ? 'sh' : s.requesterId);
                  let status = s.status;
                  if (status && status.startsWith('rejected_')) {
                    const targetId = status.replace('rejected_', '');
                    const mappedId = targetId === 'sh' ? 'yoonhee' : (targetId === 'yoonhee' ? 'sh' : targetId);
                    status = `rejected_${mappedId}`;
                  }
                  return { ...s, memberId, memberIds, requesterId, status };
                });
              } else {
                mapped = [...dbSchedules];
              }

              // Extract profiles
              const profileDocs = mapped.filter(s => s.title === '__PROFILE__');
              const myProfileDoc = profileDocs.find(s => s.memberId === 'sh');
              const otherProfileDoc = profileDocs.find(s => s.memberId === 'yoonhee');

              const myProfileData = { name: parsed.name, role: parsed.role };
              const serializedMyProfile = JSON.stringify(myProfileData);

              if (!myProfileDoc) {
                const newProfile = {
                  memberId: isCurrentUserYoonhee ? 'yoonhee' : 'sh',
                  memberIds: [isCurrentUserYoonhee ? 'yoonhee' : 'sh'],
                  title: '__PROFILE__',
                  startHour: 0,
                  endHour: 0,
                  color: 'gray',
                  status: 'profile',
                  date: 1,
                  requesterId: isCurrentUserYoonhee ? 'yoonhee' : 'sh',
                  description: serializedMyProfile
                };
                try {
                  const result = await appwriteService.createSchedule(newProfile);
                  if (result) {
                    mapped.push(result);
                  }
                } catch (e) {
                  console.error("Failed to create user profile in DB:", e);
                }
              } else if (myProfileDoc.description !== serializedMyProfile) {
                const updated = {
                  ...myProfileDoc,
                  memberId: isCurrentUserYoonhee ? 'yoonhee' : 'sh',
                  memberIds: [isCurrentUserYoonhee ? 'yoonhee' : 'sh'],
                  requesterId: isCurrentUserYoonhee ? 'yoonhee' : 'sh',
                  description: serializedMyProfile
                };
                try {
                  await appwriteService.updateSchedule(myProfileDoc.id, updated);
                } catch (e) {
                  console.error("Failed to update user profile in DB:", e);
                }
              }

              setActiveTeam([loggedInMember, memberDaeum]);

              const actualSchedules = mapped.filter(s => s.title !== '__PROFILE__');
              setSchedules(actualSchedules);
            }
            const dbMessages = await appwriteService.getMessages();
            if (dbMessages !== null) {
              const userSuffix = currentUser.$id;
              const filteredDbMessages = dbMessages.filter(msg => 
                (msg.from === `user_${userSuffix}` || msg.from === `ai_${userSuffix}`) &&
                !(msg.from.startsWith('ai') && (msg.text.includes('좋은 아침') || msg.text.includes('점심은 맛있게') || msg.text.includes('고생 많으셨습니다') || msg.text.includes('수고하셨어요') || msg.text.includes('안녕하세요')))
              );
              setMessages([initMsg, ...filteredDbMessages]);
            }
          }
        } catch (err) {
          console.error('Initialization error:', err);
        } finally {
          const now = new Date();
          setCurrentYear(now.getFullYear());
          setCurrentMonth(now.getMonth() + 1);
          setSelectedDate(now.getDate());
          setAuthLoading(false);
        }
      }
      checkAuthAndFetch();
    } else {
      // Local mode setup
      setActiveTeam(TEAM);
      const now = new Date();
      setCurrentYear(now.getFullYear());
      setCurrentMonth(now.getMonth() + 1);
      setSelectedDate(now.getDate());
      setAuthLoading(false);
    }
  }, [user]);

  // Helper to translate Appwrite Auth error messages to Korean
  const getKoreanErrorMessage = (msg) => {
    if (!msg) return '';
    const lower = msg.toLowerCase();
    if (lower.includes('paused due to inactivity') || lower.includes('project is paused')) {
      return 'Appwrite 프로젝트가 비활성화 상태입니다. Appwrite 콘솔(cloud.appwrite.io)에서 Restore 버튼을 클릭하여 프로젝트를 복구해 주세요.';
    }
    if (lower.includes('password') && lower.includes('between 8 and 256')) {
      return '비밀번호는 최소 8자 이상이어야 합니다.';
    }
    if (lower.includes('user_already_exists') || lower.includes('already exists')) {
      return '이미 가입된 이메일 주소입니다.';
    }
    if (lower.includes('invalid credentials') || lower.includes('user_invalid_credentials')) {
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    }
    if (lower.includes('email') && lower.includes('invalid')) {
      return '유효하지 않은 이메일 주소 형식입니다.';
    }
    if (lower.includes('failed to fetch') || lower.includes('network error')) {
      return '서버와 연결할 수 없습니다. 네트워크 연결 상태를 확인하거나 CORS 설정을 확인해 주세요.';
    }
    return msg; // Fallback to raw message if translation is unavailable
  };

  // Handle User Registration
  const handleSignUp = async (e) => {
    e.preventDefault();
    if (!authEmailId.trim() || !authPassword.trim() || !authName.trim()) {
      setAuthError('모든 필드를 입력해 주세요.');
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    try {
      const email = `${authEmailId.trim()}@daumit.net`;
      const fullName = `${authName.trim()} ${authRole}`;
      const session = await appwriteService.register(email, authPassword, fullName);
      if (session) {
        const currentUser = await appwriteService.getCurrentUser();
        setUser(currentUser);
      }
    } catch (err) {
      setAuthError(getKoreanErrorMessage(err.message) || '회원가입에 실패했습니다.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle User Log In
  const handleLogIn = async (e) => {
    e.preventDefault();
    if (!authEmailId.trim() || !authPassword.trim()) {
      setAuthError('이메일과 비밀번호를 입력해 주세요.');
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    try {
      const email = `${authEmailId.trim()}@daumit.net`;
      await appwriteService.login(email, authPassword);
      const currentUser = await appwriteService.getCurrentUser();
      setUser(currentUser);
    } catch (err) {
      setAuthError(getKoreanErrorMessage(err.message) || '로그인에 실패했습니다.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle User Log Out
  const handleLogOut = async () => {
    if (isConfigured) {
      setAuthLoading(true);
      await appwriteService.logout();
      setUser(null);
      setMessages([]);
      setSchedules([]);
      setActiveTeam(TEAM);
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    localStorage.setItem('zal_schedules', JSON.stringify(schedules));
  }, [schedules]);

  useEffect(() => {
    localStorage.setItem('zal_messages', JSON.stringify(messages));
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;

    const userSuffix = user ? user.$id : 'local';
    const userMsg = { id: msgId.current++, from: `user_${userSuffix}`, text, time: formatTime(new Date()), createdAt: new Date().toISOString() };
    
    setInput('');
    setIsTyping(true);

    // Optimistically add the user message to UI immediately
    setMessages(prev => [...prev, userMsg]);

    const proceedWithAI = async () => {
      try {
        const todayDate = selectedDate || new Date().getDate();
        let rawResult = await parseMessageWithGemini(text, todayDate, activeTeam, currentYear, currentMonth);
        
        let aiResult;
        if (rawResult && typeof rawResult === 'object' && rawResult.action) {
          aiResult = rawResult;
        } else if (Array.isArray(rawResult)) {
          aiResult = { action: 'create', schedules: rawResult };
        } else {
          const fallbackList = parseMessageToSchedules(text, todayDate, activeTeam);
          aiResult = { action: 'create', schedules: fallbackList };
        }

        if (aiResult.action === 'update') {
          const { criteria, updates } = aiResult;
          let updatedCount = 0;
          
          const updatedSchedules = schedules.map(s => {
            let match = false;
            const monthMatch = isScheduleInMonth(s, currentYear, currentMonth);
            if (criteria.all) {
              match = monthMatch;
            } else {
              const dateMatch = criteria.date ? s.date === criteria.date : true;
              const titleMatch = criteria.title ? s.title.includes(criteria.title) : true;
              match = monthMatch && dateMatch && titleMatch;
            }
            
            if (match) {
              updatedCount++;
              return {
                ...s,
                ...updates
              };
            }
            return s;
          });
          
          if (updatedCount > 0) {
            if (isConfigured) {
              for (const s of updatedSchedules) {
                const original = schedules.find(orig => orig.id === s.id);
                if (original && JSON.stringify(original) !== JSON.stringify(s)) {
                  let dbSched = { ...s };
                  if (isCurrentUserYoonhee) {
                    dbSched.memberId = s.memberId === 'sh' ? 'yoonhee' : (s.memberId === 'yoonhee' ? 'sh' : s.memberId);
                    dbSched.memberIds = s.memberIds.map(id => id === 'sh' ? 'yoonhee' : (id === 'yoonhee' ? 'sh' : id));
                    dbSched.requesterId = s.requesterId === 'sh' ? 'yoonhee' : (s.requesterId === 'yoonhee' ? 'sh' : s.requesterId);
                  }
                  await appwriteService.updateSchedule(s.id, dbSched);
                }
              }
            }
            setSchedules(updatedSchedules);
          }
          
          const aiReply = `요청하신 조건에 따라 ${updatedCount}개의 등록된 일정을 변경해 드렸습니다!`;
          const aiMsg = { id: msgId.current++, from: `ai_${userSuffix}`, text: aiReply, time: formatTime(new Date()), createdAt: new Date().toISOString() };
          if (isConfigured) {
            await appwriteService.createMessage(aiMsg);
          }
          setMessages(prev => [...prev, aiMsg]);
          return;
        }

        if (aiResult.action === 'delete') {
          const { criteria } = aiResult;
          let deletedCount = 0;
          const targetIds = [];
          
          const remainingSchedules = schedules.filter(s => {
            let match = false;
            const monthMatch = isScheduleInMonth(s, currentYear, currentMonth);
            if (criteria.all) {
              match = monthMatch;
            } else {
              const dateMatch = criteria.date ? s.date === criteria.date : true;
              const titleMatch = criteria.title ? s.title.includes(criteria.title) : true;
              match = monthMatch && dateMatch && titleMatch;
            }
            
            if (match) {
              deletedCount++;
              targetIds.push(s.id);
              return false;
            }
            return true;
          });

          if (deletedCount > 0) {
            if (isConfigured) {
              for (const id of targetIds) {
                await appwriteService.deleteSchedule(id);
              }
            }
            setSchedules(remainingSchedules);
          }
          
          const aiReply = `요청하신 조건에 부합하는 ${deletedCount}개의 일정을 삭제했습니다!`;
          const aiMsg = { id: msgId.current++, from: `ai_${userSuffix}`, text: aiReply, time: formatTime(new Date()), createdAt: new Date().toISOString() };
          if (isConfigured) {
            await appwriteService.createMessage(aiMsg);
          }
          setMessages(prev => [...prev, aiMsg]);
          return;
        }

        const listToCreate = aiResult.schedules || [];
        const colors = ['purple', 'blue', 'green', 'orange'];
        const newSchedules = [];

        listToCreate.forEach((parsed, index) => {
          const randomColor = colors[(Math.floor(Math.random() * colors.length) + index) % colors.length];
          
          let assignedMemberIds;
          let assignedMemberId;
          let isSelf;

          if (parsed.isAll) {
            assignedMemberIds = activeTeam.map(m => m.id);
            assignedMemberId = 'sh';
            isSelf = false;
          } else {
            const assignedMember = activeTeam.find(m => m.id === parsed.memberId) || ME;
            assignedMemberIds = [assignedMember.id];
            assignedMemberId = assignedMember.id;
            isSelf = assignedMember.id === 'sh';
          }

          const finalDescription = parsed.description || '';
          const schedYear = parsed.year ? parseInt(parsed.year) : currentYear;
          const schedMonth = parsed.month ? parseInt(parsed.month) : currentMonth;

          const newSchedule = {
            id: `s_${Date.now()}_${index}`,
            year: schedYear,
            month: schedMonth,
            memberId: assignedMemberId,
            memberIds: assignedMemberIds,
            title: parsed.title,
            startHour: parsed.startHour,
            endHour: parsed.endHour,
            color: randomColor,
            status: isSelf ? 'accepted' : 'requested',
            date: parsed.date,
            requesterId: 'sh',
            description: parsed.groupId 
              ? `[YM:${schedYear}.${schedMonth < 10 ? '0' : ''}${schedMonth}] [그룹 ID] ${parsed.groupId} | ${finalDescription}` 
              : `[YM:${schedYear}.${schedMonth < 10 ? '0' : ''}${schedMonth}] ${finalDescription}`,
          };
          newSchedules.push(newSchedule);
        });

        // Group schedules for the AI text response
        const groupedForReply = [];
        newSchedules.forEach((sched, idx) => {
          const parsed = listToCreate[idx] || {};
          const finalDescription = parsed.description || '';
          const matchGroupId = sched.description && sched.description.match(/\[그룹 ID\]\s*(g_\w+)/);
          const groupId = matchGroupId ? matchGroupId[1] : null;
          
          if (groupId) {
            let existingGroup = groupedForReply.find(g => 
              g.groupId === groupId && 
              g.title === sched.title &&
              g.startHour === sched.startHour &&
              g.endHour === sched.endHour
            );
            if (!existingGroup) {
              existingGroup = {
                groupId,
                title: sched.title,
                startHour: sched.startHour,
                endHour: sched.endHour,
                memberId: sched.memberId,
                memberIds: sched.memberIds,
                items: [{ year: sched.year, month: sched.month, date: sched.date }],
                status: sched.status,
                description: finalDescription
              };
              groupedForReply.push(existingGroup);
            } else {
              const alreadyExists = existingGroup.items.some(it => it.year === sched.year && it.month === sched.month && it.date === sched.date);
              if (!alreadyExists) {
                existingGroup.items.push({ year: sched.year, month: sched.month, date: sched.date });
              }
            }
          } else {
            groupedForReply.push({
              title: sched.title,
              startHour: sched.startHour,
              endHour: sched.endHour,
              memberId: sched.memberId,
              memberIds: sched.memberIds,
              items: [{ year: sched.year, month: sched.month, date: sched.date }],
              status: sched.status,
              description: finalDescription
            });
          }
        });

        let replyDetails = '';
        groupedForReply.forEach((group, index) => {
          let displayAssigneeName;
          if (group.memberIds.length === activeTeam.length) {
            displayAssigneeName = '전체 인원';
          } else {
            const assignedMember = activeTeam.find(m => m.id === group.memberId) || ME;
            displayAssigneeName = assignedMember.name;
          }
          
          group.items.sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            if (a.month !== b.month) return a.month - b.month;
            return a.date - b.date;
          });

          let dateStr = '';
          if (group.items.length > 1) {
            const first = group.items[0];
            const last = group.items[group.items.length - 1];
            const m1 = first.month < 10 ? `0${first.month}` : `${first.month}`;
            const d1 = first.date < 10 ? `0${first.date}` : `${first.date}`;
            const m2 = last.month < 10 ? `0${last.month}` : `${last.month}`;
            const d2 = last.date < 10 ? `0${last.date}` : `${last.date}`;
            dateStr = `${first.year}.${m1}.${d1} ~ ${last.year}.${m2}.${d2}`;
          } else {
            const single = group.items[0];
            const m = single.month < 10 ? `0${single.month}` : `${single.month}`;
            const d = single.date < 10 ? `0${single.date}` : `${single.date}`;
            dateStr = `${single.year}.${m}.${d}`;
          }

          replyDetails += `\n📅 일정 ${index + 1}: "${group.title}"\n📝 상세내용: ${group.description || '-'}\n👤 담당자: ${displayAssigneeName}${group.status === 'requested' ? ' (요청됨)' : ''}\n📅 날짜: ${dateStr}\n⏰ 시간: ${formatHour(group.startHour)} ~ ${formatHour(group.endHour)}\n`;
        });

        const savedSchedules = [];
        for (const sched of newSchedules) {
          if (isConfigured) {
            let dbSched = { ...sched };
            if (isCurrentUserYoonhee) {
              dbSched.memberId = sched.memberId === 'sh' ? 'yoonhee' : (sched.memberId === 'yoonhee' ? 'sh' : sched.memberId);
              dbSched.memberIds = sched.memberIds.map(id => id === 'sh' ? 'yoonhee' : (id === 'yoonhee' ? 'sh' : id));
              dbSched.requesterId = sched.requesterId === 'sh' ? 'yoonhee' : (sched.requesterId === 'yoonhee' ? 'sh' : sched.requesterId);
            }
            try {
              const dbSchedResult = await appwriteService.createSchedule(dbSched);
              if (!dbSchedResult) {
                console.error("Appwrite createSchedule returned null");
              }
              savedSchedules.push(dbSchedResult ? { ...sched, id: dbSchedResult.id } : sched);
            } catch (e) {
              console.error("Appwrite failed to create schedule:", e);
              savedSchedules.push(sched);
            }
          } else {
            savedSchedules.push(sched);
          }
        }

        setSchedules(prev => [...prev, ...savedSchedules]);

        const aiReply = newSchedules.length > 0 
          ? `메시지를 분석하여 타임라인에 일정을 등록해 드렸습니다!\n${replyDetails}`
          : `입력해주신 내용에서 일정을 추출하지 못했습니다. 날짜나 업무 내용을 좀 더 명확히 작성해 주세요!`;

        const aiMsg = { id: msgId.current++, from: `ai_${userSuffix}`, text: aiReply, time: formatTime(new Date()), createdAt: new Date().toISOString() };
        
        if (isConfigured) {
          try {
            const dbAiMsg = await appwriteService.createMessage(aiMsg);
            setMessages(prev => [...prev, dbAiMsg || aiMsg]);
          } catch (e) {
            console.error("Appwrite failed to create AI message:", e);
            setMessages(prev => [...prev, aiMsg]);
          }
        } else {
          setMessages(prev => [...prev, aiMsg]);
        }
      } catch (err) {
        console.error("Critical error in proceedWithAI:", err);
        const errReply = "메시지 분석 및 일정 정리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
        const errMsg = { id: msgId.current++, from: `ai_${userSuffix}`, text: errReply, time: formatTime(new Date()), createdAt: new Date().toISOString() };
        setMessages(prev => [...prev, errMsg]);
      } finally {
        setIsTyping(false);
      }
    };

    if (isConfigured) {
      appwriteService.createMessage(userMsg)
        .then(() => {
          proceedWithAI();
        })
        .catch((err) => {
          console.error("Appwrite failed to create user message:", err);
          proceedWithAI();
        });
    } else {
      proceedWithAI();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaInput = (e) => {
    setInput(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
    }
  };

  const openAddModal = (member, hour) => {
    setModalMember(member);
    setModalStartHour(hour);
    setNewTitle('');
    setIsModalOpen(true);
  };

  const saveManualSchedule = async () => {
    if (!newTitle.trim()) return;
    const colors = ['purple', 'blue', 'green', 'orange'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    const isSelf = modalMember.id === 'sh';
    const newSchedule = {
      id: `s_${Date.now()}`,
      year: currentYear,
      month: currentMonth,
      memberId: modalMember.id,
      memberIds: [modalMember.id],
      title: newTitle.trim(),
      startHour: modalStartHour,
      endHour: Math.min(modalStartHour + 2, 19.5),
      color: randomColor,
      status: isSelf ? 'accepted' : 'requested',
      date: selectedDate,
      requesterId: 'sh',
      description: `[YM:${currentYear}.${currentMonth < 10 ? '0' : ''}${currentMonth}]`,
    };

    if (isConfigured) {
      let dbSched = { ...newSchedule };
      if (isCurrentUserYoonhee) {
        dbSched.memberId = newSchedule.memberId === 'sh' ? 'yoonhee' : (newSchedule.memberId === 'yoonhee' ? 'sh' : newSchedule.memberId);
        dbSched.memberIds = newSchedule.memberIds.map(id => id === 'sh' ? 'yoonhee' : (id === 'yoonhee' ? 'sh' : id));
        dbSched.requesterId = newSchedule.requesterId === 'sh' ? 'yoonhee' : (newSchedule.requesterId === 'yoonhee' ? 'sh' : newSchedule.requesterId);
      }
      const dbSchedResult = await appwriteService.createSchedule(dbSched);
      setSchedules(prev => [...prev, dbSchedResult ? { ...newSchedule, id: dbSchedResult.id } : newSchedule]);
    } else {
      setSchedules(prev => [...prev, newSchedule]);
    }
    setIsModalOpen(false);
  };

  const filteredMembers = activeTeam.filter(m => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return m.name.toLowerCase().includes(query) || m.role.toLowerCase().includes(query);
  });

  const hourSlots = [8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16, 16.5, 17, 17.5, 18, 18.5, 19];

  if (authLoading) {
    return (
      <div style={{ display: 'flex', width: '100vw', height: '100vh', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: '16px', background: 'var(--bg-primary)' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', border: '4px solid var(--border-light)', borderTopColor: 'var(--accent-purple)', animation: 'spin 1s linear infinite' }} />
        <p style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>데이터 동기화 중...</p>
      </div>
    );
  }

  // Display Login / Sign Up UI if configured but not authenticated
  if (isConfigured && !user) {
    return (
      <div style={{ display: 'flex', width: '100vw', height: '100vh', justifyContent: 'center', alignItems: 'center', background: '#ffffff' }}>
        <div style={{ background: '#ffffff', padding: '45px 40px', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', width: '420px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--accent-purple)', letterSpacing: '-0.5px' }}>ZAL : 잘됨</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>인공지능 일정 비서 및 협업 타임라인</p>
          </div>
          
          <form onSubmit={isSignUp ? handleSignUp : handleLogIn} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {isSignUp && (
              <>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)' }}>이름</label>
                    <input 
                      type="text" 
                      placeholder="예: 정다운" 
                      value={authName} 
                      onChange={(e) => setAuthName(e.target.value)} 
                      style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', outline: 'none' }}
                      required
                    />
                  </div>
                  
                  <div style={{ width: '120px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)' }}>직급</label>
                    <select
                      value={authRole}
                      onChange={(e) => setAuthRole(e.target.value)}
                      style={{ width: '100%', padding: '10px 10px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', outline: 'none', background: '#fff' }}
                    >
                      {['사원', '대리', '과장', '차장', '부장', '이사', '상무', '전무', '대표'].map(rank => (
                        <option key={rank} value={rank}>{rank}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)' }}>이메일 아이디</label>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <input 
                  type="text" 
                  placeholder="이메일 아이디" 
                  value={authEmailId} 
                  onChange={(e) => setAuthEmailId(e.target.value)} 
                  style={{ flex: 1, padding: '10px 14px', border: 'none', outline: 'none' }}
                  required
                />
                <span style={{ padding: '10px 14px', background: '#f1f5f9', borderLeft: '1px solid var(--border-color)', fontSize: '14.5px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                  @daumit.net
                </span>
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)' }}>비밀번호</label>
              <input 
                type="password" 
                placeholder="6자리 이상 비밀번호" 
                value={authPassword} 
                onChange={(e) => setAuthPassword(e.target.value)} 
                style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', outline: 'none' }}
                required
              />
            </div>
 
            {authError && (
              <p style={{ color: 'var(--accent-red)', fontSize: '13px', fontWeight: '600', margin: '4px 0 0 0' }}>{authError}</p>
            )}
 
            <button 
              type="submit" 
              style={{ width: '100%', padding: '12px 14px', backgroundColor: 'var(--accent-purple)', color: '#ffffff', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: '700', cursor: 'pointer', transition: 'var(--transition)', marginTop: '8px' }}
            >
              {isSignUp ? '회원가입' : '로그인'}
            </button>
          </form>
 
          <div style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {isSignUp ? '이미 계정이 있으신가요?' : '아직 계정이 없으신가요?'} {' '}
            <button 
              onClick={() => {
                setIsSignUp(!isSignUp);
                setAuthError('');
              }} 
              style={{ background: 'none', border: 'none', color: 'var(--accent-purple)', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {isSignUp ? '로그인하기' : '회원가입하기'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      {/* ──── LEFT COLLAPSIBLE AI DRAWER ─────────────────── */}
      <div className={`chat-drawer ${isDrawerOpen ? '' : 'closed'}`}>
        <div className="chat-header">
          <div className="chat-header-title" style={{ overflow: 'hidden', height: '100%', display: 'flex', alignItems: 'flex-start', paddingTop: '6px' }}>
            <img src="/bi2.png" alt="BI Logo 2" style={{ height: '58px', width: 'auto', maxHeight: 'none', objectFit: 'contain', objectPosition: 'top left', flexShrink: 0, marginTop: '6px' }} />
            <span style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'baseline', gap: '2px' }}>
              <span style={{ fontSize: '19px', fontWeight: '800', letterSpacing: '-0.3px' }}>ZAL</span>
              <span style={{ fontSize: '17.5px', fontWeight: '700' }}> : 잘됨</span>
            </span>
          </div>
          <button className="close-drawer-btn" onClick={() => setIsDrawerOpen(false)}>×</button>
        </div>



        <div className="chat-messages">
          {(() => {
            const todayMessages = messages.filter(msg => isTodayMessage(msg));
            const previousMessages = messages.filter(msg => !isTodayMessage(msg));

            const renderBubble = (msg) => {
              if (msg.id === 0) {
                const now = new Date();
                const month = now.getMonth() + 1;
                const dateNum = now.getDate();
                const lines = msg.text.split('\n');
                const titleLine = lines[0] || `안녕하세요, ${ME.name}님.`;
                const subLines = lines.slice(1).join('\n');

                return (
                  <div key={msg.id} style={{ padding: '8px 4px 16px 4px', marginBottom: '8px', borderBottom: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '500', color: '#64748b' }}>
                      {month}월 {dateNum}일
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.5px', marginTop: '2px' }}>
                      {titleLine}
                    </div>
                    {subLines && (
                      <div style={{ fontSize: '13.5px', color: '#475569', marginTop: '6px', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                        {subLines}
                      </div>
                    )}
                  </div>
                );
              }

              const isUser = msg.from.startsWith('user');
              const roleClass = isUser ? 'user' : 'ai';
              return (
                <div key={msg.id} className={`chat-bubble-wrap ${roleClass}`}>
                  <div className={`chat-bubble ${roleClass}`} style={{ whiteSpace: 'pre-line' }}>
                    {!isUser && (msg.text.includes('📅 일정') || msg.text.includes('일정 1:')) ? (() => {
                      const parsedSchedules = parseSchedulesFromText(msg.text);
                      const introText = msg.text.split(/📅?\s*일정 \d+:/)[0].trim();
                      const blocks = msg.text.split(/📅?\s*일정 \d+:\s*/);

                      const existingSchedules = [];
                      parsedSchedules.forEach(p => {
                        p.dates.forEach(d => {
                          const match = schedules.find(s => 
                            s.title === p.title &&
                            isScheduleInMonth(s, currentYear, currentMonth) &&
                            s.date === d
                          );
                          if (match && !existingSchedules.some(es => es.id === match.id)) {
                            existingSchedules.push(match);
                          }
                        });
                      });

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          <div style={{ fontWeight: '600' }}>{introText}</div>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {parsedSchedules.map((parsed, idx) => {
                              let matchedSchedule = null;
                              for (const d of parsed.dates) {
                                const match = schedules.find(s => 
                                  s.title === parsed.title &&
                                  isScheduleInMonth(s, currentYear, currentMonth) &&
                                  s.date === d
                                );
                                if (match) {
                                  matchedSchedule = match;
                                  break;
                                }
                              }
                              
                              const blockLines = (blocks[idx + 1] || '').trim().split('\n');
                              
                              return (
                                <div key={idx} style={{ 
                                  padding: '10px 12px', 
                                  backgroundColor: '#ffffff', 
                                  borderRadius: '8px',
                                  border: '1px solid var(--border-color)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '3px'
                                }}>
                                  <div style={{ fontWeight: '600', fontSize: '13.5px' }}>📅 일정 {idx + 1}: "{parsed.title}"</div>
                                  {blockLines.map((line, lIdx) => {
                                    if (line.includes('📅 일정')) return null;
                                    if (line.startsWith('"') || line.includes(parsed.title)) return null;
                                    return <div key={lIdx} style={{ fontSize: '12.5px', opacity: 0.9 }}>{line}</div>;
                                  })}
                                  
                                  <div style={{ marginTop: '8px' }}>
                                      {matchedSchedule ? (
                                        <button
                                          style={{
                                            padding: '4px 10px',
                                            fontSize: '11.5px',
                                            backgroundColor: 'rgba(239, 68, 68, 0.08)', 
                                            color: '#ef4444', 
                                            border: '1px solid rgba(239, 68, 68, 0.25)', 
                                            borderRadius: '6px',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                          }}
                                          onMouseEnter={(e) => {
                                            e.target.style.backgroundColor = '#ef4444';
                                            e.target.style.borderColor = '#ef4444';
                                            e.target.style.color = '#fff';
                                          }}
                                          onMouseLeave={(e) => {
                                            e.target.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
                                            e.target.style.borderColor = 'rgba(239, 68, 68, 0.25)';
                                            e.target.style.color = '#ef4444';
                                          }}
                                          onClick={async () => {
                                             const matchGroupId = matchedSchedule.description && matchedSchedule.description.match(/\[그룹 ID\]\s*(g_\w+)/);
                                             const groupId = matchGroupId ? matchGroupId[1] : null;
                                             if (groupId) {
                                               const targets = schedules.filter(s => s.description && s.description.includes(`[그룹 ID] ${groupId}`));
                                               if (isConfigured) {
                                                 for (const t of targets) {
                                                   await appwriteService.deleteSchedule(t.id);
                                                 }
                                               }
                                               const targetIds = targets.map(t => t.id);
                                               setSchedules(prev => prev.filter(item => !targetIds.includes(item.id)));
                                             } else {
                                               if (isConfigured) {
                                                 for (const d of parsed.dates) {
                                                   const match = schedules.find(s => s.title === parsed.title && isScheduleInMonth(s, currentYear, currentMonth) && s.date === d);
                                                   if (match) {
                                                     await appwriteService.deleteSchedule(match.id);
                                                   }
                                                 }
                                               }
                                               setSchedules(prev => prev.filter(s => {
                                                  const isMatching = s.title === parsed.title && isScheduleInMonth(s, currentYear, currentMonth) && parsed.dates.includes(s.date);
                                                 return !isMatching;
                                               }));
                                             }
                                           }}
                                        >
                                          등록취소
                                        </button>
                                      ) : (
                                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: '700' }}>
                                          ✓ 취소됨
                                        </span>
                                      )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {existingSchedules.length > 1 && (
                            <button
                              style={{ 
                                width: '100%', 
                                padding: '8px 12px', 
                                fontSize: '12px', 
                                backgroundColor: '#ef4444', 
                                color: '#fff', 
                                border: 'none',
                                borderRadius: '4px', 
                                fontWeight: '600',
                                cursor: 'pointer',
                                marginTop: '4px',
                                transition: 'all 0.2s',
                                boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)'
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.backgroundColor = '#b91c1c';
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.backgroundColor = '#ef4444';
                              }}
                              onClick={async () => {
                                if (confirm('이 메시지로 등록된 모든 일정을 취소하시겠습니까?')) {
                                  for (const s of existingSchedules) {
                                    if (isConfigured) {
                                      await appwriteService.deleteSchedule(s.id);
                                    }
                                  }
                                  const ids = existingSchedules.map(s => s.id);
                                  setSchedules(prev => prev.filter(item => !ids.includes(item.id)));
                                }
                              }}
                            >
                              모두 등록취소
                            </button>
                          )}
                        </div>
                      );
                    })() : (
                      msg.text
                    )}
                  </div>
                  <div className="chat-meta-row" style={{ alignSelf: isUser ? 'flex-end' : 'flex-start' }}>
                    <span className="chat-meta-sender">
                      {roleClass === 'ai' ? 'AI 잘됨이' : ME.name}
                    </span>
                    <span className="chat-meta-time">{msg.time}</span>
                  </div>
                </div>
              );
            };

            return (
              <>
                {previousMessages.length > 0 && (
                  <div style={{
                    position: 'sticky',
                    top: '0px',
                    zIndex: 12,
                    textAlign: 'center',
                    margin: '0 0 10px 0',
                    pointerEvents: 'none'
                  }}>
                    <button
                      onClick={() => setShowPreviousMessages(prev => !prev)}
                      style={{
                        pointerEvents: 'auto',
                        background: '#ffffff',
                        border: 'none',
                        borderRadius: '20px',
                        padding: '5px 14px',
                        fontSize: '12px',
                        fontWeight: '500',
                        color: '#64748b',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        margin: '0 auto'
                      }}
                    >
                      <span>{showPreviousMessages ? '이전 대화 접기' : `이전 대화 보기 (${previousMessages.length}개)`}</span>
                      <svg 
                        width="13" 
                        height="13" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2.5" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                        style={{
                          transform: showPreviousMessages ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s ease'
                        }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </div>
                )}

                {showPreviousMessages && previousMessages.length > 0 && (
                  <>
                    {previousMessages.map(msg => renderBubble(msg))}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '16px 0 16px 0',
                      gap: '12px'
                    }}>
                      <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }} />
                      <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)' }}>오늘 대화</span>
                      <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }} />
                    </div>
                  </>
                )}

                {todayMessages.map(msg => renderBubble(msg))}
              </>
            );
          })()}

          {isTyping && (
            <div className="chat-bubble-wrap ai">
              <div className="chat-bubble ai" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', width: 'fit-content' }}>
                <div className="typing-indicator">
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                </div>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '600', marginLeft: '4px' }}>일정을 정리하고 있습니다...</span>
              </div>
              <div className="chat-meta-row" style={{ alignSelf: 'flex-start' }}>
                <span className="chat-meta-sender">AI 잘됨이</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="chat-input-area">
          <div className="chat-input-box">
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              placeholder="예: '14시 B사 미팅' 입력시 캘린더에 자동 등록됩니다."
              value={input}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isTyping}
            />
            <button className="send-btn" onClick={handleSend} disabled={isTyping || !input.trim()}>
              <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ──── MAIN CONTENT AREA ─────────────────── */}
      <main className="main-content">
        <div className="top-controls">
          <div className="top-controls-row">
            {/* Left Navigations */}
            <div className="date-navigator">
              <button 
                className="nav-arrow-text" 
                onClick={() => {
                  if (currentMonth === 1) {
                    setCurrentYear(prev => prev - 1);
                    setCurrentMonth(12);
                  } else {
                    setCurrentMonth(prev => prev - 1);
                  }
                }} 
                title="이전 달"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span className="current-date-text" style={{ minWidth: timeViewTab === 'weekly' ? '200px' : '70px', textAlign: 'center' }}>
                {(() => {
                  const monthFormatted = currentMonth < 10 ? `0${currentMonth}` : `${currentMonth}`;
                  if (timeViewTab === 'weekly') {
                    const selectedObj = new Date(currentYear, currentMonth - 1, selectedDate);
                    const dayOfWeekIndex = selectedObj.getDay();
                    const startOfWeekDate = new Date(currentYear, currentMonth - 1, selectedDate - dayOfWeekIndex);
                    const endOfWeekDate = new Date(currentYear, currentMonth - 1, selectedDate - dayOfWeekIndex + 6);
                    
                    const formatObj = (dObj) => {
                      const m = dObj.getMonth() + 1;
                      const d = dObj.getDate();
                      return `${m < 10 ? '0' : ''}${m}.${d < 10 ? '0' : ''}${d}`;
                    };
                    
                    return `${currentYear}.${formatObj(startOfWeekDate)} ~ ${formatObj(endOfWeekDate)}`;
                  }
                  return `${currentYear}.${monthFormatted}`;
                })()}
              </span>
              <button 
                className="nav-arrow-text" 
                onClick={() => {
                  if (currentMonth === 12) {
                    setCurrentYear(prev => prev + 1);
                    setCurrentMonth(1);
                  } else {
                    setCurrentMonth(prev => prev + 1);
                  }
                }} 
                title="다음 달"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>

            {/* Right Tabs */}
            <div className="toggle-tab-container">
              <div className="toggle-group">
                <button 
                  className={`toggle-item ${timeViewTab === 'daily' ? 'active-blue' : ''}`} 
                  onClick={() => setTimeViewTab('daily')}
                >
                  DAY
                </button>
                <button 
                  className={`toggle-item ${timeViewTab === 'weekly' ? 'active-blue' : ''}`} 
                  onClick={() => setTimeViewTab('weekly')}
                >
                  WEEK
                </button>
                <button 
                  className={`toggle-item ${timeViewTab === 'monthly' ? 'active-blue' : ''}`} 
                  onClick={() => setTimeViewTab('monthly')}
                >
                  MONTH
                </button>
                <button 
                  className={`toggle-item ${timeViewTab === 'list' ? 'active-blue' : ''}`} 
                  onClick={() => setTimeViewTab('list')}
                >
                  LIST
                </button>
              </div>
            </div>
            
            {/* User Session & Reset Controls (Right aligned) */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px', zIndex: 10 }}>
              {/* User Avatar & Name & Mode */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  backgroundColor: ME.color || '#6366f1',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: '600',
                  overflow: 'hidden',
                  padding: 0
                }}>
                  {getMemberAvatarPic(ME) ? (
                    <img src={getMemberAvatarPic(ME)} alt={ME.name} style={getMemberAvatarStyle(ME, 0)} />
                  ) : (
                    ME.avatar
                  )}
                </div>
                <span style={{ fontSize: '13.5px', fontWeight: '600', color: 'var(--text-primary)' }}>{ME.name}</span>
              </div>

              {/* Logout button (if configured) or local user switcher */}
              {isConfigured ? (
                <button
                  onClick={handleLogOut}
                  style={{
                    fontSize: '12.5px',
                    color: 'var(--text-secondary)',
                    background: '#ffffff',
                    border: '1px solid var(--border-color)',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontWeight: '500',
                    transition: 'var(--transition)'
                  }}
                >
                  로그아웃
                </button>
              ) : (
                <select
                  value={virtualUser.id}
                  onChange={(e) => {
                    const target = activeTeam.find(m => m.id === e.target.value);
                    if (target) setVirtualUser(target);
                  }}
                  style={{
                    fontSize: '12px',
                    padding: '3px 6px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    background: '#ffffff',
                    color: 'var(--text-secondary)'
                  }}
                >
                  {activeTeam.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              )}

              {/* Reset Button */}
              <button 
                className="modal-btn" 
                style={{ 
                  fontSize: '12.5px', 
                  fontWeight: '500', 
                  color: '#ef4444', 
                  borderColor: 'var(--border-color)',
                  backgroundColor: '#ffffff',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  transition: 'var(--transition)'
                }}
                onClick={async () => {
                  if (confirm('모든 대화 및 일정 데이터를 초기화하시겠습니까?')) {
                    if (isConfigured) {
                      await appwriteService.clearSchedules();
                      await appwriteService.clearMessages();
                    }
                    localStorage.setItem('zal_schedules', JSON.stringify([]));
                    localStorage.removeItem('zal_messages');
                    setSchedules([]);
                    setMessages([{ id: 0, from: 'ai', text: getGreetingMsg(ME.name, getTimeSlot()), time: formatTime(new Date()), createdAt: new Date().toISOString() }]);
                    alert('모든 데이터가 초기화되었습니다.');
                  }
                }}
                title="데이터 초기화"
              >
                초기화
              </button>
            </div>
          </div>


        </div>

        {/* Horizontal Date Selector */}
        <div className="horizontal-date-selector">
          {(() => {
            const totalDaysInMonth = new Date(currentYear, currentMonth, 0).getDate();
            const daysArr = ['일', '월', '화', '수', '목', '금', '토'];
            return Array.from({ length: totalDaysInMonth }, (_, i) => {
              const dayNum = i + 1;
              const dateObj = new Date(currentYear, currentMonth - 1, dayNum);
              const dayOfWeek = daysArr[dateObj.getDay()];
              const isSelected = dayNum === selectedDate;
              const now = new Date();
              const isToday = currentYear === now.getFullYear() && currentMonth === (now.getMonth() + 1) && dayNum === now.getDate();
              const isSat = dayOfWeek === '토';
              const isSun = dayOfWeek === '일';
              const hasSchedules = schedules.some(s => isScheduleInMonth(s, currentYear, currentMonth) && s.date === dayNum);
              
              const selectedObj = new Date(currentYear, currentMonth - 1, selectedDate);
              const dayOfWeekIndex = selectedObj.getDay();
              const startOfWeek = selectedDate - dayOfWeekIndex;
              const endOfWeek = startOfWeek + 6;
              const isInWeek = timeViewTab === 'weekly' && dayNum >= startOfWeek && dayNum <= endOfWeek;

              return (
                <button
                  key={dayNum}
                  className={`date-item ${isSelected ? 'active' : ''} ${isInWeek ? 'in-week' : ''} ${isToday ? 'today' : ''} ${isSat ? 'sat' : ''} ${isSun ? 'sun' : ''}`}
                  onClick={() => setSelectedDate(dayNum)}
                >
                  <span className="date-item-day">{dayOfWeek}</span>
                  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="date-item-num">{dayNum}</span>
                    {isToday && <span className="date-item-today-badge">TODAY</span>}
                    <span className={`date-item-dot ${hasSchedules ? 'visible' : ''}`} />
                  </div>
                </button>
              );
            });
          })()}
        </div>

        {/* Timeline Grid Table */}
        <div className="timeline-container">
          {timeViewTab === 'daily' && (
            <table className="timeline-table">
              <thead>
                <tr>
                  <th className="col-member">구성원</th>
                  {hourSlots.map(h => (
                    <th key={h} className="col-hour">
                      {formatHour(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member, index) => {
                  const memberSchedules = schedules.filter(s => {
                    const matchesMember = s.memberIds ? s.memberIds.includes(member.id) : s.memberId === member.id;
                    const matchesDate = isScheduleInMonth(s, currentYear, currentMonth) && s.date === selectedDate;
                    return matchesMember && matchesDate;
                  });
                  const { trackMap, totalTracks } = getSchedulesWithTracks(memberSchedules);
                  const rowHeight = Math.max(totalTracks * 32 + 16, 74);

                  return (
                    <tr key={member.id} style={{ height: `${rowHeight}px` }}>
                      {/* Column 1: Member profile info */}
                      <td className="col-member">
                        <div className="member-cell-content">
                          <div className="member-avatar-circle" style={{ backgroundColor: '#ffffff', color: '#ffffff', fontWeight: '700', border: '1px solid #e2e8f0', overflow: 'hidden', padding: 0 }}>
                            {getMemberAvatarPic(member, index) ? (
                              <img src={getMemberAvatarPic(member, index)} alt={member.name} style={getMemberAvatarStyle(member, index)} />
                            ) : (
                              member.id === 'sh' ? '나' : member.avatar
                            )}
                          </div>
                          <span className="member-role-label">{getMemberRoleText(member, index)}</span>
                        </div>
                      </td>

                      {/* Timeline cells */}
                      {hourSlots.map(h => {
                        const currentEvents = memberSchedules.filter(s => {
                          const displayStart = s.startHour < 8 ? 8 : s.startHour;
                          return displayStart === h;
                        });
                        return (
                          <td 
                            key={h} 
                            className="time-grid-cell"
                            onClick={() => openAddModal(member, h)}
                          >
                            {currentEvents.map(currentEvent => {
                              const trackIndex = trackMap[currentEvent.id] ?? 0;
                              const topOffset = totalTracks === 1 ? 24 : trackIndex * 32 + 12;
                              const isRequested = (currentEvent.status === 'requested' || (!currentEvent.status && currentEvent.memberId !== 'sh')) && member.id !== 'sh';
                              const isRejected = currentEvent.status === 'rejected' || currentEvent.status === `rejected_${member.id}`;
                              const displayStart = currentEvent.startHour < 8 ? 8 : currentEvent.startHour;
                              const displayEnd = currentEvent.endHour > 19.5 ? 19.5 : currentEvent.endHour;
                              return (
                                <div 
                                  key={currentEvent.id}
                                  className={`schedule-block ${currentEvent.color} ${isRequested ? 'status-requested' : ''} ${isRejected ? 'status-rejected' : ''}`}
                                  style={{ 
                                    width: `calc(${(displayEnd - displayStart) * 2 * 100}% - 8px)`,
                                    top: `${topOffset}px`,
                                    height: '26px',
                                    bottom: 'auto'
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDetailModal(currentEvent);
                                  }}
                                  title={`${currentEvent.title} (클릭시 상세 보기)`}
                                >
                                  {isRequested && '⏳ '}{isRejected && '❌ '}{currentEvent.title}
                                </div>
                              );
                            })}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {timeViewTab === 'weekly' && (() => {
            const getDayLabelAndDow = (d) => {
              const days = ['일', '월', '화', '수', '목', '금', '토'];
              const dateObj = new Date(currentYear, currentMonth - 1, d);
              const m = dateObj.getMonth() + 1;
              const dayNum = dateObj.getDate();
              const dow = days[dateObj.getDay()];
              return { label: `${m}/${dayNum}`, dow, month: m, dayNum };
            };

            const selectedObj = new Date(currentYear, currentMonth - 1, selectedDate);
            const dayOfWeekIndex = selectedObj.getDay();
            const startOfWeek = selectedDate - dayOfWeekIndex;
            const weekDates = Array.from({ length: 7 }, (_, i) => startOfWeek + i);
            const numMembers = filteredMembers.length;

            return (
              <table className="timeline-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                <colgroup>
                  <col style={{ width: '80px' }} />
                  {weekDates.map(d => 
                    filteredMembers.map(member => (
                      <col key={`${d}_${member.id}`} />
                    ))
                  )}
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan="2" style={{ width: '80px', textAlign: 'center', verticalAlign: 'middle', borderBottom: '2px solid var(--border-light)', backgroundColor: 'var(--bg-primary)' }}>시간</th>
                    {weekDates.map(d => {
                      const info = getDayLabelAndDow(d);
                      const isSat = info.dow === '토';
                      const isSun = info.dow === '일';
                      return (
                        <th 
                          key={d} 
                          colSpan={numMembers}
                          className={`${isSat ? 'sat' : ''} ${isSun ? 'sun' : ''}`}
                          style={{ fontSize: '13px', textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid var(--border-light)' }}
                        >
                          {info.label} ({info.dow})
                        </th>
                      );
                    })}
                  </tr>
                  <tr>
                    {weekDates.map(d => {
                      const info = getDayLabelAndDow(d);
                      const isSat = info.dow === '토';
                      const isSun = info.dow === '일';
                      return filteredMembers.map((member, memberIdx) => (
                        <th 
                          key={`${d}_${member.id}`}
                          className={`${isSat ? 'sat' : ''} ${isSun ? 'sun' : ''}`}
                          style={{ 
                            fontSize: '11px', 
                            textAlign: 'center', 
                            padding: '4px 2px', 
                            borderBottom: '2px solid var(--border-light)',
                            fontWeight: '600',
                            backgroundColor: 'var(--bg-primary)',
                            minWidth: '65px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px' }}>
                            <div 
                              className="member-avatar-circle" 
                              style={{ 
                                width: '24px', 
                                height: '24px', 
                                minWidth: '24px',
                                minHeight: '24px',
                                maxWidth: '24px',
                                maxHeight: '24px',
                                aspectRatio: '1 / 1',
                                borderRadius: '50%',
                                backgroundColor: '#ffffff', 
                                color: '#ffffff', 
                                fontWeight: '700', 
                                border: '1px solid #e2e8f0',
                                margin: '0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                padding: 0
                              }}
                              title={`${member.name} (${getMemberRoleText(member, memberIdx)})`}
                            >
                              {getMemberAvatarPic(member, memberIdx) ? (
                                <img src={getMemberAvatarPic(member, memberIdx)} alt={member.name} style={getMemberAvatarStyle(member, memberIdx)} />
                              ) : (
                                member.id === 'sh' ? '나' : member.avatar
                              )}
                            </div>
                            <span style={{ fontSize: '11.5px', fontWeight: '500', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {member.name}
                            </span>
                          </div>
                        </th>
                      ));
                    })}
                  </tr>
                </thead>
                <tbody>
                  {hourSlots.map(h => (
                    <tr key={h} style={{ height: '36px' }}>
                      <td style={{ 
                        width: '80px', 
                        textAlign: 'center', 
                        fontSize: '11.5px', 
                        fontWeight: '600', 
                        color: 'var(--text-secondary)',
                        borderRight: '1px solid var(--border-light)',
                        borderBottom: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-primary)',
                        padding: '0'
                      }}>
                        {formatHour(h)}
                      </td>
                      {weekDates.map(d => {
                        const info = getDayLabelAndDow(d);
                        const isSat = info.dow === '토';
                        const isSun = info.dow === '일';
                        
                        return filteredMembers.map(member => {
                          const daySchedules = schedules.filter(s => {
                            const matchesMember = s.memberIds ? s.memberIds.includes(member.id) : s.memberId === member.id;
                            return matchesMember && isScheduleInMonth(s, currentYear, info.month) && s.date === info.dayNum;
                          });

                          const currentEvents = daySchedules.filter(s => {
                            const displayStart = s.startHour < 8 ? 8 : s.startHour;
                            return displayStart === h;
                          });

                          return (
                            <td 
                              key={`${d}_${member.id}`} 
                              className={`time-grid-cell ${isSat ? 'sat-cell' : ''} ${isSun ? 'sun-cell' : ''}`}
                              style={{ 
                                padding: '0', 
                                height: '36px',
                                position: 'relative',
                                borderRight: '1px solid var(--border-light)',
                                borderBottom: '1px solid var(--border-light)',
                                backgroundColor: info.month === 6 && info.dayNum === new Date().getDate() ? 'rgba(99, 102, 241, 0.01)' : '',
                                opacity: info.month === 6 ? 1 : 0.5
                              }}
                              onClick={() => openAddModal(member, h)}
                            >
                              {currentEvents.map(event => {
                                const isRequested = (event.status === 'requested' || (!event.status && event.memberId !== 'sh')) && member.id !== 'sh';
                                const isRejected = event.status === 'rejected' || event.status === `rejected_${member.id}`;
                                const displayStart = event.startHour < 8 ? 8 : event.startHour;
                                const displayEnd = event.endHour > 19.5 ? 19.5 : event.endHour;
                                const duration = displayEnd - displayStart;
                                const heightPx = Math.max(duration * 2 * 36 - 12, 20);

                                return (
                                  <div
                                    key={event.id}
                                    className={`schedule-block ${event.color} ${isRequested ? 'status-requested' : ''} ${isRejected ? 'status-rejected' : ''}`}
                                    style={{
                                      position: 'absolute',
                                      top: '6px',
                                      left: '6px',
                                      width: 'calc(100% - 12px)',
                                      height: `${heightPx}px`,
                                      padding: '4px 6px',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      fontWeight: '600',
                                      lineHeight: '1.2',
                                      cursor: 'pointer',
                                      zIndex: 10,
                                      boxShadow: 'var(--shadow-sm)',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      display: 'block'
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openDetailModal(event);
                                    }}
                                    title={`${event.title} (${formatHour(event.startHour)} ~ ${formatHour(event.endHour)})`}
                                  >
                                    <div style={{ fontSize: '9px', opacity: 0.8, marginBottom: '1px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                      {formatHour(event.startHour)}~{formatHour(event.endHour)}
                                    </div>
                                    <div style={{ wordBreak: 'break-all', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: duration > 0.5 ? 2 : 1, WebkitBoxOrient: 'vertical' }}>
                                      {isRequested && '⏳ '}{isRejected && '❌ '}{event.title}
                                    </div>
                                  </div>
                                );
                              })}
                            </td>
                          );
                        });
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}

          {timeViewTab === 'monthly' && (
            <table className="timeline-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ color: 'var(--accent-red)', textAlign: 'center', padding: '10px' }}>일</th>
                  <th style={{ textAlign: 'center', padding: '10px' }}>월</th>
                  <th style={{ textAlign: 'center', padding: '10px' }}>화</th>
                  <th style={{ textAlign: 'center', padding: '10px' }}>수</th>
                  <th style={{ textAlign: 'center', padding: '10px' }}>목</th>
                  <th style={{ textAlign: 'center', padding: '10px' }}>금</th>
                  <th style={{ color: 'var(--accent-blue)', textAlign: 'center', padding: '10px' }}>토</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const days = getMonthDays(currentYear, currentMonth);
                  const rows = [];
                  for (let i = 0; i < days.length; i += 7) {
                    rows.push(days.slice(i, i + 7));
                  }

                  return rows.map((row, rIdx) => {
                    const weekRowSchedules = row.map(day => {
                      if (!day.isCurrentMonth) return [];
                      const list = schedules.filter(s => isScheduleInMonth(s, currentYear, currentMonth) && s.date === day.dayNum);
                      list.sort((a, b) => {
                        const keyA = (a.description?.match(/\[그룹 ID\]\s*(g_\w+)/)?.[1]) || a.title;
                        const keyB = (b.description?.match(/\[그룹 ID\]\s*(g_\w+)/)?.[1]) || b.title;
                        return keyA.localeCompare(keyB);
                      });
                      return list;
                    });

                    return (
                      <tr key={rIdx} style={{ height: 'auto' }}>
                        {row.map((day, dIdx) => {
                          const isCurrentMonth = day.isCurrentMonth;
                          const dayNum = day.dayNum;
                          const isSat = dIdx === 6;
                          const isSun = dIdx === 0;
                          const now = new Date();
                          const isToday = isCurrentMonth && currentYear === now.getFullYear() && currentMonth === (now.getMonth() + 1) && dayNum === now.getDate();
                          
                          const daySchedules = weekRowSchedules[dIdx] || [];
                        
                        return (
                          <td
                            key={dIdx}
                            style={{
                              width: '14.28%',
                              border: '1px solid var(--border-light)',
                              verticalAlign: 'top',
                              padding: '6px',
                              background: isCurrentMonth ? '#ffffff' : '#f8fafc',
                              opacity: isCurrentMonth ? 1 : 0.4,
                              position: 'relative'
                            }}
                            onClick={() => {
                              if (isCurrentMonth) {
                                setSelectedDate(dayNum);
                                setTimeViewTab('daily');
                              }
                            }}
                          >
                            <div style={{ minHeight: '98px', display: 'flex', flexDirection: 'column' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span 
                                  style={{ 
                                    fontSize: '13px', 
                                    fontWeight: '700', 
                                    color: isSun ? 'var(--accent-red)' : isSat ? 'var(--accent-blue)' : 'var(--text-primary)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '50%',
                                    backgroundColor: isToday ? 'var(--accent-purple)' : 'transparent',
                                    color: isToday ? '#ffffff' : ''
                                  }}
                                >
                                  {dayNum}
                                </span>
                                {isToday && <span style={{ fontSize: '9px', fontWeight: '800', color: 'var(--accent-purple)' }}>오늘</span>}
                              </div>
                              
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {daySchedules.map(event => {
                                const assignees = event.memberIds 
                                  ? event.memberIds.map(id => activeTeam.find(t => t.id === id)).filter(Boolean)
                                  : [];

                                const isPrevConnected = dIdx > 0 && weekRowSchedules[dIdx - 1].some(s => isSameScheduleRange(s, event));
                                const isNextConnected = dIdx < 6 && weekRowSchedules[dIdx + 1].some(s => isSameScheduleRange(s, event));

                                const showTitle = !isPrevConnected || dIdx === 0;

                                return (
                                  <div
                                    key={event.id}
                                    className={`schedule-block ${event.color}`}
                                    style={{
                                      position: 'relative',
                                      width: 'auto',
                                      height: '22px',
                                      padding: '0 6px',
                                      borderTopLeftRadius: isPrevConnected ? '0px' : '4px',
                                      borderBottomLeftRadius: isPrevConnected ? '0px' : '4px',
                                      borderTopRightRadius: isNextConnected ? '0px' : '4px',
                                      borderBottomRightRadius: isNextConnected ? '0px' : '4px',
                                      marginLeft: isPrevConnected ? '-7px' : '0px',
                                      marginRight: isNextConnected ? '-7px' : '0px',
                                      fontSize: '11px',
                                      fontWeight: '600',
                                      cursor: 'pointer',
                                      boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      zIndex: (isPrevConnected || isNextConnected) ? 2 : 1
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openDetailModal(event);
                                    }}
                                    title={`${event.title} (${assignees.map(a => a.name).join(', ')})`}
                                  >
                                    {showTitle ? (
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '4px' }}>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                          {event.title}
                                        </span>
                                        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                                          {assignees.map(a => (
                                            <span 
                                              key={a.id} 
                                              style={{ 
                                                width: '16px', 
                                                height: '16px', 
                                                borderRadius: '50%', 
                                                backgroundColor: a.color, 
                                                color: '#fff', 
                                                fontSize: '9px', 
                                                display: 'inline-flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center',
                                                fontWeight: '800',
                                                lineHeight: 1
                                              }}
                                              title={a.name}
                                            >
                                              {a.id === 'sh' ? '나' : a.avatar.slice(0, 1)}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    ) : (
                                      <div style={{ width: '100%', height: '100%' }} />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                        );
                      })}
                    </tr>
                  );
                });
                })()}
              </tbody>
            </table>
          )}

          {timeViewTab === 'list' && (() => {
            const grouped = {};
            schedules.filter(s => isScheduleInMonth(s, currentYear, currentMonth)).forEach(s => {
              if (!grouped[s.date]) {
                grouped[s.date] = [];
              }
              grouped[s.date].push(s);
            });
            
            const sortedDates = Object.keys(grouped).map(Number).sort((a, b) => a - b);
            
            if (sortedDates.length === 0) {
              return (
                <div style={{ padding: '40px', textAlignment: 'center', color: 'var(--text-tertiary)', fontSize: '15px' }}>
                  등록된 일정이 없습니다.
                </div>
              );
            }
            
            const getDayOfWeek = (d) => {
              const days = ['일', '월', '화', '수', '목', '금', '토'];
              const dateObj = new Date(currentYear, currentMonth - 1, d);
              return days[dateObj.getDay()];
            };

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '16px', background: '#fff', borderRadius: 'var(--radius-lg)' }}>
                {sortedDates.map(d => {
                  const dow = getDayOfWeek(d);
                  const isSat = dow === '토';
                  const isSun = dow === '일';
                  const daySchedules = grouped[d].sort((a, b) => a.startHour - b.startHour);
                  
                  return (
                    <div key={d} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ 
                        fontSize: '15px', 
                        fontWeight: '800', 
                        color: isSun ? 'var(--accent-red)' : isSat ? 'var(--accent-blue)' : 'var(--text-primary)',
                        borderBottom: '1px solid var(--border-light)',
                        paddingBottom: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        textAlign: 'left'
                      }}>
                        📅 6월 {d}일 ({dow}요일)
                        {d === new Date().getDate() && <span style={{ fontSize: '10px', backgroundColor: 'var(--accent-purple)', color: '#fff', padding: '2px 6px', borderRadius: '10px', fontWeight: '800' }}>오늘</span>}
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                        {daySchedules.map(event => {
                          const assignees = event.memberIds 
                            ? event.memberIds.map(id => activeTeam.find(t => t.id === id)).filter(Boolean)
                            : [];
                          const isRequested = event.status === 'requested';
                          const isRejected = event.status === 'rejected' || (event.status && event.status.startsWith('rejected_'));
                          
                          return (
                            <div
                              key={event.id}
                              className={`schedule-block ${event.color}`}
                              style={{
                                position: 'static',
                                width: '100%',
                                padding: '12px 14px',
                                borderRadius: '10px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                                boxShadow: 'var(--shadow-sm)',
                                border: '1.5px solid transparent',
                                transition: 'all 0.2s ease',
                                textAlign: 'left'
                              }}
                              onClick={() => openDetailModal(event)}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: '700', opacity: 0.8 }}>
                                  ⏰ {formatHour(event.startHour)} ~ {formatHour(event.endHour)}
                                </span>
                                {isRequested && <span style={{ fontSize: '10px', color: '#b45309', backgroundColor: '#fffbeb', padding: '2px 6px', borderRadius: '4px', fontWeight: '700', border: '1px solid #fef3c7' }}>승인대기</span>}
                                {isRejected && <span style={{ fontSize: '10px', color: '#b91c1c', backgroundColor: '#fef2f2', padding: '2px 6px', borderRadius: '4px', fontWeight: '700', border: '1px solid #fee2e2' }}>반려됨</span>}
                              </div>
                              <div style={{ fontSize: '14px', fontWeight: '700' }}>{event.title}</div>
                              {event.description && (
                                <div style={{ fontSize: '12px', opacity: 0.85, whiteSpace: 'pre-wrap', borderTop: '1px dashed rgba(255,255,255,0.2)', paddingTop: '4px' }}>
                                  {event.description}
                                </div>
                              )}
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                                {assignees.map(a => (
                                  <div 
                                    key={a.id} 
                                    style={{ 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      gap: '4px',
                                      fontSize: '11px',
                                      fontWeight: '600',
                                      backgroundColor: 'rgba(255,255,255,0.2)',
                                      padding: '2px 8px',
                                      borderRadius: '12px'
                                    }}
                                  >
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: a.color }} />
                                    {a.id === 'sh' ? '나' : a.name}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Floating AI Panel Button (Shown ONLY when chat drawer is closed) */}
        {!isDrawerOpen && (
          <button 
            className="ai-toggle-floating-btn"
            onClick={() => setIsDrawerOpen(true)}
            title="AI 비서 열기"
          >
            <img src="/bi2.png" alt="BI Logo 2" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </button>
        )}
      </main>

      {/* ──── ADD SCHEDULE MODAL ─────────────────── */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              📅 {modalMember?.name}의 {formatHour(modalStartHour)} 일정 추가
            </div>
            <input 
              type="text" 
              className="modal-input" 
              placeholder="일정 제목을 입력하세요"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveManualSchedule()}
              autoFocus
            />
            <div className="modal-actions">
              <button className="modal-btn" onClick={() => setIsModalOpen(false)}>취소</button>
              <button className="modal-btn primary" onClick={saveManualSchedule}>저장</button>
            </div>
          </div>
        </div>
      )}

      {/* ──── SCHEDULE DETAIL MODAL ─────────────────── */}
      {isDetailModalOpen && selectedDetailEvent && (
        <div className="modal-overlay" onClick={() => setIsDetailModalOpen(false)}>
          <div className="modal-content" style={{ width: '100%', maxWidth: '680px', padding: '28px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ fontSize: '21px', marginBottom: '8px' }}>📅 일정 상세 및 수정</div>
            
            {(selectedDetailEvent.status === 'requested' || (!selectedDetailEvent.status && selectedDetailEvent.memberId !== 'sh')) && (() => {
              const isCurrentUserRequester = selectedDetailEvent.requesterId === ME.id;
              if (isCurrentUserRequester) return null;

              const isCurrentUserAssignee = selectedDetailEvent.memberIds 
                ? selectedDetailEvent.memberIds.includes(ME.id) 
                : selectedDetailEvent.memberId === ME.id;
              
              const assignedNames = selectedDetailEvent.memberIds 
                ? selectedDetailEvent.memberIds.map(id => activeTeam.find(m => m.id === id)?.name).filter(Boolean).join(', ')
                : (activeTeam.find(m => m.id === selectedDetailEvent.memberId)?.name || '');

              return (
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 'var(--radius-sm)', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
                  {isCurrentUserAssignee ? (
                    !isRejecting ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <span style={{ fontSize: '13px', color: '#b45309', fontWeight: '700' }}>⚡ 요청 대기 중인 일정입니다</span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button 
                            className="modal-btn" 
                            style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: 'var(--accent-green)', color: '#fff', borderColor: 'var(--accent-green)', fontWeight: '700' }}
                            onClick={async () => {
                              if (isConfigured) {
                                let dbSched = { ...selectedDetailEvent, status: 'accepted' };
                                if (isCurrentUserYoonhee) {
                                  dbSched.memberId = selectedDetailEvent.memberId === 'sh' ? 'yoonhee' : (selectedDetailEvent.memberId === 'yoonhee' ? 'sh' : selectedDetailEvent.memberId);
                                  dbSched.memberIds = selectedDetailEvent.memberIds.map(id => id === 'sh' ? 'yoonhee' : (id === 'yoonhee' ? 'sh' : id));
                                  dbSched.requesterId = selectedDetailEvent.requesterId === 'sh' ? 'yoonhee' : (selectedDetailEvent.requesterId === 'yoonhee' ? 'sh' : selectedDetailEvent.requesterId);
                                }
                                await appwriteService.updateSchedule(selectedDetailEvent.id, dbSched);
                              }
                              setSchedules(prev => prev.map(s => s.id === selectedDetailEvent.id ? { ...s, status: 'accepted' } : s));
                              setIsDetailModalOpen(false);
                            }}
                          >
                            수락
                          </button>
                          <button 
                            className="modal-btn" 
                            style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: 'var(--accent-red)', color: '#fff', borderColor: 'var(--accent-red)', fontWeight: '700' }}
                            onClick={() => {
                              setIsRejecting(true);
                            }}
                          >
                            거부
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                        <span style={{ fontSize: '13px', color: '#b45309', fontWeight: '700' }}>❌ 반려 사유를 입력해주세요</span>
                        <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                          <input 
                            type="text" 
                            className="modal-input" 
                            placeholder="반려 사유 입력" 
                            value={rejectReasonInput} 
                            onChange={(e) => setRejectReasonInput(e.target.value)} 
                            style={{ flex: 1, padding: '4px 8px', fontSize: '13px', height: '30px' }}
                            autoFocus
                          />
                          <button 
                            className="modal-btn" 
                            style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: 'var(--accent-red)', color: '#fff', borderColor: 'var(--accent-red)', fontWeight: '700', whiteSpace: 'nowrap' }}
                            onClick={async () => {
                              if (!rejectReasonInput.trim()) {
                                alert('반려 사유를 입력해야 거부할 수 있습니다.');
                                return;
                              }
                              const cleanedDesc = (selectedDetailEvent.description || '')
                                .replace(/\[반려 사유\].*$/g, '')
                                .trim();
                              const newDesc = `${cleanedDesc}${cleanedDesc ? '\n' : ''}[반려 사유] ${rejectReasonInput.trim()}`;

                              const rejectedStatus = 'rejected_sh';
                              if (isConfigured) {
                                let dbSched = { 
                                  ...selectedDetailEvent, 
                                  status: rejectedStatus,
                                  description: newDesc
                                };
                                if (isCurrentUserYoonhee) {
                                  dbSched.memberId = selectedDetailEvent.memberId === 'sh' ? 'yoonhee' : (selectedDetailEvent.memberId === 'yoonhee' ? 'sh' : selectedDetailEvent.memberId);
                                  dbSched.memberIds = selectedDetailEvent.memberIds.map(id => id === 'sh' ? 'yoonhee' : (id === 'yoonhee' ? 'sh' : id));
                                  dbSched.requesterId = selectedDetailEvent.requesterId === 'sh' ? 'yoonhee' : (selectedDetailEvent.requesterId === 'yoonhee' ? 'sh' : selectedDetailEvent.requesterId);
                                  dbSched.status = 'rejected_yoonhee';
                                }
                                await appwriteService.updateSchedule(selectedDetailEvent.id, dbSched);
                              }
                              setSchedules(prev => prev.map(s => s.id === selectedDetailEvent.id ? { ...s, status: rejectedStatus, description: newDesc } : s));
                              setIsDetailModalOpen(false);
                            }}
                          >
                            확인
                          </button>
                          <button 
                            className="modal-btn" 
                            style={{ padding: '4px 8px', fontSize: '12px', whiteSpace: 'nowrap' }}
                            onClick={() => {
                              setIsRejecting(false);
                              setRejectReasonInput('');
                            }}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    )
                  ) : (
                    <span style={{ fontSize: '13.5px', color: '#b45309', fontWeight: '700', width: '100%', textAlign: 'center' }}>
                      ⏳ {assignedNames} 님의 수락 대기 중입니다
                    </span>
                  )}
                </div>
              );
            })()}

            {(selectedDetailEvent.status === 'rejected' || (selectedDetailEvent.status && selectedDetailEvent.status.startsWith('rejected'))) && (() => {
              const cleanedDesc = selectedDetailEvent.description || '';
              const match = cleanedDesc.match(/\[반려 사유\]\s*([^\n]*)/);
              const reason = match ? match[1] : '';
              const isCurrentUserRequester = selectedDetailEvent.requesterId === 'sh';
              
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                  <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 'var(--radius-sm)', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                    <span style={{ fontSize: '13px', color: 'var(--accent-red)', fontWeight: '700' }}>❌ 반려된 일정입니다</span>
                    {reason && (
                      <span style={{ fontSize: '12.5px', color: '#7f1d1d' }}>
                        <strong>반려 사유:</strong> {reason}
                      </span>
                    )}
                  </div>

                  {isCurrentUserRequester && (
                    <div style={{ padding: '8px 12px', backgroundColor: '#f0fdf4', border: '1px solid #dcfce7', borderRadius: 'var(--radius-sm)' }}>
                      {!isReRequesting ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span style={{ fontSize: '13px', color: '#15803d', fontWeight: '700' }}>🔄 이 일정을 재요청하시겠습니까?</span>
                          <button 
                            className="modal-btn" 
                            style={{ padding: '4px 10px', fontSize: '12px', backgroundColor: 'var(--accent-green)', color: '#fff', borderColor: 'var(--accent-green)', fontWeight: '700', cursor: 'pointer' }}
                            onClick={() => setIsReRequesting(true)}
                          >
                            재요청
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                          <span style={{ fontSize: '13px', color: '#15803d', fontWeight: '700' }}>🔄 재요청 메시지를 입력해주세요</span>
                          <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                            <input 
                              type="text" 
                              className="modal-input" 
                              placeholder="재요청 메시지 입력" 
                              value={reRequestMsgInput} 
                              onChange={(e) => setReRequestMsgInput(e.target.value)} 
                              style={{ flex: 1, padding: '4px 8px', fontSize: '13px', height: '30px' }}
                              autoFocus
                            />
                            <button 
                              className="modal-btn" 
                              style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: 'var(--accent-green)', color: '#fff', borderColor: 'var(--accent-green)', fontWeight: '700', whiteSpace: 'nowrap', cursor: 'pointer' }}
                              onClick={async () => {
                                if (!reRequestMsgInput.trim()) {
                                  alert('재요청 메시지를 입력해 주세요.');
                                  return;
                                }
                                const cleanDesc = (selectedDetailEvent.description || '').trim();
                                const newDesc = `${cleanDesc}${cleanDesc ? '\n' : ''}[재요청 메시지] ${reRequestMsgInput.trim()}`;

                                const newStatus = 'requested';
                                if (isConfigured) {
                                  let dbSched = { 
                                    ...selectedDetailEvent, 
                                    status: newStatus,
                                    description: newDesc
                                  };
                                  if (isCurrentUserYoonhee) {
                                    dbSched.memberId = selectedDetailEvent.memberId === 'sh' ? 'yoonhee' : (selectedDetailEvent.memberId === 'yoonhee' ? 'sh' : selectedDetailEvent.memberId);
                                    dbSched.memberIds = selectedDetailEvent.memberIds.map(id => id === 'sh' ? 'yoonhee' : (id === 'yoonhee' ? 'sh' : id));
                                    dbSched.requesterId = selectedDetailEvent.requesterId === 'sh' ? 'yoonhee' : (selectedDetailEvent.requesterId === 'yoonhee' ? 'sh' : selectedDetailEvent.requesterId);
                                  }
                                  await appwriteService.updateSchedule(selectedDetailEvent.id, dbSched);
                                }
                                setSchedules(prev => prev.map(s => s.id === selectedDetailEvent.id ? { ...s, status: newStatus, description: newDesc } : s));
                                setIsDetailModalOpen(false);
                              }}
                            >
                              보내기
                            </button>
                            <button 
                              className="modal-btn" 
                              style={{ padding: '4px 8px', fontSize: '12px', whiteSpace: 'nowrap', cursor: 'pointer' }}
                              onClick={() => {
                                setIsReRequesting(false);
                                setReRequestMsgInput('');
                              }}
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
            
            <div className="modal-detail-body" style={{ margin: '16px 0', fontSize: '16px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>일정명</label>
                <input 
                  type="text" 
                  className="modal-input" 
                  value={editTitle} 
                  onChange={(e) => setEditTitle(e.target.value)} 
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', fontSize: '15.5px' }}
                  disabled={!isDetailEditable}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>일정 기간 (날짜)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input 
                    type="date" 
                    className="modal-input" 
                    value={editStartDateStr} 
                    onChange={(e) => {
                      setEditStartDateStr(e.target.value);
                      if (!editEndDateStr || e.target.value > editEndDateStr) {
                        setEditEndDateStr(e.target.value);
                      }
                    }} 
                    style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', fontSize: '14.5px', background: '#fff' }}
                    disabled={!isDetailEditable}
                  />
                  <span style={{ fontWeight: '700', color: 'var(--text-tertiary)' }}>~</span>
                  <input 
                    type="date" 
                    className="modal-input" 
                    value={editEndDateStr} 
                    onChange={(e) => setEditEndDateStr(e.target.value)} 
                    style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', fontSize: '14.5px', background: '#fff' }}
                    disabled={!isDetailEditable}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>상세내용</label>
                <textarea 
                  placeholder="업무 지시 사항, 아젠다 등 상세 내용을 입력하세요" 
                  value={editDetail} 
                  onChange={(e) => setEditDetail(e.target.value)} 
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', resize: 'none', height: '110px', fontFamily: 'inherit', fontSize: '15px', lineHeight: '1.45' }}
                  disabled={!isDetailEditable}
                />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>담당자 (복수 선택 가능)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '4px 0' }}>
                  {activeTeam.map(m => {
                    const isChecked = editMemberIds.includes(m.id);
                    return (
                      <label 
                        key={m.id} 
                        style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '8px', 
                          cursor: isDetailEditable ? 'pointer' : 'default', 
                          background: isChecked ? 'rgba(99, 102, 241, 0.08)' : '#f8fafc', 
                          padding: '8px 14px', 
                          borderRadius: '20px', 
                          border: `1.5px solid ${isChecked ? 'var(--accent-purple)' : 'var(--border-light)'}`, 
                          fontSize: '14.5px', 
                          fontWeight: '600', 
                          transition: 'var(--transition)',
                          userSelect: 'none',
                          opacity: isDetailEditable ? 1 : 0.8
                        }}
                      >
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={(e) => {
                            if (!isDetailEditable) return;
                            if (e.target.checked) {
                              setEditMemberIds(prev => [...prev, m.id]);
                            } else {
                              setEditMemberIds(prev => prev.filter(id => id !== m.id));
                            }
                          }}
                          style={{ display: 'none' }}
                          disabled={!isDetailEditable}
                        />
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: m.color }} />
                        {m.name}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>시작 시간</label>
                  <select 
                    value={editStartHour} 
                    onChange={(e) => {
                      const newStart = parseFloat(e.target.value);
                      setEditStartHour(newStart);
                      if (editEndHour <= newStart) {
                        setEditEndHour(newStart + 1);
                      }
                    }}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: '#fff', fontSize: '15px' }}
                    disabled={!isDetailEditable}
                  >
                    {hourSlots.map(h => (
                      <option key={h} value={h}>{formatHour(h)}</option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>종료 시간</label>
                  <select 
                    value={editEndHour} 
                    onChange={(e) => setEditEndHour(parseFloat(e.target.value))}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: '#fff', fontSize: '15px' }}
                    disabled={!isDetailEditable}
                  >
                    {getEndHourOptions().map(h => (
                      <option key={h} value={h}>{formatHour(h)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>추가 내용 / 메모</label>
                <textarea 
                  placeholder="회의 안건, 준비물 등 메모를 입력하세요" 
                  value={editMemo} 
                  onChange={(e) => setEditMemo(e.target.value)} 
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', resize: 'none', height: '80px', fontFamily: 'inherit', fontSize: '15px' }}
                  disabled={!isDetailEditable}
                />
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '16px', gap: '10px' }}>
              <button className="modal-btn" style={{ padding: '9px 18px', fontSize: '15px', fontWeight: '600' }} onClick={() => setIsDetailModalOpen(false)}>닫기</button>
              {isDetailEditable && (
                <>
                  <button 
                    className="modal-btn" 
                    style={{ backgroundColor: 'var(--accent-red)', color: '#ffffff', borderColor: 'var(--accent-red)', padding: '9px 18px', fontSize: '15px', fontWeight: '600' }}
                    onClick={async () => {
                      const matchGroupId = selectedDetailEvent.description && selectedDetailEvent.description.match(/\[그룹 ID\]\s*(g_\w+)/);
                      const groupId = matchGroupId ? matchGroupId[1] : null;
                      if (groupId) {
                        if (confirm(`"${selectedDetailEvent.title}"은 그룹 일정입니다. 연결된 모든 일정을 함께 삭제하시겠습니까?`)) {
                          const targets = schedules.filter(s => s.description && s.description.includes(`[그룹 ID] ${groupId}`));
                          if (isConfigured) {
                            for (const t of targets) {
                              await appwriteService.deleteSchedule(t.id);
                            }
                          }
                          const targetIds = targets.map(t => t.id);
                          setSchedules(prev => prev.filter(s => !targetIds.includes(s.id)));
                          setIsDetailModalOpen(false);
                        }
                      } else {
                        if (confirm(`"${selectedDetailEvent.title}" 일정을 정말 삭제하시겠습니까?`)) {
                          if (isConfigured) {
                            await appwriteService.deleteSchedule(selectedDetailEvent.id);
                          }
                          setSchedules(prev => prev.filter(s => s.id !== selectedDetailEvent.id));
                          setIsDetailModalOpen(false);
                        }
                      }
                    }}
                  >
                    삭제
                  </button>
                  <button className="modal-btn primary" style={{ padding: '9px 18px', fontSize: '15px', fontWeight: '600' }} onClick={saveEventEdits}>저장</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
