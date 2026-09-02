import React, { useState, useEffect, useRef, Fragment } from 'react';
import './index.css';
import { appwriteService, isConfigured } from './appwrite';
import { parseMessageWithGemini } from './gemini';
import Dashboard from './components/Dashboard';
import LeftNavRail from './components/LeftNavRail';

const TEAM = [
  { id: 'sh', name: '정윤희', role: '부장', avatar: '윤희', avatarPic: '/pic1_thumb.png', color: '#000000', subtext: '기획 일정' },
  { id: 'sangmoo', name: '조상무', role: '상무', avatar: '상무', avatarPic: '/pic2_thumb.png', color: '#6366f1', subtext: '임원 일정' },
  { id: 'daum', name: '정다음', role: '사원', avatar: '다음', avatarPic: '/pic2_thumb.png', color: '#10b981', subtext: '개인 일정' }
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

// Helpers for extracting and rendering URLs as clickable links opening in new window (target="_blank")
const extractUrls = (text) => {
  if (!text) return [];
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);
  return matches ? Array.from(new Set(matches.map(u => u.replace(/[.,;)]$/, '')))) : [];
};

const renderTextWithLinks = (text) => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (part.match(/^https?:\/\/[^\s]+$/)) {
      const cleanUrl = part.replace(/[.,;)]$/, '');
      const trailingPunct = part.slice(cleanUrl.length);
      return (
        <span key={i}>
          <a 
            href={cleanUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            style={{ color: '#2563eb', textDecoration: 'underline', wordBreak: 'break-all', fontWeight: '600' }}
            onClick={(e) => e.stopPropagation()}
          >
            {cleanUrl}
          </a>
          {trailingPunct}
        </span>
      );
    }
    return part;
  });
};

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

function isIssueSchedule(s) {
  if (!s) return false;
  if (s.category === '이슈') return true;
  if (s.category === '일반' || s.category === '휴가') return false;
  if (s.isIssue !== undefined && typeof s.isIssue === 'boolean') return s.isIssue;
  if (s.color === 'red') return true;
  const desc = typeof s.description === 'string' ? s.description : '';
  if (desc.includes('[구분: 이슈]')) return true;
  if (desc.includes('[구분: 일반]') || desc.includes('[구분: 휴가]')) return false;
  const title = typeof s.title === 'string' ? s.title : '';
  return /긴급|이슈|장애|오류|버그|지연|에러|점검|디버깅|블로커/i.test(title + ' ' + desc);
}

function getNthWeekdayOfMonth(year, month, nth, weekdayStr) {
  const weekdayMap = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
  const targetDow = weekdayMap[weekdayStr];
  if (targetDow === undefined) return null;

  const daysInM = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInM; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === targetDow) {
      count++;
      if (count === nth) return d;
    }
  }
  return null;
}


function ColoredStampIcon({ size = 16 }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }}
    >
      <defs>
        <linearGradient id="stampWood" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id="stampRed" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff4d4f" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
      </defs>

      {/* 손잡이 상단 꼭지 */}
      <circle cx="12" cy="4" r="2.5" fill="url(#stampWood)" />
      {/* 손잡이 기둥 */}
      <path d="M10 6.5C10 6.5 8.5 10.5 8.5 12H15.5C15.5 10.5 14 6.5 14 6.5H10Z" fill="url(#stampWood)" />
      {/* 도장 중간 금속 밴드 */}
      <rect x="7" y="12" width="10" height="2" rx="0.5" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.5" />
      {/* 도장 하단 몸체 */}
      <rect x="4" y="14" width="16" height="3.5" rx="1" fill="#475569" />
      {/* 인주가 묻은 도장 인면 (선명한 빨간색) */}
      <rect x="3" y="17.5" width="18" height="3" rx="0.8" fill="url(#stampRed)" />
    </svg>
  );
}

function IssueWarningIcon({ size = 16, style = {} }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      style={{ flexShrink: 0, marginRight: '4px', verticalAlign: '-2px', display: 'inline-block', ...style }}
    >
      <path 
        d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" 
        fill="#FF0000" 
      />
      <line 
        x1="12" 
        y1="9" 
        x2="12" 
        y2="13.5" 
        stroke="#ffffff" 
        strokeWidth="2.5" 
        strokeLinecap="round" 
      />
      <circle 
        cx="12" 
        cy="17.2" 
        r="1.25" 
        fill="#ffffff" 
      />
    </svg>
  );
}


function getApproverMember(sched, currentUserId = 'sh') {
  if (!sched) return { name: '조상무', role: '상무' };
  try {
    // 1. Explicit approverId set on the schedule (designated by requester)
    if (sched.approverId) {
      const found = TEAM.find(m => m.id === sched.approverId || (sched.approverId === 'yoonhee' && m.id === 'sh') || (sched.approverId === 'sangmu' && m.id === 'sangmoo') || (sched.approverId === 'daeum' && m.id === 'daum'));
      if (found) return found;
    }

    const requester = sched.requesterId || sched.memberId || currentUserId;

    // 2. Explicit tag in description (e.g. [결재자] 조상무, [요청대상] 정다음, [승인자] 정윤희)
    const desc = sched.description || '';
    const approverTagMatch = desc.match(/\[(?:결재자|승인자|수락자|요청대상|지정결재자)\]\s*([^|\n]+)/);
    if (approverTagMatch) {
      const tagText = approverTagMatch[1].trim();
      const foundByTag = TEAM.find(m => tagText.includes(m.name) || (m.role && tagText.includes(m.role)));
      if (foundByTag && foundByTag.id !== requester && !(requester === 'sh' && foundByTag.id === 'yoonhee')) return foundByTag;
    }

    // 3. Person designated in text / description
    const fullText = `${sched.title || ''} ${desc}`;
    if (/조상무|상무님|상무/i.test(fullText) && requester !== 'sangmoo' && requester !== 'sangmu') {
      return TEAM.find(m => m.id === 'sangmoo') || { name: '조상무', role: '상무' };
    }
    if (/정윤희|정부장|부장님/i.test(fullText) && requester !== 'sh' && requester !== 'yoonhee') {
      return TEAM.find(m => m.id === 'sh') || { name: '정윤희', role: '부장' };
    }
    if (/정다음|정사원/i.test(fullText) && requester !== 'daum' && requester !== 'daeum') {
      return TEAM.find(m => m.id === 'daum') || { name: '정다음', role: '사원' };
    }

    // 4. Default approver for personal leave (반차/연차/휴가) is always sangmoo (조상무 상무)
    const isLeave = /\[?반차|연차|휴가|병가\]?/i.test(sched.title || '') || sched.category === '휴가';
    if (isLeave) {
      return TEAM.find(m => m.id === 'sangmoo') || { name: '조상무', role: '상무' };
    }

    // 5. Delegated task/meeting assignees
    if (sched.memberIds && sched.memberIds.length > 0) {
      const otherId = sched.memberIds.find(id => id !== requester && !(requester === 'sh' && id === 'yoonhee') && !(requester === 'daum' && id === 'daeum') && !(requester === 'sangmoo' && id === 'sangmu'));
      if (otherId) {
        const found = TEAM.find(m => m.id === otherId || (otherId === 'yoonhee' && m.id === 'sh') || (otherId === 'sangmu' && m.id === 'sangmoo') || (otherId === 'daeum' && m.id === 'daum'));
        if (found) return found;
      }
    }

    // 6. Default fallback for delegated non-leave tasks
    if (requester === 'daum' || requester === 'daeum') {
      return TEAM.find(m => m.id === 'sh') || { name: '정윤희', role: '부장' };
    }
    return TEAM.find(m => m.id === 'sangmoo') || { name: '조상무', role: '상무' };
  } catch (e) {
    return { name: '조상무', role: '상무' };
  }
}

function getProgressBgStyle(colorName, progress) {
  if (!progress || progress <= 0) return {};
  const map = {
    purple: '#e0e5ff',
    orange: '#ffeedd',
    green: '#d4f7e2',
    blue: '#d9e6ff',
  };
  const bgTint = map[colorName] || '#e0e5ff';
  if (progress >= 100) return { background: bgTint, backgroundColor: bgTint };
  return {
    background: `linear-gradient(to right, ${bgTint} ${progress}%, #ffffff ${progress}%)`
  };
}

function getDayCardProgressStyle(colorName, progress) {
  if (!progress || progress <= 0) return {};
  const map = {
    purple: '#e0e5ff',
    orange: '#ffeedd',
    green: '#d4f7e2',
    blue: '#d9e6ff',
  };
  const bgTint = map[colorName] || '#e0e5ff';
  if (progress >= 100) return { background: bgTint, backgroundColor: bgTint };
  return {
    background: `linear-gradient(to right, ${bgTint} ${progress}%, #ffffff ${progress}%)`
  };
}

function getMonthSegmentProgressStyle(evt, currentYear, currentMonth, schedules) {
  const sample = evt.sampleEvent;
  if (!sample) return {};
  const progress = sample.progress !== undefined ? sample.progress : (parseScheduleDescription(sample.description || '').progress || 0);
  if (!progress || progress <= 0) return {};

  const map = {
    purple: '#e0e5ff',
    orange: '#ffeedd',
    green: '#d4f7e2',
    blue: '#d9e6ff',
  };
  const bgTint = map[evt.color] || '#e0e5ff';

  if (progress >= 100) return { background: bgTint, backgroundColor: bgTint };

  const groupId = sample.description && sample.description.match(/\[그룹 ID\]\s*(g_\w+)/)?.[1];
  let groupScheds = [];
  if (groupId) {
    groupScheds = schedules.filter(s => s.description && s.description.includes(`[그룹 ID] ${groupId}`));
  }
  if (!groupId || groupScheds.length === 0) {
    return {
      background: `linear-gradient(to right, ${bgTint} ${progress}%, #ffffff ${progress}%)`
    };
  }

  groupScheds.sort((a, b) => {
    const ya = a.year || currentYear, yb = b.year || currentYear;
    if (ya !== yb) return ya - yb;
    const ma = a.month || currentMonth, mb = b.month || currentMonth;
    if (ma !== mb) return ma - mb;
    return a.date - b.date;
  });

  const first = groupScheds[0];
  const last = groupScheds[groupScheds.length - 1];

  const firstDate = new Date(first.year || currentYear, (first.month || currentMonth) - 1, first.date);
  firstDate.setHours(0, 0, 0, 0);

  const lastDate = new Date(last.year || currentYear, (last.month || currentMonth) - 1, last.date);
  lastDate.setHours(0, 0, 0, 0);

  const totalDays = Math.max(1, Math.round((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const completedDays = totalDays * (progress / 100);

  const segStartDay = evt.rowDays ? evt.rowDays[evt.startCol] : null;
  const segEndDay = evt.rowDays ? evt.rowDays[evt.endCol] : null;

  if (!segStartDay || !segEndDay) {
    return { background: `linear-gradient(to right, ${bgTint} ${progress}%, #ffffff ${progress}%)` };
  }

  const segStartDate = new Date(segStartDay.year || currentYear, (segStartDay.month || currentMonth) - 1, segStartDay.dayNum);
  segStartDate.setHours(0, 0, 0, 0);

  const segEndDate = new Date(segEndDay.year || currentYear, (segEndDay.month || currentMonth) - 1, segEndDay.dayNum);
  segEndDate.setHours(0, 0, 0, 0);

  const segmentDays = Math.max(1, Math.round((segEndDate.getTime() - segStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const daysBeforeSegment = Math.max(0, Math.round((segStartDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));

  const remainingCompletedDays = completedDays - daysBeforeSegment;

  if (remainingCompletedDays <= 0) {
    return { background: '#ffffff' };
  }
  if (remainingCompletedDays >= segmentDays) {
    return { background: bgTint, backgroundColor: bgTint };
  }

  const fillPct = Math.min(100, Math.max(0, (remainingCompletedDays / segmentDays) * 100));
  return {
    background: `linear-gradient(to right, ${bgTint} ${fillPct.toFixed(1)}%, #ffffff ${fillPct.toFixed(1)}%)`
  };
}

function getWeekCardProgressStyle(event, cardYear, cardMonth, cardDateNum, schedules) {
  const parsed = parseScheduleDescription(event.description || '');
  const progress = event.progress !== undefined ? event.progress : (parsed.progress || 0);

  if (!progress || progress <= 0) return {};

  const map = {
    purple: '#e0e5ff',
    orange: '#ffeedd',
    green: '#d4f7e2',
    blue: '#d9e6ff',
  };
  const bgTint = map[event.color] || '#e0e5ff';

  if (progress >= 100) return { background: bgTint, backgroundColor: bgTint };

  const groupId = event.description && event.description.match(/\[그룹 ID\]\s*(g_\w+)/)?.[1];
  let groupScheds = [];
  if (groupId) {
    groupScheds = schedules.filter(s => s.description && s.description.includes(`[그룹 ID] ${groupId}`));
  } else if (event.title) {
    groupScheds = schedules.filter(s => s.title === event.title);
  }

  if (groupScheds.length <= 1) {
    return {
      background: `linear-gradient(to right, ${bgTint} ${progress}%, #ffffff ${progress}%)`
    };
  }

  groupScheds.sort((a, b) => {
    const ya = a.year || cardYear, yb = b.year || cardYear;
    if (ya !== yb) return ya - yb;
    const ma = a.month || cardMonth, mb = b.month || cardMonth;
    if (ma !== mb) return ma - mb;
    return a.date - b.date;
  });

  const first = groupScheds[0];
  const last = groupScheds[groupScheds.length - 1];

  const firstDate = new Date(first.year || cardYear, (first.month || cardMonth) - 1, first.date);
  firstDate.setHours(0, 0, 0, 0);

  const lastDate = new Date(last.year || cardYear, (last.month || cardMonth) - 1, last.date);
  lastDate.setHours(0, 0, 0, 0);

  const totalDays = Math.max(1, Math.round((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const completedDays = totalDays * (progress / 100);

  const currentCardDate = new Date(cardYear, cardMonth - 1, cardDateNum);
  currentCardDate.setHours(0, 0, 0, 0);

  const dayIndexFromStart = Math.round((currentCardDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const fullCompletedDays = Math.floor(completedDays);

  if (dayIndexFromStart <= fullCompletedDays) {
    return { background: bgTint, backgroundColor: bgTint };
  } else if (dayIndexFromStart === fullCompletedDays + 1) {
    const partialFraction = (completedDays - fullCompletedDays) * 100;
    if (partialFraction > 0) {
      return {
        background: `linear-gradient(to right, ${bgTint} ${partialFraction.toFixed(1)}%, #ffffff ${partialFraction.toFixed(1)}%)`
      };
    } else {
      return { background: '#ffffff' };
    }
  } else {
    return { background: '#ffffff' };
  }
}

function getListCardProgressStyle(event, cardDateNum, currentYear, currentMonth, schedules) {
  return { background: '#ffffff', backgroundColor: '#ffffff' };
}

function getMemberAvatarPic(member) {
  if (!member) return '/pic1_thumb.png';
  if (member.id === 'sangmoo' || member.name === '조상무' || member.avatarPic === '/pic3_thumb.png') {
    return '/pic2_thumb.png';
  }
  return member.avatarPic || '/pic1_thumb.png';
}

function cleanMemberRole(role) {
  if (!role) return '팀원';
  let r = String(role).replace(/^(?:나\/|나|정윤희|조상무|정다음|\s|\(|\))+/gi, '').replace(/\)+$/, '').trim();
  r = r.replace(/.*?(부장|상무|사원|대리|과장|차장|이사|대표|팀원).*/, '$1');
  return r || '팀원';
}

function getMemberRoleText(member, meUser) {
  if (!member) return '나';

  const role = cleanMemberRole(member.role);
  const isMe = meUser && (member.id === meUser.id || member.name === meUser.name);
  if (isMe) {
    return role ? `나 ${role}` : '나';
  }
  return role ? `${member.name} ${role}` : member.name;
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
  if (!text) return { introText: '', schedules: [] };

  const lines = text.split('\n');
  let introLines = [];
  let currentChunk = null;
  const chunks = [];

  const isHeaderLine = (line) => /^📅?\s*(?:\d+\.\s*(?:일정|이슈)|(?:일정|이슈)\s*\d+)/iu.test(line);
  const isDetailLine = (line) => /^(?:상세내용|상세):?/iu.test(line);

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (isHeaderLine(trimmed)) {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = [line];
    } else if (isDetailLine(trimmed) && (!currentChunk || currentChunk.some(l => isDetailLine(l.trim())))) {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = [line];
    } else {
      if (currentChunk) {
        if (!isHeaderLine(trimmed)) {
          currentChunk.push(line);
        }
      } else {
        introLines.push(line);
      }
    }
  });
  if (currentChunk) chunks.push(currentChunk);

  const schedulesList = [];
  chunks.forEach((chunkLines, idx) => {
    const blockText = chunkLines.join('\n');
    const titleMatch = blockText.match(/"([^"]+)"/) || blockText.match(/(?:\d+\.\s*(?:일정|이슈)|(?:일정|이슈)\s*\d+):?\s*([^\n]+)/);
    
    let title = '';
    if (titleMatch) {
      title = titleMatch[1].replace(/^["']|["']$/g, '').trim();
    } else {
      const detailLine = chunkLines.find(l => /^(?:상세내용|상세):?/iu.test(l.trim()));
      if (detailLine) {
        const cleanVal = detailLine.replace(/.*(?:상세내용|상세):?\s*/iu, '').replace(/^[-•*\s]+/, '').split(',')[0].trim();
        title = cleanVal || `일정 ${idx + 1}`;
      } else {
        title = `일정 ${idx + 1}`;
      }
    }

    const dateRangeMatch = blockText.match(/📅?\s*날짜:?\s*\d{4}\.\d{2}\.(\d{2})\s*[-~–]\s*(?:\d{4}\.\d{2}\.)?(\d{2})/u);
    let dates = [];
    if (dateRangeMatch) {
      const startD = parseInt(dateRangeMatch[1]);
      const endD = parseInt(dateRangeMatch[2]);
      for (let d = startD; d <= endD; d++) dates.push(d);
    } else {
      const dateMatch = blockText.match(/📅?\s*날짜:?\s*\d{4}\.\d{2}\.(\d{2})/u);
      if (dateMatch) dates.push(parseInt(dateMatch[1]));
    }

    const timeMatch = blockText.match(/⏰?\s*시간:?\s*(\d{1,2}):\d{2}\s*[-~–]\s*(\d{1,2}):\d{2}/u);
    const startHour = timeMatch ? parseInt(timeMatch[1]) : null;
    const endHour = timeMatch ? parseInt(timeMatch[2]) : null;

    schedulesList.push({
      title,
      dates,
      startHour,
      endHour,
      lines: chunkLines,
      rawText: blockText
    });
  });

  return { introText: introLines.join('\n').trim(), schedules: schedulesList };
}

function getTimeSlot() {
  const h = new Date().getHours();
  if (h < 12)  return 'morning';
  if (h < 14)  return 'afternoon';
  if (h < 18)  return 'evening';
  return 'night';
}

function formatTime(date) {
  if (!date) return '';
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
}

function formatHour(h) {
  const hr = Math.floor(h);
  const min = h % 1 === 0 ? '00' : '30';
  return `${hr < 10 ? '0' : ''}${hr}:${min}`;
}

function extractOnlyName(fullName) {
  if (!fullName) return '사용자';
  let clean = fullName.replace(/\[.*?\]/g, '').trim();
  clean = clean.replace(/\(.*?\)/g, '').trim();

  const validRoles = [
    '웹 기획자', '기획자', '디자이너', '개발자',
    '사원', '대리', '과장', '차장', '부장', '이사', '상무', '전무', '대표'
  ];
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    const lastWord = parts[parts.length - 1];
    if (validRoles.includes(lastWord)) {
      return parts.slice(0, -1).join(' ');
    }
  }
  return clean || fullName;
}

function getGreetingMsg(rawName, slot) {
  const name = extractOnlyName(rawName);
  const s = slot || getTimeSlot();
  const greets = {
    morning:   `안녕하세요, ${name}님. 😊\n좋은 아침입니다!\n오늘 진행하실 업무나 일정을 아래 입력창에 편하게 입력해 주세요.\n(예: "오늘 14시 B사 미팅", "내일 대신증권 투입")`,
    afternoon: `안녕하세요, ${name}님. 😊\n점심은 맛있게 드셨나요?\n오늘 진행하실 업무나 일정을 아래 입력창에 편하게 입력해 주세요. 타임라인에 자동으로 등록해 드립니다!\n(예: "오늘 14시 B사 미팅", "26일 ~ 27일 워크숍")`,
    evening:   `안녕하세요, ${name}님. 😊\n오늘 하루도 수고하셨습니다.\n완료된 업무나 내일 등록할 일정을 아래 입력창에 남겨주세요!`,
    night:     `안녕하세요, ${name}님. 😊\n늦은 시간까지 수고 많으셨어요.\n기록해두실 일정이나 업무 내용을 입력해 주세요!`,
  };
  return greets[s] || greets.afternoon;
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

function splitCompoundScheduleText(text) {
  let cleaned = text.replace(/\r\n/g, '\n').trim();

  // Multi-line: recursively process each line
  const rawLines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
  if (rawLines.length > 1) {
    const result = [];
    rawLines.forEach(line => { result.push(...splitCompoundScheduleText(line)); });
    return result;
  }

  // Insert "|||" markers at task boundaries, then split on them
  let marked = cleaned;

  // 1) Mark before delegation markers (정다음 한테, 조상무님한테 etc.)
  marked = marked.replace(
    /\s*(정다음\s*한테|정다음\s*사원\s*한테|정사원\s*한테|정사인\s*한테|정부장\s*한테|조상무님?\s*한테|조상무\s*님\s*한테)\s*/gi,
    function(m) { return ' ||| ' + m.trim() + ' '; }
  );

  // 2) Mark before time markers that follow a clause-ending word (even with spaces)
  // Match patterns like: "복귀해서 3시에", "들어갈 거고 4시 반에", "보고받고 2시까지"
  // Connector can be: 고, 서, 거고, 받고, 전에, 나서, 이후, 다음에, 하고, 하며, 나갔다가
  const timeMarkerRe = /((?:나갔다가|복귀해서|복귀하고|들어갈\s*거고|들어가기\s*전에|보고받고|보고\s*받고|이후|다음에|하고\s*나서|끝나고|끝나면|나서|받고)\s+)((?:오전|오후)?\s*\d{1,2}\s*시(?:\s*(?:반|30분))?(?:에|까지|부터)?)/gi;
  marked = marked.replace(timeMarkerRe, function(m, connector, time) {
    return connector.trimEnd() + ' ||| ' + time;
  });

  // 3) Also split before any Nth 시 occurrence that appears mid-sentence after Korean words
  // This catches "4시 반에 부서장 결산 회의 들어가기 전에 2시까지" -> split before "2시까지"
  // Pattern: Korean content + connector phrases + time
  marked = marked.replace(/((?:전에|이후|다음에)\s+)(\d{1,2}\s*시)/gi, function(m, conn, time) {
    return conn.trimEnd() + ' ||| ' + time;
  });

  // 4) Split by comma
  const commaParts = marked.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  const segments = [];
  commaParts.forEach(part => {
    const subParts = part.split('|||').map(s => s.trim()).filter(Boolean);
    segments.push(...subParts);
  });

  return segments.filter(s => s && s.length > 1);
}

function parseMessageToSchedules(text, selectedDate, teamList = TEAM, year = new Date().getFullYear(), month = new Date().getMonth() + 1, currentUser = null) {
  const chunks = splitCompoundScheduleText(text);
  const results = [];
  const myId = currentUser?.id || 'sangmoo';

  let prevEndHour = 14.0; // Track previous event end time for phrases like "끝나면 5시까지"

  chunks.forEach((chunk, index) => {
    let raw = chunk.trim();
    if (!raw) return;

    let targetDate = selectedDate || new Date().getDate();
    let targetMonth = month;

    const dateMatch = raw.match(/(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일/);
    if (dateMatch) {
      if (dateMatch[1]) targetMonth = parseInt(dateMatch[1]);
      targetDate = parseInt(dateMatch[2]);
    }

    let startHour = 10.0;
    let endHour = 11.0;
    let timeFound = false;

    // 1) "오전 내내", "오전 중", "아침부터", "오전엔", "오전에" -> 9:00 ~ 12:00 (또는 9:00 ~ 11:00)
    if (/오전\s*내내|오전\s*중|아침부터|오전엔|오전에|오전에는/i.test(raw) && !/반차/i.test(raw)) {
      startHour = 9.0;
      endHour = raw.includes('로그 분석') ? 11.0 : 12.0;
      timeFound = true;
    }
    // 2) "오후 내내", "오후엔", "오후에", "오후에는" -> 13:00 ~ 17:00
    else if (/오후\s*내내|오후엔|오후에|오후에는/i.test(raw) && !/반차/i.test(raw)) {
      startHour = 13.0;
      endHour = 17.0;
      timeFound = true;
    }
    // 3) "끝나면 ~ 5시까지" or "끝나고 ~ 5시까지"
    else if (/끝나(?:면|고)/i.test(raw) && /(\d{1,2})\s*시(?:\s*(30분|반))?까지/i.test(raw)) {
      const match5 = raw.match(/(\d{1,2})\s*시(?:\s*(30분|반))?까지/i);
      let h = parseInt(match5[1]);
      let m = match5[2] === '반' || match5[2] === '30분' ? 30 : 0;
      let targetEnd = normalizeHour(h, '오후') + (m === 30 ? 0.5 : 0);
      startHour = prevEndHour;
      endHour = targetEnd;
      timeFound = true;
    }
    // 4) Duration: "오후 2시에 ... 1시간 있고" -> 14:00 ~ 15:00
    else if (/(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(30분|반))?에?.*(\d+)\s*시간/i.test(raw)) {
      const matchDur = raw.match(/(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(30분|반))?에?.*(\d+)\s*시간/i);
      let h = parseInt(matchDur[2]);
      let m = matchDur[3] === '반' || matchDur[3] === '30분' ? 30 : 0;
      let dur = parseFloat(matchDur[4]);
      startHour = normalizeHour(h, matchDur[1] || (h <= 6 ? '오후' : '오전')) + (m === 30 ? 0.5 : 0);
      endHour = startHour + dur;
      timeFound = true;
    }
    // 5) Range: "11시 ~ 12시"
    else if (/(오전|오후)?\s*(\d{1,2})(?::(\d{2})|\s*시(?:\s*(30분|반))?)\s*[-~]\s*(오전|오후)?\s*(\d{1,2})(?::(\d{2})|\s*시(?:\s*(30분|반))?)/.test(raw)) {
      const rangeMatch = raw.match(/(오전|오후)?\s*(\d{1,2})(?::(\d{2})|\s*시(?:\s*(30분|반))?)\s*[-~]\s*(오전|오후)?\s*(\d{1,2})(?::(\d{2})|\s*시(?:\s*(30분|반))?)/);
      let h1 = parseInt(rangeMatch[2]);
      let m1 = rangeMatch[3] ? parseInt(rangeMatch[3]) : (rangeMatch[4] === '반' || rangeMatch[4] === '30분' ? 30 : 0);
      let h2 = parseInt(rangeMatch[6]);
      let m2 = rangeMatch[7] ? parseInt(rangeMatch[7]) : (rangeMatch[8] === '반' || rangeMatch[8] === '30분' ? 30 : 0);
      startHour = normalizeHour(h1, rangeMatch[1]) + (m1 === 30 ? 0.5 : 0);
      endHour = normalizeHour(h2, rangeMatch[5] || rangeMatch[1]) + (m2 === 30 ? 0.5 : 0);
      timeFound = true;
    }
    // 6) Single time: "11시", "오후 2시에", "2시까지"
    else if (/(오전|오후)?\s*(\d{1,2})(?::(\d{2})|\s*시(?:\s*(30분|반))?)(?:\s*(?:에|까지|경|쯤|부터))?/.test(raw)) {
      const singleMatch = raw.match(/(오전|오후)?\s*(\d{1,2})(?::(\d{2})|\s*시(?:\s*(30분|반))?)(?:\s*(?:에|까지|경|쯤|부터))?/);
      let h = parseInt(singleMatch[2]);
      let m = singleMatch[3] ? parseInt(singleMatch[3]) : (singleMatch[4] === '반' || singleMatch[4] === '30분' ? 30 : 0);
      let sH = normalizeHour(h, singleMatch[1] || (h <= 6 && !raw.includes('오전') ? '오후' : null)) + (m === 30 ? 0.5 : 0);
      
      if (raw.includes('까지') && /보고|제출|마감|완료/i.test(raw)) {
        startHour = Math.max(sH - 1, 9.0);
        endHour = sH;
      } else {
        startHour = sH;
        endHour = sH + 1.0;
      }
      timeFound = true;
    }
    // 7) Special phrases
    else if (/오후\s*반차/i.test(raw)) {
      startHour = 14.0;
      endHour = 18.0;
      timeFound = true;
    } else if (/오전\s*반차/i.test(raw)) {
      startHour = 9.0;
      endHour = 14.0;
      timeFound = true;
    } else if (/야근|저녁|식대/i.test(raw)) {
      startHour = 18.0;
      endHour = 19.0;
      timeFound = true;
    }

    prevEndHour = endHour;

    // Assignee and Delegation Determination
    let memberId = myId;
    let isRequested = false;
    let approverId = null;
    let isAll = false;

    const isTeamWide = /팀\s*전체|전체\s*회식|전체\s*회의|전체\s*미팅|전체\s*워크숍|전원/i.test(raw);
    const isDelegatedToDaum = myId !== 'daum' && /정다음|정사원|정사인|다음/i.test(raw) && /한테|에게|맡기고|시키고|잡으라고|요청/i.test(raw);
    const isDelegatedToYoonhee = (myId !== 'sh' && myId !== 'yoonhee') && /정윤희|정부장/i.test(raw) && /한테|에게|맡기고|시키고|부탁|요청/i.test(raw) && !/정부장\s*브리핑|정부장이랑/i.test(raw);

    if (isTeamWide) {
      isAll = true;
      isRequested = true;
      memberId = myId;
      approverId = null;
    } else if (isDelegatedToDaum) {
      memberId = 'daum';
      isRequested = true;
      approverId = 'daum';
    } else if (isDelegatedToYoonhee) {
      memberId = 'sh';
      isRequested = true;
      approverId = 'sh';
    } else if (/반차|연차|휴가|병가/i.test(raw)) {
      memberId = myId;
      isRequested = true;
      if (/조상무|상무님|상무/i.test(raw)) {
        approverId = 'sangmoo';
      } else if (/정윤희|정부장|부장님|윤희/i.test(raw)) {
        approverId = 'sh';
      } else if (/정다음|다음/i.test(raw)) {
        approverId = 'daum';
      } else {
        approverId = 'sangmoo';
      }
    } else {
      // Normal personal task of the current user
      memberId = myId;
      isRequested = false;
      approverId = null;
    }

    // Extract Clean Title
    let title = raw
      .replace(/(?:\d{1,2}\s*월\s*)?\d{1,2}\s*일/g, '')
      .replace(/(?:오전|오후)?\s*\d{1,2}(?::\d{2}|\s*시(?:\s*(?:30분|반))?)(?:\s*(?:에|까지|경|쯤|부터))?/g, '')
      .replace(/정다음\s*(?:사원)?(?:한테|에게)?/g, '')
      .replace(/정윤희\s*(?:부장)?(?:한테|에게)?/g, '')
      .replace(/오늘|내일|아침부터|오전\s*내내|오후엔|오후에|끝나면|예정|있고|나갔다가|복귀|들어갈\s*거고|들어가기\s*전에|잡으라고\s*해|잡아놓으라고\s*해|보고받고|맡기고|파야할\s*듯|파야겠음/g, '')
      .replace(/[~,，]/g, '')
      .trim();

    // Map common phrase to clean standard titles
    if (/오후\s*반차/i.test(raw)) {
      title = '오후 반차';
    } else if (/오전\s*반차/i.test(raw)) {
      title = '오전 반차';
    } else if (/반차/i.test(raw)) {
      title = '오후 반차';
    } else if (/연차/i.test(raw)) {
      title = '연차';
    } else if (/휴가/i.test(raw)) {
      title = '휴가';
    } else if (/병가/i.test(raw)) {
      title = '병가';
    } else if (/인증\s*서버.*지연|서버.*지연.*이슈/i.test(raw)) {
      title = '인증 서버 지연 이슈';
    } else if (/로그\s*분석/i.test(raw)) {
      title = '로그 분석';
    } else if (/세션.*풀리|로그인.*디버깅|세션.*디버깅/i.test(raw)) {
      title = '로그인 세션 풀림 긴급 디버깅';
    } else if (/퍼블리싱.*리뷰|화면.*리뷰/i.test(raw)) {
      title = '화면 퍼블리싱 리뷰';
    } else if (/API\s*연동/i.test(raw)) {
      title = 'API 연동 마무리';
    } else if (/대신증권.*미팅/i.test(raw)) {
      title = '대신증권 본사 미팅';
    } else if (/사내\s*보안\s*감사.*보고/i.test(raw) || /보안\s*감사/i.test(raw)) {
      title = '사내 보안 감사 지적사항 조치 결과 보고';
    } else if (/정부장.*브리핑/i.test(raw)) {
      title = '정부장 브리핑';
    } else if (/부서장.*결산.*회의|결산.*회의/i.test(raw)) {
      title = '부서장 결산 회의';
    } else if (/야근자.*파악.*식대|식대.*신청/i.test(raw)) {
      title = '야근자 파악 및 저녁 식대 신청 일정';
    } else if (/긴급.*대책.*회의/i.test(raw)) {
      title = '긴급 대책 회의';
    } else if (/경영진.*보고서/i.test(raw)) {
      title = '경영진 보고서 작성';
    }

    if (!title) {
      title = `업무 일정 ${index + 1}`;
    }

    const isItemIssue = /긴급|이슈|장애|오류|버그|지연|디버깅/i.test(raw) && !/보고서|문서|자료/i.test(raw);

    results.push({
      title,
      year,
      month: targetMonth,
      date: targetDate,
      startHour,
      endHour,
      memberId,
      isRequested,
      approverId,
      isAll,
      isIssue: isItemIssue,
      description: ''
    });
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
  const descStr = typeof description === 'string' ? description : (description ? String(description) : '');
  let groupId = '';
  let detail = '';
  let memo = '';
  let progress = 0;
  let category = null;

  if (!descStr) return { groupId, detail, memo, progress, category };

  const groupMatch = descStr.match(/\[그룹 ID\]\s*(g_\w+)/);
  if (groupMatch) {
    groupId = groupMatch[1];
  }

  const catMatch = descStr.match(/\[구분:\s*([^\]]+)\]/);
  if (catMatch) {
    category = catMatch[1].trim();
  }

  const progressMatch = descStr.match(/\[진척률\]\s*(\d+)%/);
  if (progressMatch) {
    progress = parseInt(progressMatch[1]);
  }

  let remaining = descStr
    .replace(/\[YM:\d{4}\.\d{2}\]\s*\|?\s*/g, '')
    .replace(/\[그룹 ID\]\s*g_\w+\s*\|?\s*/g, '')
    .replace(/\[구분:\s*[^\ presentation\]]+\]\s*\|?\s*/g, '')
    .replace(/\[구분:\s*[^\presentation\]]+\]\s*\|?\s*/g, '')
    .replace(/\[구분:\s*[^\presentation\]]+?\]\s*\|?\s*/g, '')
    .replace(/\[구분:.*?\]\s*\|?\s*/g, '')
    .replace(/\[진척률\]\s*\d+%\s*\|?\s*/g, '')
    .replace(/\[반려\s*사유\].*?(\||$)/g, '')
    .replace(/\[반려사유\].*?(\||$)/g, '')
    .replace(/\[재요청\s*메시지\].*?(\||$)/g, '')
    .replace(/\[수락메시지\].*?(\||$)/g, '')
    .replace(/\[승인\s*완료\]\s*\|?\s*/g, '')
    .trim();

  remaining = remaining.replace(/^[\s|]+/, '').replace(/[\s|]+$/, '').trim();

  const detailMatch = remaining.match(/\[상세\]\s*(.*?)(?=\s*\|\s*\[메모\]|\s*\[메모\]|$)/s);
  const memoMatch = remaining.match(/\[메모\]\s*(.*)$/s);

  if (detailMatch) {
    detail = detailMatch[1].replace(/^[\s|]+/, '').replace(/[\s|]+$/, '').trim();
  }
  if (memoMatch) {
    memo = memoMatch[1].replace(/^[\s|]+/, '').replace(/[\s|]+$/, '').trim();
  }

  if (!detailMatch && !memoMatch && remaining) {
    detail = remaining.replace(/^\[상세\]\s*/, '').replace(/^[\s|]+/, '').replace(/[\s|]+$/, '').trim();
  }

  if (detail === '|' || detail === '없음' || /^\[.*?\]$/.test(detail)) {
    detail = '';
  }

  return { groupId, detail, memo, progress, category };
}

function formatScheduleDescription(groupId, detail, memo, year = null, month = null, progress = 0, category = '일반') {
  let parts = [];
  if (year && month) {
    parts.push(`[YM:${year}.${month < 10 ? '0' : ''}${month}]`);
  }
  if (groupId) {
    parts.push(`[그룹 ID] ${groupId}`);
  }
  if (category) {
    parts.push(`[구분: ${category}]`);
  }
  if (progress > 0) {
    parts.push(`[진척률] ${progress}%`);
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
  return s1.title === s2.title;
}

function normalizeRangeSchedules(rawSchedules) {
  if (!Array.isArray(rawSchedules) || rawSchedules.length === 0) return rawSchedules;
  
  const groups = {};
  rawSchedules.forEach(s => {
    const groupId = s.description && s.description.match(/\[그룹 ID\]\s*(g_\w+)/)?.[1];
    const key = groupId ? `group_${groupId}` : `title_${s.title}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  const result = [...rawSchedules];

  Object.values(groups).forEach(items => {
    if (items.length <= 1) return;
    
    items.sort((a, b) => {
      const ya = a.year || 2026, yb = b.year || 2026;
      if (ya !== yb) return ya - yb;
      const ma = a.month || 8, mb = b.month || 8;
      if (ma !== mb) return ma - mb;
      return a.date - b.date;
    });

    const first = items[0];
    const last = items[items.length - 1];

    const startDate = new Date((first.year || 2026), (first.month || 8) - 1, first.date);
    const endDate = new Date((last.year || 2026), (last.month || 8) - 1, last.date);

    const curr = new Date(startDate.getTime());
    curr.setDate(curr.getDate() + 1);

    while (curr < endDate) {
      const cYear = curr.getFullYear();
      const cMonth = curr.getMonth() + 1;
      const cDate = curr.getDate();

      const exists = items.some(it => (it.year || 2026) === cYear && (it.month || 8) === cMonth && it.date === cDate);
      if (!exists) {
        const fillItem = {
          ...first,
          id: `fill_${first.id}_${cYear}_${cMonth}_${cDate}`,
          year: cYear,
          month: cMonth,
          date: cDate
        };
        result.push(fillItem);
        items.push(fillItem);
      }
      curr.setDate(curr.getDate() + 1);
    }
  });

  return result;
}

// ─── Custom Dropdown Select Component ──────────────────────────────────────────
function CustomDropdown({ placeholder, value, options, onChange, width, isMulti }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      const timer = setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 0);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [isOpen]);

  // Compute selected items array if isMulti
  const selectedList = isMulti 
    ? (Array.isArray(value) ? value : (value ? [value] : []))
    : [];

  const handleSelectOption = (option, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (isMulti) {
      let updated;
      if (option === '해당없음') {
        updated = selectedList.includes('해당없음') ? [] : ['해당없음'];
      } else {
        const filtered = selectedList.filter(item => item !== '해당없음');
        if (filtered.includes(option)) {
          updated = filtered.filter(item => item !== option);
        } else {
          updated = [...filtered, option];
        }
      }
      onChange(updated);
    } else {
      onChange(option);
      setIsOpen(false);
    }
  };

  // Determine trigger display label
  let displayLabel = placeholder;
  if (isMulti) {
    if (selectedList.length === 1) {
      displayLabel = selectedList[0];
    } else if (selectedList.length > 1) {
      displayLabel = `${selectedList[0]} 외 ${selectedList.length - 1}개`;
    }
  } else {
    if (value) displayLabel = value;
  }

  const hasValue = isMulti ? selectedList.length > 0 : Boolean(value);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        position: 'relative', 
        flex: width ? 'none' : 1, 
        width: width || '100%', 
        zIndex: isOpen ? 1000 : 1 
      }}
    >
      {/* Trigger Box */}
      <div
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(prev => !prev);
        }}
        style={{
          width: '100%',
          height: '60px',
          backgroundColor: '#ffffff',
          border: isOpen ? '2px solid #000000' : '1.5px solid #e2e8f0',
          borderRadius: '16px',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
          boxSizing: 'border-box',
          transition: 'all 0.15s ease'
        }}
      >
        <span style={{ 
          fontSize: width === '120px' ? '14px' : '14.5px', 
          fontWeight: hasValue ? '700' : '600', 
          color: hasValue ? '#0f172a' : '#94a3b8',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {displayLabel}
        </span>
        <svg 
          width="16" 
          height="16" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="#64748b" 
          strokeWidth="2.5" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          style={{ 
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', 
            transition: 'transform 0.2s ease',
            flexShrink: 0,
            marginLeft: '6px'
          }}
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>

      {/* Floating Options Layer */}
      {isOpen && (
        <div 
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1.5px solid #e2e8f0',
            boxShadow: '0 16px 36px -6px rgba(15, 23, 42, 0.2), 0 4px 12px rgba(0, 0, 0, 0.05)',
            zIndex: 9999,
            padding: '6px',
            maxHeight: '230px',
            overflowY: 'auto'
          }}
        >
          {options.map((option) => {
            const isSelected = isMulti ? selectedList.includes(option) : value === option;
            return (
              <div
                key={option}
                onClick={(e) => handleSelectOption(option, e)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  backgroundColor: isSelected ? '#f1f5f9' : '#ffffff',
                  color: isSelected ? '#000000' : '#334155',
                  fontWeight: isSelected ? '800' : '600',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                  boxSizing: 'border-box',
                  transition: 'background-color 0.12s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = '#ffffff';
                }}
              >
                <span>{option}</span>
                {isSelected && (
                  <span style={{ fontWeight: '900', color: '#000000', fontSize: '15px' }}>✓</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ──── REUSABLE STYLED SELECT DROPDOWN COMPONENT ────
const StyledSelect = ({ value, onChange, options = [], disabled = false, width = '100%', minWidth = 'auto', style = {} }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const safeOptions = Array.isArray(options) ? options : [];
  const selectedOption = safeOptions.find(o => (typeof o === 'object' ? o?.value : o) === value) || safeOptions[0] || { value: '', label: '' };
  const selectedLabel = typeof selectedOption === 'object' ? (selectedOption?.label ?? selectedOption?.value ?? '') : String(selectedOption || '');

  return (
    <div 
      ref={dropdownRef} 
      style={{ 
        position: 'relative', 
        width: width, 
        minWidth: minWidth, 
        userSelect: 'none',
        ...style 
      }}
    >
      <div
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '9px 12px',
          backgroundColor: disabled ? '#f8fafc' : (isOpen ? '#f8fafc' : '#ffffff'),
          border: isOpen ? '1.5px solid #0f172a' : '1.5px solid #cbd5e1',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '600',
          color: disabled ? '#94a3b8' : '#0f172a',
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxSizing: 'border-box',
          boxShadow: isOpen ? '0 0 0 3px rgba(15, 23, 42, 0.08)' : '0 1px 2px rgba(15, 23, 42, 0.04)',
          transition: 'all 0.15s ease'
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedLabel}
        </span>
        <svg 
          width="13" 
          height="13" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke={isOpen ? '#0f172a' : '#64748b'} 
          strokeWidth="2.5" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          style={{
            marginLeft: '6px',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            flexShrink: 0
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            backgroundColor: '#ffffff',
            border: '1.5px solid #cbd5e1',
            borderRadius: '10px',
            padding: '4px',
            boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.15), 0 8px 10px -6px rgba(15, 23, 42, 0.08)',
            maxHeight: '220px',
            overflowY: 'auto',
            animation: 'fadeIn 0.12s ease-out'
          }}
        >
          {safeOptions.map((opt) => {
            const optVal = typeof opt === 'object' ? opt?.value : opt;
            const optLabel = typeof opt === 'object' ? opt?.label : opt;
            const isSelected = optVal === value;

            return (
              <div
                key={String(optVal)}
                onClick={() => {
                  onChange(optVal);
                  setIsOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  fontSize: '13.5px',
                  fontWeight: isSelected ? '700' : '500',
                  color: isSelected ? '#0f172a' : '#334155',
                  backgroundColor: isSelected ? '#f1f5f9' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background-color 0.12s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span>{optLabel}</span>
                {isSelected && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};


export default function App() {
  const slot = getTimeSlot();

  // Page Routing View State ('dashboard' | 'sync')
  const [currentView, setCurrentView] = useState(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const hash = window.location.hash;
      if (path === '/sync' || hash === '#/sync' || hash === '#sync') {
        return 'sync';
      }
    }
    return 'dashboard';
  });

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const hash = window.location.hash;
      if (path === '/sync' || hash === '#/sync' || hash === '#sync') {
        setCurrentView('sync');
      } else {
        setCurrentView('dashboard');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToView = (view) => {
    setCurrentView(view);
    if (typeof window !== 'undefined' && window.history) {
      const newPath = view === 'sync' ? '/sync' : '/dashboard';
      window.history.pushState({}, '', newPath);
    }
  };

  // Auth States
  const [user, setUser] = useState(null);
  const [authEmailId, setAuthEmailId] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authRole, setAuthRole] = useState('');
  const [authDepartment, setAuthDepartment] = useState('');
  const [authProject, setAuthProject] = useState([]);
  const [activeSelectLayer, setActiveSelectLayer] = useState(null); // 'department' | 'role' | 'project' | null
  const [isSignUp, setIsSignUp] = useState(false);
  const [signUpStep, setSignUpStep] = useState(1); // 1 | 2
  const [headerSelectedProject, setHeaderSelectedProject] = useState('전체');
  const [authLoading, setAuthLoading] = useState(isConfigured);
  const [authError, setAuthError] = useState('');

  const selectContainerRef = useRef(null);
  const userMenuRef = useRef(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Close user profile menu layer when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setIsUserMenuOpen(false);
      }
    };
    if (isUserMenuOpen) {
      const timer = setTimeout(() => {
        document.addEventListener('click', handleOutsideClick);
      }, 0);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('click', handleOutsideClick);
      };
    }
  }, [isUserMenuOpen]);

  const projectMenuRef = useRef(null);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);

  const [selectedReportProject, setSelectedReportProject] = useState('대신증권 연금 경쟁력 강화');
  const [isReportProjectMenuOpen, setIsReportProjectMenuOpen] = useState(false);
  const reportProjectMenuRef = useRef(null);

  // Close report project select dropdown layer when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (reportProjectMenuRef.current && !reportProjectMenuRef.current.contains(e.target)) {
        setIsReportProjectMenuOpen(false);
      }
    };
    if (isReportProjectMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }
  }, [isReportProjectMenuOpen]);

  // Close project select dropdown layer when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target)) {
        setIsProjectMenuOpen(false);
      }
    };
    if (isProjectMenuOpen) {
      const timer = setTimeout(() => {
        document.addEventListener('click', handleOutsideClick);
      }, 0);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('click', handleOutsideClick);
      };
    }
  }, [isProjectMenuOpen]);

  // Close custom dropdown layers when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectContainerRef.current && !selectContainerRef.current.contains(event.target)) {
        setActiveSelectLayer(null);
      }
    };
    if (activeSelectLayer) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeSelectLayer]);

  // Fallback virtual user state for non-configured environment
  const [virtualUser, setVirtualUser] = useState(() => {
    return TEAM[0] || { id: 'sh', name: '정윤희', role: '부장', avatar: '윤희', avatarPic: '/pic1_thumb.png', color: '#000000', subtext: '기획 일정' };
  });

  // Dynamic active team members list
  const [activeTeam, setActiveTeam] = useState(() => {
    return isConfigured ? [] : TEAM;
  });

  // Day view member row visibility selection state (default: all selected)
  const [daySelectedMemberIds, setDaySelectedMemberIds] = useState(() => TEAM.map(m => m.id));
  const timelineContainerRef = useRef(null);

  // Extract display name, role, department, and project from stored name
  const parseStoredName = (rawFullName) => {
    if (!rawFullName) return { name: '정윤희', role: '부장', department: '개발', project: '대신증권 연금 경쟁력 강화' };

    let str = rawFullName.trim();
    const isYoonhee = str.includes('정윤희');
    let department = '개발';
    let project = isYoonhee ? '대신증권 연금 경쟁력 강화' : '전체';

    // Remove trailing '사원' if string contains brackets or another role before it
    if (str.includes('[') && str.endsWith('사원')) {
      str = str.replace(/\s+사원$/, '').trim();
    }

    // Extract [부서 / 프로젝트] if present
    const bracketMatch = str.match(/\[(.*?)\]/);
    if (bracketMatch) {
      const inside = bracketMatch[1];
      if (inside.includes('/')) {
        const parts = inside.split('/');
        department = parts[0].trim() || '개발';
        project = parts[1].trim() || (isYoonhee ? '대신증권 연금 경쟁력 강화' : '전체');
      }
      str = str.replace(/\[.*?\]/, '').trim();
    }

    // Clean up any remaining trailing '사원' if there's already another role in str
    const validRolesExceptSawon = [
      '웹 기획자', '기획자', '디자이너', '개발자',
      '대리', '과장', '차장', '부장', '이사', '상무', '전무', '대표'
    ];
    let foundRole = '';
    for (const r of validRolesExceptSawon) {
      if (str.includes(r)) {
        foundRole = r;
        str = str.replace(r, '').trim();
        break;
      }
    }

    if (!foundRole) {
      if (str.endsWith('사원')) {
        foundRole = '사원';
        str = str.replace(/사원$/, '').trim();
      } else {
        foundRole = isYoonhee ? '부장' : '사원';
      }
    }

    let cleanName = str || (isYoonhee ? '정윤희' : '사용자');
    if (/^[가-힣]\s+[가-힣]{1,3}$/.test(cleanName)) {
      cleanName = cleanName.replace(/\s+/g, '');
    }

    return {
      name: cleanName,
      role: foundRole,
      department: department,
      project: project
    };
  };

  const parsedUser = user ? parseStoredName(user.name) : { name: '정윤희', role: '부장', department: '개발', project: '대신증권 연금 경쟁력 강화' };
  const isCurrentUserYoonhee = user && parsedUser.name === '정윤희';

  const [greetingEmoji] = useState(() => {
    const emojis = ['😊', '😄', '😃', '🥰', '🤩', '🤗', '☺️', '🙋‍♀️', '🙌', '✨'];
    return emojis[Math.floor(Math.random() * emojis.length)];
  });

  const ME = virtualUser || (isConfigured && user ? { id: 'sh', name: parsedUser.name, role: parsedUser.role, avatar: '나', avatarPic: '/pic1_thumb.png', color: '#000000' } : TEAM[0]);
  const displayUser = {
    name: ME.name || parsedUser.name,
    role: ME.role || parsedUser.role,
    department: parsedUser.department || '개발',
    project: parsedUser.project || '대신증권 연금 경쟁력 강화'
  };

  const isApproverForItem = (sched) => {
    if (!sched) return false;

    // 1) Vacation / leave request default to designated approver (never the applicant!)
    const isLeave = /\[?반차|연차|휴가|병가\]?/i.test(sched.title || '');
    if (isLeave) {
      const applicantId = sched.requesterId || sched.memberId;
      // If ME is the applicant, ME is NOT the approver!
      if (applicantId === ME.id || (ME.id === 'sh' && applicantId === 'yoonhee') || (ME.id === 'sangmoo' && applicantId === 'sangmu') || (ME.id === 'daum' && applicantId === 'daeum')) {
        return false;
      }
      const approver = getApproverMember(sched, ME.id);
      return approver.id === ME.id || (ME.id === 'sh' && approver.id === 'yoonhee') || (ME.id === 'sangmoo' && approver.id === 'sangmu') || (ME.id === 'daum' && approver.id === 'daeum');
    }

    // The requester themselves is never the approver of their own outgoing request
    const reqId = sched.requesterId || sched.memberId;
    const isMyOutgoingReq = reqId && (
      reqId === ME.id ||
      (ME.id === 'sh' && reqId === 'yoonhee') ||
      (ME.id === 'daum' && reqId === 'daeum') ||
      (ME.id === 'sangmoo' && reqId === 'sangmu')
    );
    if (isMyOutgoingReq && (!sched.approverId || sched.approverId !== ME.id)) return false;

    // 2) Explicit approverId match
    if (sched.approverId) {
      if (sched.approverId === ME.id ||
          (ME.id === 'sh' && sched.approverId === 'yoonhee') ||
          (ME.id === 'sangmoo' && sched.approverId === 'sangmu') ||
          (ME.id === 'daum' && sched.approverId === 'daeum')) {
        return true;
      }
    }

    // 3) Co-assigned / Collaborative Meeting or Task request (only if assigned to ME and not requested by ME)
    if (!isMyOutgoingReq) {
      if (sched.memberIds && sched.memberIds.length > 0) {
        if (sched.memberIds.includes(ME.id) ||
            (ME.id === 'sh' && sched.memberIds.includes('yoonhee')) ||
            (ME.id === 'sangmoo' && sched.memberIds.includes('sangmu')) ||
            (ME.id === 'daum' && sched.memberIds.includes('daeum'))) {
          return true;
        }
      }
      if (sched.memberId === ME.id ||
          (ME.id === 'sh' && sched.memberId === 'yoonhee') ||
          (ME.id === 'sangmoo' && sched.memberId === 'sangmu') ||
          (ME.id === 'daum' && sched.memberId === 'daeum')) {
        return true;
      }
    }

    return false;
  };

    const getRejecterMember = (sched) => {
    if (!sched) return { name: '조상무', role: '상무' };
    return getApproverMember(sched, ME.id);
  };

  const getCleanDesc = (desc) => {
    if (!desc) return '';
    let d = desc;
    d = d.replace(/\[YM:.*?\]\s*\|?/g, '');
    d = d.replace(/\[그룹 ID\]\s*g_[\w_]+\s*\|?/g, '');
    d = d.replace(/\[구분:.*?\]\s*\|?/g, '');
    d = d.replace(/\[진척률\]\s*\d+%\s*\|?/g, '');
    d = d.replace(/\[반려\s*사유\].*?(\||\n|$)/g, '');
    d = d.replace(/\[반려사유\].*?(\||\n|$)/g, '');
    d = d.replace(/\[재요청\s*메시지\].*?(\||\n|$)/g, '');
    d = d.replace(/\[수락메시지\].*?(\||\n|$)/g, '');
    d = d.replace(/\[승인\s*완료\]\s*\|?/g, '');
    d = d.replace(/\[상세\]\s*/g, '');
    d = d.replace(/\[메모\].*?(\||\n|$)/g, '');
    d = d.replace(/^[\s|•*-]+/, '').replace(/[\s|•*-]+$/, '').trim();
    return (d === '없음' || d === '|' || !d) ? '' : d;
  };

  const groupList = (list) => {
    const groups = [];
    const processedGroupIds = new Set();

    (list || []).forEach(item => {
      const groupMatch = (item.description || '').match(/\[그룹 ID\]\s*(g_[\w_]+)/);
      const groupId = item.groupId || (groupMatch ? groupMatch[1] : null);

      if (groupId) {
        if (processedGroupIds.has(groupId)) return;
        processedGroupIds.add(groupId);

        const groupItems = list.filter(s => {
          const gMatch = (s.description || '').match(/\[그룹 ID\]\s*(g_[\w_]+)/);
          return s.groupId === groupId || (gMatch && gMatch[1] === groupId);
        });

        groupItems.sort((a, b) => new Date(a.year, a.month - 1, a.date) - new Date(b.year, b.month - 1, b.date));
        const first = groupItems[0];
        const last = groupItems[groupItems.length - 1];

        const startMonthStr = first.month < 10 ? `0${first.month}` : `${first.month}`;
        const startDateStr = first.date < 10 ? `0${first.date}` : `${first.date}`;
        const endMonthStr = last.month < 10 ? `0${last.month}` : `${last.month}`;
        const endDateStr = last.date < 10 ? `0${last.date}` : `${last.date}`;

        const dateStr = groupItems.length > 1
          ? `${first.year}.${startMonthStr}.${startDateStr} ~ ${last.year}.${endMonthStr}.${endDateStr}`
          : `${first.year}.${startMonthStr}.${startDateStr}`;

        groups.push({ ...first, dateStr, isGroup: true, count: groupItems.length });
      } else {
        const monthStr = item.month < 10 ? `0${item.month}` : `${item.month}`;
        const dateNumStr = item.date < 10 ? `0${item.date}` : `${item.date}`;
        const dateStr = `${item.year}.${monthStr}.${dateNumStr}`;
        groups.push({ ...item, dateStr, isGroup: false });
      }
    });

    return groups;
  };
  const initMsg = { id: 0, from: 'ai', text: getGreetingMsg(ME.name, getTimeSlot()), time: formatTime(new Date()), createdAt: new Date().toISOString() };

  // UI States
  const getInitialMessagesForUser = (userObj) => {
    const u = userObj || { id: 'sh', name: '정윤희' };
    const defaultMsg = { id: 0, from: `ai_${u.id}`, text: getGreetingMsg(u.name, getTimeSlot()), time: formatTime(new Date()), createdAt: new Date().toISOString() };
    const savedMsg = localStorage.getItem(`zal_messages_${u.id}`);
    const resetTsStr = localStorage.getItem('zal_reset_timestamp');
    const resetTs = resetTsStr ? parseInt(resetTsStr, 10) : 0;

    if (savedMsg) {
      try {
        const parsed = JSON.parse(savedMsg);
        const filtered = parsed.filter(msg => {
          if (!msg || msg.id === 0) return false;
          if (resetTs) {
            let createdTime = 0;
            if (msg.createdAt) createdTime = new Date(msg.createdAt).getTime();
            if (!createdTime || isNaN(createdTime) || createdTime <= resetTs) return false;
          }
          return !(msg.from && msg.from.startsWith('ai') && msg.text && (
            msg.text.includes('안녕하세요') ||
            msg.text.includes('좋은 아침') ||
            msg.text.includes('점심은') ||
            msg.text.includes('수고하셨') ||
            msg.text.includes('수고 많으셨')
          ));
        });
        return [defaultMsg, ...filtered];
      } catch (e) {
        return [defaultMsg];
      }
    }
    return [defaultMsg];
  };

  const [messages, setMessages] = useState(() => getInitialMessagesForUser(ME));

  useEffect(() => {
    setMessages(getInitialMessagesForUser(ME));
    setSelectedReportMembers([ME.id]);
  }, [ME.id, ME.name]);
  const [input, setInput] = useState('');
  const chatMessagesRef = useRef(null);
  const [showUnprocessedChip, setShowUnprocessedChip] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [showPreviousMessages, setShowPreviousMessages] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const [selectedReportMembers, setSelectedReportMembers] = useState([ME.id]);
  const [showReportTooltip, setShowReportTooltip] = useState(true);
  const [isEditingReport, setIsEditingReport] = useState(false);
  const [dashboardResetKey, setDashboardResetKey] = useState(0);
  const [feeds, setFeeds] = useState(() => {
    try {
      localStorage.removeItem('zal_feeds');
      const saved = localStorage.getItem('zal_feeds_v2');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });


  const openReportModal = () => {
    setIsEditingReport(false);
    setSelectedReportMembers([ME.id]);
    setIsReportModalOpen(true);
  };

  const closeReportModal = () => {
    setIsEditingReport(false);
    setIsReportModalOpen(false);
  };

  // Custom Layer Dialog State (Replaces native browser alert & confirm)
  const [layerDialog, setLayerDialog] = useState({
    isOpen: false,
    title: '안내',
    message: '',
    type: 'info', // info | success | error | confirm | prompt
    isConfirm: false,
    hasInput: false,
    inputPlaceholder: '',
    inputValue: '',
    confirmText: '확인',
    cancelText: '취소',
    onConfirm: null,
    onCancel: null
  });

  const showLayerAlert = (message, title = '안내', type = 'info', onConfirm = null) => {
    setLayerDialog({
      isOpen: true,
      title,
      message,
      type,
      isConfirm: false,
      hasInput: false,
      inputPlaceholder: '',
      inputValue: '',
      confirmText: '확인',
      cancelText: '취소',
      onConfirm,
      onCancel: null
    });
  };

  const showLayerConfirm = (message, title = '확인', onConfirm = null, onCancel = null) => {
    setLayerDialog({
      isOpen: true,
      title,
      message,
      type: 'confirm',
      isConfirm: true,
      hasInput: false,
      inputPlaceholder: '',
      inputValue: '',
      confirmText: '확인',
      cancelText: '취소',
      onConfirm,
      onCancel
    });
  };

  const showLayerPrompt = (message, title = '입력', placeholder = '내용을 입력하세요...', confirmText = '확인', onConfirm = null, onCancel = null) => {
    setLayerDialog({
      isOpen: true,
      title,
      message,
      type: 'prompt',
      isConfirm: true,
      hasInput: true,
      inputPlaceholder: placeholder,
      inputValue: '',
      confirmText,
      cancelText: '취소',
      onConfirm,
      onCancel
    });
  };

  const closeLayerDialog = (confirmed = false) => {
    // Capture callbacks BEFORE clearing state, then call AFTER closing
    const onConfirmFn = layerDialog.onConfirm;
    const onCancelFn = layerDialog.onCancel;
    const inputVal = layerDialog.inputValue;
    setLayerDialog(prev => ({ ...prev, isOpen: false, inputValue: '', hasInput: false, onConfirm: null, onCancel: null }));
    if (confirmed && onConfirmFn) onConfirmFn(inputVal);
    if (!confirmed && onCancelFn) onCancelFn();
  };
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [reportScheduleEdits, setReportScheduleEdits] = useState({});
  const [monthlySummaryEdits, setMonthlySummaryEdits] = useState({});

  const [dailyNextPlanText, setDailyNextPlanText] = useState('');
  const [dailyIssueText, setDailyIssueText] = useState('');

  const [weeklyNextPlanText, setWeeklyNextPlanText] = useState('');
  const [weeklyRiskText, setWeeklyRiskText] = useState('');

  const handleGlobalResetDemo = async () => {
    const nowTs = Date.now().toString();
    localStorage.setItem('zal_reset_timestamp', nowTs);
    localStorage.setItem('zal_schedules', JSON.stringify([]));
    localStorage.setItem('zal_feeds_v2', JSON.stringify([]));
    
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('zal_messages') || key.startsWith('zal_feeds') || key.startsWith('zal_schedules') || key.startsWith('zal_daily_issue')) {
        localStorage.removeItem(key);
      }
    });

    setSchedules([]);
    setFeeds([]);
    setShowPreviousMessages(false);
    setMessages([{ id: 0, from: 'ai', text: getGreetingMsg(ME.name, getTimeSlot()), time: formatTime(new Date()), createdAt: new Date().toISOString() }]);
    setDailyIssueText('특이사항 없음 (또는 이슈 내용 입력)');
    setDashboardResetKey(k => k + 1);

    if (isConfigured) {
      try {
        await appwriteService.setGlobalResetMarker();
        await appwriteService.clearSchedules();
        await appwriteService.clearMessages();
      } catch (err) {
        console.error("Remote clear error:", err);
      }
    }
    showLayerAlert('모든 대화, 일정 및 대시보드 데이터가 성공적으로 초기화되었습니다.', '초기화 완료', 'success');
  };

  const [monthlyGoodText, setMonthlyGoodText] = useState('Good: 주요 프로모션 전환율 개선 및 기획/QA 목표 달성');
  const [monthlyBadText, setMonthlyBadText] = useState('Bad: 3주차 서버 응답 지연 발생 → 모니터링 체계 보완 완료');
  const [monthlyNextTasksText, setMonthlyNextTasksText] = useState('대시보드 2.0 고도화 및 고객 유지율(Retention) 개선 캠페인 실행');

  const LoadingSpinner = ({ size = 16, color = 'currentColor' }) => (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      style={{ 
        animation: 'spin 0.8s linear infinite', 
        display: 'inline-block',
        verticalAlign: 'middle'
      }}
    >
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" opacity="0.3" />
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="24" />
    </svg>
  );

  const handleMonthlySummaryChange = (weekIdx, field, value) => {
    setMonthlySummaryEdits(prev => ({
      ...prev,
      [weekIdx]: {
        ...(prev[weekIdx] || {}),
        [field]: value
      }
    }));
  };

  const rebuildDescription = (originalDesc, newCleanText) => {
    if (!originalDesc) return newCleanText;
    const ymMatch = originalDesc.match(/\[YM:\d{4}\.\d{2}\]/);
    const groupMatch = originalDesc.match(/\[그룹 ID\]\s*g_\w+/);
    const progMatch = originalDesc.match(/\[진척률\]\s*\d+%/);

    const tags = [];
    if (ymMatch) tags.push(ymMatch[0]);
    if (groupMatch) tags.push(groupMatch[0]);
    if (progMatch) tags.push(progMatch[0]);

    if (tags.length === 0) return newCleanText;
    return `${tags.join(' | ')} | [상세] ${newCleanText}`;
  };

  const handleReportScheduleChange = (id, field, value) => {
    setReportScheduleEdits(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value
      }
    }));
  };

  const handleSaveReportEdits = async () => {
    setIsSavingReport(true);
    try {
      await new Promise(r => setTimeout(r, 450));
      const editEntries = Object.entries(reportScheduleEdits);
      if (editEntries.length > 0) {
        for (const [id, changes] of editEntries) {
          if (isConfigured) {
            try {
              await appwriteService.updateSchedule(id, changes);
            } catch (err) {
              console.error('Appwrite schedule update error:', err);
            }
          }
          setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s));
        }
      }
      setReportScheduleEdits({});
      setIsEditingReport(false);
    } finally {
      setIsSavingReport(false);
    }
  };

  const getDailyNextPlanDefault = () => {
    if (dailyNextPlanText.trim()) return dailyNextPlanText.trim();
    const tomDate = selectedDate + 1;
    const tomScheds = schedules.filter(s => isScheduleInMonth(s, currentYear, currentMonth) && s.date === tomDate);
    if (tomScheds.length > 0) {
      return tomScheds.map(s => {
        const parsed = parseScheduleDescription(s.description || '');
        const desc = (parsed.detail || s.description || '').replace(/\[YM:\d{4}\.\d{2}\]/g, '').replace(/\[그룹 ID\]\s*g_\w+\s*\|?\s*/gi, '').trim();
        return `[${s.title}] ${desc || '익일 업무 수행 및 검수'}`;
      }).join('\n');
    }
    return '[업무] 익일 지정 업무 수행 및 배포 요청';
  };

  const getDailyIssueDefault = () => {
    if (dailyIssueText.trim()) return dailyIssueText.trim();
    const todayScheds = schedules.filter(s => isScheduleInMonth(s, currentYear, currentMonth) && s.date === selectedDate);
    const issueLines = [];
    todayScheds.forEach(s => {
      const desc = s.description || '';
      if (/이슈|지연|서버|QA|확인|블로커|오류|버그|대응/.test(s.title + ' ' + desc)) {
        const clean = desc.replace(/\[YM:\d{4}\.\d{2}\]/g, '').replace(/\[그룹 ID\]\s*g_\w+\s*\|?\s*/gi, '').trim();
        issueLines.push(`${s.title}: ${clean || '상세 확인 및 조치 진행 중'}`);
      }
    });
    if (issueLines.length > 0) return issueLines.join('\n');
    return 'QA 서버 간헐적 접속 지연 (인프라팀 확인 요청 예정)';
  };

  const getWeeklyNextPlanDefault = () => {
    if (weeklyNextPlanText.trim()) return weeklyNextPlanText.trim();
    const { sunday } = getWeekRangeStr(currentYear, currentMonth, selectedDate);
    const nextWeekStart = new Date(sunday);
    nextWeekStart.setDate(nextWeekStart.getDate() + 1);
    nextWeekStart.setHours(0, 0, 0, 0);

    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekEnd.getDate() + 6);
    nextWeekEnd.setHours(23, 59, 59, 999);

    const nextWeekScheds = schedules.filter(s => {
      const sDate = new Date(s.year || currentYear, (s.month || currentMonth) - 1, s.date);
      sDate.setHours(12, 0, 0, 0);
      return sDate >= nextWeekStart && sDate <= nextWeekEnd;
    });

    if (nextWeekScheds.length > 0) {
      return nextWeekScheds.map(s => {
        const mName = activeTeam.find(m => m.id === s.memberId)?.name || ME.name;
        return `${s.title} 진행 및 연동 테스트 완료 (담당: ${mName})`;
      }).join('\n');
    }
    return `결제 모듈 연동 테스트 완료 (담당: ${ME.name})`;
  };

  const getWeeklyRiskDefault = () => {
    if (weeklyRiskText.trim()) return weeklyRiskText.trim();
    const { monday, sunday } = getWeekRangeStr(currentYear, currentMonth, selectedDate);
    const thisWeekScheds = schedules.filter(s => {
      const sDate = new Date(s.year || currentYear, (s.month || currentMonth) - 1, s.date);
      sDate.setHours(12, 0, 0, 0);
      return sDate >= monday && sDate <= sunday;
    });

    const riskLines = [];
    thisWeekScheds.forEach(s => {
      const desc = s.description || '';
      if (/이슈|지연|서버|QA|API|인증|기술지원|위험|지체/.test(s.title + ' ' + desc)) {
        riskLines.push(`${s.title} 관련 이슈 발생 → 담당팀 기술지원 요청 후 해결 예정`);
      }
    });
    if (riskLines.length > 0) return Array.from(new Set(riskLines)).join('\n');
    return '결제 API 인증 지연 발생 → PG사 기술지원 요청 후 14일까지 해결 예정';
  };

  const handleCopyReportText = () => {
    let text = '';
    if (timeViewTab === 'daily') {
      const dateStr = `${currentYear}.${currentMonth < 10 ? '0' : ''}${currentMonth}.${selectedDate < 10 ? '0' : ''}${selectedDate}`;
      const isScheduleForCurrentUser = (s) => {
        if (!s || !ME) return false;
        const uid = ME.id;
        const matchesUid = id => id === uid || (uid === 'sh' && id === 'yoonhee') || (uid === 'yoonhee' && id === 'sh') || (uid === 'sangmoo' && id === 'sangmu') || (uid === 'sangmu' && id === 'sangmoo');
        if (matchesUid(s.memberId)) return true;
        if (s.memberIds && Array.isArray(s.memberIds) && s.memberIds.some(matchesUid)) return true;
        if (s.requesterId && matchesUid(s.requesterId)) return true;
        return false;
      };
      const filtered = schedules.filter(s => isScheduleForCurrentUser(s) && isScheduleInMonth(s, currentYear, currentMonth) && s.date === selectedDate);
      
      const doneList = filtered.length > 0
        ? filtered.map(s => {
            const parsed = parseScheduleDescription(s.description || '');
            const cleanD = (parsed.detail || (s.description || ''))
              .replace(/\[YM:\d{4}\.\d{2}\]/g, '')
              .replace(/\[그룹 ID\]\s*g_\w+\s*\|?\s*/gi, '')
              .replace(/\[진척률\]\s*\d+%\s*\|?\s*/gi, '')
              .replace(/\[상세\]\s*/gi, '')
              .replace(/\[메모\]\s*/gi, '')
              .replace(/^[\s|]+/, '').replace(/[\s|]+$/, '').trim();
            const prog = s.progress !== undefined ? s.progress : (parsed.progress || 0);
            return `[${s.title}] ${cleanD || s.title} (진척률 ${prog}%)`;
          }).join('\n')
        : '[업무] 금일 등록된 실적 완료';

      const nextPlan = getDailyNextPlanDefault();
      const issueStr = getDailyIssueDefault();

      text = `[일일 업무보고] ${dateStr} (작성자: ${ME.name})\n\n1. 금일 업무 실적 (Done)\n\n${doneList}\n\n2. 익일 업무 계획 (To-Do)\n\n${nextPlan}\n\n3. 이슈 및 특이사항 (Issue/Blocker)\n\n${issueStr}`;

    } else if (timeViewTab === 'weekly') {
      const { monday, sunday } = getWeekRangeStr(currentYear, currentMonth, selectedDate);
      const filtered = schedules.filter(s => {
        const sMonth = s.month || currentMonth;
        const sYear = s.year || currentYear;
        const sDate = new Date(sYear, sMonth - 1, s.date);
        sDate.setHours(12, 0, 0, 0);
        return sDate >= monday && sDate <= sunday;
      });

      const weekNum = Math.ceil(selectedDate / 7);
      const doneList = filtered.length > 0
        ? filtered.map((s, i) => {
            const parsed = parseScheduleDescription(s.description || '');
            const prog = s.progress !== undefined ? s.progress : (parsed.progress || 0);
            const statusTag = prog >= 100 ? '[완료]' : `[진행 중, ${prog}%]`;
            return `목표 ${i + 1}: ${s.title} → ${statusTag} (일정 대비 정상)`;
          }).join('\n')
        : '목표 1: 주간 주요 목표 수행 → [완료] (일정 대비 정상)';

      const nextPlan = getWeeklyNextPlanDefault();
      const riskStr = getWeeklyRiskDefault();

      text = `[주간 업무보고] ${currentYear}년 ${currentMonth}월 ${weekNum}주차 (작성자: ${ME.name})\n\n1. 금주 주요 실적\n\n${doneList}\n\n2. 차주 계획 및 마일스톤\n\n${nextPlan}\n\n3. 이슈 및 건의사항 (Risk & Action Plan)\n\n${riskStr}`;

    } else if (timeViewTab === 'monthly') {
      const filtered = schedules.filter(s => isScheduleInMonth(s, currentYear, currentMonth));
      const summaryItems = `주요 업무 총 ${filtered.length}건 목표 정상 달성\n핵심 추진 프로젝트 일정 대비 정상 완료 (달성률 100%)`;

      const goodStr = monthlyGoodText.trim() || 'Good: 프로모션 전환율 개선 (3.2% → 4.5%)';
      const badStr = monthlyBadText.trim() || 'Bad: 3주차 서버 다운으로 인한 이탈 발생 → 모니터링 체계 보완 완료';
      const nextMonthStr = monthlyNextTasksText.trim() || '대시보드 2.0 고도화 및 고객 유지율(Retention) 개선 캠페인 실행';

      text = `[월간 업무보고] ${currentYear}년 ${currentMonth}월 (부서/작성자: ${ME.name})\n\n1. 월간 핵심 성과 (Executive Summary)\n\n${summaryItems}\n\n2. 목표 대비 실적 분석 (성과 및 미흡점)\n\n${goodStr}\n${badStr}\n\n3. 익월 중점 추진 과제\n\n${nextMonthStr}`;

    } else {
      text = `[${currentMonth}월 업무 목록]\n\n` + schedules.map(s => `• ${s.dateRangeStr || s.date + '일'} | ${s.title} (${s.progress || 0}%)`).join('\n');
    }

    navigator.clipboard.writeText(text).then(() => {
      showLayerAlert(
        '표준 업무 보고서 템플릿이 클립보드에 복사되었습니다!\n원하시는 곳(슬랙, 메일, 톡 등)에 바로 붙여넣어 사용하세요.',
        '클립보드 복사 완료',
        'success'
      );
    }).catch(err => {
      console.error('Clipboard copy failed:', err);
    });
  };

  // Scheduler States
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth() + 1); // 1-indexed (1-12)
  const [selectedDate, setSelectedDate] = useState(() => new Date().getDate());
  const [searchQuery, setSearchQuery] = useState('');
  const [includeSubOrg, setIncludeSubOrg] = useState(true);
  const [activeLeftTab, setActiveLeftTab] = useState('schedule'); // schedule | facility
  const [showWeekend, setShowWeekend] = useState(false); // Weekend on/off (default: off)

  useEffect(() => {
    localStorage.setItem('zal_selected_date', selectedDate.toString());
  }, [selectedDate]);
  
  const [dashboardTab, setDashboardTab] = useState('members'); // members | personal
  const [timeViewTab, setTimeViewTab] = useState('daily'); // daily | weekly

  useEffect(() => {
    if (timeViewTab === 'list' && selectedDate) {
      const el = document.getElementById(`list-day-${selectedDate}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [selectedDate, timeViewTab, currentMonth, currentYear]);

  // Auto-scroll timeline container to selected date in WEEK view
  useEffect(() => {
    if (timeViewTab === 'weekly' && timelineContainerRef.current) {
      const timer = setTimeout(() => {
        const targetTh = document.getElementById(`week_th_${selectedDate}`);
        if (targetTh && timelineContainerRef.current) {
          const container = timelineContainerRef.current;
          const targetLeft = targetTh.offsetLeft - 80;
          container.scrollTo({
            left: Math.max(0, targetLeft),
            behavior: 'smooth'
          });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [selectedDate, timeViewTab]);

  const getWeekRangeStr = (year, month, date) => {
    const current = new Date(year, month - 1, date);
    const dayOfWeek = current.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const distToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(year, month - 1, date + distToMon);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const fmt = (d) => `${d.getFullYear()}.${d.getMonth() + 1 < 10 ? '0' : ''}${d.getMonth() + 1}.${d.getDate() < 10 ? '0' : ''}${d.getDate()}`;
    return {
      monday,
      sunday,
      str: `${fmt(monday)} ~ ${fmt(sunday)}`
    };
  };

  const handlePrevReportDate = () => {
    if (timeViewTab === 'daily') {
      const dt = new Date(currentYear, currentMonth - 1, selectedDate - 1);
      setCurrentYear(dt.getFullYear());
      setCurrentMonth(dt.getMonth() + 1);
      setSelectedDate(dt.getDate());
    } else if (timeViewTab === 'weekly') {
      const dt = new Date(currentYear, currentMonth - 1, selectedDate - 7);
      setCurrentYear(dt.getFullYear());
      setCurrentMonth(dt.getMonth() + 1);
      setSelectedDate(dt.getDate());
    } else {
      if (currentMonth === 1) {
        setCurrentYear(prev => prev - 1);
        setCurrentMonth(12);
      } else {
        setCurrentMonth(prev => prev - 1);
      }
    }
  };

  const handleNextReportDate = () => {
    if (timeViewTab === 'daily') {
      const dt = new Date(currentYear, currentMonth - 1, selectedDate + 1);
      setCurrentYear(dt.getFullYear());
      setCurrentMonth(dt.getMonth() + 1);
      setSelectedDate(dt.getDate());
    } else if (timeViewTab === 'weekly') {
      const dt = new Date(currentYear, currentMonth - 1, selectedDate + 7);
      setCurrentYear(dt.getFullYear());
      setCurrentMonth(dt.getMonth() + 1);
      setSelectedDate(dt.getDate());
    } else {
      if (currentMonth === 12) {
        setCurrentYear(prev => prev + 1);
        setCurrentMonth(1);
      } else {
        setCurrentMonth(prev => prev + 1);
      }
    }
  };

  // Schedule Data
  const [schedules, setSchedules] = useState(() => {
    const savedSched = localStorage.getItem('zal_schedules');
    const list = savedSched ? JSON.parse(savedSched) : INITIAL_SCHEDULES;
    return (list || []).map(s => {
      if (s.title && s.title.includes('정부장 브리핑')) {
        if (s.memberIds && (s.memberIds.includes('sh') || s.memberIds.includes('yoonhee')) && (s.memberIds.includes('sangmoo') || s.memberId === 'sangmoo' || s.requesterId === 'sangmoo')) {
          s.requesterId = 'sangmoo';
        }
      }
      const isLeave = /반차|연차|휴가|병가/i.test(s.title || '') || s.category === '휴가';
      const isExplicitRequest = s.isRequested || s.status === 'requested' || (s.approverId && s.approverId !== s.requesterId);
      // Auto-restore normal work items (like API 연동 마무리, 화면 퍼블리싱 리뷰, 디버깅 등) that got erroneously marked as rejected
      if (!isLeave && !isExplicitRequest && s.status && (s.status === 'rejected' || s.status.startsWith('rejected_'))) {
        return {
          ...s,
          status: 'accepted'
        };
      }
      return s;
    });
  });

  const checkCardsVisibility = () => {
    if (!chatMessagesRef.current) return;
    const container = chatMessagesRef.current;
    const containerRect = container.getBoundingClientRect();

    // 화면 내에 처리 대기 중인 요청 카드들 찾기
    const cards = container.querySelectorAll('[id^="card_"]');
    if (cards.length === 0) {
      setShowUnprocessedChip(false);
      return;
    }

    let anyVisible = false;
    cards.forEach(card => {
      const cardRect = card.getBoundingClientRect();
      const isVisible = cardRect.top < containerRect.bottom - 10 && cardRect.bottom > containerRect.top + 10;
      if (isVisible) {
        anyVisible = true;
      }
    });

    // 요청 카드가 하나라도 화면에 보이면 캐릭터 숨김 (false)
    // 스크롤 때문에 모든 요청 카드가 화면 밖으로 벗어난 경우에만 캐릭터 노출 (true)
    setShowUnprocessedChip(!anyVisible);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      checkCardsVisibility();
    }, 150);
    return () => clearTimeout(timer);
  }, [schedules, messages, isDrawerOpen]);

  useEffect(() => {
    const handleResize = () => checkCardsVisibility();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Event modal dialog
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMember, setModalMember] = useState(null);
  const [addTitle, setAddTitle] = useState('');
  const [addCategory, setAddCategory] = useState('일반');
  const [addMemberIds, setAddMemberIds] = useState([]);
  const [addStartHour, setAddStartHour] = useState(9);
  const [addEndHour, setAddEndHour] = useState(11);
  const [addStartDateStr, setAddStartDateStr] = useState('');
  const [addEndDateStr, setAddEndDateStr] = useState('');
  const [addDetail, setAddDetail] = useState('');
  const [addMemo, setAddMemo] = useState('');
  const [addProgress, setAddProgress] = useState(0);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedDetailEvent, setSelectedDetailEvent] = useState(null);
  const [dashboardFeedId, setDashboardFeedId] = useState(null); // feedId from dashboard card that opened this modal

  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('업무');
  const [editMemberIds, setEditMemberIds] = useState([]);
  const [editStartHour, setEditStartHour] = useState(9);
  const [editEndHour, setEditEndHour] = useState(11);
  const [editDescription, setEditDescription] = useState('');
  const [editDetail, setEditDetail] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [editProgress, setEditProgress] = useState(0);
  const [editStartDateStr, setEditStartDateStr] = useState('');
  const [editEndDateStr, setEditEndDateStr] = useState('');

  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReasonInput, setRejectReasonInput] = useState('');

  const [isReRequesting, setIsReRequesting] = useState(false);
  const [reRequestMsgInput, setReRequestMsgInput] = useState('');

  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [showDetailInput, setShowDetailInput] = useState(false);
  const [showMemoInput, setShowMemoInput] = useState(false);

  const isDetailEditable = selectedDetailEvent
    ? (
        selectedDetailEvent.requesterId === ME.id ||
        (ME.id === 'sh' && selectedDetailEvent.requesterId === 'yoonhee') ||
        (ME.id === 'yoonhee' && selectedDetailEvent.requesterId === 'sh') ||
        (ME.id === 'sangmoo' && (selectedDetailEvent.requesterId === 'sangmu' || selectedDetailEvent.requesterId === 'sangmoo')) ||
        (selectedDetailEvent.memberIds ? selectedDetailEvent.memberIds.includes(ME.id) : selectedDetailEvent.memberId === ME.id) ||
        (ME.id === 'sh' && (selectedDetailEvent.memberIds ? selectedDetailEvent.memberIds.includes('yoonhee') : selectedDetailEvent.memberId === 'yoonhee')) ||
        (ME.id === 'sangmoo' && (selectedDetailEvent.memberIds ? selectedDetailEvent.memberIds.includes('sangmu') : selectedDetailEvent.memberId === 'sangmu'))
      )
    : false;

  const getScheduleHistoryList = (schedule) => {
    if (!schedule) return [];
    const list = Array.isArray(schedule.history) ? [...schedule.history] : [];

    // If list is empty, reconstruct from schedule metadata and description
    if (list.length === 0) {
      const isLeave = /반차|연차|휴가|병가/i.test(schedule.title || '') || schedule.category === '휴가';
      const reqId = schedule.requesterId || schedule.memberId || 'daum';
      const requester = TEAM.find(m => m.id === reqId || (reqId === 'yoonhee' && m.id === 'sh') || (reqId === 'sangmu' && m.id === 'sangmoo') || (reqId === 'daeum' && m.id === 'daum')) || { name: '정다음', role: '사원', id: 'daum' };
      const appId = schedule.approverId || (isLeave ? 'sangmoo' : 'sh');
      const approver = TEAM.find(m => m.id === appId || (appId === 'yoonhee' && m.id === 'sh') || (appId === 'sangmu' && m.id === 'sangmoo') || (appId === 'daeum' && m.id === 'daum')) || (isLeave ? { name: '조상무', role: '상무', id: 'sangmoo' } : { name: '정윤희', role: '부장', id: 'sh' });

      // 1. Initial request entry
      list.push({
        id: `hist_init_${schedule.id}`,
        action: 'request',
        actionLabel: '결재 요청',
        actorId: requester.id,
        actorName: requester.name,
        actorRole: requester.role,
        message: `${isLeave ? '휴가/반차' : '업무'} 결재를 요청했습니다.`,
        timestamp: schedule.createdAt || new Date().toISOString()
      });

      // 2. Parse description for [반려사유], [재요청메시지], [수락메시지]
      const desc = schedule.description || '';
      const rejectMatch = desc.match(/\[반려사유\]\s*([^|\n]+)/);
      const resubmitMatch = desc.match(/\[재요청메시지\]\s*([^|\n]+)/);
      const acceptMatch = desc.match(/\[수락메시지\]\s*([^|\n]+)/);

      if (rejectMatch) {
        list.push({
          id: `hist_rej_${schedule.id}`,
          action: 'reject',
          actionLabel: '결재 반려',
          actorId: approver.id,
          actorName: approver.name,
          actorRole: approver.role,
          message: rejectMatch[1].trim(),
          timestamp: schedule.updatedAt || new Date().toISOString()
        });
      }

      if (resubmitMatch) {
        list.push({
          id: `hist_resub_${schedule.id}`,
          action: 'resubmit',
          actionLabel: '재요청',
          actorId: requester.id,
          actorName: requester.name,
          actorRole: requester.role,
          message: resubmitMatch[1].trim(),
          timestamp: schedule.updatedAt || new Date().toISOString()
        });
      }

      if (schedule.status === 'accepted') {
        list.push({
          id: `hist_appr_${schedule.id}`,
          action: 'approve',
          actionLabel: isLeave ? '결재 승인' : '일정 수락',
          actorId: approver.id,
          actorName: approver.name,
          actorRole: approver.role,
          message: acceptMatch ? acceptMatch[1].trim() : `${isLeave ? '휴가/반차' : '일정'} 결재를 승인(수락)했습니다.`,
          timestamp: schedule.statusUpdatedAt ? new Date(schedule.statusUpdatedAt).toISOString() : (schedule.updatedAt || new Date().toISOString())
        });
      }
    }

    return list;
  };

  const openDetailModal = (event) => {
    setSelectedDetailEvent(event);
    setEditTitle(event.title);
    setEditMemberIds(event.memberIds ? event.memberIds : [event.memberId]);
    setEditStartHour(event.startHour);
    setEditEndHour(event.endHour);
    setEditDescription(event.description || '');
    const parsedDesc = parseScheduleDescription(event.description || '');
    let initialCategory = event.category || parsedDesc.category;
    if (!initialCategory) {
      const titleLower = (event.title || '').toLowerCase();
      const descLower = (event.description || '').toLowerCase();
      if (event.isIssue || event.color === 'red' || (event.description || '').includes('[구분: 이슈]') || /긴급|이슈|장애|오류|버그|지연|에러|점검|디버깅|블로커/i.test(titleLower + ' ' + descLower)) {
        initialCategory = '이슈';
      } else if (/반차|연차|휴가|병가/i.test(titleLower)) {
        initialCategory = '휴가';
      } else {
        initialCategory = '일반';
      }
    }
    setEditCategory(initialCategory);
    setEditDetail(parsedDesc.detail);
    setEditMemo(parsedDesc.memo);
    setEditProgress(event.progress !== undefined ? event.progress : parsedDesc.progress);

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
    setIsHistoryExpanded(false);
    setShowDetailInput(Boolean(parsedDesc.detail && parsedDesc.detail.trim()));
    setShowMemoInput(Boolean(parsedDesc.memo && parsedDesc.memo.trim()));
    setIsDetailModalOpen(true);
  };

  const saveEventEdits = async () => {
    if (!editTitle.trim()) return;
    if (editMemberIds.length === 0) {
      showLayerAlert('최소 한 명 이상의 담당자를 지정해야 합니다.', '담당자 지정 필요', 'error');
      return;
    }
    if (!editStartDateStr || !editEndDateStr) {
      showLayerAlert('시작일과 종료일을 지정해야 합니다.', '날짜 지정 필요', 'error');
      return;
    }
    if (editStartDateStr > editEndDateStr) {
      showLayerAlert('시작일은 종료일보다 이전이어야 합니다.', '날짜 오류', 'error');
      return;
    }

    setIsSavingEvent(true);
    try {
      await new Promise(r => setTimeout(r, 450));
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
      let newRequesterId = selectedDetailEvent.requesterId || ME.id;
      
      if (hasAssigneeChanged) {
        const isAssignedToSelfOnly = editMemberIds.length === 1 && (editMemberIds.includes(ME.id) || (ME.id === 'sh' && editMemberIds.includes('yoonhee')));
        newStatus = isAssignedToSelfOnly ? 'accepted' : 'requested';
        newRequesterId = ME.id;
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
      const isNowIssue = editCategory === '이슈';
      const isNowLeave = editCategory === '휴가';
      let randomColor;
      if (isNowIssue) {
        randomColor = 'red';
      } else if (selectedDetailEvent.color === 'red') {
        randomColor = isNowLeave ? 'green' : colors[Math.floor(Math.random() * colors.length)];
      } else {
        randomColor = selectedDetailEvent.color || (isNowLeave ? 'green' : colors[Math.floor(Math.random() * colors.length)]);
      }

      const createdSchedules = [];
      for (let idx = 0; idx < dateList.length; idx++) {
        const item = dateList[idx];
        const newDesc = formatScheduleDescription(newGroupId, editDetail.trim(), editMemo.trim(), item.year, item.month, editProgress, editCategory);

        const otherMemberId = editMemberIds.find(id => id !== newRequesterId && !(newRequesterId === 'sh' && id === 'yoonhee') && !(newRequesterId === 'daum' && id === 'daeum') && !(newRequesterId === 'sangmoo' && id === 'sangmu'));
        const newApproverId = selectedDetailEvent.approverId || otherMemberId || (editCategory === '휴가' ? (newRequesterId === 'daum' ? 'sh' : 'sangmoo') : otherMemberId);

        const schedObj = {
          id: `s_${Date.now()}_${idx}`,
          year: item.year,
          month: item.month,
          date: item.date,
          title: editTitle.trim(),
          category: editCategory,
          isIssue: editCategory === '이슈',
          memberIds: editMemberIds,
          memberId: editMemberIds[0],
          startHour: parseFloat(editStartHour),
          endHour: parseFloat(editEndHour),
          color: randomColor,
          description: newDesc,
          progress: editProgress,
          status: newStatus,
          requesterId: newRequesterId,
          approverId: newApproverId || null
        };

        if (isConfigured) {
          let dbSched = { ...schedObj };
          if (isCurrentUserYoonhee) {
            dbSched.memberId = schedObj.memberId === 'sh' ? 'yoonhee' : (schedObj.memberId === 'yoonhee' ? 'sh' : schedObj.memberId);
            dbSched.memberIds = schedObj.memberIds.map(id => id === 'sh' ? 'yoonhee' : (id === 'yoonhee' ? 'sh' : id));
            dbSched.requesterId = schedObj.requesterId === 'sh' ? 'yoonhee' : (schedObj.requesterId === 'yoonhee' ? 'sh' : schedObj.requesterId);
            if (schedObj.approverId) {
              dbSched.approverId = schedObj.approverId === 'sh' ? 'yoonhee' : (schedObj.approverId === 'yoonhee' ? 'sh' : schedObj.approverId);
            }
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
      setSchedules(prev => {
        const next = [...prev.filter(s => !oldIds.includes(s.id)), ...createdSchedules];
        try { localStorage.setItem('zal_schedules', JSON.stringify(next)); } catch (_) {}
        return next;
      });

      // Also sync to feeds in Dashboard
      if (setFeeds && createdSchedules.length > 0) {
        const firstSched = createdSchedules[0];
        const otherMemberId = editMemberIds.find(id => id !== newRequesterId && !(newRequesterId === 'sh' && id === 'yoonhee') && !(newRequesterId === 'daum' && id === 'daeum') && !(newRequesterId === 'sangmoo' && id === 'sangmu'));
        const otherMember = TEAM.find(m => m.id === otherMemberId) || { name: '정윤희', role: '부장' };
        setFeeds(prev => {
          const next = prev.map(f => {
            const isMatch = f.id === dashboardFeedId || f.id === selectedDetailEvent.feedId || (f.content && f.content.includes(selectedDetailEvent.title));
            if (isMatch) {
              return {
                ...f,
                vacationInfo: newStatus === 'requested' ? {
                  type: editCategory === '이슈' ? '이슈' : (editCategory === '휴가' ? '휴가' : '미팅 요청'),
                  date: `${firstSched.year}.${String(firstSched.month).padStart(2, '0')}.${String(firstSched.date).padStart(2, '0')}`,
                  status: 'pending',
                  approverName: otherMember.name,
                  approverRole: otherMember.role,
                  targetUserId: otherMember.id,
                  requesterId: newRequesterId,
                  requesterName: ME.name
                } : (newStatus === 'accepted' && f.vacationInfo ? {
                  ...f.vacationInfo,
                  status: 'approved',
                  approverName: otherMember.name
                } : f.vacationInfo)
              };
            }
            return f;
          });
          try { localStorage.setItem('zal_feeds_v2', JSON.stringify(next)); } catch (_) {}
          return next;
        });
      }

      setIsDetailModalOpen(false);
    } finally {
      setIsSavingEvent(false);
    }
  };

  const performDeleteScheduleAndFeed = (targetEvent, fid) => {
    if (!targetEvent) return;
    const targetEventId = targetEvent.id;
    const targetEventTitle = (targetEvent.title || '').trim();
    const targetEventDesc = (targetEvent.description || '').trim();
    const cleanTitleNoSpace = targetEventTitle.replace(/[\s🏖️🚨🤝📋📄⚡]/g, '').toLowerCase();
    const cleanDescNoSpace = targetEventDesc.replace(/[\s🏖️🚨🤝📋📄⚡]/g, '').toLowerCase();

    const targetFeedId = targetEvent.feedId || fid || (targetEventId && targetEventId.startsWith('feed_') ? targetEventId.split('_').slice(0, 2).join('_') : null);
    const matchGroupId = targetEvent.description && targetEvent.description.match(/\[그룹 ID\]\s*(g_\w+)/);
    const groupId = matchGroupId ? matchGroupId[1] : null;

    // 1. Synchronously update schedules state
    if (groupId) {
      setSchedules(prev => prev.filter(s => !(s.description && s.description.includes(`[그룹 ID] ${groupId}`))));
    } else {
      setSchedules(prev => prev.filter(s => s.id !== targetEventId));
    }

    // 2. Synchronously update feeds state and localStorage
    setFeeds(prev => {
      const next = prev.filter(f => {
        // Direct ID match
        if (targetFeedId && (f.id === targetFeedId || f.id.startsWith(targetFeedId) || targetFeedId.startsWith(f.id))) return false;
        if (targetEventId && (f.id === targetEventId || targetEventId.startsWith(f.id) || f.id.startsWith(targetEventId))) return false;
        
        // Text comparison (case-insensitive & space-insensitive)
        const fContentNoSpace = (f.content || '').replace(/[\s🏖️🚨🤝📋📄⚡]/g, '').toLowerCase();
        if (cleanDescNoSpace && fContentNoSpace && (fContentNoSpace.includes(cleanDescNoSpace) || cleanDescNoSpace.includes(fContentNoSpace))) return false;
        if (cleanTitleNoSpace && fContentNoSpace && (fContentNoSpace.includes(cleanTitleNoSpace) || cleanTitleNoSpace.includes(fContentNoSpace))) return false;

        // Badge label comparison
        if (f.aiBadges && f.aiBadges.length > 0) {
          const badgeMatched = f.aiBadges.some(b => {
            const bLabelNoSpace = (b.label || '').replace(/[\s🏖️🚨🤝📋📄⚡]/g, '').toLowerCase();
            if (targetEventId && b.id && b.id.includes(targetEventId)) return true;
            if (cleanTitleNoSpace && bLabelNoSpace && (bLabelNoSpace.includes(cleanTitleNoSpace) || cleanTitleNoSpace.includes(bLabelNoSpace))) return true;
            return false;
          });
          if (badgeMatched) return false;
        }

        // Vacation/Request info comparison
        if (f.vacationInfo) {
          const vTypeNoSpace = (f.vacationInfo.type || '').replace(/[\s🏖️🚨🤝📋📄⚡]/g, '').toLowerCase();
          if (cleanTitleNoSpace && vTypeNoSpace && (vTypeNoSpace.includes(cleanTitleNoSpace) || cleanTitleNoSpace.includes(vTypeNoSpace))) return false;
        }

        return true;
      });

      try {
        localStorage.setItem('zal_feeds_v2', JSON.stringify(next));
      } catch (_) {}
      return next;
    });

    // 3. Close modals immediately
    setDashboardFeedId(null);
    setIsDetailModalOpen(false);

    // 4. Fire background Appwrite delete if configured (won't block UI)
    if (isConfigured) {
      if (groupId) {
        const targets = schedules.filter(s => s.description && s.description.includes(`[그룹 ID] ${groupId}`));
        targets.forEach(t => {
          appwriteService.deleteSchedule(t.id).catch(() => {});
        });
      } else if (targetEventId) {
        appwriteService.deleteSchedule(targetEventId).catch(() => {});
      }
    }
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
            // Auto-clean check: if Appwrite stored name has duplicate '사원' appended at the end, clean it up!
            let trimmed = currentUser.name.trim();
            if (trimmed.includes('[') && trimmed.endsWith('사원')) {
              trimmed = trimmed.replace(/\s+사원$/, '').trim();
              try {
                await appwriteService.updateName(trimmed);
                currentUser = await appwriteService.getCurrentUser();
              } catch (err) {
                console.error('Failed to clean user name', err);
              }
            }
            if (!user || user.$id !== currentUser.$id || user.name !== currentUser.name) {
              setUser(currentUser);
            }
            
            const getDeterministicColor = (str) => {
              const colors = ['#000000', '#4f8ef7', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
              let hash = 0;
              for (let i = 0; i < str.length; i++) {
                hash = str.charCodeAt(i) + ((hash << 5) - hash);
              }
              const index = Math.abs(hash) % colors.length;
              return colors[index];
            };

            const parsed = parseStoredName(currentUser.name);
            if (parsed.project) {
              setHeaderSelectedProject(parsed.project);
            }
            const userColor = getDeterministicColor(parsed.name);
            const isCurrentUserYoonhee = parsed.name === '정윤희';

            const memberYoonhee = {
              id: 'sh',
              name: '정윤희',
              role: '부장',
              avatar: '윤희',
              avatarPic: '/pic1_thumb.png',
              color: '#000000',
              subtext: '기획 일정'
            };

            const memberDaeum = {
              id: 'daum',
              name: '정다음',
              role: '사원',
              avatar: '다음',
              avatarPic: '/pic2_thumb.png',
              color: '#10b981',
              subtext: '개인 일정'
            };

            const loggedInMember = {
              id: 'sh',
              name: parsed.name || '조상무',
              role: parsed.role || '상무',
              avatar: parsed.name ? parsed.name.slice(0, 2) : '조상무',
              avatarPic: '/pic1_thumb.png',
              color: userColor || '#000000',
              subtext: `${parsed.department || '개발'} 일정`
            };

            const otherMember = isCurrentUserYoonhee ? {
              id: 'sangmoo',
              name: '조상무',
              role: '상무',
              avatar: '상무',
              avatarPic: '/pic3_thumb.png',
              color: '#000000',
              subtext: '개발 일정'
            } : {
              id: 'yoonhee',
              name: '정윤희',
              role: '부장',
              avatar: '윤희',
              avatarPic: '/pic3_thumb.png',
              color: '#4f8ef7',
              subtext: '기획 일정'
            };

            const fullTeamList = [loggedInMember, otherMember, memberDaeum];

            setActiveTeam(fullTeamList);
            
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

              setActiveTeam(fullTeamList);

              const resetDocs = mapped.filter(s => s.title === '__RESET__');
              let globalResetTs = 0;
              resetDocs.forEach(rd => {
                const ts = parseInt(rd.description || '0', 10);
                if (ts > globalResetTs) globalResetTs = ts;
              });

              const localResetTsStr = localStorage.getItem('zal_reset_timestamp');
              const localResetTs = localResetTsStr ? parseInt(localResetTsStr, 10) : 0;
              const effectiveResetTs = Math.max(localResetTs, globalResetTs);

              const actualSchedules = mapped.filter(s => {
                if (s.title === '__PROFILE__' || s.title === '__RESET__') return false;
                if (effectiveResetTs && s.createdAt) {
                  const createdTime = new Date(s.createdAt).getTime();
                  if (createdTime && createdTime <= effectiveResetTs) return false;
                }
                return true;
              }).map(s => {
                if (s.title && s.title.includes('정부장 브리핑')) {
                  if (s.memberIds && (s.memberIds.includes('sh') || s.memberIds.includes('yoonhee')) && (s.memberIds.includes('sangmoo') || s.memberId === 'sangmoo' || s.requesterId === 'sangmoo')) {
                    return {
                      ...s,
                      requesterId: 'sangmoo'
                    };
                  }
                }
                return s;
              });
              setSchedules(actualSchedules);
            }
            const dbMessages = await appwriteService.getMessages();
            if (dbMessages !== null) {
              const resetDocs = (await appwriteService.getSchedules() || []).filter(s => s.title === '__RESET__');
              let globalResetTs = 0;
              resetDocs.forEach(rd => {
                const ts = parseInt(rd.description || '0', 10);
                if (ts > globalResetTs) globalResetTs = ts;
              });

              const localResetTsStr = localStorage.getItem('zal_reset_timestamp');
              const localResetTs = localResetTsStr ? parseInt(localResetTsStr, 10) : 0;
              const effectiveResetTs = Math.max(localResetTs, globalResetTs);

              const userSuffix = currentUser.$id;

              const filteredDbMessages = dbMessages.filter(msg => {
                if (!msg || msg.id === 0) return false;
                if (effectiveResetTs) {
                  let createdTime = 0;
                  if (msg.createdAt) createdTime = new Date(msg.createdAt).getTime();
                  if (!createdTime && msg.$createdAt) createdTime = new Date(msg.$createdAt).getTime();
                  if (!createdTime || isNaN(createdTime) || createdTime <= effectiveResetTs) return false;
                }
                const isMyMsg = msg.from === `user_${userSuffix}_${ME.id}` || 
                                msg.from === `ai_${userSuffix}_${ME.id}` || 
                                msg.from === `user_${ME.id}` || 
                                msg.from === `ai_${ME.id}` ||
                                (msg.from && (
                                  msg.from.endsWith(`_${ME.id}`) ||
                                  (ME.id === 'sh' && (msg.from.endsWith('_yoonhee') || msg.from === 'ai_yoonhee' || msg.from === 'user_yoonhee')) ||
                                  (ME.id === 'yoonhee' && (msg.from.endsWith('_sh') || msg.from === 'ai_sh' || msg.from === 'user_sh'))
                                ));
                return isMyMsg &&
                  !(msg.from && msg.from.includes('ai') && msg.text && (
                    msg.text.includes('안녕하세요') ||
                    msg.text.includes('좋은 아침') ||
                    msg.text.includes('점심은') ||
                    msg.text.includes('수고하셨') ||
                    msg.text.includes('수고 많으셨')
                  ));
              });
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

  // Step 1 Validation & Next Step Transition
  const handleNextSignUpStep = (e) => {
    if (e) e.preventDefault();
    if (!authName.trim() || !authDepartment || !authRole || !authEmailId.trim() || !authPassword.trim()) {
      setAuthError('이름, 부서, 직급, 이메일 아이디, 비밀번호를 모두 입력해 주세요.');
      return;
    }
    setAuthError('');
    setSignUpStep(2);
  };

  // Handle User Registration
  const handleSignUp = async (e) => {
    e.preventDefault();
    const projectOptions = [
      '신영증권 외화표시펀드 매매 시스템 구축',
      '삼성증권 연금 고객중심 서비스 개선',
      'NH투자증권 퇴직연금시스템 운영',
      '경찰공제회 시스템 유지보수',
      '대신증권 연금 경쟁력 강화',
      '다음 D-RPS 고도화'
    ];
    const isAllProjectsSelected = Array.isArray(authProject) && projectOptions.every(p => authProject.includes(p));
    const projectStr = isAllProjectsSelected ? '전체' : (Array.isArray(authProject) ? authProject.join(', ') : authProject);
    const hasProject = Array.isArray(authProject) ? authProject.length > 0 : Boolean(authProject);
    if (!authEmailId.trim() || !authPassword.trim() || !authName.trim() || !authDepartment || !hasProject || !authRole) {
      setAuthError('이름, 직급, 부서, 프로젝트 등 모든 필드를 입력해 주세요.');
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    try {
      const email = `${authEmailId.trim()}@daumit.net`;
      const fullName = `${authName.trim()} ${authRole} [${authDepartment} / ${projectStr}]`;
      const prefs = {
        department: authDepartment,
        project: projectStr,
        role: authRole,
        name: authName.trim()
      };
      const session = await appwriteService.register(email, authPassword, fullName, prefs);
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
    if (ME && ME.id) {
      localStorage.setItem(`zal_messages_${ME.id}`, JSON.stringify(messages));
    }
  }, [messages, ME.id]);

    const userSuffix = user ? user.$id : 'default';

    const handleApproveSchedule = (schedId) => {
    const target = schedules.find(s => 
      s.id === schedId || 
      s.$id === schedId || 
      (schedId && String(s.id) === String(schedId)) || 
      (schedId && String(s.$id) === String(schedId))
    );
    if (!target) return;

    const isLeave = /반차|연차|휴가|병가/i.test(target.title || '');
    const verb = isLeave ? '승인' : '수락';
    const approverName = ME.name || '조상무';

    showLayerPrompt(
      `"${target.title}" 일정을 ${verb}하시겠습니까?\n전달할 메시지를 입력해 주세요.`,
      `일정 ${verb}`,
      `${verb} 메시지를 입력하세요 (선택 사항)`,
      `${verb}하기`,
      async (userMsg) => {
        const groupMatch = (target.description || '').match(/\[그룹 ID\]\s*(g_[\w_]+)/);
        const groupId = target.groupId || (groupMatch ? groupMatch[1] : null);

        let targetItems = [target];
        if (groupId) {
          targetItems = schedules.filter(s => {
            const gMatch = (s.description || '').match(/\[그룹 ID\]\s*(g_[\w_]+)/);
            return s.groupId === groupId || (gMatch && gMatch[1] === groupId);
          });
        }

        const targetIdStrings = targetItems.map(s => String(s.id || s.$id || ''));
        const cleanMsg = (userMsg || '').trim();

        const isMatchingItem = (s) => {
          const sId = String(s.id || s.$id || '');
          if (sId && targetIdStrings.includes(sId)) return true;
          return targetItems.some(t => 
            t.title === s.title && 
            t.date === s.date && 
            (!t.month || !s.month || t.month === s.month) && 
            (!t.year || !s.year || t.year === s.year) &&
            t.startHour === s.startHour
          );
        };

        if (isConfigured) {
          try {
            for (const item of targetItems) {
              let updatedDesc = item.description || '';
              if (cleanMsg) {
                updatedDesc = updatedDesc.replace(/\[수락메시지\].*?(\||\n|$)/g, '').trim();
                updatedDesc += ` | [수락메시지] ${cleanMsg}`;
              }
              let dbSched = { ...item, status: 'accepted', description: updatedDesc };
              if (isCurrentUserYoonhee) {
                dbSched.memberId = item.memberId === 'sh' ? 'yoonhee' : (item.memberId === 'yoonhee' ? 'sh' : item.memberId);
                dbSched.memberIds = (item.memberIds || []).map(id => id === 'sh' ? 'yoonhee' : (id === 'yoonhee' ? 'sh' : id));
                dbSched.requesterId = item.requesterId === 'sh' ? 'yoonhee' : (item.requesterId === 'yoonhee' ? 'sh' : item.requesterId);
              }
              await appwriteService.updateSchedule(item.id || item.$id, dbSched);
            }
          } catch (e) {
            console.error("Failed to update schedule status:", e);
          }
        }

        const newHistItem = {
          id: `hist_appr_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          action: 'approve',
          actionLabel: isLeave ? '결재 승인' : '일정 수락',
          actorId: ME.id,
          actorName: ME.name,
          actorRole: ME.role || '',
          message: cleanMsg || `${isLeave ? '휴가/반차' : '일정'} 결재를 승인(수락)했습니다.`,
          timestamp: new Date().toISOString()
        };

        setSchedules(prev => {
          const next = prev.map(s => {
            if (!isMatchingItem(s)) return s;
            let updatedDesc = s.description || '';
            if (cleanMsg) {
              updatedDesc = updatedDesc.replace(/\[수락메시지\].*?(\||\n|$)/g, '').trim();
              updatedDesc += ` | [수락메시지] ${cleanMsg}`;
            }
            const prevHist = Array.isArray(s.history) ? s.history : getScheduleHistoryList(s);
            return { ...s, status: 'accepted', description: updatedDesc, history: [...prevHist, newHistItem], statusUpdatedAt: Date.now(), updatedAt: new Date().toISOString() };
          });
          try {
            localStorage.setItem('zal_schedules', JSON.stringify(next));
          } catch (e) {}
          return next;
        });

        // Sync with Dashboard feeds
        setFeeds(prev => {
          const next = prev.map(f => {
            if (!f.vacationInfo) return f;
            const isMatch = targetItems.some(t => {
              const tTitle = (t.title || '').trim();
              return (f.content && f.content.includes(tTitle)) || 
                     (f.vacationInfo?.type && tTitle.includes(f.vacationInfo.type)) ||
                     (/반차|휴가|연차/i.test(t.title || '') && /반차|휴가|연차/i.test(f.vacationInfo?.type || ''));
            });
            if (isMatch) {
              return {
                ...f,
                vacationInfo: {
                  ...f.vacationInfo,
                  status: 'approved',
                  approverName: `${ME.name} ${ME.role || ''}`.trim(),
                  approvedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                }
              };
            }
            return f;
          });
          try { localStorage.setItem('zal_feeds_v2', JSON.stringify(next)); } catch (_) {}
          return next;
        });

        // Notify requester
        const requesterId = target.requesterId || target.memberId || 'sh';
        const reqKeys = [requesterId];
        if (requesterId === 'sh') reqKeys.push('yoonhee');
        if (requesterId === 'yoonhee') reqKeys.push('sh');
        if (requesterId === 'sangmoo') reqKeys.push('sangmu');
        if (requesterId === 'sangmu') reqKeys.push('sangmoo');
        if (requesterId === 'daum') reqKeys.push('daum');

        let reqNoticeText = `🎉 ${ME.name} ${ME.role || '사원'}님이 "${target.title}" 일정을 ${verb}하셨습니다.`;
        if (cleanMsg) {
          reqNoticeText += `\n💬 메시지: "${cleanMsg}"`;
        }

        const noticeMsg = {
          id: Date.now() + 2,
          from: `ai_${userSuffix}_${requesterId}`,
          text: reqNoticeText,
          time: formatTime(new Date()),
          createdAt: new Date().toISOString()
        };

        try {
          reqKeys.forEach(k => {
            const saved = localStorage.getItem(`zal_messages_${k}`);
            const list = saved ? JSON.parse(saved) : [];
            list.push(noticeMsg);
            localStorage.setItem(`zal_messages_${k}`, JSON.stringify(list));
          });
        } catch (e) {}

        if (isConfigured) {
          try {
            await appwriteService.createMessage(noticeMsg);
          } catch (e) {}
        }

        showLayerAlert(`"${target.title}" 일정이 ${verb}되었습니다.`, `${verb} 완료`, 'success');
      }
    );
  };

  const handleAcceptSchedule = handleApproveSchedule;

    const handleRejectSchedule = (schedId) => {
    const target = schedules.find(s => 
      s.id === schedId || 
      s.$id === schedId || 
      (schedId && String(s.id) === String(schedId)) || 
      (schedId && String(s.$id) === String(schedId))
    );
    if (!target) return;

    const isLeave = /반차|연차|휴가|병가/i.test(target.title || '');
    const verb = isLeave ? '반려' : '거절';
    const approverName = ME.name || '정윤희';

    showLayerPrompt(
      `"${target.title}" 일정을 ${verb}하시겠습니까?\n${verb} 사유나 전달할 메시지를 입력해 주세요.`,
      `일정 ${verb}`,
      `${verb} 사유를 입력하세요 (선택 사항)`,
      `${verb}하기`,
      async (reasonText) => {
        const groupMatch = (target.description || '').match(/\[그룹 ID\]\s*(g_[\w_]+)/);
        const groupId = target.groupId || (groupMatch ? groupMatch[1] : null);

        let targetItems = [target];
        if (groupId) {
          targetItems = schedules.filter(s => {
            const gMatch = (s.description || '').match(/\[그룹 ID\]\s*(g_[\w_]+)/);
            return s.groupId === groupId || (gMatch && gMatch[1] === groupId);
          });
        }

        const targetIdStrings = targetItems.map(s => String(s.id || s.$id || ''));
        const cleanReason = (reasonText || '').trim();

        const isMatchingItem = (s) => {
          const sId = String(s.id || s.$id || '');
          if (sId && targetIdStrings.includes(sId)) return true;
          return targetItems.some(t => 
            t.title === s.title && 
            t.date === s.date && 
            (!t.month || !s.month || t.month === s.month) && 
            (!t.year || !s.year || t.year === s.year) &&
            t.startHour === s.startHour
          );
        };

        if (isConfigured) {
          try {
            for (const item of targetItems) {
              let updatedDesc = item.description || '';
              if (cleanReason) {
                updatedDesc = updatedDesc.replace(/\[반려사유\].*?(\||\n|$)/g, '').trim();
                updatedDesc += ` | [반려사유] ${cleanReason}`;
              }
              let dbSched = { ...item, status: 'rejected', description: updatedDesc };
              if (isCurrentUserYoonhee) {
                dbSched.memberId = item.memberId === 'sh' ? 'yoonhee' : (item.memberId === 'yoonhee' ? 'sh' : item.memberId);
                dbSched.memberIds = (item.memberIds || []).map(id => id === 'sh' ? 'yoonhee' : (id === 'yoonhee' ? 'sh' : id));
                dbSched.requesterId = item.requesterId === 'sh' ? 'yoonhee' : (item.requesterId === 'yoonhee' ? 'sh' : item.requesterId);
              }
              await appwriteService.updateSchedule(item.id || item.$id, dbSched);
            }
          } catch (e) {
            console.error("Failed to update schedule status:", e);
          }
        }

        const newHistItem = {
          id: `hist_rej_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          action: 'reject',
          actionLabel: isLeave ? '결재 반려' : '일정 거절',
          actorId: ME.id,
          actorName: ME.name,
          actorRole: ME.role || '',
          message: cleanReason || '일정을 반려했습니다.',
          timestamp: new Date().toISOString()
        };

        setSchedules(prev => {
          const next = prev.map(s => {
            if (!isMatchingItem(s)) return s;
            let updatedDesc = s.description || '';
            if (cleanReason) {
              updatedDesc = updatedDesc.replace(/\[반려사유\].*?(\||\n|$)/g, '').trim();
              updatedDesc += ` | [반려사유] ${cleanReason}`;
            }
            const prevHist = Array.isArray(s.history) ? s.history : getScheduleHistoryList(s);
            return { ...s, status: 'rejected', description: updatedDesc, history: [...prevHist, newHistItem], statusUpdatedAt: Date.now(), updatedAt: new Date().toISOString() };
          });
          try {
            localStorage.setItem('zal_schedules', JSON.stringify(next));
          } catch (e) {}
          return next;
        });

        // Sync with Dashboard feeds
        setFeeds(prev => {
          const next = prev.map(f => {
            if (!f.vacationInfo) return f;
            const isMatch = targetItems.some(t => {
              const tTitle = (t.title || '').trim();
              return (f.content && f.content.includes(tTitle)) || 
                     (f.vacationInfo?.type && tTitle.includes(f.vacationInfo.type)) ||
                     (/반차|휴가|연차/i.test(t.title || '') && /반차|휴가|연차/i.test(f.vacationInfo?.type || ''));
            });
            if (isMatch) {
              return {
                ...f,
                vacationInfo: {
                  ...f.vacationInfo,
                  status: 'rejected',
                  approverName: `${ME.name} ${ME.role || ''}`.trim(),
                  approvedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                }
              };
            }
            return f;
          });
          try { localStorage.setItem('zal_feeds_v2', JSON.stringify(next)); } catch (_) {}
          return next;
        });

        // 1) Add notification message to rejecter's chat
        let myNoticeText = `❌ "${target.title}" 일정을 ${verb}하셨습니다.`;
        if (cleanReason) {
          myNoticeText += `\n사유: ${cleanReason}`;
        }
        const myNoticeMsg = {
          id: Date.now() + 1,
          from: `ai_${userSuffix}_${ME.id}`,
          text: myNoticeText,
          time: formatTime(new Date()),
          createdAt: new Date().toISOString(),
          targetScheduleId: target.id,
          targetTitle: target.title
        };
        setMessages(prev => [...prev, myNoticeMsg]);

        // 2) Add notification message to requester's chat (e.g. Cho Sangmoo)
        const requesterId = target.requesterId || (target.memberId && target.memberId !== ME.id ? target.memberId : (ME.id === 'sh' || ME.id === 'yoonhee' ? 'sangmoo' : 'sh'));
        const reqKeys = [requesterId];
        if (requesterId === 'sh') reqKeys.push('yoonhee');
        if (requesterId === 'yoonhee') reqKeys.push('sh');
        if (requesterId === 'sangmoo') reqKeys.push('sangmu');
        if (requesterId === 'sangmu') reqKeys.push('sangmoo');

        let reqNoticeText = `❌ ${approverName} ${ME.role || '부장'}님이 "${target.title}" 일정을 ${verb}하셨습니다.`;
        if (cleanReason) {
          reqNoticeText += `\n사유: ${cleanReason}`;
        }
        const noticeForRequester = {
          id: Date.now() + 2,
          from: `ai_${userSuffix}_${requesterId}`,
          text: reqNoticeText,
          time: formatTime(new Date()),
          createdAt: new Date().toISOString(),
          targetScheduleId: target.id,
          targetTitle: target.title
        };

        try {
          reqKeys.forEach(k => {
            const saved = localStorage.getItem(`zal_messages_${k}`);
            const list = saved ? JSON.parse(saved) : [];
            const isAlready = list.some(m => m.id === noticeForRequester.id || (m.text === noticeForRequester.text && m.time === noticeForRequester.time));
            if (!isAlready) {
              list.push(noticeForRequester);
              localStorage.setItem(`zal_messages_${k}`, JSON.stringify(list));
            }
          });

          const myKeys = [ME.id];
          if (ME.id === 'sh') myKeys.push('yoonhee');
          if (ME.id === 'yoonhee') myKeys.push('sh');
          if (ME.id === 'sangmoo') myKeys.push('sangmu');
          if (ME.id === 'sangmu') myKeys.push('sangmoo');

          myKeys.forEach(k => {
            const mySaved = localStorage.getItem(`zal_messages_${k}`);
            const myList = mySaved ? JSON.parse(mySaved) : [];
            const isAlready = myList.some(m => m.id === myNoticeMsg.id || (m.text === myNoticeMsg.text && m.time === myNoticeMsg.time));
            if (!isAlready) {
              myList.push(myNoticeMsg);
              localStorage.setItem(`zal_messages_${k}`, JSON.stringify(myList));
            }
          });
        } catch (e) {}

        if (isConfigured) {
          try {
            await appwriteService.createMessage(myNoticeMsg);
            await appwriteService.createMessage(noticeForRequester);
          } catch (e) {}
        }

        showLayerAlert(`"${target.title}" 일정이 ${verb}되었습니다.`, `${verb} 완료`, 'info');
      }
    );
  };

  const handleResubmitSchedule = (schedId, optionalDirectMsg = null) => {
    const target = schedules.find(s => 
      s.id === schedId || 
      s.$id === schedId || 
      (schedId && String(s.id) === String(schedId)) || 
      (schedId && String(s.$id) === String(schedId))
    );
    if (!target) return;

    const isLeave = /\[?반차|연차|휴가|병가\]?/i.test(target.title || '');
    const targetMember = isLeave ? getApproverMember(target, ME.id) : (getRejecterMember(target) || getApproverMember(target, ME.id));
    const roleSuffix = targetMember.role ? `${targetMember.role}님` : '님';

    const performResubmit = async (userMsg) => {
      const groupMatch = (target.description || '').match(/\[그룹 ID\]\s*(g_[\w_]+)/);
      const groupId = target.groupId || (groupMatch ? groupMatch[1] : null);

      let targetItems = [target];
      if (groupId) {
        targetItems = schedules.filter(s => {
          const gMatch = (s.description || '').match(/\[그룹 ID\]\s*(g_[\w_]+)/);
          return s.groupId === groupId || (gMatch && gMatch[1] === groupId);
        });
      }

      const targetIdStrings = targetItems.map(s => String(s.id || s.$id || ''));
      const cleanMsg = (userMsg || '').trim();

      const isMatchingItem = (s) => {
        const sId = String(s.id || s.$id || '');
        if (sId && targetIdStrings.includes(sId)) return true;
        return targetItems.some(t => 
          t.title === s.title && 
          t.date === s.date && 
          (!t.month || !s.month || t.month === s.month) && 
          (!t.year || !s.year || t.year === s.year) &&
          t.startHour === s.startHour
        );
      };

      if (isConfigured) {
        try {
          for (const item of targetItems) {
            let updatedDesc = item.description || '';
            if (cleanMsg) {
              updatedDesc = updatedDesc.replace(/\[재요청메시지\].*?(\||\n|$)/g, '').trim();
              updatedDesc += ` | [재요청메시지] ${cleanMsg}`;
            }
            let dbSched = { ...item, status: 'requested', isCancelled: false, approverId: targetMember.id, description: updatedDesc };
            if (isCurrentUserYoonhee) {
              dbSched.memberId = item.memberId === 'sh' ? 'yoonhee' : (item.memberId === 'yoonhee' ? 'sh' : item.memberId);
              dbSched.memberIds = (item.memberIds || []).map(id => id === 'sh' ? 'yoonhee' : (id === 'yoonhee' ? 'sh' : id));
              dbSched.requesterId = item.requesterId === 'sh' ? 'yoonhee' : (item.requesterId === 'yoonhee' ? 'sh' : item.requesterId);
            }
            await appwriteService.updateSchedule(item.id || item.$id, dbSched);
          }
        } catch (e) {
          console.error("Failed to resubmit schedule:", e);
        }
      }

      const newHistItem = {
        id: `hist_resub_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        action: 'resubmit',
        actionLabel: '재요청',
        actorId: ME.id,
        actorName: ME.name,
        actorRole: ME.role || '',
        message: cleanMsg || '일정을 다시 요청했습니다.',
        timestamp: new Date().toISOString()
      };

      setSchedules(prev => {
        const next = prev.map(s => {
          if (!isMatchingItem(s)) return s;
          let updatedDesc = s.description || '';
          if (cleanMsg) {
            updatedDesc = updatedDesc.replace(/\[재요청메시지\].*?(\||\n|$)/g, '').trim();
            updatedDesc += ` | [재요청메시지] ${cleanMsg}`;
          }
          const prevHist = Array.isArray(s.history) ? s.history : getScheduleHistoryList(s);
          return { ...s, status: 'requested', isCancelled: false, approverId: targetMember.id, description: updatedDesc, history: [...prevHist, newHistItem], statusUpdatedAt: Date.now(), updatedAt: new Date().toISOString() };
        });
        try {
          localStorage.setItem('zal_schedules', JSON.stringify(next));
        } catch (e) {}
        return next;
      });

      const nowTs = Date.now();
      const nowIso = new Date().toISOString();
      const nowTime = formatTime(new Date());

      const userSuffix = user ? user.$id : 'local';
      const reasonSuffix = cleanMsg ? `\n사유 : ${cleanMsg}` : '';

      // AI confirmation bubble in current user's chat (사유 포함)
      const myAiNoticeMsg = {
        id: nowTs + 1,
        from: `ai_${userSuffix}_${ME.id}`,
        text: `"${target.title}" 일정을 ${targetMember.name} ${roleSuffix}에게 다시 요청하였습니다.${reasonSuffix}`,
        time: nowTime,
        createdAt: new Date(nowTs + 100).toISOString()
      };

      // Recipient's chat: AI notice bubble
      const targetUserId = targetMember.id;
      const recipientAiNoticeMsg = {
        id: nowTs + 2,
        from: `ai_${targetUserId}`,
        text: `🔄 ${ME.name} ${ME.role || '부장'}님이 "${target.title}" 일정을 다시 요청하셨습니다.${reasonSuffix}`,
        time: nowTime,
        createdAt: new Date(nowTs + 100).toISOString()
      };

      // Save to localStorage for both sender and recipient
      try {
        const myKeys = [ME.id];
        if (ME.id === 'sh') myKeys.push('yoonhee');
        if (ME.id === 'yoonhee') myKeys.push('sh');
        if (ME.id === 'sangmoo') myKeys.push('sangmu');
        if (ME.id === 'sangmu') myKeys.push('sangmoo');
        if (ME.id === 'daum') myKeys.push('daeum');

        const targetKeys = [targetUserId];
        if (targetUserId === 'sh') targetKeys.push('yoonhee');
        if (targetUserId === 'yoonhee') targetKeys.push('sh');
        if (targetUserId === 'sangmoo') targetKeys.push('sangmu');
        if (targetUserId === 'sangmu') targetKeys.push('sangmoo');
        if (targetUserId === 'daum') targetKeys.push('daeum');

        myKeys.forEach(k => {
          const saved = localStorage.getItem(`zal_messages_${k}`);
          const list = saved ? JSON.parse(saved) : [];
          list.push(myAiNoticeMsg);
          localStorage.setItem(`zal_messages_${k}`, JSON.stringify(list));
        });

        targetKeys.forEach(k => {
          const saved = localStorage.getItem(`zal_messages_${k}`);
          const list = saved ? JSON.parse(saved) : [];
          list.push(recipientAiNoticeMsg);
          localStorage.setItem(`zal_messages_${k}`, JSON.stringify(list));
        });
      } catch (e) {}

      if (isConfigured) {
        try {
          await appwriteService.createMessage(myAiNoticeMsg);
          await appwriteService.createMessage(recipientAiNoticeMsg);
        } catch (e) {
          console.error("Failed to save re-request messages to DB:", e);
        }
      }
      setMessages(prev => [...prev, myAiNoticeMsg]);

      showLayerAlert(`"${target.title}" 일정을 ${targetMember.name} ${roleSuffix}에게 다시 요청하였습니다.`, '다시요청 완료', 'success');
    };

    if (optionalDirectMsg !== null && optionalDirectMsg !== undefined) {
      performResubmit(optionalDirectMsg);
    } else {
      showLayerPrompt(
        `"${target.title}" 일정을 ${targetMember.name} ${roleSuffix}에게 다시 요청하시겠습니까?\n전달할 메시지나 변경 사항을 입력해 주세요.`,
        '일정 다시요청',
        '다시 요청 메시지를 입력하세요 (선택 사항)',
        '다시요청',
        (userMsg) => performResubmit(userMsg)
      );
    }
  };

  const handleCancelSchedule = async (schedId) => {
    const target = schedules.find(s => s.id === schedId);
    if (!target) return;

    const groupMatch = (target.description || '').match(/\[그룹 ID\]\s*(g_[\w_]+)/);
    const groupId = target.groupId || (groupMatch ? groupMatch[1] : null);

    let targetItems = [target];
    if (groupId) {
      targetItems = schedules.filter(s => {
        const gMatch = (s.description || '').match(/\[그룹 ID\]\s*(g_[\w_]+)/);
        return s.groupId === groupId || (gMatch && gMatch[1] === groupId);
      });
    }

    const targetIds = targetItems.map(s => s.id);
    const nowIso = new Date().toISOString();
    const nowTime = formatTime(new Date());
    const nowTs = Date.now();

    // 1. Update schedules state to status: 'cancelled'
    const updatedSchedules = schedules.map(s => {
      if (targetIds.includes(s.id)) {
        return {
          ...s,
          status: 'cancelled',
          isCancelled: true,
          cancelledAt: nowIso,
          description: `${s.description || ''}\n[요청 취소] ${ME.name}님이 일정을 취소함`
        };
      }
      return s;
    });

    if (isConfigured) {
      try {
        for (const item of updatedSchedules.filter(s => targetIds.includes(s.id))) {
          await appwriteService.updateSchedule(item.id, item);
        }
      } catch (e) {
        console.error("Failed to update schedule status to cancelled:", e);
      }
    }
    setSchedules(updatedSchedules);

    // 2. Update Dashboard feeds (mark as cancelled so Dashboard hides them)
    setFeeds(prev => {
      const nextFeeds = prev.map(f => {
        const isMatched = targetIds.includes(f.scheduleId) || 
                          targetIds.includes(f.id) || 
                          (f.schedule && targetIds.includes(f.schedule.id)) ||
                          (f.content && f.content.includes(target.title));
        if (isMatched) {
          return {
            ...f,
            status: 'cancelled',
            isCancelled: true,
            vacationInfo: f.vacationInfo ? { ...f.vacationInfo, status: 'cancelled' } : undefined
          };
        }
        return f;
      });
      try {
        localStorage.setItem('zal_feeds_v2', JSON.stringify(nextFeeds));
      } catch (err) {}
      return nextFeeds;
    });

    // 3. Post Speech Bubble messages in Calendar chat (Only AI confirmation bubble, no fake user speech bubble)
    const approverId = target.approverId || (target.memberId !== ME.id ? target.memberId : 'sangmoo');

    // (a) Requester's (나/정다음) AI confirmation message
    const myAiNoticeMsg = {
      id: nowTs + 1,
      from: `ai_${ME.id}`,
      text: `${ME.name}님의 [${target.title}] 요청이 정상적으로 취소되었습니다.\n필요 시 일정 카드의 '재요청' 버튼을 통해 언제든 다시 신청하실 수 있습니다.`,
      targetTitle: target.title,
      time: nowTime,
      createdAt: new Date(nowTs + 50).toISOString()
    };

    // (b) Approver's (조상무) messages
    const approverAiNoticeMsg = {
      id: nowTs + 2,
      from: `ai_${approverId}`,
      text: `🔔 [알림] ${ME.name}님이 [${target.title}] (${target.date || ''}일) 결재 요청을 취소하였습니다.`,
      targetTitle: target.title,
      time: nowTime,
      createdAt: new Date(nowTs + 100).toISOString()
    };

    // Save to localStorage for both requester and approver
    try {
      const myKeys = [ME.id];
      if (ME.id === 'sh') myKeys.push('yoonhee');
      if (ME.id === 'yoonhee') myKeys.push('sh');
      if (ME.id === 'daum') myKeys.push('daeum');

      const approverKeys = [approverId];
      if (approverId === 'sangmoo') approverKeys.push('sangmu');
      if (approverId === 'sangmu') approverKeys.push('sangmoo');
      if (approverId === 'sh') approverKeys.push('yoonhee');
      if (approverId === 'yoonhee') approverKeys.push('sh');

      myKeys.forEach(k => {
        const saved = localStorage.getItem(`zal_messages_${k}`);
        const list = saved ? JSON.parse(saved) : [];
        list.push(myAiNoticeMsg);
        localStorage.setItem(`zal_messages_${k}`, JSON.stringify(list));
      });

      approverKeys.forEach(k => {
        const saved = localStorage.getItem(`zal_messages_${k}`);
        const list = saved ? JSON.parse(saved) : [];
        list.push(approverAiNoticeMsg);
        localStorage.setItem(`zal_messages_${k}`, JSON.stringify(list));
      });
    } catch (e) {}

    if (isConfigured) {
      try {
        await appwriteService.createMessage(myAiNoticeMsg);
        await appwriteService.createMessage(approverAiNoticeMsg);
      } catch (e) {
        console.error("Failed to save cancel messages to DB:", e);
      }
    }

    setMessages(prev => [...prev, myAiNoticeMsg]);

    showLayerAlert(`"${target.title}" 요청이 취소되었습니다.`, '요청취소 완료', 'info');
  };

  const processMessageAndCreateSchedule = (textInput, actingUser = ME, skipDashboardFeed = false, customDate = null, customMonth = null, customYear = null) => {
    const text = (textInput || '').trim();
    if (!text) return;

    const userSuffix = user ? user.$id : 'local';
    const userMsg = { id: msgId.current++, from: `user_${userSuffix}_${actingUser.id}`, text, time: formatTime(new Date()), createdAt: new Date().toISOString() };
    
    setIsTyping(true);

    // Optimistically add the user message to UI immediately
    setMessages(prev => [...prev, userMsg]);

    const proceedWithAI = async () => {
      try {
        const targetD = (customDate !== null && customDate !== undefined) ? customDate : (selectedDate || new Date().getDate());
        const targetM = (customMonth !== null && customMonth !== undefined) ? customMonth : (currentMonth || (new Date().getMonth() + 1));
        const targetY = (customYear !== null && customYear !== undefined) ? customYear : (currentYear || new Date().getFullYear());
        
        let rawResult = await parseMessageWithGemini(text, targetD, activeTeam, targetY, targetM, actingUser);
        
        let aiResult;
        if (rawResult && typeof rawResult === 'object' && rawResult.action) {
          aiResult = rawResult;
        } else if (Array.isArray(rawResult)) {
          aiResult = { action: 'create', schedules: rawResult };
        } else {
          const fallbackList = parseMessageToSchedules(text, targetD, activeTeam, targetY, targetM, actingUser);
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
          const aiMsg = { id: msgId.current++, from: `ai_${userSuffix}_${actingUser.id}`, text: aiReply, time: formatTime(new Date()), createdAt: new Date().toISOString() };
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
          const aiMsg = { id: msgId.current++, from: `ai_${userSuffix}_${actingUser.id}`, text: aiReply, time: formatTime(new Date()), createdAt: new Date().toISOString() };
          if (isConfigured) {
            await appwriteService.createMessage(aiMsg);
          }
          setMessages(prev => [...prev, aiMsg]);
          return;
        }

        const listToCreate = aiResult.schedules || [];
        const colors = ['purple', 'blue', 'green', 'orange'];
        const newSchedules = [];
        // All schedules from the same message share one timestamp for correct stream ordering
        const batchCreatedAt = new Date().toISOString();

        listToCreate.forEach((parsed, index) => {

          // Check issue status per individual schedule item, NOT forcing whole text
          const isReportTask = /보고서|자료\s*작성|문서|서류/i.test((parsed.title || '') + ' ' + (parsed.description || ''));
          const isItemIssue = !isReportTask && (parsed.isIssue || /긴급|디버깅|버그|오류|지연|블로커|안\s*와|미회신|아직도|이슈\s*터짐/i.test(parsed.title || ''));
          const randomColor = isItemIssue ? 'red' : colors[(Math.floor(Math.random() * colors.length) + index) % colors.length];
          
          const titleAndText = (parsed.title || '') + ' ' + (parsed.description || '');
          const isPersonalLeave = ((parsed.title || '').includes('연차') || (parsed.title || '').includes('휴가') || (parsed.title || '').includes('반차') || (parsed.title || '').includes('병가')) && !/복귀|스프린트|미팅|브리핑|업무|회의|점검/i.test(parsed.title || '');

          // Detect target delegatee mentions
          const isDelegatedToDaum = actingUser.id !== 'daum' && (parsed.memberId === 'daum' || (/정사원|정사인|정다음|다음/i.test(titleAndText) && /한테|에게|맡기|지시|잡으라고/i.test(text)));
          const isDelegatedToYoonhee = (actingUser.id !== 'sh' && actingUser.id !== 'yoonhee') && (parsed.memberId === 'sh' || parsed.memberId === 'yoonhee' || (/정윤희|정부장/i.test(titleAndText) && /한테|에게|맡기|지시|부탁/i.test(text) && !/정부장\s*브리핑|정부장이랑/i.test(text)));

          let assignedMemberId = actingUser.id;
          let assignedMemberIds = [actingUser.id];
          let isSelf = true;
          let schedStatus = 'accepted';
          let schedApproverId = null;

          if (isPersonalLeave) {
            // 1) Personal Leave / Vacation (연차, 반차, 휴가) - 모든 휴가는 항상 조상무 상무 결재
            assignedMemberId = actingUser.id;
            assignedMemberIds = [actingUser.id];
            isSelf = true;
            schedStatus = 'requested';
            schedApproverId = 'sangmoo';
          } else if (isDelegatedToDaum) {
            // 2) Task delegated to Jung Daeum (정다음 사원)
            assignedMemberId = 'daum';
            assignedMemberIds = ['daum'];
            isSelf = false;
            schedStatus = 'requested';
            schedApproverId = 'daum';
          } else if (isDelegatedToYoonhee) {
            // 3) Task delegated to Jung Yoonhee (정윤희 부장)
            assignedMemberId = 'sh';
            assignedMemberIds = ['sh'];
            isSelf = false;
            schedStatus = 'requested';
            schedApproverId = 'sh';
          } else if (parsed.isAll) {
            // 4) All team members (팀 전체 일정 / 회식 / 전체 회의 등 - 팀원들의 수락을 받도록 requested 상태로 생성)
            assignedMemberIds = activeTeam.map(m => m.id);
            assignedMemberId = actingUser.id;
            isSelf = false;
            schedStatus = 'requested';
            schedApproverId = null;
          } else if (parsed.memberId && parsed.memberId !== actingUser.id) {
            // 5) Explicitly delegated to another colleague (타인 배정 일정은 항상 수락 대기)
            assignedMemberId = parsed.memberId;
            assignedMemberIds = [parsed.memberId];
            isSelf = false;
            schedStatus = 'requested';
            schedApproverId = parsed.memberId;
          } else {
            // 6) Normal personal schedule of the logged-in user (본인 개인 업무만 확정)
            assignedMemberId = actingUser.id;
            assignedMemberIds = [actingUser.id];
            isSelf = true;
            schedStatus = 'accepted';
            schedApproverId = null;
          }

          const finalDescription = parsed.description || '';
          const schedYear = parsed.year ? parseInt(parsed.year) : currentYear;
          const schedMonth = parsed.month ? parseInt(parsed.month) : currentMonth;

          let startHour = parsed.startHour;
          let endHour = parsed.endHour;

          if (/오후\s*반차/i.test(titleAndText)) {
            startHour = 14.0;
            endHour = 18.0;
          } else if (/오전\s*반차/i.test(titleAndText)) {
            startHour = 9.0;
            endHour = 14.0;
          } else if (/반차/i.test(titleAndText) && !/오전/i.test(titleAndText)) {
            startHour = 14.0;
            endHour = 18.0;
          } else if (/연차|휴가|병가/i.test(parsed.title || '')) {
            startHour = 9.0;
            endHour = 18.0;
          }

          const newSchedule = {
            id: `s_${Date.now()}_${index}`,
            createdAt: batchCreatedAt,
            year: schedYear,
            month: schedMonth,
            memberId: assignedMemberId,
            memberIds: assignedMemberIds,
            title: parsed.title,
            startHour: startHour,
            endHour: endHour,
            color: randomColor,
            status: schedStatus,
            date: parsed.date,
            requesterId: actingUser.id,
            approverId: schedApproverId,
            isIssue: isItemIssue,
            description: parsed.groupId 
              ? `[YM:${schedYear}.${schedMonth < 10 ? '0' : ''}${schedMonth}] [그룹 ID] ${parsed.groupId} | ${finalDescription}` 
              : `[YM:${schedYear}.${schedMonth < 10 ? '0' : ''}${schedMonth}] ${finalDescription}`,
          };          newSchedules.push(newSchedule);
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
                description: finalDescription,
                isIssue: sched.isIssue
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
              description: finalDescription,
              isIssue: sched.isIssue
            });
          }
        });

        let replyDetails = '';
        groupedForReply.forEach((group, index) => {
          let displayAssigneeText = '';
          if (group.memberIds.length === activeTeam.length) {
            displayAssigneeText = '전체 인원';
            if (group.status === 'requested') displayAssigneeText += ' (요청됨)';
          } else if (group.memberIds.length > 1) {
            const names = group.memberIds.map(id => {
              const m = activeTeam.find(teamMember => teamMember.id === id);
              const mName = m ? m.name : id;
              if (group.status === 'requested' && id !== actingUser.id && (id === 'sh' || id === 'yoonhee' || id === 'sangmoo')) {
                return `${mName} (요청됨)`;
              }
              return mName;
            });
            displayAssigneeText = names.join(', ');
          } else {
            const assignedMember = activeTeam.find(m => m.id === group.memberId) || actingUser;
            displayAssigneeText = assignedMember.name;
            if (group.status === 'requested' && (group.isPersonalLeave || group.approverId)) {
              displayAssigneeText += ' (요청됨)';
            }
          }
          
          group.items.sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            if (a.month !== b.month) return a.month - b.month;
            return a.date - b.date;
          });

          let dateStr = '';
          if (group.items.length === 1) {
            const it = group.items[0];
            dateStr = `${it.year}.${it.month < 10 ? '0' : ''}${it.month}.${it.date < 10 ? '0' : ''}${it.date}`;
          } else {
            const first = group.items[0];
            const last = group.items[group.items.length - 1];
            const m1 = first.month < 10 ? `0${first.month}` : `${first.month}`;
            const d1 = first.date < 10 ? `0${first.date}` : `${first.date}`;
            const m2 = last.month < 10 ? `0${last.month}` : `${last.month}`;
            const d2 = last.date < 10 ? `0${last.date}` : `${last.date}`;
            dateStr = `${first.year}.${m1}.${d1} ~ ${last.year}.${m2}.${d2} (총 ${group.items.length}일)`;
          }

          const cleanDesc = (group.description || '')
            .split('\n')
            .map(l => l.replace(/^[-•*\s]+/, '').trim())
            .filter(Boolean)
            .join(', ');

          const labelType = group.isIssue ? '이슈' : '일정';
          const detailLine = cleanDesc && cleanDesc !== '없음' ? `\n상세 ${cleanDesc}` : '';
          replyDetails += `\n${index + 1}. ${labelType}: "${group.title}"${detailLine}\n담당 ${displayAssigneeText}\n날짜 ${dateStr}\n시간 ${formatHour(group.startHour)} ~ ${formatHour(group.endHour)}\n`;
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

        // Also push a dashboard feed card so Dashboard shows this registration too (only when NOT from dashboard)
        if (!skipDashboardFeed && savedSchedules.length > 0) {
          const now = new Date();
          const timeDisplay = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
          const text = (textInput || '').trim();
          const hasVacation = /반차|연차|휴가|병가|조퇴/i.test(text);
          const hasMeeting = /회의|미팅|리뷰|브리핑/i.test(text);
          const hasIssueInText = /에러|버그|장애|디버깅|긴급|이슈/i.test(text);
          const hasRequest = /요청|부탁|신청|컨펌|검토/i.test(text);

          const primaryType = hasIssueInText ? 'issue' : hasVacation ? 'vacation' : hasMeeting ? 'meeting' : 'work';

          const badges = savedSchedules.map((s, i) => {
            const isVac = /반차|연차|휴가|병가/i.test(s.title || '') || s.category === '휴가';
            const isMtg = /회의|미팅|리뷰|브리핑/i.test(s.title || '') || s.category === '회의';
            const isIss = s.isIssue || s.category === '이슈' || /에러|버그|장애|디버깅/i.test(s.title || '');
            return {
              id: `b_${s.id}_${i}`,
              type: isIss ? 'issue' : isVac ? 'vacation' : isMtg ? 'meeting' : 'work',
              label: isIss ? `🚨 ${s.title}` : (isVac ? `🏖️ ${s.title}` : (isMtg ? `🤝 ${s.title}` : `📄 ${s.title}`)),
              category: isIss ? '이슈' : (isVac ? '휴가' : (isMtg ? '회의' : '일반'))
            };
          });

          let targetUserId = 'sangmoo';
          let targetUserName = '조상무';
          let targetUserRole = '상무';

          const reqSchedule = savedSchedules.find(s => s.status === 'requested' || s.isRequested);
          if (reqSchedule && reqSchedule.approverId) {
            const approverMember = TEAM.find(m => m.id === reqSchedule.approverId || (reqSchedule.approverId === 'sangmu' && m.id === 'sangmoo') || (reqSchedule.approverId === 'yoonhee' && m.id === 'sh') || (reqSchedule.approverId === 'daeum' && m.id === 'daum'));
            if (approverMember) {
              targetUserId = approverMember.id;
              targetUserName = approverMember.name;
              targetUserRole = approverMember.role;
            }
          } else if (hasVacation || /조상무|상무님|상무/i.test(text)) {
            targetUserId = 'sangmoo';
            targetUserName = '조상무';
            targetUserRole = '상무';
          } else if (/정윤희|정부장|부장님|윤희/i.test(text)) {
            targetUserId = 'sh';
            targetUserName = '정윤희';
            targetUserRole = '부장';
          } else if (/정다음|다음/i.test(text)) {
            targetUserId = 'daum';
            targetUserName = '정다음';
            targetUserRole = '사원';
          } else {
            if (actingUser.id === 'daum') {
              targetUserId = hasVacation ? 'sangmoo' : 'sh';
              targetUserName = hasVacation ? '조상무' : '정윤희';
              targetUserRole = hasVacation ? '상무' : '부장';
            } else {
              targetUserId = 'sangmoo';
              targetUserName = '조상무';
              targetUserRole = '상무';
            }
          }

          const vacSchedule = savedSchedules.find(s => (/반차|연차|휴가|병가/i.test(s.title || '') || s.category === '휴가'));
          const vacDate = vacSchedule ? `${vacSchedule.year}.${String(vacSchedule.month).padStart(2, '0')}.${String(vacSchedule.date).padStart(2, '0')}` : `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;

          let vacType = '업무 요청';
          if (vacSchedule) {
            vacType = vacSchedule.title;
          } else if (hasVacation) {
            vacType = text.includes('오전') ? '오전 반차' : (text.includes('오후') ? '오후 반차' : '휴가');
          }

          const newFeed = {
            id: `feed_${Date.now()}`,
            authorId: actingUser.id,
            authorName: actingUser.name,
            authorRole: actingUser.role,
            authorAvatarPic: actingUser.avatarPic || '/pic1_thumb.png',
            authorColor: actingUser.color || '#000000',
            createdAt: now.toISOString(),
            timeDisplay,
            type: primaryType,
            content: text,
            aiBadges: badges,
            vacationInfo: (hasVacation || hasRequest || vacSchedule) ? {
              type: vacType,
              date: vacDate,
              status: 'pending',
              approverName: targetUserName,
              approverRole: targetUserRole,
              targetUserId: targetUserId,
              requesterId: actingUser.id,
              requesterName: actingUser.name,
              approvedAt: null
            } : null,
            likes: 0,
            hasLiked: false,
            cheers: 0,
            hasCheered: false,
            comments: []
          };

          setFeeds(prev => {
            const next = [newFeed, ...prev];
            try { localStorage.setItem('zal_feeds_v2', JSON.stringify(next)); } catch (_) {}
            return next;
          });
        }

        const hasIssues = groupedForReply.some(g => g.isIssue);
        if (hasIssues) {
          const issueSummaryLines = groupedForReply
            .filter(g => g.isIssue)
            .map(g => {
              const desc = (g.description || '').replace(/^[-•*\s]+/, '').trim();
              return desc && desc !== '없음' ? `• ${g.title}: ${desc}` : `• ${g.title}`;
            });
          if (issueSummaryLines.length > 0) {
            setDailyIssueText(prev => {
              const added = issueSummaryLines.join('\n');
              return prev && prev.trim() && prev.trim() !== '특이사항 없음 (또는 이슈 내용 입력)' ? `${prev}\n${added}` : added;
            });
          }
        }

        const issueCount = groupedForReply.filter(g => g.isIssue).length;
        const scheduleCount = groupedForReply.filter(g => !g.isIssue).length;

        let aiReplyHeader = '메시지를 분석하여 ';
        if (issueCount > 0 && scheduleCount > 0) {
          aiReplyHeader += `이슈 ${issueCount}건, 일정 ${scheduleCount}건 등록해 드렸습니다!`;
        } else if (issueCount > 0) {
          aiReplyHeader += `이슈 ${issueCount}건 등록해 드렸습니다!`;
        } else if (scheduleCount > 0) {
          aiReplyHeader += `일정 ${scheduleCount}건 등록해 드렸습니다!`;
        } else {
          aiReplyHeader += `일정을 등록해 드렸습니다!`;
        }

        const aiReply = newSchedules.length > 0 
          ? `${aiReplyHeader}\n${replyDetails}`
          : `입력해주신 내용에서 일정을 추출하지 못했습니다. 날짜나 업무 내용을 좀 더 명확히 작성해 주세요!`;

        const aiMsg = { id: msgId.current++, from: `ai_${userSuffix}_${ME.id}`, text: aiReply, time: formatTime(new Date()), createdAt: new Date().toISOString() };
        
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
        const errMsg = { id: msgId.current++, from: `ai_${userSuffix}_${ME.id}`, text: errReply, time: formatTime(new Date()), createdAt: new Date().toISOString() };
        setMessages(prev => [...prev, errMsg]);
      } finally {
        setIsTyping(false);
      }
    };

    if (isConfigured) {
      return appwriteService.createMessage(userMsg)
        .then(() => proceedWithAI())
        .catch((err) => {
          console.error("Appwrite failed to create user message:", err);
          return proceedWithAI();
        });
    } else {
      return proceedWithAI();
    }
  };

  const handleSend = () => {
    processMessageAndCreateSchedule(input, ME);
    setInput('');
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

  const handleDashboardAddSchedule = async (text, user, targetDateObj) => {
    let targetD = selectedDate;
    let targetM = currentMonth;
    let targetY = currentYear;
    if (targetDateObj instanceof Date && !isNaN(targetDateObj.getTime())) {
      targetD = targetDateObj.getDate();
      targetM = targetDateObj.getMonth() + 1;
      targetY = targetDateObj.getFullYear();
    }
    return await processMessageAndCreateSchedule(text, user || ME, false, targetD, targetM, targetY);
  };

  const handleOpenScheduleDetailFromDashboard = (itemOrFeed) => {
    if (!itemOrFeed) return;
    
    // 0. Use matchedSchedule directly if available
    let targetSched = itemOrFeed.matchedSchedule;

    // 1. Direct ID lookup in schedules array
    if (!targetSched) {
      targetSched = schedules.find(s => 
        s.id === itemOrFeed.id || 
        s.id === itemOrFeed.scheduleId || 
        s.id === itemOrFeed.feedId ||
        s.id === `sched_feed_${itemOrFeed.id}` ||
        `sched_feed_${s.id}` === itemOrFeed.id ||
        (itemOrFeed.id && String(itemOrFeed.id).endsWith(String(s.id)))
      );
    }
    
    // 2. Exact or fuzzy match in schedules array
    if (!targetSched) {
      const itemTitle = (itemOrFeed.title || itemOrFeed.content || '').replace(/^[🏖️🚨🤝📋📄⚡\s]+/, '').replace(/\s*\(\d{4}\.\d{2}\.\d{2}\)$/, '').trim();
      const authorId = itemOrFeed.authorId || itemOrFeed.memberId;

      targetSched = schedules.find(s => {
        if (!s.title) return false;
        const sTitle = s.title.replace(/^[🏖️🚨🤝📋📄⚡\s]+/, '').trim();
        const authorMatch = !authorId || s.memberId === authorId || s.requesterId === authorId;
        if (authorMatch && (itemTitle.includes(sTitle) || sTitle.includes(itemTitle))) {
          return true;
        }
        return false;
      });
    }

    // 3. If found in real schedules array, pass that exact schedule to openDetailModal
    if (targetSched) {
      setDashboardFeedId(itemOrFeed.feedId || itemOrFeed.id || (itemOrFeed.feed ? itemOrFeed.feed.id : null));
      openDetailModal(targetSched);
      return;
    }

    // 4. Fallback fallback only if not found in schedules array
    const isVac = /반차|연차|휴가|병가/i.test(itemOrFeed.title || itemOrFeed.content || '');
    const isIss = /이슈|에러|장애|오류|버그|디버깅/i.test(itemOrFeed.title || itemOrFeed.content || '');
    const isMtg = /회의|미팅|리뷰|브리핑/i.test(itemOrFeed.title || itemOrFeed.content || '');
    
    const authorId = itemOrFeed.authorId || itemOrFeed.memberId || ME.id;
    const cleanTitle = (itemOrFeed.title || itemOrFeed.content || '일정').replace(/^[🏖️🚨🤝📋📄⚡\s]+/, '').trim();
    
    const fallbackSched = {
      id: itemOrFeed.id || `sched_dash_sync_${Date.now()}`,
      feedId: itemOrFeed.feedId || itemOrFeed.id || (itemOrFeed.feed ? itemOrFeed.feed.id : null),
      title: cleanTitle || '일정',
      date: selectedDate || new Date().getDate(),
      month: currentMonth || (new Date().getMonth() + 1),
      year: currentYear || new Date().getFullYear(),
      startHour: itemOrFeed.start || 9.0,
      endHour: itemOrFeed.end || 18.0,
      memberId: authorId,
      memberIds: [authorId],
      isRequested: itemOrFeed.vacationInfo?.status === 'pending' || false,
      approverId: itemOrFeed.vacationInfo?.targetUserId || (isVac ? 'sangmoo' : null),
      status: itemOrFeed.vacationInfo?.status === 'pending' ? 'requested' : (itemOrFeed.vacationInfo?.status === 'approved' ? 'accepted' : (itemOrFeed.vacationInfo?.status === 'rejected' ? 'rejected' : 'accepted')),
      category: isVac ? '휴가' : isIss ? '이슈' : (isMtg ? '회의' : '일반'),
      color: isIss ? 'red' : isVac ? 'orange' : (isMtg ? 'purple' : 'blue'),
      description: itemOrFeed.content || itemOrFeed.description || itemOrFeed.title || '',
      createdAt: itemOrFeed.createdAt || new Date().toISOString()
    };

    setDashboardFeedId(itemOrFeed.feedId || itemOrFeed.id || (itemOrFeed.feed ? itemOrFeed.feed.id : null));
    openDetailModal(fallbackSched);
  };

  const openAddModal = (member = null, hour = 9, date = null, month = null, year = null) => {
    const targetYear = year || currentYear;
    const targetMonth = month || currentMonth;
    const targetDate = date || selectedDate;
    const targetMember = member || (activeTeam.length > 0 ? activeTeam[0] : ME);

    setModalMember(targetMember);
    setAddTitle('');
    setAddMemberIds(targetMember ? [targetMember.id] : ['sh']);
    setAddStartHour(hour);
    setAddEndHour(Math.min(hour + 1, 19.5));

    const fmt = (y, m, d) => `${y}-${m < 10 ? '0' : ''}${m}-${d < 10 ? '0' : ''}${d}`;
    const dateStr = fmt(targetYear, targetMonth, targetDate);
    setAddStartDateStr(dateStr);
    setAddEndDateStr(dateStr);
    setAddDetail('');
    setAddMemo('');
    setAddProgress(0);

    setIsModalOpen(true);
  };

  const saveManualSchedule = async () => {
    if (!addTitle.trim()) {
      showLayerAlert('일정명을 입력해 주세요.', '일정명 입력 필요', 'error');
      return;
    }
    if (addMemberIds.length === 0) {
      showLayerAlert('최소 한 명 이상의 담당자를 지정해야 합니다.', '담당자 지정 필요', 'error');
      return;
    }
    if (!addStartDateStr || !addEndDateStr) {
      showLayerAlert('시작일과 종료일을 지정해야 합니다.', '날짜 지정 필요', 'error');
      return;
    }
    if (addStartDateStr > addEndDateStr) {
      showLayerAlert('시작일은 종료일보다 이전이어야 합니다.', '날짜 오류', 'error');
      return;
    }

    setIsSavingEvent(true);
    try {
      await new Promise(r => setTimeout(r, 450));
      const dStart = new Date(addStartDateStr + 'T00:00:00');
      const dEnd = new Date(addEndDateStr + 'T00:00:00');
      
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

      const isAssignedToSelfOnly = addMemberIds.length === 1 && addMemberIds.includes('sh');
      const newStatus = isAssignedToSelfOnly ? 'accepted' : 'requested';
      const newRequesterId = 'sh';

      const newGroupId = dateList.length > 1 ? `g_${Date.now()}_${Math.floor(Math.random() * 1000)}` : null;
      const colors = ['purple', 'blue', 'green', 'orange'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      const createdSchedules = [];
      for (let idx = 0; idx < dateList.length; idx++) {
        const item = dateList[idx];
        const newDesc = formatScheduleDescription(newGroupId, addDetail.trim(), addMemo.trim(), item.year, item.month, addProgress, addCategory);

        const schedObj = {
          id: `s_${Date.now()}_${idx}`,
          year: item.year,
          month: item.month,
          date: item.date,
          title: addTitle.trim(),
          category: addCategory,
          isIssue: addCategory === '이슈',
          memberIds: addMemberIds,
          memberId: addMemberIds[0],
          startHour: parseFloat(addStartHour),
          endHour: parseFloat(addEndHour),
          color: randomColor,
          description: newDesc,
          progress: addProgress,
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

      setSchedules(prev => [...prev, ...createdSchedules]);
      setIsModalOpen(false);
    } finally {
      setIsSavingEvent(false);
    }
  };

  const getAddEndHourOptions = () => {
    const options = [];
    for (let h = parseFloat(addStartHour) + 0.5; h <= 19.5; h += 0.5) {
      options.push(h);
    }
    return options;
  };

  const filteredMembers = activeTeam
    .filter(m => {
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;
      return m.name.toLowerCase().includes(query) || m.role.toLowerCase().includes(query);
    })
    .slice()
    .sort((a, b) => {
      if (a.id === ME.id || a.name === ME.name) return -1;
      if (b.id === ME.id || b.name === ME.name) return 1;
      return 0;
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
      <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', fontFamily: 'sans-serif' }}>
        {/* ──── LEFT SIDE: BRANDING & FEATURE CARDS & CHARACTER ─────────────────── */}
        <div style={{ 
          flex: '1 1 60%', 
          backgroundColor: '#ffffff', 
          padding: '80px 64px 40px 64px', 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'center', 
          alignItems: 'center',
          position: 'relative', 
          overflow: 'hidden' 
        }}>
          {/* Top Branding Header (Fixed at top-left) */}
          <div style={{ position: 'absolute', top: '36px', left: '64px', display: 'flex', alignItems: 'center', gap: '10px', zIndex: 10 }}>
            <img src="/ci.png" alt="다음정보시스템즈 CI" style={{ width: '282px', height: '64px', objectFit: 'contain', objectPosition: 'left center' }} />
          </div>

          {/* Center Main Copy & Features (Shifted 110px right, 185px upwards) */}
          <div style={{ maxWidth: '520px', width: '100%', margin: 'auto 0', transform: 'translate(110px, -185px)', position: 'relative', zIndex: 10 }}>
            <h1 style={{ fontSize: '56px', fontWeight: '900', lineHeight: '1.20', color: '#0f172a', letterSpacing: '-1.8px', margin: 0 }}>
              업무 보고,<br />
              <span style={{ position: 'relative', display: 'inline-block', zIndex: 1 }}>
                10초에
                <span style={{ 
                  position: 'absolute', 
                  bottom: '4px', 
                  left: 0, 
                  right: 0, 
                  height: '18px', 
                  backgroundColor: '#facc15', 
                  zIndex: -1, 
                  borderRadius: '3px' 
                }}></span>
              </span>
              {' '}완료!
            </h1>
            <p style={{ fontSize: '18px', color: '#64748b', fontWeight: '600', marginTop: '16px', marginBottom: '32px' }}>
              대화하듯 툭 던지면 보고서까지 한 번에 끝납니다.
            </p>

            {/* 3 Clean Feature Highlight Items (16px titles / 14px descriptions / Tighter Spacing) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
              {/* Feature 1 */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{ 
                  width: '40px', 
                  height: '40px', 
                  borderRadius: '12px', 
                  backgroundColor: '#f1f5f9', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontSize: '19px',
                  flexShrink: 0
                }}>
                  💬
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', lineHeight: '1.25' }}>AI 대화형 간편 입력</div>
                  <div style={{ fontSize: '14px', color: '#64748b', fontWeight: '500', marginTop: '2px', lineHeight: '1.35' }}>번거로운 양식 없이 메신저 하듯 AI와 대화하면 끝</div>
                </div>
              </div>

              {/* Feature 2 */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{ 
                  width: '40px', 
                  height: '40px', 
                  borderRadius: '12px', 
                  backgroundColor: '#f1f5f9', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontSize: '19px',
                  flexShrink: 0
                }}>
                  📊
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', lineHeight: '1.25' }}>실시간 팀 통합 대시보드</div>
                  <div style={{ fontSize: '14px', color: '#64748b', fontWeight: '500', marginTop: '2px', lineHeight: '1.35' }}>대화 한마디로 팀 캘린더와 업무 피드가 즉시 동기화</div>
                </div>
              </div>

              {/* Feature 3 */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{ 
                  width: '40px', 
                  height: '40px', 
                  borderRadius: '12px', 
                  backgroundColor: '#f1f5f9', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontSize: '19px',
                  flexShrink: 0
                }}>
                  📑
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', lineHeight: '1.25' }}>일·주·월간 보고서 자동 생성</div>
                  <div style={{ fontSize: '14px', color: '#64748b', fontWeight: '500', marginTop: '2px', lineHeight: '1.35' }}>대화 속 일정을 분석·등록하고, 자동 분류해 완성하는 업무 보고서</div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom 3D Mascot Character Graphic with Ground Feet Shadow (Shifted 55px right) */}
          <div style={{ 
            position: 'absolute', 
            bottom: 0, 
            left: 0, 
            right: 0, 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'flex-end',
            transform: 'translateX(55px)',
            pointerEvents: 'none', 
            zIndex: 1 
          }}>
            {/* Soft Oval Ground Shadow under feet */}
            <div style={{ 
              position: 'absolute', 
              bottom: '4px', 
              width: '540px', 
              height: '24px', 
              borderRadius: '50%', 
              backgroundColor: 'rgba(15, 23, 42, 0.22)', 
              filter: 'blur(10px)', 
              zIndex: 0 
            }} />

            <img 
              src="/bi_cc.png" 
              alt="잘됨이 마스코트" 
              style={{ 
                maxWidth: '640px', 
                width: '100%',
                height: 'auto', 
                maxHeight: '440px', 
                objectFit: 'contain',
                objectPosition: 'bottom center',
                display: 'block',
                filter: 'drop-shadow(0 12px 14px rgba(0, 0, 0, 0.12))',
                position: 'relative',
                zIndex: 1
              }} 
            />
          </div>
        </div>

        {/* ──── RIGHT SIDE: LOGIN PANEL (460px WIDTH, 100vh FULL HEIGHT BOX WITH SHADOW) ─────────────────── */}
        <div style={{ 
          flex: '1 1 40%', 
          backgroundColor: '#ffffff', 
          height: '100vh',
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          position: 'relative',
          zIndex: 10
        }}>
          {/* Card Box (Fixed 460px width, 100vh full height, shifted 200px to the left) */}
          <div style={{ 
            width: '100%', 
            maxWidth: '460px', 
            height: '100vh',
            backgroundColor: '#ffffff', 
            padding: '40px 42px', 
            boxShadow: '0 0 50px rgba(15, 23, 42, 0.09), -12px 0 30px rgba(0, 0, 0, 0.04)', 
            borderLeft: '1px solid #f1f5f9',
            borderRight: '1px solid #f1f5f9',
            transform: 'translate(-200px, -30px)',
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            justifyContent: 'center' 
          }}>
            
            {/* Header Switcher: Sign Up vs Log In */}
            {isSignUp ? (
              /* ──── SIGN UP HEADER (시작하기) ─────────────────── */
              <div style={{ width: '100%', marginBottom: '20px', textAlign: 'left' }}>
                {/* Back Arrow Button */}
                <button 
                  type="button" 
                  onClick={() => {
                    if (signUpStep === 2) {
                      setSignUpStep(1);
                      setAuthError('');
                    } else {
                      setIsSignUp(false);
                      setSignUpStep(1);
                      setAuthError('');
                    }
                  }}
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    cursor: 'pointer', 
                    padding: 0, 
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    color: '#0f172a',
                    transition: 'transform 0.15s ease'
                  }}
                  title={signUpStep === 2 ? "1단계로 돌아가기" : "로그인으로 돌아가기"}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"></line>
                    <polyline points="12 19 5 12 12 5"></polyline>
                  </svg>
                </button>

                {/* Title: 시작하기 with Yellow Underline Accent */}
                <h2 style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', margin: 0, letterSpacing: '-0.8px', lineHeight: '1.2' }}>
                  <span style={{ position: 'relative', display: 'inline-block', zIndex: 1 }}>
                    시작하기
                    <span style={{ 
                      position: 'absolute', 
                      bottom: '2px', 
                      left: 0, 
                      right: 0, 
                      height: '14px', 
                      backgroundColor: '#facc15', 
                      zIndex: -1,
                      borderRadius: '2px'
                    }}></span>
                  </span>
                </h2>

                {/* Subtitle */}
                <p style={{ fontSize: '16px', color: '#64748b', fontWeight: '500', marginTop: '6px', margin: 0, letterSpacing: '-0.3px' }}>
                  {signUpStep === 1 ? '회사 이메일 계정 및 소속 정보를 입력합니다.' : '참여 프로젝트를 선택해 주세요.'}
                </p>
              </div>
            ) : (
              /* ──── LOGIN HEADER (반가워요!) ─────────────────── */
              <div style={{ display: 'flex', alignItems: 'center', gap: '0px', width: '100%', marginBottom: '12px', marginLeft: '-82px' }}>
                <img 
                  src="/bi_aa.png" 
                  alt="잘됨이 로고" 
                  style={{ 
                    width: '194px', 
                    height: '194px', 
                    objectFit: 'contain', 
                    flexShrink: 0 
                  }} 
                />
                <div style={{ textAlign: 'left', marginLeft: '-38px' }}>
                  <h2 style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', margin: 0, letterSpacing: '-0.5px', lineHeight: '1.2' }}>
                    <span style={{ position: 'relative', display: 'inline-block' }}>
                      반가워요!
                      <span style={{ position: 'absolute', bottom: '2px', left: 0, right: 0, height: '8px', backgroundColor: '#facc15', zIndex: -1 }}></span>
                    </span>
                  </h2>
                  <p style={{ fontSize: '24px', color: '#64748b', fontWeight: '500', marginTop: '4px', margin: 0, letterSpacing: '-0.5px', lineHeight: '1.25', whiteSpace: 'nowrap' }}>
                    잘됨이와 스마트한 하루!
                  </p>
                </div>
              </div>
            )}

            {/* Login / Sign Up Form */}
            <form onSubmit={isSignUp ? (signUpStep === 1 ? handleNextSignUpStep : handleSignUp) : handleLogIn} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              
              {/* ──── SIGN UP STEP 1: Name, Department & Rank, Email, Password ──── */}
              {isSignUp && signUpStep === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                  {/* Name Input Field */}
                  <div style={{ height: '60px', backgroundColor: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '16px', padding: '0 18px', display: 'flex', alignItems: 'center' }}>
                    <input 
                      type="text" 
                      placeholder="이름 (실명입력)" 
                      value={authName} 
                      onChange={(e) => setAuthName(e.target.value)} 
                      style={{ width: '100%', border: 'none', outline: 'none', fontSize: '15px', fontWeight: '600', color: '#0f172a', background: 'transparent' }}
                      required
                    />
                  </div>

                  {/* Department & Rank Custom Dropdowns in ONE Row */}
                  <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                    <CustomDropdown
                      placeholder="부서 선택"
                      value={authDepartment}
                      options={['관리', '개발', '신사업']}
                      onChange={(dept) => setAuthDepartment(dept)}
                    />

                    <CustomDropdown
                      placeholder="직급 선택"
                      value={authRole}
                      options={['사원', '대리', '과장', '차장', '부장', '이사', '상무', '전무', '대표']}
                      onChange={(rank) => setAuthRole(rank)}
                      width="120px"
                    />
                  </div>

                  {/* Email Input Field */}
                  <div style={{ 
                    height: '60px',
                    backgroundColor: '#ffffff', 
                    border: '1.5px solid #e2e8f0', 
                    borderRadius: '16px', 
                    padding: '0 18px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    transition: 'border-color 0.15s ease'
                  }}>
                    <input 
                      type="text" 
                      placeholder="회사메일 아이디 입력" 
                      value={authEmailId} 
                      onChange={(e) => setAuthEmailId(e.target.value)} 
                      style={{ flex: 1, border: 'none', outline: 'none', fontSize: '15px', fontWeight: '600', color: '#0f172a', background: 'transparent' }}
                      required
                    />
                    <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: '700', marginLeft: '8px' }}>
                      @daumit.net
                    </span>
                  </div>

                  {/* Password Input Field */}
                  <div style={{ 
                    height: '60px',
                    backgroundColor: '#ffffff', 
                    border: '1.5px solid #e2e8f0', 
                    borderRadius: '16px', 
                    padding: '0 18px',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'border-color 0.15s ease'
                  }}>
                    <input 
                      type="password" 
                      placeholder="패스워드입력" 
                      value={authPassword} 
                      onChange={(e) => setAuthPassword(e.target.value)} 
                      style={{ width: '100%', border: 'none', outline: 'none', fontSize: '15px', fontWeight: '600', color: '#0f172a', background: 'transparent' }}
                      required
                    />
                  </div>
                </div>
              )}

              {/* ──── SIGN UP STEP 2: Project Button List ──── */}
              {isSignUp && signUpStep === 2 && (() => {
                const projectOptions = [
                  '신영증권 외화표시펀드 매매 시스템 구축',
                  '삼성증권 연금 고객중심 서비스 개선',
                  'NH투자증권 퇴직연금시스템 운영',
                  '경찰공제회 시스템 유지보수',
                  '대신증권 연금 경쟁력 강화',
                  '다음 D-RPS 고도화'
                ];
                const isAllSelected = projectOptions.every(p => authProject.includes(p));

                const handleToggleAll = () => {
                  if (isAllSelected) {
                    setAuthProject([]);
                  } else {
                    setAuthProject([...projectOptions]);
                  }
                };

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                    {/* Project Selection Button List Header with Select All Checkbox */}
                    <div style={{ marginTop: '2px', width: '100%' }}>
                      <div 
                        onClick={handleToggleAll} 
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 8px 2px', cursor: 'pointer', userSelect: 'none' }}
                      >
                        {/* Custom Select All Checkbox Icon */}
                        <div style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '6px',
                          backgroundColor: isAllSelected ? '#000000' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          transition: 'all 0.15s ease'
                        }}>
                          <svg 
                            width={isAllSelected ? "14" : "18"} 
                            height={isAllSelected ? "14" : "18"} 
                            viewBox="0 0 24 24" 
                            fill="none" 
                            stroke={isAllSelected ? "#ffffff" : "#94a3b8"} 
                            strokeWidth={isAllSelected ? "3.5" : "3"} 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </div>

                        <span style={{ fontSize: '13.5px', fontWeight: '700', color: '#334155' }}>
                          프로젝트 선택 <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '500' }}>(복수 선택 가능)</span>
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                        {[
                          ...projectOptions,
                          '해당없음'
                        ].map((proj) => {
                          const isSelected = authProject.includes(proj);
                          return (
                            <button
                              key={proj}
                              type="button"
                              onClick={() => {
                                if (proj === '해당없음') {
                                  setAuthProject(authProject.includes('해당없음') ? [] : ['해당없음']);
                                } else {
                                  const filtered = authProject.filter(p => p !== proj && p !== '해당없음');
                                  if (authProject.includes(proj)) {
                                    setAuthProject(filtered);
                                  } else {
                                    setAuthProject([...filtered, proj]);
                                  }
                                }
                              }}
                              style={{
                                width: '100%',
                                height: '60px',
                                padding: '0 18px',
                                borderRadius: '16px',
                                border: isSelected ? '2px solid #000000' : '1.5px solid #e2e8f0',
                                backgroundColor: '#ffffff',
                                color: isSelected ? '#0f172a' : '#334155',
                                fontSize: '14.5px',
                                fontWeight: isSelected ? '800' : '600',
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.15s ease',
                                boxSizing: 'border-box'
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc';
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) e.currentTarget.style.backgroundColor = '#ffffff';
                              }}
                            >
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '8px' }}>
                                {proj}
                              </span>
                              {isSelected && (
                                <span style={{ fontWeight: '900', color: '#000000', fontSize: '16px', flexShrink: 0 }}>✓</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ──── LOGIN MODE FIELDS ──── */}
              {!isSignUp && (
                <>
                  {/* Email Input Field */}
                  <div style={{ 
                    height: '60px',
                    backgroundColor: '#ffffff', 
                    border: '1.5px solid #e2e8f0', 
                    borderRadius: '16px', 
                    padding: '0 18px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    transition: 'border-color 0.15s ease'
                  }}>
                    <input 
                      type="text" 
                      placeholder="아이디 입력" 
                      value={authEmailId} 
                      onChange={(e) => setAuthEmailId(e.target.value)} 
                      style={{ flex: 1, border: 'none', outline: 'none', fontSize: '15px', fontWeight: '600', color: '#0f172a', background: 'transparent' }}
                      required
                    />
                    <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: '700', marginLeft: '8px' }}>
                      @daumit.net
                    </span>
                  </div>

                  {/* Password Input Field */}
                  <div style={{ 
                    height: '60px',
                    backgroundColor: '#ffffff', 
                    border: '1.5px solid #e2e8f0', 
                    borderRadius: '16px', 
                    padding: '0 18px',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'border-color 0.15s ease'
                  }}>
                    <input 
                      type="password" 
                      placeholder="패스워드입력" 
                      value={authPassword} 
                      onChange={(e) => setAuthPassword(e.target.value)} 
                      style={{ width: '100%', border: 'none', outline: 'none', fontSize: '15px', fontWeight: '600', color: '#0f172a', background: 'transparent' }}
                      required
                    />
                  </div>

                  {/* Auto Login Checkbox */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', paddingLeft: '2px' }}>
                    <input 
                      type="checkbox" 
                      id="auto-login" 
                      defaultChecked 
                      style={{ 
                        width: '18px', 
                        height: '18px', 
                        accentColor: '#000000', 
                        cursor: 'pointer' 
                      }} 
                    />
                    <label htmlFor="auto-login" style={{ fontSize: '13.5px', color: '#334155', fontWeight: '700', cursor: 'pointer', userSelect: 'none' }}>
                      자동로그인
                    </label>
                  </div>
                </>
              )}

              {/* Error Message */}
              {authError && (
                <p style={{ color: '#ef4444', fontSize: '13px', fontWeight: '600', margin: '2px 0 0 0', textAlign: 'center' }}>
                  {authError}
                </p>
              )}

              {/* Primary Action Button */}
              {isSignUp ? (
                signUpStep === 1 ? (
                  <button 
                    type="button" 
                    onClick={handleNextSignUpStep}
                    style={{ 
                      width: '100%', 
                      height: '68px', 
                      backgroundColor: '#000000', 
                      color: '#ffffff', 
                      border: 'none', 
                      borderRadius: '16px', 
                      fontSize: '18px', 
                      fontWeight: '800', 
                      cursor: 'pointer', 
                      marginTop: '6px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#18181b'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#000000'}
                  >
                    다음
                  </button>
                ) : (
                  <button 
                    type="submit" 
                    style={{ 
                      width: '100%', 
                      height: '68px', 
                      backgroundColor: '#000000', 
                      color: '#ffffff', 
                      border: 'none', 
                      borderRadius: '16px', 
                      fontSize: '18px', 
                      fontWeight: '800', 
                      cursor: 'pointer', 
                      marginTop: '6px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#18181b'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#000000'}
                  >
                    인증 메일 발송하기
                  </button>
                )
              ) : (
                <button 
                  type="submit" 
                  style={{ 
                    width: '100%', 
                    height: '68px', 
                    backgroundColor: '#000000', 
                    color: '#ffffff', 
                    border: 'none', 
                    borderRadius: '16px', 
                    fontSize: '18px', 
                    fontWeight: '800', 
                    cursor: 'pointer', 
                    marginTop: '6px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#18181b'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#000000'}
                >
                  로그인
                </button>
              )}

              {/* Secondary Action Button (Only in Login Mode) */}
              {!isSignUp && (
                <button 
                  type="button" 
                  onClick={() => {
                    setIsSignUp(true);
                    setSignUpStep(1);
                    setAuthError('');
                  }}
                  style={{ 
                    width: '100%', 
                    height: '68px', 
                    backgroundColor: '#ffffff', 
                    color: '#0f172a', 
                    border: '1.5px solid #000000', 
                    borderRadius: '16px', 
                    fontSize: '18px', 
                    fontWeight: '800', 
                    cursor: 'pointer', 
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                >
                  오늘 처음이신가요?
                </button>
              )}
            </form>

            {/* Find Password Link (Only in Login Mode) */}
            {!isSignUp && (
              <div style={{ marginTop: '24px', textAlign: 'center' }}>
                <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '600', cursor: 'pointer', textDecoration: 'none' }}
                  onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                  onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                >
                  비밀번호 찾기
                </span>
              </div>
            )}
          </div>

          {/* Bottom Copyright */}
          <div style={{ position: 'absolute', bottom: '24px', textAlign: 'center', fontSize: '11.5px', color: '#94a3b8', fontWeight: '500' }}>
            © 다음정보시스템즈. All Rights Reserved.
          </div>

          {/* Transparent Click-Outside Overlay to close dropdown menu without screen dimming */}
          {activeSelectLayer && (
            <div 
              onClick={() => setActiveSelectLayer(null)}
              style={{ 
                position: 'fixed', 
                top: 0, 
                left: 0, 
                right: 0, 
                bottom: 0, 
                backgroundColor: 'transparent', 
                zIndex: 90 
              }}
            />
          )}

          {/* Bottom Right Floating Badge Buttons (ADMIN & Chat) */}
          <div style={{ position: 'absolute', bottom: '24px', right: '24px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
            <div style={{ 
              width: '38px', 
              height: '38px', 
              borderRadius: '50%', 
              backgroundColor: '#000000', 
              color: '#ffffff', 
              fontSize: '9px', 
              fontWeight: '900', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              cursor: 'pointer',
              boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
              letterSpacing: '-0.3px'
            }}>
              ADMIN
            </div>
            <div style={{ 
              width: '38px', 
              height: '38px', 
              borderRadius: '50%', 
              backgroundColor: '#000000', 
              color: '#ffffff', 
              fontSize: '18px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              cursor: 'pointer',
              boxShadow: '0 4px 10px rgba(0,0,0,0.15)'
            }}>
              💬
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout" style={{ display: 'flex', flexDirection: 'row', height: '100vh', width: '100vw', overflow: 'hidden', backgroundColor: '#ffffff' }}>
      
      {/* ──── LEFT SLIM NAVIGATION RAIL (56px) ──── */}
      <LeftNavRail 
        currentView={currentView} 
        onNavigate={navigateToView} 
        onResetData={() => {
          try {
            localStorage.clear();
            sessionStorage.clear();
          } catch (err) {}
          window.location.reload();
        }}
      />

      {/* ──── MAIN VIEW AREA: DASHBOARD VIEW ──── */}
      {currentView === 'dashboard' && (
        <Dashboard
          key={dashboardResetKey}
          currentUser={ME}
          displayUser={displayUser}
          parsedUser={parsedUser}
          teamMembers={TEAM}
          headerSelectedProject={headerSelectedProject}
          onSelectProject={setHeaderSelectedProject}
          schedules={schedules}
          setSchedules={setSchedules}
          feeds={feeds}
          setFeeds={setFeeds}
          selectedDate={selectedDate}
          currentMonth={currentMonth}
          currentYear={currentYear}
          calendarSelectedDate={new Date(currentYear, currentMonth - 1, selectedDate)}
          onSelectDate={(newDate) => {
            if (newDate instanceof Date && !isNaN(newDate.getTime())) {
              setSelectedDate(newDate.getDate());
              setCurrentMonth(newDate.getMonth() + 1);
              setCurrentYear(newDate.getFullYear());
            }
          }}
          onAddSchedule={handleDashboardAddSchedule}
          onOpenScheduleDetail={handleOpenScheduleDetailFromDashboard}
          onCancelSchedule={handleCancelSchedule}
          onApproveSchedule={handleApproveSchedule}
          onRejectSchedule={handleRejectSchedule}
          onResubmitSchedule={handleResubmitSchedule}
          onNavigateToSync={() => navigateToView('sync')}
          onSwitchUser={(userOrId) => {
            const targetUser = typeof userOrId === 'string' ? (TEAM.find(m => m.id === userOrId) || { id: userOrId, name: userOrId, role: '팀원' }) : userOrId;
            setVirtualUser(targetUser);
            showLayerAlert(`${targetUser.name} ${targetUser.role || ''}(으)로 계정이 전환되었습니다.`, '계정 전환', 'success');
          }}
          onLogout={() => {
            if (isConfigured) {
              handleLogOut();
            } else {
              showLayerAlert('로그아웃 되었습니다.', '알림', 'info');
            }
          }}
          onResetData={() => {
            showLayerConfirm(
              '모든 대화, 일정 및 대시보드 데이터를 초기화하시겠습니까?',
              '시연 데이터 초기화',
              () => handleGlobalResetDemo()
            );
          }}
        />
      )}

      {/* ──── MAIN VIEW AREA: TIMELINE & AI CHAT SYNC VIEW ──── */}
      <div className="sync-view-container" style={{ display: currentView === 'sync' ? 'flex' : 'none', flex: 1, height: '100vh', overflow: 'hidden', position: 'relative' }}>
        {/* ──── LEFT COLLAPSIBLE AI DRAWER ─────────────────── */}
        <div className={`chat-drawer ${isDrawerOpen ? '' : 'closed'}`}>
        <div className="chat-header">
          <div 
            className="chat-header-title" 
            onClick={() => navigateToView('dashboard')}
            title="피드 대시보드로 이동"
            style={{ overflow: 'hidden', height: '100%', display: 'flex', alignItems: 'flex-start', paddingTop: '6px', cursor: 'pointer' }}
          >
            <img src="/bi2.png" alt="BI Logo 2" style={{ height: '58px', width: 'auto', maxHeight: 'none', objectFit: 'contain', objectPosition: 'top left', flexShrink: 0, marginTop: '6px' }} />
            <span style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'baseline', gap: '2px' }}>
              <span style={{ fontSize: '19px', fontWeight: '800', letterSpacing: '-0.3px' }}>ZAL</span>
              <span style={{ fontSize: '17.5px', fontWeight: '700' }}> : 잘됨</span>
            </span>
          </div>
          <button 
            className="close-drawer-btn" 
            onClick={() => setIsDrawerOpen(false)}
            title="사이드바 접기"
            style={{ padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="5" x2="4" y2="19" />
              <polyline points="14 6 8 12 14 18" />
              <line x1="20" y1="12" x2="8" y2="12" />
            </svg>
          </button>
        </div>



        <div 
          className="chat-messages" 
          ref={chatMessagesRef}
          onScroll={checkCardsVisibility}
        >
          {(() => {
            const uniqueMessages = [];
            const seenIds = new Set();
            const seenContents = new Set();

            (messages || []).forEach(msg => {
              if (!msg) return;
              if (msg.id === 0) {
                if (!seenIds.has(0)) {
                  seenIds.add(0);
                  uniqueMessages.push(msg);
                }
              } else {
                const isGreeting = msg.from && msg.from.startsWith('ai') && msg.text && (
                  msg.text.includes('안녕하세요') ||
                  msg.text.includes('좋은 아침') ||
                  msg.text.includes('점심은') ||
                  msg.text.includes('수고하셨') ||
                  msg.text.includes('수고 많으셨')
                );

                const idKey = msg.id || msg.$id;
                const contentKey = (msg.text || '').trim() + '_' + (msg.time || '') + '_' + (msg.from || '');

                if (!isGreeting) {
                  if (idKey && seenIds.has(idKey)) return;
                  if (contentKey && seenContents.has(contentKey)) return;

                  if (idKey) seenIds.add(idKey);
                  if (contentKey) seenContents.add(contentKey);
                  uniqueMessages.push(msg);
                }
              }
            });

            const todayMessages = uniqueMessages.filter(msg => isTodayMessage(msg));
            const previousMessages = uniqueMessages.filter(msg => !isTodayMessage(msg));

            const isApprovalTarget = (s) => {
              const isLeave = /\[?반차|연차|휴가|병가\]?/i.test(s.title || '');
              if (isLeave) return true;
              const isReqByMe = s.requesterId === ME.id || (ME.id === 'sh' && s.requesterId === 'yoonhee');
              const isAssignedToOther = (s.memberId !== ME.id && !(ME.id === 'sh' && s.memberId === 'yoonhee')) || 
                (s.memberIds && s.memberIds.some(id => id !== ME.id && !(ME.id === 'sh' && id === 'yoonhee')));
              return isReqByMe && isAssignedToOther;
            };

            // Collect all schedule IDs that are already rendered inside chat message bubbles
            const renderedScheduleIdsInMessages = new Set();
            todayMessages.forEach(msg => {
              if (msg.from && (msg.from === 'ai' || msg.from.startsWith('ai_'))) {
                const { schedules: schedList } = parseSchedulesFromText(msg.text);
                schedList.forEach(s => {
                  const matched = schedules.find(sched => 
                    sched.title === s.title && 
                    sched.date === s.date && 
                    sched.startHour === s.startHour
                  );
                  if (matched) {
                    renderedScheduleIdsInMessages.add(matched.id);
                  }
                });
              }
            });

            const rejectedOutgoingRequests = schedules.filter(s => 
              (s.requesterId === ME.id || (ME.id === 'sh' && s.requesterId === 'yoonhee') || (s.memberId === ME.id && /\[?반차|연차|휴가|병가\]?/i.test(s.title || ''))) && 
              (s.status === 'rejected' || (s.status && s.status.startsWith('rejected'))) &&
              isApprovalTarget(s) &&
              !renderedScheduleIdsInMessages.has(s.id)
            );
            const groupedRejectedOutgoingRequests = groupList(rejectedOutgoingRequests);

            const acceptedOutgoingRequests = schedules.filter(s => {
              const isMyReq = (s.requesterId === ME.id || (ME.id === 'sh' && s.requesterId === 'yoonhee') || (s.memberId === ME.id && /\[?반차|연차|휴가|병가\]?/i.test(s.title || '')));
              if (!isMyReq) return false;
              if (s.status !== 'accepted') return false;
              if (!isApprovalTarget(s)) return false;
              if (renderedScheduleIdsInMessages.has(s.id)) return false;
              return (s.description || '').includes('[수락메시지]') || (s.description || '').includes('[승인 완료]');
            });
            const groupedAcceptedOutgoingRequests = groupList(acceptedOutgoingRequests);
            const pendingItems = schedules.filter(s => {
              if (s.status === 'cancelled' || s.isCancelled) return false;
              const isLeave = /반차|연차|휴가|병가|결재|비용/i.test(s.title || '') || s.category === '휴가';
              return isLeave && isApproverForItem(s);
            });
            const requestedPendingCount = pendingItems.filter(s => s.status === 'requested').length;

            const pendingIds = new Set(pendingItems.map(p => p.id));
            const incomingTaskRequests = schedules.filter(s => {
              if (pendingIds.has(s.id)) return false;
              const isAssignedToMe = (s.memberId === ME.id || (s.memberIds && s.memberIds.includes(ME.id)));
              const isNotMyRequest = s.requesterId && s.requesterId !== ME.id && !(ME.id === 'sh' && s.requesterId === 'yoonhee');
              const isNotLeave = !/반차|연차|휴가|병가/i.test(s.title || '') && s.category !== '휴가';
              
              if (!isAssignedToMe || !isNotMyRequest || !isNotLeave) return false;
              
              // 요청 대기, 수락 완료, 반려 상태인 모든 인커밍 업무 카드를 유지
              return s.status === 'requested' || s.status === 'accepted' || s.status === 'rejected' || (s.status && s.status.startsWith('rejected')) || (s.description && (
                s.description.includes('[수락메시지]') || 
                s.description.includes('[반려사유]') || 
                s.description.includes('[재요청메시지]')
              ));
            });
            const requestedTaskCount = incomingTaskRequests.filter(s => s.status === 'requested').length;

            const groupedPendingItems = groupList(pendingItems);
            const groupedIncomingTaskRequests = groupList(incomingTaskRequests);

            const renderBubble = (msg) => {
              if (msg.id === 0) {
                const now = new Date();
                const month = now.getMonth() + 1;
                const dateNum = now.getDate();
                const lines = msg.text.split('\n');
                const titleLine = lines[0] || `안녕하세요, ${ME.name}님.`;
                const subLines = lines.slice(1).join('\n');

                return (
                  <Fragment key={msg.id}>
                    <div style={{ padding: '8px 4px 16px 4px', marginBottom: '12px', borderBottom: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: '#64748b' }}>
                        {month}월 {dateNum}일
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.5px', marginTop: '2px', display: 'flex', alignItems: 'center' }}>
                        <span>{titleLine.replace(/\s*[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s*/gu, '').trim()}</span>
                        <span style={{ fontSize: '28px', marginLeft: '6px', lineHeight: 1 }}>{greetingEmoji}</span>
                      </div>
                      {subLines && (
                        <div style={{ fontSize: '13.5px', color: '#475569', marginTop: '6px', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                          {subLines}
                        </div>
                      )}
                    </div>
                  </Fragment>
                );
              }

              const isUser = msg.from.startsWith('user');
              const roleClass = isUser ? 'user' : 'ai';
              return (
                <div key={msg.id} className={`chat-bubble-wrap ${roleClass}`}>
                  <div className={`chat-bubble ${roleClass}`} style={{ whiteSpace: 'pre-line' }}>
                    {!isUser && (parseSchedulesFromText(msg.text || '').schedules || []).length > 0 ? (() => {
                      const { introText, schedules: parsedSchedules } = parseSchedulesFromText(msg.text || '');

                      const existingSchedules = [];
                      (parsedSchedules || []).forEach(p => {
                        (p.dates || []).forEach(d => {
                          const match = schedules.find(s => 
                            s.title === p.title &&
                            s.date === d &&
                            s.status !== 'cancelled' && !s.isCancelled &&
                            (!p.year || !s.year || s.year === p.year) &&
                            (!p.month || !s.month || s.month === p.month)
                          );
                          if (match && !existingSchedules.some(es => es.id === match.id)) {
                            existingSchedules.push(match);
                          }
                        });
                      });

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '320px', maxWidth: '100%', boxSizing: 'border-box' }}>
                          {introText && <div style={{ fontWeight: '600' }}>{renderTextWithLinks(introText)}</div>}
                          
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                            {(parsedSchedules || []).map((parsed, idx) => {
                              const isCancellationMsg = /취소/i.test(parsed.action || '') || (msg && msg.text && /취소/i.test(msg.text));
                              let matchedSchedule = null;
                              const normalizeStr = str => (str || '').replace(/\s+/g, ' ').trim().toLowerCase();

                              for (const d of (parsed.dates || [])) {
                                const match = schedules.find(s => 
                                  normalizeStr(s.title) === normalizeStr(parsed.title) &&
                                  s.date === d &&
                                  (!parsed.year || !s.year || s.year === parsed.year) &&
                                  (!parsed.month || !s.month || s.month === parsed.month)
                                );
                                if (match) {
                                  matchedSchedule = match;
                                  break;
                                }
                              }
                              
                              const lines = parsed.lines || [];
                              const fields = [];
                              let currentField = null;

                              lines.forEach(line => {
                                const trimmed = line.trim();
                                if (!trimmed) return;
                                if (/^📅?\s*(?:\d+\.\s*(?:일정|이슈)|(?:일정|이슈)\s*\d+)/iu.test(trimmed)) return;
                                if (trimmed.startsWith('"') && trimmed.endsWith('"')) return;

                                if (trimmed.includes('상세내용:') || trimmed.includes('상세:') || trimmed.includes('상세')) {
                                  currentField = { type: 'detail', label: '상세', text: trimmed.replace(/.*(?:상세내용|상세):?\s*/, '') };
                                  fields.push(currentField);
                                } else if (trimmed.includes('담당자:') || trimmed.includes('담당:') || trimmed.includes('담당')) {
                                  currentField = { type: 'assignee', label: '담당', text: trimmed.replace(/.*(?:담당자|담당):?\s*/, '') };
                                  fields.push(currentField);
                                } else if (trimmed.includes('날짜:') || trimmed.includes('날짜')) {
                                  currentField = { type: 'date', label: '날짜', text: trimmed.replace(/.*날짜:?\s*/, '') };
                                  fields.push(currentField);
                                } else if (trimmed.includes('시간:') || trimmed.includes('시간')) {
                                  currentField = { type: 'time', label: '시간', text: trimmed.replace(/.*시간:?\s*/, '') };
                                  fields.push(currentField);
                                } else {
                                  if (currentField) {
                                    currentField.text += '\n' + trimmed;
                                  } else {
                                    fields.push({ type: 'other', label: '', text: trimmed });
                                  }
                                }
                              });
                              
                              const isIssueCard = parsed.isIssue || (lines[0] && lines[0].includes('이슈')) || (parsed.rawText && parsed.rawText.includes('이슈'));

                              return (
                                <div 
                                  key={idx} 
                                  onClick={(e) => {
                                    if (matchedSchedule) {
                                      openDetailModal(matchedSchedule);
                                    } else {
                                      const found = schedules.find(s => 
                                        normalizeStr(s.title) === normalizeStr(parsed.title) &&
                                        (!parsed.dates || parsed.dates.length === 0 || parsed.dates.includes(s.date))
                                      );
                                      if (found) {
                                        openDetailModal(found);
                                      }
                                    }
                                  }}
                                  style={{ 
                                    padding: '12px 14px', 
                                    backgroundColor: '#ffffff', 
                                    borderRadius: '10px',
                                    border: '1px solid var(--border-color)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = '#94a3b8';
                                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(15, 23, 42, 0.08)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--border-color)';
                                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.04)';
                                  }}
                                >
                                  <div style={{ fontWeight: '700', fontSize: '13.5px', color: '#0f172a', marginBottom: '2px' }}>
                                    {isIssueCard ? '이슈' : '일정'} {idx + 1}: "{parsed.title}"
                                  </div>
                                  {fields.map((f, fIdx) => {
                                    let icon = null;
                                    if (f.type === 'detail') {
                                      icon = (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                          <polyline points="14 2 14 8 20 8"/>
                                          <line x1="16" y1="13" x2="8" y2="13"/>
                                          <line x1="16" y1="17" x2="8" y2="17"/>
                                        </svg>
                                      );
                                    } else if (f.type === 'assignee') {
                                      icon = (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                          <circle cx="12" cy="7" r="4"/>
                                        </svg>
                                      );
                                    } else if (f.type === 'date') {
                                      icon = (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                                          <line x1="16" y1="2" x2="16" y2="6"/>
                                          <line x1="8" y1="2" x2="8" y2="6"/>
                                          <line x1="3" y1="10" x2="21" y2="10"/>
                                        </svg>
                                      );
                                    } else if (f.type === 'time') {
                                      icon = (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                          <circle cx="12" cy="12" r="10"/>
                                          <polyline points="12 6 12 12 16 14"/>
                                        </svg>
                                      );
                                    }

                                    if (f.type === 'detail' && (!f.text || f.text.trim() === '없음' || f.text.trim() === '')) {
                                      return null;
                                    }

                                    if (f.type === 'other') {
                                      return <div key={fIdx} style={{ fontSize: '12.5px', opacity: 0.9 }}>{renderTextWithLinks(f.text)}</div>;
                                    }

                                    return (
                                      <div key={fIdx} style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#334155', marginTop: '2px', alignItems: 'flex-start' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#475569' }}>
                                          {icon}
                                          <span>{f.label}</span>
                                        </div>
                                        <div style={{ wordBreak: 'break-all', whiteSpace: 'pre-line' }}>
                                           {(() => {
                                             let val = f.text;
                                             if (f.type === 'detail' && val) {
                                               const items = val.split('\n').map(l => l.replace(/^[-•*\s]+/, '').trim()).filter(Boolean);
                                               val = items.join(', ');
                                               val = val.replace(/^[-•*\s]+/, '').trim();
                                               if (!val || val === '-') val = '없음';
                                             }
                                             return renderTextWithLinks(val);
                                           })()}
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {/* Status and Reason Row for Rejected / Accepted Schedule */}
                                  {matchedSchedule && (matchedSchedule.status === 'rejected' || (matchedSchedule.status && matchedSchedule.status.startsWith('rejected'))) && (() => {
                                    const rejectReasonMatch = (matchedSchedule.description || '').match(/\[반려사유\]\s*([^|]+)/);
                                    const rejectReason = rejectReasonMatch ? rejectReasonMatch[1].trim() : null;

                                    return (
                                      <>
                                        <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#dc2626', marginTop: '4px', alignItems: 'center' }}>
                                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#dc2626' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                            <span>상태</span>
                                          </div>
                                          <div style={{ fontWeight: '700', color: '#dc2626' }}>
                                            반려
                                          </div>
                                        </div>
                                        {rejectReason && (
                                          <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#dc2626', marginTop: '2px', alignItems: 'flex-start' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#dc2626' }}>
                                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                              <span>사유</span>
                                            </div>
                                            <div style={{ fontWeight: '600', color: '#b91c1c', wordBreak: 'break-all' }}>
                                              {rejectReason}
                                            </div>
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}

                                  {matchedSchedule && matchedSchedule.status === 'accepted' && (() => {
                                     const isLeave = /\[?반차|연차|휴가|병가\]?/i.test(matchedSchedule.title || '');
                                     const isExplicitApproved = (matchedSchedule.description || '').includes('[수락메시지]') || (matchedSchedule.description || '').includes('[승인 완료]');
                                     const isRequestOrApproval = isLeave || isExplicitApproved;
                                     if (!isRequestOrApproval) return null;
                                    const acceptMsgMatch = (matchedSchedule.description || '').match(/\[수락메시지\]\s*([^|]+)/);
                                    const acceptMsg = acceptMsgMatch ? acceptMsgMatch[1].trim() : null;

                                    return (
                                      <>
                                        <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#059669', marginTop: '4px', alignItems: 'center' }}>
                                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#059669' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                            <span>상태</span>
                                          </div>
                                          <div style={{ fontWeight: '700', color: '#059669' }}>
                                            승인 완료
                                          </div>
                                        </div>
                                        {acceptMsg && (
                                          <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#059669', marginTop: '2px', alignItems: 'flex-start' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#059669' }}>
                                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                              <span>메시지</span>
                                            </div>
                                            <div style={{ fontWeight: '600', color: '#047857', wordBreak: 'break-all' }}>
                                              {acceptMsg}
                                            </div>
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                  
                                  <div style={{ marginTop: '8px' }}>
                                       {!isCancellationMsg ? (
                                         (() => {
                                           const approverMember = matchedSchedule ? getApproverMember(matchedSchedule, ME.id) : { name: '조상무', role: '상무' };
                                           const isApprover = matchedSchedule ? isApproverForItem(matchedSchedule) : false;

                                           if (matchedSchedule && matchedSchedule.status === 'requested') {
                                             if (isApprover) {
                                               return (
                                                 <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px' }}>
                                                   <button
                                                     onClick={(e) => {
                                                       e.stopPropagation();
                                                       handleApproveSchedule(matchedSchedule.id);
                                                     }}
                                                     style={{
                                                       flex: 1,
                                                       padding: '7px 12px',
                                                       fontSize: '12.5px',
                                                       fontWeight: '800',
                                                       backgroundColor: '#6366f1',
                                                       color: '#ffffff',
                                                       border: 'none',
                                                       borderRadius: '8px',
                                                       cursor: 'pointer',
                                                       boxShadow: '0 2px 6px rgba(99, 102, 241, 0.3)',
                                                       transition: 'all 0.15s ease',
                                                       display: 'inline-flex',
                                                       alignItems: 'center',
                                                       justifyContent: 'center',
                                                       gap: '4px'
                                                     }}
                                                   >
                                                     <span>💙 승인</span>
                                                   </button>
                                                   <button
                                                     onClick={(e) => {
                                                       e.stopPropagation();
                                                       handleRejectSchedule(matchedSchedule.id);
                                                     }}
                                                     style={{
                                                       flex: 1,
                                                       padding: '7px 12px',
                                                       fontSize: '12.5px',
                                                       fontWeight: '800',
                                                       backgroundColor: '#ffffff',
                                                       color: '#ef4444',
                                                       border: '1.5px solid #fecaca',
                                                       borderRadius: '8px',
                                                       cursor: 'pointer',
                                                       transition: 'all 0.15s ease',
                                                       display: 'inline-flex',
                                                       alignItems: 'center',
                                                       justifyContent: 'center',
                                                       gap: '4px'
                                                     }}
                                                   >
                                                     <span>❌ 반려</span>
                                                   </button>
                                                 </div>
                                               );
                                             } else {
                                                const isDelegatedTask = (matchedSchedule.requesterId === ME.id || (ME.id === 'sh' && matchedSchedule.requesterId === 'yoonhee')) && (matchedSchedule.memberId !== ME.id && !(ME.id === 'sh' && matchedSchedule.memberId === 'yoonhee'));
                                                const reqTargetMember = TEAM.find(m => m.id === (matchedSchedule.approverId || matchedSchedule.memberId)) || approverMember;

                                                return (
                                                  <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', flexWrap: 'wrap', gap: '6px' }}>
                                                    <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#b45309', backgroundColor: '#fffbeb', padding: '4px 10px', borderRadius: '6px', border: 'none' }}>
                                                      {isDelegatedTask 
                                                        ? `⏳ 요청 대기중 (${reqTargetMember.name} ${reqTargetMember.role || '사원'}에게 요청)` 
                                                        : `⏳ 결재 대기중 (${approverMember.name} ${approverMember.role || '상무'} 결재)`}
                                                    </span>
                                                    <button
                                                      style={{
                                                        padding: '7px 14px',
                                                        fontSize: '12.5px',
                                                        backgroundColor: '#fef2f2',
                                                        color: '#dc2626',
                                                        border: '1px solid #fca5a5',
                                                        borderRadius: '8px',
                                                        fontWeight: '700',
                                                        lineHeight: '1.2',
                                                        cursor: 'pointer'
                                                      }}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleCancelSchedule(matchedSchedule.id);
                                                      }}
                                                    >
                                                      {isDelegatedTask ? '요청취소' : '요청취소'}
                                                    </button>
                                                  </div>
                                               );
                                             }
                                           } else if (matchedSchedule && matchedSchedule.status === 'accepted') {
                                               const isDelegatedTask = (matchedSchedule.requesterId === ME.id || (ME.id === 'sh' && matchedSchedule.requesterId === 'yoonhee')) && (matchedSchedule.memberId !== ME.id && !(ME.id === 'sh' && matchedSchedule.memberId === 'yoonhee'));
                                               const reqTargetMember = TEAM.find(m => m.id === (matchedSchedule.approverId || matchedSchedule.memberId)) || approverMember;
                                               const isApprovalItem = /반차|연차|휴가|병가|신청|승인/i.test(matchedSchedule.title || '') || (matchedSchedule.requesterId && matchedSchedule.requesterId !== matchedSchedule.memberId);

                                               if (!isApprover && !isApprovalItem && !isDelegatedTask) {
                                                 return (
                                                   <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'flex-end', marginTop: '6px' }}>
                                                     <button
                                                       style={{
                                                         padding: '7px 14px',
                                                         fontSize: '12.5px',
                                                         backgroundColor: '#fef2f2',
                                                         color: '#dc2626',
                                                         border: '1px solid #fca5a5',
                                                         borderRadius: '8px',
                                                         fontWeight: '700',
                                                         lineHeight: '1.2',
                                                         cursor: 'pointer'
                                                       }}
                                                       onClick={async (e) => {
                                                         e.stopPropagation();
                                                         if (isConfigured) {
                                                           await appwriteService.deleteSchedule(matchedSchedule.id);
                                                         }
                                                         setSchedules(prev => prev.filter(s => s.id !== matchedSchedule.id));
                                                       }}
                                                     >
                                                       등록취소
                                                     </button>
                                                   </div>
                                                 );
                                               }
                                              return (
                                                <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', flexWrap: 'wrap', gap: '6px' }}>
                                                  <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#059669', backgroundColor: '#ecfdf5', padding: '4px 10px', borderRadius: '6px', border: 'none' }}>
                                                    {isApprover ? '🎉 승인하였습니다' : (isDelegatedTask ? `🎉 수락 완료 (${reqTargetMember.name} ${reqTargetMember.role || '사원'} 수락)` : (isApprovalItem ? `🎉 승인 완료 (${approverMember.name} ${approverMember.role} 승인)` : '🎉 등록 완료'))}
                                                  </span>
                                                 {isApprover ? (
                                                   <button
                                                     style={{
                                                       padding: '6px 12px',
                                                       fontSize: '12px',
                                                       fontWeight: '700',
                                                       backgroundColor: '#fef2f2',
                                                       color: '#dc2626',
                                                       border: '1px solid #fca5a5',
                                                       borderRadius: '8px',
                                                       cursor: 'pointer',
                                                       marginLeft: 'auto'
                                                     }}
                                                     onClick={(e) => {
                                                       e.stopPropagation();
                                                       handleRejectSchedule(matchedSchedule.id);
                                                     }}
                                                   >
                                                     승인 취소
                                                   </button>
                                                 ) : (
                                                   <button
                                                     style={{
                                                       padding: '6px 12px',
                                                       fontSize: '12px',
                                                       backgroundColor: '#fef2f2',
                                                       color: '#dc2626',
                                                       border: '1px solid #fca5a5',
                                                       borderRadius: '8px',
                                                       fontWeight: '700',
                                                       cursor: 'pointer'
                                                     }}
                                                     onClick={async (e) => {
                                                       e.stopPropagation();
                                                       if (isConfigured) {
                                                         await appwriteService.deleteSchedule(matchedSchedule.id);
                                                       }
                                                       setSchedules(prev => prev.filter(s => s.id !== matchedSchedule.id));
                                                     }}
                                                   >요청취소</button>
                                                 )}
                                               </div>
                                             );
                                           } else if (matchedSchedule && (matchedSchedule.status === 'rejected' || (matchedSchedule.status && matchedSchedule.status.startsWith('rejected')))) {
                                              const rejecterMember = getRejecterMember(matchedSchedule);
                                              return (
                                                <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', flexWrap: 'wrap', gap: '6px' }}>
                                                  <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#dc2626', backgroundColor: '#fef2f2', padding: '4px 10px', borderRadius: '6px', border: 'none' }}>
                                                    {isApprover ? '❌ 반려하였습니다' : `❌ 반려됨 (${rejecterMember.name} ${rejecterMember.role || '사원'} 반려)`}
                                                  </span>
                                                  {isApprover ? (
                                                    <button
                                                      style={{
                                                        padding: '6px 12px',
                                                        fontSize: '12px',
                                                        fontWeight: '700',
                                                        backgroundColor: '#ecfdf5',
                                                        color: '#059669',
                                                        border: '1px solid #a7f3d0',
                                                        borderRadius: '8px',
                                                        marginLeft: 'auto',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease'
                                                      }}
                                                      onClick={() => handleApproveSchedule(matchedSchedule.id)}
                                                    >
                                                      재승인
                                                    </button>
                                                  ) : (
                                                    <div style={{ display: 'inline-flex', gap: '6px', marginLeft: 'auto' }}>
                                                      <button
                                                        style={{
                                                          padding: '6px 12px',
                                                          fontSize: '12px',
                                                          backgroundColor: '#fef2f2',
                                                          color: '#dc2626',
                                                          border: '1px solid #fca5a5',
                                                          borderRadius: '8px',
                                                          fontWeight: '700',
                                                          cursor: 'pointer',
                                                          transition: 'all 0.15s ease'
                                                        }}
                                                        onClick={() => handleCancelSchedule(matchedSchedule.id)}
                                                      >
                                                        요청취소
                                                      </button>
                                                      <button
                                                        style={{
                                                          padding: '6px 12px',
                                                          fontSize: '12px',
                                                          fontWeight: '700',
                                                          backgroundColor: '#f0fdf4',
                                                          color: '#15803d',
                                                          border: '1px solid #86efac',
                                                          borderRadius: '8px',
                                                          cursor: 'pointer',
                                                          transition: 'all 0.15s ease'
                                                        }}
                                                        onClick={() => handleResubmitSchedule(matchedSchedule.id)}
                                                      >
                                                        다시요청
                                                      </button>
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            } else if (matchedSchedule && (matchedSchedule.status === 'cancelled' || matchedSchedule.isCancelled)) {
                                               const isMine = matchedSchedule.requesterId === ME.id || (matchedSchedule.memberId === ME.id && !matchedSchedule.requesterId);
                                               return (
                                                 <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', flexWrap: 'wrap', gap: '6px' }}>
                                                   <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#64748b', backgroundColor: '#f1f5f9', padding: '4px 10px', borderRadius: '6px', border: 'none' }}>
                                                     {isMine ? '🚫 요청 취소됨' : '🚫 요청자가 취소함'}
                                                   </span>
                                                   {isMine && (
                                                     <button
                                                       style={{
                                                         padding: '6px 12px',
                                                         fontSize: '12px',
                                                         fontWeight: '700',
                                                         backgroundColor: '#f0fdf4',
                                                         color: '#15803d',
                                                         border: '1px solid #86efac',
                                                         borderRadius: '8px',
                                                         cursor: 'pointer',
                                                         marginLeft: 'auto',
                                                         transition: 'all 0.15s ease'
                                                       }}
                                                       onClick={(e) => {
                                                         e.stopPropagation();
                                                         handleResubmitSchedule(matchedSchedule.id);
                                                       }}
                                                     >
                                                       재요청
                                                     </button>
                                                   )}
                                                 </div>
                                               );
                                             }

                                           return (
                                             <button
                                               style={{
                                                  padding: '6px 12px',
                                                  fontSize: '12px',
                                                  backgroundColor: '#fef2f2',
                                                  color: '#dc2626',
                                                  border: '1px solid #fca5a5',
                                                  borderRadius: '8px',
                                                  fontWeight: '700',
                                                  cursor: 'pointer',
                                                  transition: 'all 0.15s ease'
                                                }}
                                               onClick={async () => {
                                                  const matchGroupId = matchedSchedule && matchedSchedule.description && matchedSchedule.description.match(/\[그룹 ID\]\s*(g_\w+)/);
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
                                           );
                                         })()
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
                                padding: '10px 14px', 
                                fontSize: '13px', 
                                backgroundColor: 'rgba(239, 68, 68, 0.08)', 
                                color: '#ef4444', 
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                borderRadius: '8px', 
                                fontWeight: '700',
                                cursor: 'pointer',
                                marginTop: '4px',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.backgroundColor = '#ef4444';
                                e.target.style.borderColor = '#ef4444';
                                e.target.style.color = '#ffffff';
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
                                e.target.style.borderColor = 'rgba(239, 68, 68, 0.25)';
                                e.target.style.color = '#ef4444';
                              }}
                              onClick={() => {
                                showLayerConfirm(
                                  '이 메시지로 등록된 모든 일정을 취소하시겠습니까?',
                                  '등록 취소 확인',
                                  async () => {
                                    for (const s of existingSchedules) {
                                      if (isConfigured) {
                                        await appwriteService.deleteSchedule(s.id);
                                      }
                                    }
                                    const ids = existingSchedules.map(s => s.id);
                                    setSchedules(prev => prev.filter(item => !ids.includes(item.id)));
                                  }
                                );
                              }}
                            >
                              모두 등록취소
                            </button>
                          )}
                        </div>
                      );
                    })() : (
                      isUser ? msg.text : (() => {
                        const isNotice = msg.text && (msg.text.includes('반려') || msg.text.includes('거절') || msg.text.includes('승인') || msg.text.includes('수락') || msg.text.includes('요청'));
                        const targetTitleMatch = msg.text.match(/"([^"]+)"/);
                        const targetTitle = msg.targetTitle || (targetTitleMatch ? targetTitleMatch[1] : null);

                        return (
                          <div 
                            style={{
                              backgroundColor: 'transparent',
                              border: '1px solid #cbd5e1',
                              borderRadius: '16px',
                              borderTopLeftRadius: '4px',
                              borderBottomLeftRadius: '16px',
                              padding: '9px 15px',
                              color: '#0f172a',
                              fontWeight: '600',
                              fontSize: '13.5px',
                              lineHeight: '1.5',
                              display: 'inline-block',
                              maxWidth: '100%',
                              cursor: isNotice ? 'pointer' : 'default',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={isNotice ? (e) => { 
                              e.currentTarget.style.backgroundColor = '#f8fafc'; 
                              e.currentTarget.style.borderColor = '#94a3b8'; 
                            } : undefined}
                            onMouseLeave={isNotice ? (e) => { 
                              e.currentTarget.style.backgroundColor = 'transparent'; 
                              e.currentTarget.style.borderColor = '#cbd5e1'; 
                            } : undefined}
                            onClick={isNotice ? () => {
                              let el = null;
                              if (msg.targetScheduleId) el = document.getElementById('card_' + msg.targetScheduleId);
                              if (!el && targetTitle) el = document.querySelector(`[data-card-title="${targetTitle}"]`);
                              if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                el.style.transition = 'box-shadow 0.3s ease, border-color 0.3s ease';
                                el.style.borderColor = '#3b82f6';
                                el.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.2)';
                                setTimeout(() => {
                                  el.style.borderColor = '#cbd5e1';
                                  el.style.boxShadow = '0 2px 6px rgba(15, 23, 42, 0.04)';
                                }, 1600);
                              }
                            } : undefined}
                          >
                            {msg.text}
                          </div>
                        );
                      })()
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

                                {(() => {
                  const formatCardTime = (ts) => {
                    if (!ts) return formatTime(new Date());
                    let d;
                    if (typeof ts === 'number') {
                      d = new Date(ts);
                    } else if (typeof ts === 'string') {
                      d = new Date(ts);
                      if (isNaN(d.getTime())) {
                        const num = parseInt(ts.replace(/\D/g, ''), 10);
                        if (!isNaN(num) && num > 1000000000000) d = new Date(num);
                      }
                    }
                    if (!d || isNaN(d.getTime()) || d.getTime() <= 0) return formatTime(new Date());
                    return formatTime(d);
                  };

                  const getSafeItemTs = (item) => {
                    if (!item) return 0;

                    // 1) 실제 사용자가 수락/반려/재요청 버튼을 누른 경우에만 statusUpdatedAt 반영!
                    if (item.statusUpdatedAt) return item.statusUpdatedAt;
                    if (item.data && item.data.statusUpdatedAt) return item.data.statusUpdatedAt;

                    // 2) 실제 요청/생성 일시 (createdAt / $createdAt)
                    const cAt = item.createdAt || item.$createdAt || item.data?.createdAt || item.data?.$createdAt;
                    if (cAt) {
                      const t = typeof cAt === 'number' ? cAt : new Date(cAt).getTime();
                      if (!isNaN(t) && t > 0) return t;
                    }

                    // 3) ID에서 s_1740... 또는 13자리 밀리초 타임스탬프 추출
                    const rawId = item.id || item.data?.id || item.$id || item.data?.$id;
                    const idStr = String(rawId || '');
                    const sMatch = idStr.match(/s_(\d{13})/);
                    if (sMatch) {
                      const parsedTs = parseInt(sMatch[1], 10);
                      if (!isNaN(parsedTs) && parsedTs > 0) return parsedTs;
                    }
                    if (typeof rawId === 'number' && rawId > 1000000000000) return rawId;
                    const numId = parseInt(idStr.replace(/\D/g, ''), 10);
                    if (!isNaN(numId) && numId > 1000000000000) return numId;

                    // 4) time 문자열 (예: "11:13" 또는 "09:30")
                    const timeStr = item.time || item.data?.time;
                    if (timeStr && /^\d{1,2}:\d{2}/.test(timeStr)) {
                      const [hh, mm] = timeStr.split(':').map(n => parseInt(n, 10));
                      const d = new Date();
                      d.setHours(hh, mm, 0, 0);
                      return d.getTime();
                    }

                    return 0;
                  };

                  const getSafeGroupTs = (items) => {
                    if (!items || items.length === 0) return Date.now();
                    const validTs = items.map(getSafeItemTs).filter(t => !isNaN(t) && t > 0);
                    return validTs.length > 0 ? Math.max(...validTs) : Date.now();
                  };

                  const greetingMsg = todayMessages.find(msg => msg.id === 0);
                  const otherMessages = todayMessages.filter(msg => msg.id !== 0);

                  // Build a map: schedule ID -> timestamp of the AI message that registered it
                  // This ensures cards sort at the same position as the message that created them
                  const scheduleToMsgTs = {};
                  otherMessages.forEach(msg => {
                    const msgTs = getSafeItemTs(msg);
                    const { schedules: parsedList } = parseSchedulesFromText(msg.text || '');
                    parsedList.forEach(parsed => {
                      const matched = schedules.find(s =>
                        s.title === parsed.title &&
                        s.date === parsed.date &&
                        s.startHour === parsed.startHour
                      );
                      if (matched) {
                        // Only store if no statusUpdatedAt (i.e. not manually changed)
                        if (!matched.statusUpdatedAt) {
                          scheduleToMsgTs[matched.id] = msgTs;
                        }
                      }
                    });
                  });

                  const getCardTs = (item) => {
                    if (!item) return 0;
                    const id = String(item.id || item.$id || item.data?.id || item.data?.$id || '');
                    if (scheduleToMsgTs[id]) return scheduleToMsgTs[id];
                    return getSafeItemTs(item);
                  };

                  const otherMessageItems = otherMessages.map(msg => ({
                    type: 'message',
                    id: 'msg_' + msg.id,
                    createdAt: getSafeItemTs(msg),
                    data: msg
                  }));

                  const pendingApprovalItems = groupedPendingItems.map(item => ({
                    type: 'pending_approval_single',
                    id: 'pending_' + (item.id || item.$id),
                    createdAt: getCardTs(item),
                    data: item
                  }));

                  const incomingTaskItems = groupedIncomingTaskRequests.map(item => ({
                    type: 'incoming_task_single',
                    id: 'tasks_' + (item.id || item.$id),
                    createdAt: getCardTs(item),
                    data: item
                  }));

                  const rejectedOutgoingItems = groupedRejectedOutgoingRequests.map(item => ({
                    type: 'rejected_outgoing_single',
                    id: 'rejected_' + (item.id || item.$id),
                    createdAt: getCardTs(item),
                    data: item
                  }));

                  const acceptedOutgoingItems = groupedAcceptedOutgoingRequests.map(item => ({
                    type: 'accepted_outgoing_single',
                    id: 'accepted_' + (item.id || item.$id),
                    createdAt: getCardTs(item),
                    data: item
                  }));

                  const allChronologicalItems = [
                    ...otherMessageItems,
                    ...pendingApprovalItems,
                    ...incomingTaskItems,
                    ...rejectedOutgoingItems,
                    ...acceptedOutgoingItems
                  ].sort((a, b) => a.createdAt - b.createdAt);

                  const unifiedStream = [
                    ...(greetingMsg ? [{ type: 'message', id: 'msg_0', createdAt: 0, data: greetingMsg }] : []),
                    ...allChronologicalItems
                  ];

                  return unifiedStream.map(item => {
                    if (item.type === 'message') {
                      return renderBubble(item.data);
                    }
                    if (item.type === 'pending_approval_single') {
                      const pItem = item.data;
                      if (!pItem) return null;
                      const liveSched = schedules.find(s => s.id === pItem.id || String(s.id) === String(pItem.id) || (s.title === pItem.title && s.date === pItem.date && s.startHour === pItem.startHour)) || pItem;
                      const currentStatus = liveSched.status || pItem.status || 'requested';
                      const isRejectedStatus = currentStatus === 'rejected' || (typeof currentStatus === 'string' && currentStatus.startsWith('rejected'));
                      const isAcceptedStatus = currentStatus === 'accepted';
                      const isRequestedStatus = currentStatus === 'requested';

                      const reqMember = TEAM.find(m => m.id === liveSched.requesterId || m.id === liveSched.memberId) || { name: '정다음', role: '사원' };
                      const dateStr = liveSched.dateStr || `${liveSched.year}.${liveSched.month < 10 ? '0' : ''}${liveSched.month}.${liveSched.date < 10 ? '0' : ''}${liveSched.date}`;
                      const timeStr = `${formatHour(liveSched.startHour)} ~ ${formatHour(liveSched.endHour)}`;
                      const cleanDesc = getCleanDesc(liveSched.description);

                      return (
                        <div key={item.id} className="chat-bubble-wrap ai" style={{ marginTop: '4px', marginBottom: '14px' }}>
                          <div className="chat-bubble ai" style={{ whiteSpace: 'pre-line', width: '320px', maxWidth: '100%', boxSizing: 'border-box' }}>
                            <div style={{ fontWeight: '600', marginBottom: '10px' }}>
                              {reqMember.name}님이 결재를 요청하셨습니다.
                            </div>
                            <div 
                              id={'card_' + liveSched.id}
                              data-card-title={liveSched.title}
                              onClick={() => openDetailModal(liveSched)}
                              style={{
                                backgroundColor: '#ffffff',
                                border: '1px solid var(--border-color)',
                                borderRadius: '10px',
                                padding: '12px 14px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                                width: '100%',
                                boxSizing: 'border-box',
                                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = '#94a3b8';
                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(15, 23, 42, 0.08)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border-color)';
                                e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.04)';
                              }}
                            >
                              <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0f172a', marginBottom: '2px' }}>
                                결재 1 : "{pItem.title}"
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px', color: '#334155' }}>
                                {cleanDesc && cleanDesc !== '없음' && (
                                  <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#334155', marginTop: '2px', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#475569' }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                                      <span>상세</span>
                                    </div>
                                    <div style={{ wordBreak: 'break-all', whiteSpace: 'pre-line' }}>{cleanDesc}</div>
                                  </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#334155', marginTop: '2px', alignItems: 'center' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#475569' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                    <span>신청</span>
                                  </div>
                                  <div style={{ wordBreak: 'break-all', whiteSpace: 'pre-line', fontWeight: '700', color: '#0f172a' }}>{reqMember.name} ({reqMember.role || '사원'})</div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#334155', marginTop: '2px', alignItems: 'center' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#475569' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                    <span>날짜</span>
                                  </div>
                                  <div style={{ wordBreak: 'break-all', whiteSpace: 'pre-line' }}>{dateStr}</div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#334155', marginTop: '2px', alignItems: 'center' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#475569' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    <span>시간</span>
                                  </div>
                                  <div style={{ wordBreak: 'break-all', whiteSpace: 'pre-line' }}>{timeStr}</div>
                                </div>
                              </div>

                              <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                                {isRequestedStatus ? (
                                  <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end', marginLeft: 'auto' }}>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRejectSchedule(liveSched.id);
                                      }}
                                      style={{
                                        padding: '7px 14px',
                                        fontSize: '12.5px',
                                        fontWeight: '700',
                                        backgroundColor: '#fef2f2',
                                        color: '#dc2626',
                                        border: '1px solid #fca5a5',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        lineHeight: '1.2',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.15s ease'
                                      }}
                                    >
                                      요청반려
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleApproveSchedule(liveSched.id);
                                      }}
                                      style={{
                                        padding: '7px 14px',
                                        fontSize: '12.5px',
                                        fontWeight: '700',
                                        backgroundColor: '#ecfdf5',
                                        color: '#059669',
                                        border: '1px solid #a7f3d0',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        lineHeight: '1.2',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.15s ease'
                                      }}
                                    >
                                      요청수락
                                    </button>
                                  </div>
                                ) : isAcceptedStatus ? (
                                  <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                                    <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#059669', backgroundColor: '#ecfdf5', padding: '4px 10px', borderRadius: '6px', border: 'none' }}>
                                      🎉 승인하였습니다
                                    </span>
                                    <button
                                      style={{
                                        padding: '7px 14px',
                                        fontSize: '12.5px',
                                        fontWeight: '700',
                                        backgroundColor: '#fef2f2',
                                        color: '#dc2626',
                                        border: '1px solid #fca5a5',
                                        borderRadius: '8px',
                                        marginLeft: 'auto',
                                        cursor: 'pointer',
                                        lineHeight: '1.2'
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRejectSchedule(liveSched.id);
                                      }}
                                    >
                                      승인 취소
                                    </button>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                                    <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#dc2626', backgroundColor: '#fef2f2', padding: '4px 10px', borderRadius: '6px', border: 'none' }}>
                                      ❌ 반려하였습니다
                                    </span>
                                    <button
                                      style={{
                                        padding: '7px 14px',
                                        fontSize: '12.5px',
                                        fontWeight: '700',
                                        backgroundColor: '#ecfdf5',
                                        color: '#059669',
                                        border: '1px solid #a7f3d0',
                                        borderRadius: '8px',
                                        marginLeft: 'auto',
                                        cursor: 'pointer',
                                        lineHeight: '1.2',
                                        transition: 'all 0.15s ease'
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleApproveSchedule(liveSched.id);
                                      }}
                                    >
                                      재승인
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="chat-meta-row" style={{ alignSelf: 'flex-start' }}>
                            <span className="chat-meta-sender">AI 잘됨이</span>
                            <span className="chat-meta-time">{formatCardTime(item.createdAt)}</span>
                          </div>
                        </div>
                      );
                    }
                    if (item.type === 'incoming_task_single') {
                      const tItem = item.data;
                      if (!tItem) return null;
                      const reqMember = TEAM.find(m => m.id === tItem.requesterId) || { name: '정윤희', role: '부장' };
                      const dateStr = tItem.dateStr || `${tItem.year}.${tItem.month < 10 ? '0' : ''}${tItem.month}.${tItem.date < 10 ? '0' : ''}${tItem.date}`;
                      const timeStr = `${formatHour(tItem.startHour)} ~ ${formatHour(tItem.endHour)}`;
                      const cleanDesc = getCleanDesc(tItem.description);

                      return (
                        <div key={item.id} className="chat-bubble-wrap ai" style={{ marginTop: '4px', marginBottom: '14px' }}>
                          <div className="chat-bubble ai" style={{ whiteSpace: 'pre-line', width: '320px', maxWidth: '100%', boxSizing: 'border-box' }}>
                            <div style={{ fontWeight: '600', marginBottom: '10px' }}>
                              {reqMember.name}님이 업무를 요청하셨습니다.
                            </div>
                            <div 
                              id={'card_' + tItem.id}
                              data-card-title={tItem.title}
                              onClick={() => openDetailModal(tItem)}
                              style={{
                                backgroundColor: '#ffffff',
                                border: '1px solid var(--border-color)',
                                borderRadius: '10px',
                                padding: '12px 14px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                                width: '100%',
                                boxSizing: 'border-box',
                                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = '#94a3b8';
                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(15, 23, 42, 0.08)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border-color)';
                                e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.04)';
                              }}
                            >
                              <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0f172a', marginBottom: '2px' }}>
                                요청 1 : "{tItem.title}"
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px', color: '#334155' }}>
                                {cleanDesc && cleanDesc !== '없음' && (
                                  <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#334155', marginTop: '2px', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#475569' }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                                      <span>상세</span>
                                    </div>
                                    <div style={{ wordBreak: 'break-all', whiteSpace: 'pre-line' }}>{cleanDesc}</div>
                                  </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#334155', marginTop: '2px', alignItems: 'center' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#475569' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                    <span>요청자</span>
                                  </div>
                                  <div style={{ wordBreak: 'break-all', whiteSpace: 'pre-line', fontWeight: '700', color: '#0f172a' }}>{reqMember.id === ME.id ? '나' : reqMember.name} <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>{reqMember.role || '팀원'}</span></div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#334155', marginTop: '2px', alignItems: 'center' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#475569' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                    <span>날짜</span>
                                  </div>
                                  <div style={{ wordBreak: 'break-all', whiteSpace: 'pre-line' }}>{dateStr}</div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#334155', marginTop: '2px', alignItems: 'center' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#475569' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    <span>시간</span>
                                  </div>
                                  <div style={{ wordBreak: 'break-all', whiteSpace: 'pre-line' }}>{timeStr}</div>
                                </div>
                              </div>

                              <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                                {tItem.status === 'requested' ? (
                                  <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end', marginLeft: 'auto' }}>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRejectSchedule(tItem.id);
                                      }}
                                      style={{
                                        padding: '7px 14px',
                                        fontSize: '12.5px',
                                        fontWeight: '700',
                                        backgroundColor: '#fef2f2',
                                        color: '#dc2626',
                                        border: '1px solid #fca5a5',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        lineHeight: '1.2',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.15s ease'
                                      }}
                                    >
                                      요청반려
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAcceptSchedule(tItem.id);
                                      }}
                                      style={{
                                        padding: '7px 14px',
                                        fontSize: '12.5px',
                                        fontWeight: '700',
                                        backgroundColor: '#ecfdf5',
                                        color: '#059669',
                                        border: '1px solid #a7f3d0',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        lineHeight: '1.2',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.15s ease'
                                      }}
                                    >
                                      요청수락
                                    </button>
                                  </div>
                                ) : tItem.status === 'accepted' ? (
                                  <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                                    <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#059669', backgroundColor: '#ecfdf5', padding: '4px 10px', borderRadius: '6px', border: 'none' }}>
                                      🎉 수락하였습니다
                                    </span>
                                    <button
                                      style={{
                                        padding: '5px 12px',
                                        fontSize: '12px',
                                        fontWeight: '700',
                                        backgroundColor: '#fef2f2',
                                        color: '#dc2626',
                                        border: '1px solid #fca5a5',
                                        borderRadius: '8px',
                                        marginLeft: 'auto',
                                        cursor: 'pointer'
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRejectSchedule(tItem.id);
                                      }}
                                    >
                                      수락 취소
                                    </button>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                                    <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#dc2626', backgroundColor: '#fef2f2', padding: '4px 10px', borderRadius: '6px', border: 'none' }}>
                                      ❌ 반려하였습니다
                                    </span>
                                    <button
                                      style={{
                                        padding: '5px 12px',
                                        fontSize: '12px',
                                        fontWeight: '700',
                                        backgroundColor: '#ecfdf5',
                                        color: '#059669',
                                        border: '1px solid #a7f3d0',
                                        borderRadius: '8px',
                                        marginLeft: 'auto',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAcceptSchedule(tItem.id);
                                      }}
                                    >
                                      재수락
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="chat-meta-row" style={{ alignSelf: 'flex-start' }}>
                            <span className="chat-meta-sender">AI 잘됨이</span>
                            <span className="chat-meta-time">{formatCardTime(item.createdAt)}</span>
                          </div>
                        </div>
                      );
                    }
                    if (item.type === 'rejected_outgoing_single') {
                      const rItem = item.data;
                      if (!rItem) return null;
                      const rejecterMember = getRejecterMember(rItem);
                      const dateStr = rItem.dateStr || `${rItem.year}.${rItem.month < 10 ? '0' : ''}${rItem.month}.${rItem.date < 10 ? '0' : ''}${rItem.date}`;
                      const timeStr = `${formatHour(rItem.startHour)} ~ ${formatHour(rItem.endHour)}`;
                      const isLeave = /반차|연차|휴가|병가/i.test(rItem.title || '');
                      const reasonMatch = (rItem.description || '').match(/\[반려사유\]\s*([^|]+)/);
                      const reasonText = reasonMatch ? reasonMatch[1].trim() : null;

                      return (
                        <div key={item.id} className="chat-bubble-wrap ai" style={{ marginTop: '4px', marginBottom: '14px' }}>
                          <div className="chat-bubble ai" style={{ whiteSpace: 'pre-line', width: '320px', maxWidth: '100%', boxSizing: 'border-box' }}>
                            <div style={{ fontWeight: '600', marginBottom: '10px' }}>
                              {rejecterMember.name}님이 {isLeave ? '결재를' : '업무 요청을'} 반려하셨습니다.{reasonText && ` (사유: ${reasonText})`}
                            </div>
                            <div 
                              id={'card_' + rItem.id}
                              data-card-title={rItem.title}
                              onClick={() => openDetailModal(rItem)}
                              style={{
                                backgroundColor: '#ffffff',
                                border: '1px solid var(--border-color)',
                                borderRadius: '10px',
                                padding: '12px 14px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                                width: '100%',
                                boxSizing: 'border-box',
                                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = '#94a3b8';
                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(15, 23, 42, 0.08)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border-color)';
                                e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.04)';
                              }}
                            >
                              <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0f172a', marginBottom: '2px' }}>
                                {isLeave ? '결재 1' : '일정 1'} : "{rItem.title}"
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px', color: '#334155' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#334155', marginTop: '2px', alignItems: 'center' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#475569' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                    <span>담당</span>
                                  </div>
                                  <div style={{ wordBreak: 'break-all', whiteSpace: 'pre-line', fontWeight: '700', color: '#0f172a' }}>{TEAM.find(m => m.id === rItem.memberId)?.name || '담당자'}</div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#334155', marginTop: '2px', alignItems: 'center' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#475569' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                    <span>날짜</span>
                                  </div>
                                  <div style={{ wordBreak: 'break-all', whiteSpace: 'pre-line' }}>{dateStr}</div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#334155', marginTop: '2px', alignItems: 'center' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#475569' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    <span>시간</span>
                                  </div>
                                  <div style={{ wordBreak: 'break-all', whiteSpace: 'pre-line' }}>{timeStr}</div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#dc2626', marginTop: '2px', alignItems: 'center' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '700', color: '#dc2626' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                    <span>상태</span>
                                  </div>
                                  <div style={{ fontWeight: '800' }}>반려</div>
                                </div>

                                {reasonText && (
                                  <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#b91c1c', marginTop: '2px', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '700', color: '#b91c1c' }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                      <span>사유</span>
                                    </div>
                                    <div style={{ fontWeight: '700', wordBreak: 'break-all' }}>{reasonText}</div>
                                  </div>
                                )}
                              </div>

                              <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', flexWrap: 'wrap', gap: '6px' }}>
                                <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#dc2626', backgroundColor: '#fef2f2', padding: '4px 10px', borderRadius: '6px', border: 'none' }}>
                                  ❌ 반려됨 ({rejecterMember.name} {rejecterMember.role || '사원'} 반려)
                                </span>
                                <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCancelSchedule(rItem.id);
                                    }}
                                    style={{
                                      padding: '5px 12px',
                                      fontSize: '12px',
                                      backgroundColor: '#fef2f2',
                                      color: '#dc2626',
                                      border: '1px solid #fca5a5',
                                      borderRadius: '8px',
                                      fontWeight: '700',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {isLeave ? '요청취소' : '요청취소'}
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleResubmitSchedule(rItem.id);
                                    }}
                                    style={{
                                      padding: '5px 12px',
                                      fontSize: '12px',
                                      backgroundColor: '#f0fdf4',
                                      color: '#16a34a',
                                      border: '1px solid #86efac',
                                      borderRadius: '8px',
                                      fontWeight: '700',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    다시요청
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="chat-meta-row" style={{ alignSelf: 'flex-start' }}>
                            <span className="chat-meta-sender">AI 잘됨이</span>
                            <span className="chat-meta-time">{formatCardTime(item.createdAt)}</span>
                          </div>
                        </div>
                      );
                    }
                    if (item.type === 'accepted_outgoing_single') {
                      const aItem = item.data;
                      if (!aItem) return null;
                      const dateStr = aItem.dateStr || `${aItem.year}.${aItem.month < 10 ? '0' : ''}${aItem.month}.${aItem.date < 10 ? '0' : ''}${aItem.date}`;
                      const timeStr = `${formatHour(aItem.startHour)} ~ ${formatHour(aItem.endHour)}`;
                      const isLeave = /반차|연차|휴가|병가/i.test(aItem.title || '');
                      const isDelegatedTask = (aItem.requesterId === ME.id || (ME.id === 'sh' && aItem.requesterId === 'yoonhee')) && (aItem.memberId !== ME.id && !(ME.id === 'sh' && aItem.memberId === 'yoonhee'));
                      const targetWorker = TEAM.find(m => m.id === aItem.memberId) || { name: '정다음', role: '사원' };
                      const approverMember = (aItem.approverId ? TEAM.find(m => m.id === aItem.approverId) : null) || (isDelegatedTask ? targetWorker : { name: '조상무', role: '상무' });
                      const actualAcceptor = isDelegatedTask ? targetWorker : approverMember;

                      return (
                        <div key={item.id} className="chat-bubble-wrap ai" style={{ marginTop: '4px', marginBottom: '14px' }}>
                          <div className="chat-bubble ai" style={{ whiteSpace: 'pre-line', width: '320px', maxWidth: '100%', boxSizing: 'border-box' }}>
                            <div style={{ fontWeight: '600', marginBottom: '10px' }}>
                              {actualAcceptor.name}님이 {isLeave ? '결재를' : '업무 요청을'} 수락하셨습니다.
                            </div>
                            <div 
                              id={'card_' + aItem.id}
                              data-card-title={aItem.title}
                              onClick={() => openDetailModal(aItem)}
                              style={{
                                backgroundColor: '#ffffff',
                                border: '1px solid #a7f3d0',
                                borderRadius: '10px',
                                padding: '12px 14px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                                width: '100%',
                                boxSizing: 'border-box',
                                boxShadow: '0 1px 3px rgba(16, 185, 129, 0.04)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = '#34d399';
                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.12)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = '#a7f3d0';
                                e.currentTarget.style.boxShadow = '0 1px 3px rgba(16, 185, 129, 0.04)';
                              }}
                            >
                              <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0f172a', marginBottom: '2px' }}>
                                {isLeave ? '결재 1' : '일정 1'} : "{aItem.title}"
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px', color: '#334155' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#334155', marginTop: '2px', alignItems: 'center' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#475569' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                    <span>담당</span>
                                  </div>
                                  <div style={{ wordBreak: 'break-all', whiteSpace: 'pre-line', fontWeight: '700', color: '#0f172a' }}>{TEAM.find(m => m.id === aItem.memberId)?.name || '담당자'}</div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#334155', marginTop: '2px', alignItems: 'center' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#475569' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                    <span>날짜</span>
                                  </div>
                                  <div style={{ wordBreak: 'break-all', whiteSpace: 'pre-line' }}>{dateStr}</div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '6px', fontSize: '12.5px', color: '#334155', marginTop: '2px', alignItems: 'center' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: '600', color: '#475569' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    <span>시간</span>
                                  </div>
                                  <div style={{ wordBreak: 'break-all', whiteSpace: 'pre-line' }}>{timeStr}</div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', flexWrap: 'wrap', gap: '6px' }}>
                                <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#059669', backgroundColor: '#ecfdf5', padding: '4px 10px', borderRadius: '6px', border: 'none' }}>
                                  🎉 {isLeave ? `승인 완료 (${approverMember.name} ${approverMember.role} 승인)` : `수락 완료 (${actualAcceptor.name} ${actualAcceptor.role || '사원'} 수락)`}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCancelSchedule(aItem.id);
                                  }}
                                  style={{
                                    padding: '7px 14px',
                                    fontSize: '12.5px',
                                    backgroundColor: '#fef2f2',
                                    color: '#dc2626',
                                    border: '1px solid #fca5a5',
                                    borderRadius: '8px',
                                    fontWeight: '700',
                                    lineHeight: '1.2',
                                    marginLeft: 'auto',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {isLeave ? '요청취소' : '요청취소'}
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="chat-meta-row" style={{ alignSelf: 'flex-start' }}>
                            <span className="chat-meta-sender">AI 잘됨이</span>
                            <span className="chat-meta-time">{formatCardTime(item.createdAt)}</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  });
                })()}

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

        {/* Floating Approval Request Character Mascot & Speech Bubble Tooltip */}
        {(() => {
          const pendingApprovalCount = schedules.filter(s => isApproverForItem(s) && s.status === 'requested').length;
          const incomingTaskCount = schedules.filter(s => 
            (s.memberId === ME.id || (s.memberIds && s.memberIds.includes(ME.id))) && 
            s.requesterId !== ME.id && !(ME.id === 'sh' && s.requesterId === 'yoonhee') &&
            !/반차|연차|휴가|병가/i.test(s.title || '') &&
            s.status === 'requested'
          ).length;
          const totalUnprocessedRequestsCount = pendingApprovalCount + incomingTaskCount;

          if (totalUnprocessedRequestsCount > 0 && showUnprocessedChip) {
            return (
              <div 
                style={{ 
                  position: 'absolute', 
                  right: '20px', 
                  bottom: '76px', 
                  zIndex: 50, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'flex-end',
                  cursor: 'pointer',
                  userSelect: 'none',
                  animation: 'floatCharacterIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
                onClick={() => {
                  const firstCard = document.querySelector('[id^="card_"]') || document.querySelector('[data-card-title]');
                  if (firstCard) {
                    firstCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    firstCard.style.transition = 'box-shadow 0.3s ease, border-color 0.3s ease';
                    firstCard.style.borderColor = '#10b981';
                    firstCard.style.boxShadow = '0 0 0 4px rgba(16, 185, 129, 0.2)';
                    setTimeout(() => {
                      firstCard.style.borderColor = '#cbd5e1';
                      firstCard.style.boxShadow = '0 2px 6px rgba(15, 23, 42, 0.04)';
                    }, 1600);
                  } else if (chatMessagesRef.current) {
                    chatMessagesRef.current.scrollTo({ top: chatMessagesRef.current.scrollHeight, behavior: 'smooth' });
                  }
                }}
              >
                {/* Speech Bubble Tooltip */}
                <div 
                  style={{
                    position: 'relative',
                    marginBottom: '8px',
                    marginRight: '6px',
                    backgroundColor: '#18181b',
                    color: '#ffffff',
                    padding: '5px 9px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    fontSize: '12.5px',
                    fontWeight: '600',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                  }}
                >
                  <span style={{ fontSize: '13px', lineHeight: 1, margin: 0, padding: 0 }}>💡</span>
                  <span>받은 요청 {totalUnprocessedRequestsCount}건</span>

                  {/* Bottom Pointer Beak / Tail */}
                  <div 
                    style={{
                      position: 'absolute',
                      bottom: '-6px',
                      right: '26px',
                      width: 0,
                      height: 0,
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderTop: '6px solid #18181b'
                    }}
                  />
                </div>

                {/* Character Button with Ground Shadow */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <button 
                    type="button"
                    className="ai-toggle-floating-btn"
                    style={{ position: 'relative', right: 0, bottom: 0, cursor: 'pointer' }}
                    title="결재 요청건 보기"
                  >
                    <img src="/bi2.png" alt="BI Logo 2" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </button>

                  {/* Ground Shadow Effect */}
                  <div 
                    style={{
                      width: '46px',
                      height: '7px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(0, 0, 0, 0.22)',
                      marginTop: '-6px',
                      filter: 'blur(2px)',
                      pointerEvents: 'none'
                    }}
                  />
                </div>
              </div>
            );
          }
          return null;
        })()}

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
            <div className="date-navigator" style={{ display: 'flex', alignItems: 'center' }}>
              {!isDrawerOpen && (
                <button 
                  className="close-drawer-btn" 
                  onClick={() => setIsDrawerOpen(true)}
                  title="사이드바 열기"
                  style={{ marginRight: '10px', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="12" x2="16" y2="12" />
                    <polyline points="10 6 16 12 10 18" />
                    <line x1="20" y1="5" x2="20" y2="19" />
                  </svg>
                </button>
              )}
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
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginLeft: '4px' }}>
                <button 
                  className="today-btn" 
                  onClick={() => {
                    const today = new Date();
                    setCurrentYear(today.getFullYear());
                    setCurrentMonth(today.getMonth() + 1);
                    setSelectedDate(today.getDate());
                  }}
                  style={{
                    padding: '0 12px',
                    height: '24px',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#475569',
                    backgroundColor: 'transparent',
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: '1',
                    boxSizing: 'border-box'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                    e.currentTarget.style.borderColor = '#94a3b8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.borderColor = '#cbd5e1';
                  }}
                  title="오늘 날짜로 이동"
                >
                  오늘
                </button>

                <button 
                  className={`weekend-toggle-btn ${showWeekend ? 'active' : ''}`}
                  onClick={() => {
                    setShowWeekend(prev => {
                      const next = !prev;
                      if (!next) {
                        const dateObj = new Date(currentYear, currentMonth - 1, selectedDate);
                        const dow = dateObj.getDay();
                        if (dow === 6) {
                          setSelectedDate(prevDate => Math.max(1, prevDate - 1));
                        } else if (dow === 0) {
                          setSelectedDate(prevDate => Math.max(1, prevDate - 2));
                        }
                      }
                      return next;
                    });
                  }}
                  style={{
                    padding: '0 12px',
                    height: '24px',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#475569',
                    backgroundColor: showWeekend ? 'rgba(255, 187, 0, 0.2)' : 'transparent',
                    border: showWeekend ? '1px solid #D99B00' : '1px solid #cbd5e1',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: '1',
                    boxSizing: 'border-box'
                  }}
                  onMouseEnter={(e) => {
                    if (!showWeekend) {
                      e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                      e.currentTarget.style.borderColor = '#94a3b8';
                    } else {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 187, 0, 0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!showWeekend) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.borderColor = '#cbd5e1';
                    } else {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 187, 0, 0.2)';
                    }
                  }}
                  title="주말 표시 여부 토글"
                >
                  주말
                </button>
              </div>
            </div>

            {/* Right Tabs: DAY / WEEK / MONTH / LIST */}
            <div className="toggle-tab-container" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', height: '100%', display: 'flex', alignItems: 'center', zIndex: 20 }}>
              <div className="toggle-group" style={{ display: 'flex', height: '100%', alignItems: 'center', gap: '24px' }}>
                <button 
                  className={`toggle-item ${timeViewTab === 'daily' ? 'active-blue' : ''}`} 
                  onClick={() => setTimeViewTab('daily')}
                  style={{
                    position: 'relative',
                    height: '100%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 10px',
                    fontSize: '13.5px',
                    fontWeight: timeViewTab === 'daily' ? '700' : '500',
                    color: timeViewTab === 'daily' ? '#000000' : '#94a3b8',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  DAY
                </button>
                <button 
                  className={`toggle-item ${timeViewTab === 'weekly' ? 'active-blue' : ''}`} 
                  onClick={() => setTimeViewTab('weekly')}
                  style={{
                    position: 'relative',
                    height: '100%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 10px',
                    fontSize: '13.5px',
                    fontWeight: timeViewTab === 'weekly' ? '700' : '500',
                    color: timeViewTab === 'weekly' ? '#000000' : '#94a3b8',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  WEEK
                </button>
                <button 
                  className={`toggle-item ${timeViewTab === 'monthly' ? 'active-blue' : ''}`} 
                  onClick={() => setTimeViewTab('monthly')}
                  style={{
                    position: 'relative',
                    height: '100%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 10px',
                    fontSize: '13.5px',
                    fontWeight: timeViewTab === 'monthly' ? '700' : '500',
                    color: timeViewTab === 'monthly' ? '#000000' : '#94a3b8',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  MONTH
                </button>
                <button 
                  className={`toggle-item ${timeViewTab === 'list' ? 'active-blue' : ''}`} 
                  onClick={() => setTimeViewTab('list')}
                  style={{
                    position: 'relative',
                    height: '100%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 10px',
                    fontSize: '13.5px',
                    fontWeight: timeViewTab === 'list' ? '700' : '500',
                    color: timeViewTab === 'list' ? '#000000' : '#94a3b8',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  LIST
                </button>
              </div>
            </div>
            
            {/* User Session & Reset Controls (Right aligned) */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 10 }}>
              
              {/* User Profile Trigger & Floating Dropdown Menu */}
              <div ref={userMenuRef} style={{ position: 'relative' }}>
                <div 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsUserMenuOpen(prev => !prev);
                  }}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    padding: '4px 6px',
                    borderRadius: '8px',
                    transition: 'background-color 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  title="사용자 메뉴 열기"
                >
                  {/* Avatar Circle */}
                  <div style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    backgroundColor: ME.color || '#000000',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10.5px',
                    fontWeight: '600',
                    overflow: 'hidden',
                    padding: 0,
                    flexShrink: 0
                  }}>
                    {getMemberAvatarPic(ME) ? (
                      <img src={getMemberAvatarPic(ME)} alt={ME.name} style={getMemberAvatarStyle(ME, 0)} />
                    ) : (
                      ME.avatar
                    )}
                  </div>
                  
                  {/* User Name & Role */}
                  <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#0f172a', whiteSpace: 'nowrap' }}>
                    {displayUser.name}{displayUser.role ? ` ${displayUser.role}` : ''}
                  </span>

                  {/* Chevron Arrow */}
                  <svg 
                    width="13" 
                    height="13" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="#64748b" 
                    strokeWidth="2.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                    style={{
                      transform: isUserMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                      flexShrink: 0,
                      marginLeft: '2px'
                    }}
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>

                {/* Floating Profile Dropdown Layer */}
                {isUserMenuOpen && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    minWidth: '180px',
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    border: '1.5px solid #e2e8f0',
                    boxShadow: '0 12px 30px rgba(15, 23, 42, 0.15), 0 4px 12px rgba(0, 0, 0, 0.05)',
                    zIndex: 9999,
                    padding: '5px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}>
                    <div style={{ padding: '6px 10px 4px 10px', fontSize: '11px', fontWeight: '800', color: '#94a3b8' }}>
                      계정 / 멤버 전환
                    </div>
                    {TEAM.map(tm => (
                      <div
                        key={tm.id}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setVirtualUser(tm);
                          setIsUserMenuOpen(false);
                          showLayerAlert(`${tm.name} ${tm.role || ''}(으)로 계정이 전환되었습니다.`, '계정 전환', 'success');
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          fontSize: '12.5px',
                          fontWeight: ME.id === tm.id ? '800' : '600',
                          color: ME.id === tm.id ? '#6366f1' : '#334155',
                          backgroundColor: ME.id === tm.id ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          boxSizing: 'border-box'
                        }}
                      >
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: tm.color || '#6366f1' }}></span>
                        <span>{ME.id === tm.id ? `나 (${tm.role || '팀원'})` : `${tm.name} (${tm.role || '팀원'})`}</span>
                        {ME.id === tm.id && <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: '800' }}>✓</span>}
                      </div>
                    ))}
                    <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '4px 0' }}></div>
                    {/* Reset Data Menu Item */}
                    <div
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsUserMenuOpen(false);
                        showLayerConfirm(
                          '모든 대화, 일정 및 대시보드 데이터를 초기화하시겠습니까?',
                          '시연 데이터 초기화',
                          () => handleGlobalResetDemo()
                        );
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '700',
                        color: '#ef4444',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        userSelect: 'none',
                        boxSizing: 'border-box',
                        transition: 'background-color 0.12s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1 4 1 10 7 10"></polyline>
                        <polyline points="23 20 23 14 17 14"></polyline>
                        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
                      </svg>
                      <span>시연 데이터 초기화</span>
                    </div>

                    {/* Logout Menu Item */}
                    <div
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsUserMenuOpen(false);
                        if (isConfigured) {
                          handleLogOut();
                        } else {
                          showLayerAlert('로그아웃 되었습니다.', '알림', 'info');
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '700',
                        color: '#334155',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        userSelect: 'none',
                        boxSizing: 'border-box',
                        transition: 'background-color 0.12s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                      </svg>
                      <span>로그아웃</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Custom Interactive Project Select Dropdown Card */}
              <div ref={projectMenuRef} style={{ position: 'relative' }}>
                <div
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsProjectMenuOpen(prev => !prev);
                  }}
                  style={{
                    height: '32px',
                    backgroundColor: isProjectMenuOpen ? 'rgba(0, 0, 0, 0.04)' : 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0 8px 0 6px',
                    fontSize: '13px',
                    fontWeight: '800',
                    color: '#0f172a',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxSizing: 'border-box',
                    transition: 'background-color 0.15s ease',
                    userSelect: 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isProjectMenuOpen) {
                      e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isProjectMenuOpen) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                  title="프로젝트 선택"
                >
                  <span style={{
                    maxWidth: '160px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    lineHeight: '1'
                  }}>
                    {headerSelectedProject}
                  </span>
                  
                  <svg 
                    width="12" 
                    height="12" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="#64748b" 
                    strokeWidth="2.8" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                    style={{
                      transform: isProjectMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                      flexShrink: 0
                    }}
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>

                {/* Floating Options Layer */}
                {isProjectMenuOpen && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    width: '260px',
                    backgroundColor: '#ffffff',
                    borderRadius: '14px',
                    border: '1.5px solid #e2e8f0',
                    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.16), 0 4px 12px rgba(0, 0, 0, 0.05)',
                    zIndex: 9999,
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    maxHeight: '320px',
                    overflowY: 'auto'
                  }}>
                    {[
                      '전체',
                      '신영증권 외화표시펀드 매매 시스템 구축',
                      '삼성증권 연금 고객중심 서비스 개선',
                      'NH투자증권 퇴직연금시스템 운영',
                      '경찰공제회 시스템 유지보수',
                      '대신증권 연금 경쟁력 강화',
                      '다음 D-RPS 고도화',
                      '해당없음'
                    ].map((projOption) => {
                      const isSelected = headerSelectedProject === projOption;
                      return (
                        <div
                          key={projOption}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setHeaderSelectedProject(projOption);
                            setIsProjectMenuOpen(false);
                          }}
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: '9px',
                            fontSize: '12.5px',
                            fontWeight: isSelected ? '800' : '600',
                            color: isSelected ? '#000000' : '#334155',
                            backgroundColor: isSelected ? '#f1f5f9' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            cursor: 'pointer',
                            userSelect: 'none',
                            boxSizing: 'border-box',
                            transition: 'all 0.12s ease',
                            lineHeight: '1.3'
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc';
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <span>{projOption}</span>
                          {isSelected && (
                            <span style={{ fontWeight: '900', color: '#000000', fontSize: '14px', flexShrink: 0 }}>✓</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>


        </div>

        {/* Horizontal Date Selector (Hidden in MONTH view) */}
        {timeViewTab !== 'monthly' && (
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
                if (!showWeekend && (isSat || isSun)) return null;

                const hasSchedules = schedules.some(s => isScheduleInMonth(s, currentYear, currentMonth) && s.date === dayNum);
                
                const selectedObj = new Date(currentYear, currentMonth - 1, selectedDate);
                const dayOfWeekIndex = selectedObj.getDay();
                const startOfWeek = selectedDate - dayOfWeekIndex;
                const endOfWeek = startOfWeek + 6;
                const isInWeek = timeViewTab === 'weekly' && dayNum >= startOfWeek && dayNum <= endOfWeek;
                const isNotInWeek = timeViewTab === 'weekly' && !isInWeek;
                const isWeekStart = timeViewTab === 'weekly' && dayNum === startOfWeek;
                const isWeekEnd = timeViewTab === 'weekly' && dayNum === endOfWeek;

                return (
                  <button
                    key={dayNum}
                    className={`date-item ${isSelected ? 'active' : ''} ${isInWeek ? 'in-week' : ''} ${isNotInWeek ? 'not-in-week' : ''} ${isWeekStart ? 'week-start' : ''} ${isWeekEnd ? 'week-end' : ''} ${isToday ? 'today' : ''} ${isSat ? 'sat' : ''} ${isSun ? 'sun' : ''}`}
                    onClick={() => setSelectedDate(dayNum)}
                  >
                    <span className="date-item-day">{dayOfWeek}</span>
                    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="date-item-num">{dayNum}</span>
                      {isToday && <span className="date-item-today-badge">오늘</span>}
                      <span className={`date-item-dot ${hasSchedules ? 'visible' : ''}`} />
                    </div>
                  </button>
                );
              });
            })()}
          </div>
        )}

        {/* Timeline Grid Table */}
        <div className="timeline-container" ref={timelineContainerRef}>
          {timeViewTab === 'daily' && (
            <table className="timeline-table">
              <thead>
                <tr>
                  <th className="col-checkbox" style={{ width: '28px', minWidth: '28px', maxWidth: '28px', textAlign: 'center', verticalAlign: 'middle', padding: 0 }}>
                    {(() => {
                      const isAllSelected = filteredMembers.length > 0 && filteredMembers.every(m => daySelectedMemberIds.includes(m.id));
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            if (isAllSelected) {
                              setDaySelectedMemberIds([]);
                            } else {
                              setDaySelectedMemberIds(TEAM.map(m => m.id));
                            }
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '24px',
                            height: '24px'
                          }}
                          title={isAllSelected ? '전체 해제' : '전체 선택'}
                        >
                          <div style={{
                            width: '15px',
                            height: '15px',
                            borderRadius: '50%',
                            backgroundColor: isAllSelected ? '#000000' : '#f1f5f9',
                            border: isAllSelected ? '1.5px solid #000000' : '1px solid #cbd5e1',
                            boxSizing: 'border-box',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s ease'
                          }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="4.8" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                        </button>
                      );
                    })()}
                  </th>
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
                  const isMemberSelected = daySelectedMemberIds.includes(member.id);

                  const memberSchedules = isMemberSelected ? schedules.filter(s => {
                    const matchesMember = s.memberIds ? s.memberIds.includes(member.id) : s.memberId === member.id;
                    const matchesDate = isScheduleInMonth(s, currentYear, currentMonth) && s.date === selectedDate;
                    return matchesMember && matchesDate;
                  }) : [];
                  const { trackMap, totalTracks } = getSchedulesWithTracks(memberSchedules);
                  const rowHeight = isMemberSelected ? Math.max(totalTracks * 32 + 16, 74) : 34;

                  return (
                    <tr key={member.id} style={{ height: `${rowHeight}px`, opacity: isMemberSelected ? 1 : 0.65, transition: 'all 0.2s ease' }}>
                      {/* Column 0: Selection Checkbox */}
                      <td className="col-checkbox" style={{ width: '28px', minWidth: '28px', maxWidth: '28px', textAlign: 'center', verticalAlign: 'middle', padding: 0 }}>
                        <button
                          type="button"
                          onClick={() => {
                            setDaySelectedMemberIds(prev => 
                              prev.includes(member.id)
                                ? prev.filter(id => id !== member.id)
                                : [...prev, member.id]
                            );
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '24px',
                            height: '24px'
                          }}
                          title={isMemberSelected ? `${member.name} 숨기기` : `${member.name} 보이기`}
                        >
                          <div style={{
                            width: '15px',
                            height: '15px',
                            borderRadius: '50%',
                            backgroundColor: isMemberSelected ? '#000000' : '#f1f5f9',
                            border: isMemberSelected ? '1.5px solid #000000' : '1px solid #cbd5e1',
                            boxSizing: 'border-box',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s ease'
                          }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="4.8" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                        </button>
                      </td>

                      {/* Column 1: Member profile info */}
                      <td className="col-member" style={{ padding: isMemberSelected ? undefined : '2px 4px', verticalAlign: 'middle' }}>
                        <div className="member-cell-content" style={{ gap: isMemberSelected ? '4px' : '0', justifyContent: 'center' }}>
                          {isMemberSelected && (
                            <div className="member-avatar-circle" style={{ backgroundColor: '#ffffff', color: '#ffffff', fontWeight: '700', border: '1px solid #e2e8f0', overflow: 'hidden', padding: 0 }}>
                              {getMemberAvatarPic(member, index) ? (
                                <img src={getMemberAvatarPic(member, index)} alt={member.name} style={getMemberAvatarStyle(member, index)} />
                              ) : (
                                member.id === 'sh' ? '나' : member.avatar
                              )}
                            </div>
                          )}
                          <span className="member-role-label" style={{ fontSize: isMemberSelected ? undefined : '11.5px', whiteSpace: 'nowrap' }}>
                            {member.id === ME.id || member.name === ME.name ? (
                              <><strong>나</strong> <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: '600' }}>{member.role || '부장'}</span></>
                            ) : (
                              <><strong>{member.name}</strong> <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: '600' }}>{member.role || '팀원'}</span></>
                            )}
                          </span>
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
                            onClick={() => openAddModal(member, h, selectedDate, currentMonth, currentYear)}
                          >
                            {currentEvents.map(currentEvent => {
                              const trackIndex = trackMap[currentEvent.id] ?? 0;
                              const topOffset = totalTracks === 1 ? 24 : trackIndex * 32 + 12;
                              const reqId1 = currentEvent.requesterId || currentEvent.memberId;
                              const isPersonalLeave1 = /반차|연차|휴가|병가/i.test(currentEvent.title || '');
                              const isRequested = currentEvent.status === 'requested' && (isPersonalLeave1 ? true : member.id !== reqId1);
                              const isRejected = currentEvent.status === 'rejected' || currentEvent.status === `rejected_${member.id}`;
                              const isCancelled = currentEvent.status === 'cancelled' || currentEvent.isCancelled;
                              const displayStart = currentEvent.startHour < 8 ? 8 : currentEvent.startHour;
                              const displayEnd = currentEvent.endHour > 19.5 ? 19.5 : currentEvent.endHour;
                              const eventProgress = currentEvent.progress !== undefined ? currentEvent.progress : (parseScheduleDescription(currentEvent.description || '').progress);
                              const isCompleted = eventProgress === 100;

                              const isIssue = isIssueSchedule(currentEvent);

                              return (
                                <div 
                                  key={currentEvent.id}
                                  className={`schedule-block ${isIssue ? 'issue' : currentEvent.color} ${isCompleted ? 'completed' : ''} ${isRequested ? 'status-requested' : ''} ${isRejected ? 'status-rejected' : ''}`}
                                  style={{ 
                                    width: `calc(${(displayEnd - displayStart) * 2 * 100}% - 8px)`,
                                    top: `${topOffset}px`,
                                    height: '26px',
                                    bottom: 'auto',
                                    borderColor: isIssue ? 'var(--border-color)' : undefined,
                                    borderLeftColor: isIssue ? '#FF0000' : undefined,
                                    borderStyle: isRequested ? 'dashed' : (isIssue ? 'solid' : undefined),
                                    borderLeftStyle: isIssue ? 'solid' : undefined,
                                    borderColor: isCancelled ? '#cbd5e1' : undefined,
                                    borderLeftColor: isCancelled ? '#94a3b8' : undefined,
                                    backgroundColor: isCancelled ? '#f1f5f9' : undefined,
                                    color: isCancelled ? '#94a3b8' : undefined,
                                    opacity: isCancelled ? 0.75 : 1,
                                    textDecoration: isCancelled ? 'line-through' : undefined,
                                    ...(!isCancelled ? getDayCardProgressStyle(currentEvent.color, eventProgress) : {})
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDetailModal(currentEvent);
                                  }}
                                  title={`${currentEvent.title} (클릭시 상세 보기)`}
                                >
                                  {isIssue && <IssueWarningIcon size={16} />}
                                  {isCancelled && '🚫 '}
                                  {isRequested && !isIssue && !isCancelled && '⏳ '}
                                  {isRejected && !isIssue && !isCancelled && '❌ '}
                                  {currentEvent.title}
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
            let weekDates = Array.from({ length: 7 }, (_, i) => startOfWeek + i);
            if (!showWeekend) {
              weekDates = weekDates.filter(d => {
                const dateObj = new Date(currentYear, currentMonth - 1, d);
                const dow = dateObj.getDay();
                return dow !== 0 && dow !== 6;
              });
            }
            const weeklyMembers = filteredMembers.filter(m => daySelectedMemberIds.includes(m.id));
            const numMembers = weeklyMembers.length;
            const memberColWidth = 105;
            const minTableWidth = 80 + weekDates.length * Math.max(numMembers, 1) * memberColWidth;

            return (
              <table className="timeline-table" style={{ width: '100%', minWidth: `${minTableWidth}px`, tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                <colgroup>
                  <col style={{ width: '80px', minWidth: '80px' }} />
                  {weekDates.map(d => 
                    weeklyMembers.map(member => (
                      <col key={`${d}_${member.id}`} style={{ minWidth: `${memberColWidth}px` }} />
                    ))
                  )}
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan="2" style={{ width: '80px', minWidth: '80px', position: 'sticky', left: 0, zIndex: 12, textAlign: 'center', verticalAlign: 'middle', borderBottom: '2px solid var(--border-light)', backgroundColor: '#ffffff', padding: 0 }}>
                      <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span>시간</span>
                        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '1px', backgroundColor: 'var(--border-light)', zIndex: 20 }} />
                      </div>
                    </th>
                    {weekDates.map((d, dIdx) => {
                      const info = getDayLabelAndDow(d);
                      const isSat = info.dow === '토';
                      const isSun = info.dow === '일';
                      return (
                        <th 
                          key={d} 
                          id={`week_th_${d}`}
                          colSpan={Math.max(numMembers, 1)}
                          className={`${isSat ? 'sat' : ''} ${isSun ? 'sun' : ''}`}
                          style={{ fontSize: '13px', textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid var(--border-light)', borderLeft: dIdx === 0 ? 'none' : undefined, whiteSpace: 'nowrap' }}
                        >
                          {info.label} ({info.dow})
                        </th>
                      );
                    })}
                  </tr>
                  <tr>
                    {weekDates.map((d, dIdx) => {
                      const info = getDayLabelAndDow(d);
                      const isSat = info.dow === '토';
                      const isSun = info.dow === '일';
                      return weeklyMembers.map((member, memberIdx) => (
                        <th 
                          key={`${d}_${member.id}`}
                          className={`${isSat ? 'sat' : ''} ${isSun ? 'sun' : ''}`}
                          style={{ 
                            fontSize: '11px', 
                            textAlign: 'center', 
                            padding: '4px 6px', 
                            borderBottom: '2px solid var(--border-light)',
                            borderLeft: (dIdx === 0 && memberIdx === 0) ? 'none' : undefined,
                            fontWeight: '600',
                            backgroundColor: 'var(--bg-primary)',
                            minWidth: `${memberColWidth}px`,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px', width: '100%' }}>
                            <div 
                              className="member-avatar-circle" 
                              style={{ 
                                width: '22px', 
                                height: '22px', 
                                minWidth: '22px',
                                minHeight: '22px',
                                maxWidth: '22px',
                                maxHeight: '22px',
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
                                padding: 0,
                                flexShrink: 0
                              }}
                              title={getMemberRoleText(member, ME)}
                            >
                              {getMemberAvatarPic(member, memberIdx) ? (
                                <img src={getMemberAvatarPic(member, memberIdx)} alt={member.name} style={getMemberAvatarStyle(member, memberIdx)} />
                              ) : (
                                member.id === 'sh' ? '나' : member.avatar
                              )}
                            </div>
                            <span style={{ fontSize: '11.5px', fontWeight: '600', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {member.id === ME.id || member.name === ME.name ? (
                                <><strong style={{ color: '#0f172a' }}>나</strong> <span style={{ fontSize: '10px', color: '#64748b' }}>{member.role || '부장'}</span></>
                              ) : (
                                <><strong style={{ color: '#0f172a' }}>{member.name}</strong> <span style={{ fontSize: '10px', color: '#64748b' }}>{member.role || '팀원'}</span></>
                              )}
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
                        minWidth: '80px',
                        position: 'sticky',
                        left: 0,
                        zIndex: 6,
                        textAlign: 'center', 
                        fontSize: '11.5px', 
                        fontWeight: '600', 
                        color: 'var(--text-secondary)',
                        borderBottom: '1px solid var(--border-light)',
                        backgroundColor: '#ffffff',
                        padding: '0'
                      }}>
                        <div style={{ position: 'relative', width: '100%', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {formatHour(h)}
                          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '1px', backgroundColor: 'var(--border-light)', zIndex: 20 }} />
                        </div>
                      </td>
                      {weekDates.map((d, dIdx) => {
                        const info = getDayLabelAndDow(d);
                        const isSat = info.dow === '토';
                        const isSun = info.dow === '일';
                        
                        return weeklyMembers.map((member, memberIdx) => {
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
                                borderLeft: (dIdx === 0 && memberIdx === 0) ? 'none' : undefined,
                                borderRight: '1px solid var(--border-light)',
                                borderBottom: '1px solid var(--border-light)',
                                backgroundColor: info.month === 6 && info.dayNum === new Date().getDate() ? 'rgba(99, 102, 241, 0.01)' : '',
                                opacity: info.month === 6 ? 1 : 0.5
                              }}
                              onClick={() => openAddModal(member, h, info.dayNum, info.month, currentYear)}
                            >
                              {currentEvents.map(event => {
                                const reqId2 = event.requesterId || event.memberId;
                                 const isLeaveOrApprove2 = /반차|연차|휴가|병가|신청|승인/i.test(event.title || '') || Boolean(event.approverId && event.status === 'requested');
                                 const isRequested = event.status === 'requested' && (isLeaveOrApprove2 || member.id !== reqId2);
                                const isRejected = event.status === 'rejected' || event.status === `rejected_${member.id}`;
                                const isCancelled = event.status === 'cancelled' || event.isCancelled;
                                const displayStart = event.startHour < 8 ? 8 : event.startHour;
                                const displayEnd = event.endHour > 19.5 ? 19.5 : event.endHour;
                                const duration = displayEnd - displayStart;
                                const heightPx = Math.max(duration * 2 * 36 - 12, 20);
                                const eventProgress = event.progress !== undefined ? event.progress : (parseScheduleDescription(event.description || '').progress);
                                const isCompleted = eventProgress === 100;

                                const isIssue = isIssueSchedule(event);

                                return (
                                  <div
                                    key={event.id}
                                    className={`schedule-block ${isIssue ? 'issue' : event.color} ${isCompleted ? 'completed' : ''} ${isRequested ? 'status-requested' : ''} ${isRejected ? 'status-rejected' : ''}`}
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
                                      display: 'block',
                                      borderColor: isIssue ? 'var(--border-color)' : undefined,
                                      borderLeftColor: isIssue ? '#FF0000' : undefined,
                                      borderStyle: isRequested ? 'dashed' : (isIssue ? 'solid' : undefined),
                                      borderLeftStyle: isIssue ? 'solid' : undefined,
                                      borderColor: isCancelled ? '#cbd5e1' : undefined,
                                      borderLeftColor: isCancelled ? '#94a3b8' : undefined,
                                      backgroundColor: isCancelled ? '#f1f5f9' : undefined,
                                      color: isCancelled ? '#94a3b8' : undefined,
                                      opacity: isCancelled ? 0.75 : 1,
                                      textDecoration: isCancelled ? 'line-through' : undefined,
                                      ...(!isCancelled ? getWeekCardProgressStyle(event, currentYear, info.month, info.dayNum, schedules) : {})
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
                                      {isIssue && <IssueWarningIcon size={15} />}
                                      {isCancelled && '🚫 '}
                                      {isRequested && !isIssue && !isCancelled && '⏳ '}
                                      {isRejected && !isIssue && !isCancelled && '❌ '}
                                      {event.title}
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
            <div style={{ width: '100%', border: 'none', borderRadius: '8px', overflow: 'visible', background: '#ffffff' }}>
              {/* Header: Days of Week */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: showWeekend ? 'repeat(7, 1fr)' : 'repeat(5, 1fr)', 
                background: '#ffffff', 
                borderBottom: '2px solid var(--border-light)',
                position: 'sticky',
                top: 0,
                zIndex: 10
              }}>
                {showWeekend && <div style={{ color: 'var(--accent-red)', textAlign: 'center', padding: '10px', fontWeight: '700', fontSize: '13px' }}>일</div>}
                <div style={{ textAlign: 'center', padding: '10px', fontWeight: '700', fontSize: '13px' }}>월</div>
                <div style={{ textAlign: 'center', padding: '10px', fontWeight: '700', fontSize: '13px' }}>화</div>
                <div style={{ textAlign: 'center', padding: '10px', fontWeight: '700', fontSize: '13px' }}>수</div>
                <div style={{ textAlign: 'center', padding: '10px', fontWeight: '700', fontSize: '13px' }}>목</div>
                <div style={{ textAlign: 'center', padding: '10px', fontWeight: '700', fontSize: '13px' }}>금</div>
                {showWeekend && <div style={{ color: 'var(--accent-blue)', textAlign: 'center', padding: '10px', fontWeight: '700', fontSize: '13px' }}>토</div>}
              </div>

              {/* Month Weeks (Rows) */}
              {(() => {
                const allNormalizedSchedules = normalizeRangeSchedules(schedules);
                const days = getMonthDays(currentYear, currentMonth);
                const rows = [];
                for (let i = 0; i < days.length; i += 7) {
                  rows.push(days.slice(i, i + 7));
                }

                return rows.map((row, rIdx) => {
                  // 1. Collect all schedules for each day in this week row
                  const weekDaySchedules = row.map(day => {
                    if (!day.isCurrentMonth) return [];
                    return allNormalizedSchedules.filter(s => {
                      const isSelectedMember = s.memberIds 
                        ? s.memberIds.some(id => daySelectedMemberIds.includes(id)) 
                        : daySelectedMemberIds.includes(s.memberId);
                      return isSelectedMember && isScheduleInMonth(s, currentYear, currentMonth) && s.date === day.dayNum;
                    });
                  });

                  // 2. Group items by title or groupId to form continuous range bars across columns 0..6
                  const weekEventsMap = {};

                  row.forEach((day, col) => {
                    if (!day.isCurrentMonth) return;
                    const dayScheds = weekDaySchedules[col];
                    dayScheds.forEach(s => {
                      const groupId = s.description && s.description.match(/\[그룹 ID\]\s*(g_\w+)/)?.[1];
                      const key = groupId ? `g_${groupId}` : `t_${s.title}`;
                      
                      if (!weekEventsMap[key]) {
                        weekEventsMap[key] = {
                          key,
                          title: s.title,
                          color: s.color,
                          status: s.status,
                          description: s.description,
                          memberId: s.memberId,
                          memberIds: s.memberIds,
                          sampleEvent: s,
                          startCol: col,
                          endCol: col,
                          cols: [col],
                          rowDays: row
                        };
                      } else {
                        weekEventsMap[key].endCol = col;
                        if (!weekEventsMap[key].cols.includes(col)) {
                          weekEventsMap[key].cols.push(col);
                        }
                      }
                    });
                  });

                  const weekEvents = Object.values(weekEventsMap);

                  // Sort events: longer span first, then earlier startCol
                  weekEvents.sort((a, b) => {
                    const spanA = a.endCol - a.startCol + 1;
                    const spanB = b.endCol - b.startCol + 1;
                    if (spanA !== spanB) return spanB - spanA;
                    return a.startCol - b.startCol;
                  });

                  // 3. Track Assignment (Slot allocation for row)
                  const trackOccupied = [];

                  weekEvents.forEach(evt => {
                    let trackIndex = 0;
                    while (true) {
                      if (!trackOccupied[trackIndex]) {
                        trackOccupied[trackIndex] = [false, false, false, false, false, false, false];
                      }
                      let isAvailable = true;
                      for (let c = evt.startCol; c <= evt.endCol; c++) {
                        if (trackOccupied[trackIndex][c]) {
                          isAvailable = false;
                          break;
                        }
                      }
                      if (isAvailable) {
                        evt.trackIndex = trackIndex;
                        for (let c = evt.startCol; c <= evt.endCol; c++) {
                          trackOccupied[trackIndex][c] = true;
                        }
                        break;
                      }
                      trackIndex++;
                    }
                  });

                  const totalTracksInRow = Math.max(trackOccupied.length, 3);
                  const cellMinHeight = totalTracksInRow * 26 + 36;

                  return (
                    <div key={rIdx} style={{ position: 'relative', width: '100%', background: '#fff', borderBottom: rIdx < rows.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                      {/* Day Cells Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: showWeekend ? 'repeat(7, 1fr)' : 'repeat(5, 1fr)', width: '100%' }}>
                        {row.map((day, dIdx) => {
                          if (!showWeekend && (dIdx === 0 || dIdx === 6)) return null;
                          const isCurrentMonth = day.isCurrentMonth;
                          const dayNum = day.dayNum;
                          const isSat = dIdx === 6;
                          const isSun = dIdx === 0;
                          const now = new Date();
                          const isToday = isCurrentMonth && currentYear === now.getFullYear() && currentMonth === (now.getMonth() + 1) && dayNum === now.getDate();

                          return (
                            <div
                              key={dIdx}
                              style={{
                                borderRight: showWeekend 
                                  ? (dIdx < 6 ? '1px solid var(--border-light)' : 'none')
                                  : (dIdx < 5 ? '1px solid var(--border-light)' : 'none'),
                                padding: '6px',
                                background: '#ffffff',
                                opacity: isCurrentMonth ? 1 : 0.4,
                                minHeight: `${cellMinHeight}px`,
                                boxSizing: 'border-box',
                                cursor: isCurrentMonth ? 'pointer' : 'default'
                              }}
                              onClick={() => {
                                if (isCurrentMonth) {
                                  setSelectedDate(dayNum);
                                  openAddModal(activeTeam[0] || ME, 9, dayNum, currentMonth, currentYear);
                                }
                              }}
                            >
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
                            </div>
                          );
                        })}
                      </div>

                      {/* Event Overlay Layer */}
                      <div style={{ position: 'absolute', top: '32px', left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                        {weekEvents.map(evt => {
                          const startCol = evt.startCol;
                          const endCol = evt.endCol;

                          let leftPct = 0;
                          let widthPct = 0;

                          if (showWeekend) {
                            const span = endCol - startCol + 1;
                            leftPct = (startCol / 7) * 100;
                            widthPct = (span / 7) * 100;
                          } else {
                            if (endCol < 1 || startCol > 5) return null;
                            const effStart = Math.max(1, Math.min(5, startCol));
                            const effEnd = Math.max(1, Math.min(5, endCol));
                            const startIdx = effStart - 1;
                            const span = effEnd - effStart + 1;
                            leftPct = (startIdx / 5) * 100;
                            widthPct = (span / 5) * 100;
                          }

                          const topPx = evt.trackIndex * 26;

                          const assignees = evt.memberIds && evt.memberIds.length > 0
                            ? evt.memberIds.map(id => activeTeam.find(t => t.id === id)).filter(Boolean)
                            : (evt.memberId ? [activeTeam.find(t => t.id === evt.memberId)].filter(Boolean) : [ME]);

                          const sample = evt.sampleEvent;
                          const sampleProgress = sample ? (sample.progress !== undefined ? sample.progress : (parseScheduleDescription(sample.description || '').progress)) : 0;
                          const isCompleted = sampleProgress === 100;

                          const isIssue = isIssueSchedule(sample) || isIssueSchedule(evt);
                          const isRequested = (sample && sample.status === 'requested') || evt.status === 'requested';
                          const isRejected = (sample && (sample.status === 'rejected' || (sample.status && sample.status.startsWith('rejected_')))) || evt.status === 'rejected';
                          const isCancelled = (sample && (sample.status === 'cancelled' || sample.isCancelled)) || evt.status === 'cancelled';

                          return (
                            <div
                              key={evt.key}
                              className={`schedule-block ${isIssue ? 'issue' : evt.color} ${isCompleted ? 'completed' : ''} ${isRequested ? 'status-requested' : ''} ${isRejected ? 'status-rejected' : ''}`}
                              style={{
                                position: 'absolute',
                                top: `${topPx}px`,
                                left: `calc(${leftPct}% + 4px)`,
                                width: `calc(${widthPct}% - 8px)`,
                                height: '22px',
                                padding: '0 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                display: 'flex',
                                alignItems: 'center',
                                pointerEvents: 'auto',
                                zIndex: 5,
                                borderColor: isIssue ? 'var(--border-color)' : undefined,
                                borderLeftColor: isIssue ? '#FF0000' : undefined,
                                borderStyle: isRequested ? 'dashed' : (isIssue ? 'solid' : undefined),
                                borderLeftStyle: isIssue ? 'solid' : undefined,
                                borderColor: isCancelled ? '#cbd5e1' : undefined,
                                borderLeftColor: isCancelled ? '#94a3b8' : undefined,
                                backgroundColor: isCancelled ? '#f1f5f9' : undefined,
                                color: isCancelled ? '#94a3b8' : undefined,
                                opacity: isCancelled ? 0.75 : 1,
                                textDecoration: isCancelled ? 'line-through' : undefined,
                                ...(!isCancelled ? getMonthSegmentProgressStyle(evt, currentYear, currentMonth, schedules) : {})
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openDetailModal(sample);
                              }}
                              title={`${evt.title} (${assignees.map(a => a.name).join(', ')})`}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '6px' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                  {isIssue && <IssueWarningIcon size={15} />}
                                  {isCancelled && '🚫 '}
                                  {isRequested && !isIssue && !isCancelled && '⏳ '}
                                  {evt.title}
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
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
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
            const visibleDates = showWeekend ? sortedDates : sortedDates.filter(d => {
              const dowIdx = new Date(currentYear, currentMonth - 1, d).getDay();
              return dowIdx !== 0 && dowIdx !== 6;
            });
            
            if (visibleDates.length === 0) {
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
                {visibleDates.map(d => {
                  const dow = getDayOfWeek(d);
                  const isSat = dow === '토';
                  const isSun = dow === '일';
                  const daySchedules = grouped[d].sort((a, b) => a.startHour - b.startHour);
                  
                  return (
                    <div key={d} id={`list-day-${d}`} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ 
                        fontSize: '15px', 
                        fontWeight: '800', 
                        color: isSun ? 'var(--accent-red)' : isSat ? 'var(--accent-blue)' : 'var(--text-primary)',
                        paddingBottom: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        textAlign: 'left'
                      }}>
                        {currentMonth}월 {d}일 ({dow}요일)
                        {d === new Date().getDate() && <span style={{ fontSize: '10px', backgroundColor: 'var(--accent-purple)', color: '#fff', padding: '2px 6px', borderRadius: '10px', fontWeight: '800' }}>오늘</span>}
                        <button
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            border: '1px solid var(--border-color)',
                            backgroundColor: '#f8fafc',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            padding: 0,
                            marginLeft: '2px',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--accent-purple)';
                            e.currentTarget.style.borderColor = 'var(--accent-purple)';
                            e.currentTarget.style.color = '#ffffff';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#f8fafc';
                            e.currentTarget.style.borderColor = 'var(--border-color)';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                          }}
                          onClick={() => openAddModal(activeTeam[0] || ME, 9, d, currentMonth, currentYear)}
                          title={`${d}일 일정 추가`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </button>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                        {daySchedules.map(event => {
                          const assignees = event.memberIds 
                            ? event.memberIds.map(id => activeTeam.find(t => t.id === id)).filter(Boolean)
                            : [];
                          const isRequested = event.status === 'requested';
                          const isRejected = event.status === 'rejected' || (event.status && event.status.startsWith('rejected_'));
                          const isCancelled = event.status === 'cancelled' || event.isCancelled;
                          const parsedDesc = parseScheduleDescription(event.description || '');
                          const eventProgress = event.progress !== undefined ? event.progress : (parsedDesc.progress || 0);
                          const isCompleted = eventProgress === 100;
                          
                          const cleanDescText = (parsedDesc.detail || parsedDesc.memo || '')
                            .replace(/\[YM:\d{4}\.\d{2}\]/g, '')
                            .replace(/\[그룹 ID\]\s*g_\w+\s*\|?\s*/gi, '')
                            .replace(/\[진척률\]\s*\d+%\s*\|?\s*/gi, '')
                            .replace(/\[상세\]\s*/gi, '')
                            .replace(/\[메모\]\s*/gi, '')
                            .replace(/^[\s|]+/, '')
                            .replace(/[\s|]+$/, '')
                            .trim();

                          const isIssue = isIssueSchedule(event);

                          return (
                            <div
                              key={event.id}
                              className={`schedule-block ${isIssue ? 'issue' : event.color}`}
                              style={{
                                position: 'static',
                                width: '100%',
                                padding: '12px 14px',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                                boxShadow: 'var(--shadow-sm)',
                                border: isCancelled ? '1px dashed #cbd5e1' : (isIssue ? '1px solid var(--border-color)' : '1px solid var(--border-light)'),
                                borderLeft: isIssue ? '4px solid #FF0000' : (isCancelled ? '4px solid #94a3b8' : undefined),
                                borderColor: isCancelled ? '#cbd5e1' : (isIssue ? 'var(--border-color)' : undefined),
                                borderLeftColor: isCancelled ? '#94a3b8' : (isIssue ? '#FF0000' : undefined),
                                borderStyle: (isCancelled || isRequested) ? 'dashed' : (isIssue ? 'solid' : undefined),
                                borderLeftStyle: (isIssue || isCancelled) ? 'solid' : undefined,
                                transition: 'all 0.2s ease',
                                textAlign: 'left',
                                opacity: isCancelled ? 0.75 : 1,
                                textDecoration: isCancelled ? 'line-through' : undefined,
                                background: isCancelled ? '#f8fafc' : '#ffffff',
                                backgroundColor: isCancelled ? '#f8fafc' : '#ffffff'
                              }}
                              onClick={() => openDetailModal(event)}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: '700', opacity: 0.8 }}>
                                  {formatHour(event.startHour)} ~ {formatHour(event.endHour)}
                                </span>
                                {isIssue && <span style={{ fontSize: '10px', color: '#dc2626', backgroundColor: '#fef2f2', padding: '2px 6px', borderRadius: '4px', fontWeight: '700', border: '1px solid #fecaca' }}>이슈/특이사항</span>}
                                {isRequested && !isIssue && <span style={{ fontSize: '10px', color: '#b45309', backgroundColor: '#fffbeb', padding: '2px 6px', borderRadius: '4px', fontWeight: '700', border: '1px solid #fef3c7' }}>승인대기</span>}
                                {isRejected && !isIssue && <span style={{ fontSize: '10px', color: '#b91c1c', backgroundColor: '#fef2f2', padding: '2px 6px', borderRadius: '4px', fontWeight: '700', border: '1px solid #fee2e2' }}>반려됨</span>}
                              </div>
                              <div style={{ fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {isIssue && <IssueWarningIcon size={20} />}
                                <span>{event.title}{eventProgress > 0 ? ` ${eventProgress}%` : ''}</span>
                              </div>
                              {cleanDescText && (
                                <div style={{ fontSize: '12px', opacity: 0.85, whiteSpace: 'pre-wrap', borderTop: '1px dashed rgba(0,0,0,0.1)', paddingTop: '4px' }}>
                                  {renderTextWithLinks(cleanDescText)}
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

        {/* Floating Report Character Button with Layer Bubble Tooltip */}
        <div style={{ position: 'fixed', right: '24px', bottom: '18px', zIndex: 999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          {showReportTooltip && (
            <div 
              style={{
                position: 'relative',
                marginBottom: '8px',
                marginRight: '6px',
                backgroundColor: '#18181b',
                color: '#ffffff',
                padding: '5px 10px',
                borderRadius: '10px',
                boxShadow: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12.5px',
                fontWeight: '500',
                cursor: 'pointer',
                userSelect: 'none',
                whiteSpace: 'nowrap',
                animation: 'fadeIn 0.2s ease'
              }}
              onClick={() => openReportModal()}
            >
              <span style={{ fontSize: '13.5px' }}>💡</span>
              <span style={{ fontWeight: '500' }}>보고서를 클릭해 보세요!</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowReportTooltip(false);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  opacity: 0.8,
                  cursor: 'pointer',
                  padding: '1px 3px',
                  marginLeft: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  lineHeight: 1,
                  transition: 'opacity 0.15s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                title="닫기"
              >
                ✕
              </button>

              {/* Bottom Pointer Beak / Tail */}
              <div 
                style={{
                  position: 'absolute',
                  bottom: '-6px',
                  right: '38px',
                  width: 0,
                  height: 0,
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderTop: '6px solid #18181b'
                }}
              />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <button 
              className="ai-toggle-floating-btn"
              onClick={() => openReportModal()}
              style={{ position: 'relative', right: 0, bottom: 0, width: '115px', height: '115px' }}
              title={
                timeViewTab === 'daily' ? '일일 업무 보고서 생성' :
                timeViewTab === 'weekly' ? '주간 업무 보고서 생성' :
                timeViewTab === 'monthly' ? '월간 업무 보고서 생성' : '업무 보고서 생성'
              }
            >
              <img src="/bi5.png" alt="Report Character" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </button>

            {/* Ground Shadow Effect Under Character Feet */}
            <div 
              style={{
                width: '52px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: 'rgba(0, 0, 0, 0.22)',
                marginTop: '-7px',
                filter: 'blur(2.2px)',
                pointerEvents: 'none'
              }}
            />
          </div>
        </div>
      </main>
      </div>

      {/* ──── ADD SCHEDULE MODAL ─────────────────── */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" style={{ width: '100%', maxWidth: '680px', padding: '28px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div className="modal-title" style={{ fontSize: '21px', marginBottom: 0 }}>일정 추가</div>
              <button 
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  cursor: 'pointer', 
                  padding: '4px', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  color: 'var(--text-tertiary)',
                  borderRadius: '4px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
                onClick={() => setIsModalOpen(false)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="modal-detail-body" style={{ margin: '16px 0', fontSize: '16px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>일정명</label>
                  <input 
                    type="text" 
                    className="modal-input" 
                    placeholder="일정 제목을 입력하세요"
                    value={addTitle} 
                    onChange={(e) => setAddTitle(e.target.value)} 
                    style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '15.5px', boxSizing: 'border-box' }}
                    autoFocus
                  />
                </div>

                <div style={{ width: '115px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>구분</label>
                  <StyledSelect
                    value={addCategory}
                    onChange={(val) => setAddCategory(val)}
                    options={['일반', '휴가', '이슈']}
                    width="100%"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>일정 기간 및 시간</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '220px' }}>
                    <input 
                      type="date" 
                      className="modal-input" 
                      value={addStartDateStr} 
                      onChange={(e) => {
                        setAddStartDateStr(e.target.value);
                        if (!addEndDateStr || e.target.value > addEndDateStr) {
                          setAddEndDateStr(e.target.value);
                        }
                      }} 
                      style={{ flex: 1, padding: '9px 10px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: '#fff' }}
                    />
                    <StyledSelect
                      value={addStartHour}
                      onChange={(val) => {
                        const newStart = parseFloat(val);
                        setAddStartHour(newStart);
                        if (addEndHour <= newStart) {
                          setAddEndHour(newStart + 1);
                        }
                      }}
                      options={hourSlots.map(h => ({ value: h, label: formatHour(h) }))}
                      width="110px"
                    />
                  </div>

                  <span style={{ fontWeight: '700', color: 'var(--text-tertiary)', padding: '0 2px' }}>~</span>

                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '220px' }}>
                    <input 
                      type="date" 
                      className="modal-input" 
                      value={addEndDateStr} 
                      onChange={(e) => setAddEndDateStr(e.target.value)} 
                      style={{ flex: 1, padding: '9px 10px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: '#fff' }}
                    />
                    <StyledSelect
                      value={addEndHour}
                      onChange={(val) => setAddEndHour(parseFloat(val))}
                      options={getAddEndHourOptions().map(h => ({ value: h, label: formatHour(h) }))}
                      width="110px"
                    />
                  </div>
                </div>
              </div>

              {/* 진척률 바 그래프 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>진척률</label>
                  <span style={{ fontSize: '15px', fontWeight: '800', color: addProgress > 0 ? 'var(--accent-purple)' : 'var(--text-tertiary)' }}>
                    {addProgress}%
                  </span>
                </div>
                <div style={{ 
                  display: 'flex', 
                  gap: 0, 
                  backgroundColor: '#f1f5f9', 
                  padding: '3px', 
                  borderRadius: '12px', 
                  border: '1px solid var(--border-light)',
                  alignItems: 'center',
                  boxSizing: 'border-box',
                  overflow: 'hidden'
                }}>
                  <button
                    type="button"
                    onClick={() => setAddProgress(0)}
                    style={{
                      padding: '0 8px',
                      height: '30px',
                      borderRadius: '8px 0 0 8px',
                      border: 'none',
                      backgroundColor: addProgress === 0 ? '#64748b' : 'transparent',
                      color: addProgress === 0 ? '#ffffff' : '#64748b',
                      fontSize: '12px',
                      fontWeight: '800',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      flexShrink: 0
                    }}
                    title="0% 리셋"
                  >
                    0%
                  </button>
                  {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((val, idx) => {
                    const isFilled = addProgress >= val;
                    const isCurrentTarget = addProgress === val;
                    const isLast = idx === 9;
                    const showText = isFilled ? isCurrentTarget : true;

                    return (
                      <div
                        key={val}
                        onClick={() => setAddProgress(val)}
                        style={{
                          flex: 1,
                          height: '30px',
                          borderRadius: isLast ? '0 8px 8px 0' : '0',
                          backgroundColor: isFilled ? '#000000' : '#ffffff',
                          borderRight: isLast ? 'none' : (isFilled ? '1px solid rgba(255,255,255,0.15)' : '1px solid #e2e8f0'),
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isFilled ? '#ffffff' : '#94a3b8',
                          fontSize: '11.5px',
                          fontWeight: '800',
                          transition: 'all 0.15s ease',
                          userSelect: 'none'
                        }}
                        title={`${val}%`}
                      >
                        {showText ? `${val}%` : ''}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>상세내용</label>
                <textarea 
                  placeholder="업무 지시 사항, 아젠다 등 상세 내용을 입력하세요" 
                  value={addDetail} 
                  onChange={(e) => setAddDetail(e.target.value)} 
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', resize: 'none', height: '110px', fontFamily: 'inherit', fontSize: '15px', lineHeight: '1.45' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>담당자 (복수 선택 가능)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '4px 0' }}>
                  {activeTeam.map(m => {
                    const isChecked = addMemberIds.includes(m.id);
                    return (
                      <label 
                        key={m.id} 
                        style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '8px', 
                          cursor: 'pointer', 
                          background: isChecked ? 'rgba(99, 102, 241, 0.08)' : '#f8fafc', 
                          padding: '8px 14px', 
                          borderRadius: '20px', 
                          border: `1.5px solid ${isChecked ? 'var(--accent-purple)' : 'var(--border-light)'}`, 
                          fontSize: '14.5px', 
                          fontWeight: '600', 
                          transition: 'var(--transition)',
                          userSelect: 'none'
                        }}
                      >
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAddMemberIds(prev => [...prev, m.id]);
                            } else {
                              setAddMemberIds(prev => prev.filter(id => id !== m.id));
                            }
                          }}
                          style={{ display: 'none' }}
                        />
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: m.color }} />
                        {m.name}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>추가 내용 / 메모</label>
                <textarea 
                  placeholder="회의 안건, 준비물 등 메모를 입력하세요" 
                  value={addMemo} 
                  onChange={(e) => setAddMemo(e.target.value)} 
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', resize: 'none', height: '80px', fontFamily: 'inherit', fontSize: '15px' }}
                />
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '16px', gap: '10px' }}>
              <button className="modal-btn" onClick={() => setIsModalOpen(false)} disabled={isSavingEvent}>취소</button>
              <button className="modal-btn primary" onClick={saveManualSchedule} disabled={isSavingEvent}>
                {isSavingEvent ? (
                  <>
                    <LoadingSpinner size={16} color="#ffffff" />
                    저장 중...
                  </>
                ) : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──── SCHEDULE DETAIL MODAL ─────────────────── */}
      {isDetailModalOpen && selectedDetailEvent && (
        <div className="modal-overlay" onClick={() => setIsDetailModalOpen(false)}>
          <div className="modal-content" style={{ 
            width: '100%', 
            maxWidth: '680px', 
            maxHeight: '90vh', 
            display: 'flex', 
            flexDirection: 'column', 
            padding: 0, 
            gap: 0,
            overflow: 'hidden', 
            boxSizing: 'border-box' 
          }} onClick={e => e.stopPropagation()}>
            
            {/* 1. Modal Header (Fixed Top) */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              padding: '12px 24px', 
              borderBottom: '1px solid var(--border-color)', 
              backgroundColor: '#ffffff',
              flexShrink: 0 
            }}>
              <div className="modal-title" style={{ fontSize: '18px', fontWeight: '800', marginBottom: 0 }}>일정 상세 및 수정</div>
              <button 
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  cursor: 'pointer', 
                  padding: '4px', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  color: 'var(--text-tertiary)', 
                  borderRadius: '4px', 
                  transition: 'all 0.2s' 
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
                onClick={() => setIsDetailModalOpen(false)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            
            {/* 2. Scrollable Body Area */}
            <div style={{ 
              flex: 1, 
              overflowY: 'auto', 
              padding: '16px 24px 20px', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '14px',
              textAlign: 'left'
            }}>
              {/* ──── APPROVAL & PROCESSING HISTORY TIMELINE (Top of body) ──── */}
              {(() => {
                const historyList = getScheduleHistoryList(selectedDetailEvent);
                if (!historyList || historyList.length === 0) return null;

                const getActorAvatarPic = (hist) => {
                  const actorId = hist.actorId;
                  const actorName = hist.actorName || '';
                  const m = activeTeam.find(t => 
                    t.id === actorId || 
                    t.name === actorName || 
                    (actorId === 'yoonhee' && t.id === 'sh') || 
                    (actorId === 'sangmu' && t.id === 'sangmoo') || 
                    (actorId === 'daeum' && t.id === 'daum')
                  );
                  if (m) return getMemberAvatarPic(m);
                  if (actorId === 'sangmoo' || actorName.includes('상무')) return '/pic2_thumb.png';
                  if (actorId === 'daum' || actorName.includes('다음')) return '/pic2_thumb.png';
                  return '/pic1_thumb.png';
                };

                const formatHistTime = (isoString) => {
                  if (!isoString) return '';
                  const d = new Date(isoString);
                  if (isNaN(d.getTime())) return '';
                  const month = d.getMonth() + 1;
                  const day = d.getDate();
                  const hours = String(d.getHours()).padStart(2, '0');
                  const minutes = String(d.getMinutes()).padStart(2, '0');
                  return `${month}. ${day}. ${hours}:${minutes}`;
                };

                return (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap'
                    }}>
                      <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>
                        결재 및 처리 히스토리
                      </label>
                      
                      {/* Accordion Toggle: 총 N건 내용보기 / 접어두기 (보더/배경 없이 언더라인, 노볼드) */}
                      <button
                        type="button"
                        onClick={() => setIsHistoryExpanded(prev => !prev)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '2px 4px',
                          fontSize: '12px',
                          fontWeight: '400',
                          color: '#64748b',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'color 0.15s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; }}
                      >
                        <span style={{ textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                          {isHistoryExpanded ? `총 ${historyList.length}건 접어두기` : `총 ${historyList.length}건 내용보기`}
                        </span>
                        <svg 
                          width="11" 
                          height="11" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="2" 
                          strokeLinecap="round" 
                          strokeLinejoin="round"
                          style={{
                            transform: isHistoryExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s ease',
                            marginTop: '1px'
                          }}
                        >
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </button>
                    </div>

                    {/* Collapsible History List Area */}
                    {isHistoryExpanded && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', animation: 'fadeIn 0.2s ease' }}>
                        {historyList.map((hist, idx) => {
                          let badgeBg = '#ecfdf5', badgeColor = '#059669', badgeBorder = '#a7f3d0';
                          if (hist.action === 'reject') {
                            badgeBg = '#fef2f2'; badgeColor = '#dc2626'; badgeBorder = '#fecaca';
                          } else if (hist.action === 'resubmit') {
                            badgeBg = '#f0fdf4'; badgeColor = '#16a34a'; badgeBorder = '#bbf7d0';
                          } else if (hist.action === 'request') {
                            badgeBg = '#fffbeb'; badgeColor = '#b45309'; badgeBorder = '#fde68a';
                          } else if (hist.action === 'cancel') {
                            badgeBg = '#f1f5f9'; badgeColor = '#64748b'; badgeBorder = '#cbd5e1';
                          }

                          const timeDisplay = formatHistTime(hist.timestamp);
                          const avatarPic = getActorAvatarPic(hist);

                          return (
                            <div key={hist.id || idx} style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              position: 'relative',
                              paddingLeft: '2px'
                            }}>
                              {/* Left: Avatar with Name below */}
                              <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                width: '46px',
                                flexShrink: 0,
                                gap: '3px'
                              }}>
                                <img 
                                  src={avatarPic} 
                                  alt={hist.actorName || ''} 
                                  style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    objectFit: 'cover',
                                    border: '1.5px solid #e2e8f0',
                                    backgroundColor: '#ffffff'
                                  }} 
                                  onError={(e) => { e.target.src = '/pic1_thumb.png'; }}
                                />
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: '500',
                                  color: '#475569',
                                  textAlign: 'center',
                                  lineHeight: 1.15,
                                  wordBreak: 'keep-all',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {hist.actorName || '사용자'}
                                </span>
                              </div>

                              {/* Right: Single-row history item box */}
                              <div style={{
                                flex: 1,
                                backgroundColor: '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                padding: '9px 14px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px',
                                minHeight: '38px',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                              }}>
                                {/* Action badge + message */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, flexWrap: 'nowrap' }}>
                                  <span style={{
                                    fontSize: '11.5px',
                                    fontWeight: '800',
                                    color: badgeColor,
                                    backgroundColor: badgeBg,
                                    border: `1px solid ${badgeBorder}`,
                                    padding: '2px 7px',
                                    borderRadius: '4px',
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0
                                  }}>
                                    {(hist.actionLabel || '').replace(/휴가\/반차 결재 요청|일정 결재 요청/g, '결재 요청').replace(/일정 재요청/g, '재요청') || (hist.action === 'request' ? '결재 요청' : (hist.action === 'resubmit' ? '재요청' : hist.action))}
                                  </span>
                                  {hist.message && (
                                    <span style={{
                                      fontSize: '13px',
                                      fontWeight: '500',
                                      color: '#1e293b',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap'
                                    }} title={hist.message}>
                                      {hist.message}
                                    </span>
                                  )}
                                </div>

                                {/* Time on right */}
                                {timeDisplay && (
                                  <span style={{
                                    fontSize: '12px',
                                    color: '#64748b',
                                    fontWeight: '500',
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0
                                  }}>
                                    {timeDisplay}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ──── Approval Request / Waiting Banner (Below History) ──── */}
              {(selectedDetailEvent.status === 'requested' || (!selectedDetailEvent.status && selectedDetailEvent.memberId !== 'sh')) && (() => {
                const isLeave = /반차|연차|휴가|병가/i.test(selectedDetailEvent.title || '') || selectedDetailEvent.category === '휴가';
                
                const requesterId = selectedDetailEvent.requesterId || selectedDetailEvent.memberId;
                const isCurrentUserRequester = requesterId === ME.id || (ME.id === 'sh' && requesterId === 'yoonhee') || (ME.id === 'sangmoo' && requesterId === 'sangmu') || (ME.id === 'daum' && requesterId === 'daeum');

                const isCurrentUserAssignee = selectedDetailEvent.memberIds 
                  ? (selectedDetailEvent.memberIds.includes(ME.id) || (ME.id === 'sh' && selectedDetailEvent.memberIds.includes('yoonhee')) || (ME.id === 'sangmoo' && selectedDetailEvent.memberIds.includes('sangmu')) || (ME.id === 'daum' && selectedDetailEvent.memberIds.includes('daeum')))
                  : (selectedDetailEvent.memberId === ME.id || (ME.id === 'sh' && selectedDetailEvent.memberId === 'yoonhee') || (ME.id === 'sangmoo' && selectedDetailEvent.memberId === 'sangmu') || (ME.id === 'daum' && selectedDetailEvent.memberId === 'daeum'));

                const isCurrentUserApprover = selectedDetailEvent.approverId 
                  ? (selectedDetailEvent.approverId === ME.id || (ME.id === 'sh' && selectedDetailEvent.approverId === 'yoonhee') || (ME.id === 'sangmoo' && selectedDetailEvent.approverId === 'sangmu') || (ME.id === 'daum' && selectedDetailEvent.approverId === 'daeum'))
                  : (isLeave ? (ME.id === 'sangmoo' || ME.role === '상무') : isCurrentUserAssignee);

                // Can current user approve/reject this?
                const canCurrentAction = isLeave ? (isCurrentUserApprover && !isCurrentUserRequester) : (isCurrentUserAssignee && !isCurrentUserRequester);

                const requesterMember = activeTeam.find(m => m.id === requesterId || (requesterId === 'yoonhee' && m.id === 'sh') || (requesterId === 'sangmu' && m.id === 'sangmoo') || (requesterId === 'daeum' && m.id === 'daum')) || { name: '정다음', role: '사원' };
                const approverMember = activeTeam.find(m => m.id === selectedDetailEvent.approverId || (selectedDetailEvent.approverId === 'yoonhee' && m.id === 'sh') || (selectedDetailEvent.approverId === 'sangmu' && m.id === 'sangmoo') || (selectedDetailEvent.approverId === 'daeum' && m.id === 'daum')) || (isLeave ? { name: '조상무', role: '상무' } : { name: '정윤희', role: '부장' });

                const assignedNames = selectedDetailEvent.memberIds 
                  ? selectedDetailEvent.memberIds.map(id => activeTeam.find(m => m.id === id || (id === 'yoonhee' && m.id === 'sh') || (id === 'sangmu' && m.id === 'sangmoo') || (id === 'daeum' && m.id === 'daum'))?.name).filter(Boolean).join(', ')
                  : (activeTeam.find(m => m.id === selectedDetailEvent.memberId || (selectedDetailEvent.memberId === 'yoonhee' && m.id === 'sh') || (selectedDetailEvent.memberId === 'sangmu' && m.id === 'sangmoo') || (selectedDetailEvent.memberId === 'daeum' && m.id === 'daum'))?.name || '');

                const headerNoticeText = canCurrentAction 
                  ? (isLeave ? `📋 ${requesterMember.name} ${requesterMember.role || ''}님의 결재 요청입니다 (승인 대기 중)` : `⚡ ${requesterMember.name} ${requesterMember.role || ''}님이 일정을 요청하셨습니다 (수락 대기 중)`)
                  : (isCurrentUserRequester ? (isLeave ? `⏳ ${approverMember.name} ${approverMember.role || ''}님의 승인 대기 중입니다` : `⏳ ${assignedNames} 님의 수락 대기 중입니다`) : `⏳ ${approverMember.name} ${approverMember.role || ''}님의 결재 대기 중입니다`);

                return (
                  <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 'var(--radius-sm)', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {canCurrentAction ? (
                      !isRejecting ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span style={{ fontSize: '13.5px', color: '#b45309', fontWeight: '700' }}>
                            {headerNoticeText}
                          </span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button 
                              className="modal-btn" 
                              style={{ padding: '5px 12px', fontSize: '13px', backgroundColor: 'var(--accent-green)', color: '#fff', borderColor: 'var(--accent-green)', fontWeight: '700', cursor: 'pointer', borderRadius: '6px' }}
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
                                setSchedules(prev => prev.map(s => s.id === selectedDetailEvent.id ? { ...s, status: 'accepted', statusUpdatedAt: Date.now(), updatedAt: new Date().toISOString() } : s));
                                
                                setFeeds(prev => {
                                  const next = prev.map(f => {
                                    const isMatch = f.id === selectedDetailEvent.feedId || f.id === dashboardFeedId || (f.vacationInfo && f.content && f.content.includes(selectedDetailEvent.title));
                                    if (isMatch && f.vacationInfo) {
                                      return {
                                        ...f,
                                        vacationInfo: {
                                          ...f.vacationInfo,
                                          status: 'approved',
                                          approvedAt: new Date().toISOString()
                                        }
                                      };
                                    }
                                    return f;
                                  });
                                  try { localStorage.setItem('zal_feeds_v2', JSON.stringify(next)); } catch (_) {}
                                  return next;
                                });

                                setIsDetailModalOpen(false);
                                showLayerAlert(`"${selectedDetailEvent.title}" 일정을 승인(수락)했습니다.`, '승인 완료', 'success');
                              }}
                            >
                              {isLeave ? '승인' : '수락'}
                            </button>
                            <button 
                              className="modal-btn" 
                              style={{ padding: '5px 12px', fontSize: '13px', backgroundColor: 'var(--accent-red)', color: '#fff', borderColor: 'var(--accent-red)', fontWeight: '700', cursor: 'pointer', borderRadius: '6px' }}
                              onClick={() => setIsRejecting(true)}
                            >
                              반려
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
                              style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: 'var(--accent-red)', color: '#fff', borderColor: 'var(--accent-red)', fontWeight: '700', whiteSpace: 'nowrap', cursor: 'pointer' }}
                              onClick={async () => {
                                if (!rejectReasonInput.trim()) {
                                  showLayerAlert('반려 사유를 입력해야 거부할 수 있습니다.', '사유 입력 필요', 'error');
                                  return;
                                }
                                const cleanedDesc = (selectedDetailEvent.description || '').trim();
                                const newDesc = `${cleanedDesc}${cleanedDesc ? '\n' : ''}[반려 사유] ${rejectReasonInput.trim()}`;
                                
                                const rejectedStatus = ME.id === 'sangmoo' ? 'rejected_sangmu' : (ME.id === 'daum' ? 'rejected_daeum' : 'rejected_sh');
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
                                setSchedules(prev => prev.map(s => s.id === selectedDetailEvent.id ? { ...s, status: rejectedStatus, description: newDesc, statusUpdatedAt: Date.now(), updatedAt: new Date().toISOString() } : s));
                                
                                setFeeds(prev => {
                                  const next = prev.map(f => {
                                    const isMatch = f.id === selectedDetailEvent.feedId || f.id === dashboardFeedId || (f.vacationInfo && f.content && f.content.includes(selectedDetailEvent.title));
                                    if (isMatch && f.vacationInfo) {
                                      return {
                                        ...f,
                                        vacationInfo: {
                                          ...f.vacationInfo,
                                          status: 'rejected',
                                          approvedAt: null
                                        }
                                      };
                                    }
                                    return f;
                                  });
                                  try { localStorage.setItem('zal_feeds_v2', JSON.stringify(next)); } catch (_) {}
                                  return next;
                                });

                                setIsDetailModalOpen(false);
                                showLayerAlert(`"${selectedDetailEvent.title}" 일정을 반려했습니다.`, '반려 완료', 'info');
                              }}
                            >
                              확인
                            </button>
                            <button 
                              className="modal-btn" 
                              style={{ padding: '4px 8px', fontSize: '12px', whiteSpace: 'nowrap', cursor: 'pointer' }}
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
                        {headerNoticeText}
                      </span>
                    )}
                  </div>
                );
              })()}

              {(selectedDetailEvent.status === 'rejected' || (selectedDetailEvent.status && selectedDetailEvent.status.startsWith('rejected'))) && (() => {
                const cleanedDesc = selectedDetailEvent.description || '';
                const match = cleanedDesc.match(/\[반려 사유\]\s*([^\n]*)/) || cleanedDesc.match(/\[반려사유\]\s*([^\n]*)/);
                const reason = match ? match[1] : '';
                
                const isLeave = /반차|연차|휴가|병가/i.test(selectedDetailEvent.title || '') || selectedDetailEvent.category === '휴가';
                const requesterId = selectedDetailEvent.requesterId || selectedDetailEvent.memberId;
                const isCurrentUserRequester = requesterId === ME.id || (ME.id === 'sh' && requesterId === 'yoonhee') || (ME.id === 'sangmoo' && requesterId === 'sangmu') || (ME.id === 'daum' && requesterId === 'daeum');

                const isCurrentUserApprover = selectedDetailEvent.approverId 
                  ? (selectedDetailEvent.approverId === ME.id || (ME.id === 'sh' && selectedDetailEvent.approverId === 'yoonhee') || (ME.id === 'sangmoo' && selectedDetailEvent.approverId === 'sangmu') || (ME.id === 'daum' && selectedDetailEvent.approverId === 'daeum'))
                  : (isLeave ? (ME.id === 'sangmoo' || ME.role === '상무') : true);

                const canReApprove = (isCurrentUserApprover && !isCurrentUserRequester);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 'var(--radius-sm)', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--accent-red)', fontWeight: '700' }}>❌ 반려된 일정입니다</span>
                        {reason && (
                          <span style={{ fontSize: '12.5px', color: '#7f1d1d' }}>
                            <strong>반려 사유:</strong> {reason}
                          </span>
                        )}
                      </div>
                      {canReApprove && (
                        <button
                          className="modal-btn"
                          style={{ padding: '5px 12px', fontSize: '12.5px', backgroundColor: 'var(--accent-green)', color: '#fff', borderColor: 'var(--accent-green)', fontWeight: '700', cursor: 'pointer', borderRadius: '6px' }}
                          onClick={async () => {
                            if (isConfigured) {
                              let dbSched = { ...selectedDetailEvent, status: 'accepted' };
                              await appwriteService.updateSchedule(selectedDetailEvent.id, dbSched);
                            }
                            setSchedules(prev => prev.map(s => s.id === selectedDetailEvent.id ? { ...s, status: 'accepted', statusUpdatedAt: Date.now(), updatedAt: new Date().toISOString() } : s));
                            setFeeds(prev => {
                              const next = prev.map(f => {
                                const isMatch = f.id === selectedDetailEvent.feedId || (f.vacationInfo && f.content && f.content.includes(selectedDetailEvent.title));
                                if (isMatch && f.vacationInfo) {
                                  return {
                                    ...f,
                                    vacationInfo: { ...f.vacationInfo, status: 'approved', approvedAt: new Date().toISOString() }
                                  };
                                }
                                return f;
                              });
                              try { localStorage.setItem('zal_feeds_v2', JSON.stringify(next)); } catch (_) {}
                              return next;
                            });
                            setIsDetailModalOpen(false);
                            showLayerAlert(`"${selectedDetailEvent.title}" 일정을 재승인했습니다.`, '재승인 완료', 'success');
                          }}
                        >
                          재승인
                        </button>
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
                                onClick={() => {
                                  if (!reRequestMsgInput.trim()) {
                                    showLayerAlert('재요청 메시지를 입력해 주세요.', '메시지 입력 필요', 'error');
                                    return;
                                  }
                                  handleResubmitSchedule(selectedDetailEvent.id, reRequestMsgInput.trim());
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
              
              <div className="modal-detail-body" style={{ margin: 0, fontSize: '16px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>일정명</label>
                    <input 
                      type="text" 
                      className="modal-input" 
                      value={editTitle} 
                      onChange={(e) => setEditTitle(e.target.value)} 
                      style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '15.5px', boxSizing: 'border-box' }}
                      disabled={!isDetailEditable}
                    />
                  </div>

                <div style={{ width: '115px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>구분</label>
                  <StyledSelect
                    value={editCategory}
                    onChange={(val) => setEditCategory(val)}
                    options={['일반', '휴가', '이슈']}
                    disabled={!isDetailEditable}
                    width="100%"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>일정 기간 및 시간</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '220px' }}>
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
                      style={{ flex: 1, padding: '9px 10px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: '#fff' }}
                      disabled={!isDetailEditable}
                    />
                    <StyledSelect
                      value={editStartHour}
                      onChange={(val) => {
                        const newStart = parseFloat(val);
                        setEditStartHour(newStart);
                        if (editEndHour <= newStart) {
                          setEditEndHour(newStart + 1);
                        }
                      }}
                      options={hourSlots.map(h => ({ value: h, label: formatHour(h) }))}
                      disabled={!isDetailEditable}
                      width="110px"
                    />
                  </div>

                  <span style={{ fontWeight: '700', color: 'var(--text-tertiary)', padding: '0 2px' }}>~</span>

                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '220px' }}>
                    <input 
                      type="date" 
                      className="modal-input" 
                      value={editEndDateStr} 
                      onChange={(e) => setEditEndDateStr(e.target.value)} 
                      style={{ flex: 1, padding: '9px 10px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: '#fff' }}
                      disabled={!isDetailEditable}
                    />
                    <StyledSelect
                      value={editEndHour}
                      onChange={(val) => setEditEndHour(parseFloat(val))}
                      options={getEndHourOptions().map(h => ({ value: h, label: formatHour(h) }))}
                      disabled={!isDetailEditable}
                      width="110px"
                    />
                  </div>
                </div>
              </div>

              {/* 진척률 바 그래프 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>진척률</label>
                  <span style={{ fontSize: '15px', fontWeight: '800', color: editProgress > 0 ? 'var(--accent-purple)' : 'var(--text-tertiary)' }}>
                    {editProgress}%
                  </span>
                </div>
                <div style={{ 
                  display: 'flex', 
                  gap: 0, 
                  backgroundColor: '#f1f5f9', 
                  padding: '3px', 
                  borderRadius: '12px', 
                  border: '1px solid var(--border-light)',
                  alignItems: 'center',
                  boxSizing: 'border-box',
                  overflow: 'hidden'
                }}>
                  <button
                    type="button"
                    onClick={() => isDetailEditable && setEditProgress(0)}
                    disabled={!isDetailEditable}
                    style={{
                      padding: '0 8px',
                      height: '30px',
                      borderRadius: '8px 0 0 8px',
                      border: 'none',
                      backgroundColor: editProgress === 0 ? '#64748b' : 'transparent',
                      color: editProgress === 0 ? '#ffffff' : '#64748b',
                      fontSize: '12px',
                      fontWeight: '800',
                      cursor: isDetailEditable ? 'pointer' : 'default',
                      transition: 'all 0.15s ease',
                      flexShrink: 0
                    }}
                    title="0% 리셋"
                  >
                    0%
                  </button>
                  {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((val, idx) => {
                    const isFilled = editProgress >= val;
                    const isCurrentTarget = editProgress === val;
                    const isLast = idx === 9;
                    const showText = isFilled ? isCurrentTarget : true;

                    return (
                      <div
                        key={val}
                        onClick={() => isDetailEditable && setEditProgress(val)}
                        style={{
                          flex: 1,
                          height: '30px',
                          borderRadius: isLast ? '0 8px 8px 0' : '0',
                          backgroundColor: isFilled ? '#000000' : '#ffffff',
                          borderRight: isLast ? 'none' : (isFilled ? '1px solid rgba(255,255,255,0.15)' : '1px solid #e2e8f0'),
                          cursor: isDetailEditable ? 'pointer' : 'default',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isFilled ? '#ffffff' : '#94a3b8',
                          fontSize: '11.5px',
                          fontWeight: '800',
                          transition: 'all 0.15s ease',
                          userSelect: 'none'
                        }}
                        title={`${val}%`}
                      >
                        {showText ? `${val}%` : ''}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 1) 담당자 (복수 선택 가능) - 진척률 바로 다음 */}
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

              {/* 2) 상세내용 - 값이 없으면 히든, 제목 옆 + 버튼 클릭 시 노출 */}
              {((editDetail || '').trim() || showDetailInput) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>상세내용</label>
                    {isDetailEditable && !(editDetail || '').trim() && (
                      <button
                        type="button"
                        onClick={() => setShowDetailInput(false)}
                        style={{ background: 'none', border: 'none', fontSize: '12px', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                      >
                        접기
                      </button>
                    )}
                  </div>
                  <textarea 
                    placeholder="업무 지시 사항, 아젠다 등 상세 내용을 입력하세요" 
                    value={editDetail || ''} 
                    onChange={(e) => setEditDetail(e.target.value)} 
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', resize: 'none', height: '110px', fontFamily: 'inherit', fontSize: '15px', lineHeight: '1.45' }}
                    disabled={!isDetailEditable}
                    autoFocus={!(editDetail || '').trim()}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>상세내용</label>
                  {isDetailEditable && (
                    <button
                      type="button"
                      onClick={() => setShowDetailInput(true)}
                      style={{
                        background: 'none',
                        border: '1px solid #cbd5e1',
                        borderRadius: '50%',
                        width: '20px',
                        height: '20px',
                        padding: 0,
                        fontSize: '14px',
                        fontWeight: '700',
                        color: '#64748b',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = '#94a3b8'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                      title="상세내용 입력창 열기"
                    >
                      +
                    </button>
                  )}
                </div>
              )}

              {/* 3) 추가 내용 / 메모 - 값이 없으면 히든, 제목 옆 + 버튼 클릭 시 노출 */}
              {((editMemo || '').trim() || showMemoInput) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>추가 내용 / 메모</label>
                    {isDetailEditable && !(editMemo || '').trim() && (
                      <button
                        type="button"
                        onClick={() => setShowMemoInput(false)}
                        style={{ background: 'none', border: 'none', fontSize: '12px', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                      >
                        접기
                      </button>
                    )}
                  </div>
                  <textarea 
                    placeholder="회의 안건, 준비물 등 메모를 입력하세요" 
                    value={editMemo || ''} 
                    onChange={(e) => setEditMemo(e.target.value)} 
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', resize: 'none', height: '80px', fontFamily: 'inherit', fontSize: '15px' }}
                    disabled={!isDetailEditable}
                    autoFocus={!(editMemo || '').trim()}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-secondary)' }}>추가 내용 / 메모</label>
                  {isDetailEditable && (
                    <button
                      type="button"
                      onClick={() => setShowMemoInput(true)}
                      style={{
                        background: 'none',
                        border: '1px solid #cbd5e1',
                        borderRadius: '50%',
                        width: '20px',
                        height: '20px',
                        padding: 0,
                        fontSize: '14px',
                        fontWeight: '700',
                        color: '#64748b',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = '#94a3b8'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                      title="추가 내용 / 메모 입력창 열기"
                    >
                      +
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 3. Action Buttons (Fixed Bottom) */}
          <div className="modal-actions" style={{ 
            padding: '16px 24px', 
            borderTop: '1px solid var(--border-color)', 
            backgroundColor: '#ffffff', 
            flexShrink: 0, 
            marginTop: 0, 
            gap: '10px', 
            display: 'flex', 
            justifyContent: 'flex-end', 
            alignItems: 'center' 
          }}>
              {isDetailEditable && (
                <>
                  <button 
                    className="modal-btn" 
                    disabled={isDeletingEvent || isSavingEvent}
                    style={{ 
                      backgroundColor: 'var(--accent-red)', 
                      color: '#ffffff', 
                      borderColor: 'var(--accent-red)', 
                      padding: '9px 18px', 
                      fontSize: '15px', 
                      fontWeight: '600',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: (isDeletingEvent || isSavingEvent) ? 'not-allowed' : 'pointer',
                      opacity: (isDeletingEvent || isSavingEvent) ? 0.7 : 1
                    }}
                    onClick={() => {
                      const targetEvent = selectedDetailEvent;
                      if (!targetEvent) return;
                      const fid = dashboardFeedId;

                      showLayerConfirm(
                        `"${targetEvent.title}" 일정을 정말 삭제하시겠습니까?`,
                        '일정 삭제 확인',
                        () => {
                          performDeleteScheduleAndFeed(targetEvent, fid);
                        }
                      );
                    }}
                  >
                    {isDeletingEvent ? (
                      <>
                        <LoadingSpinner size={16} color="#ffffff" />
                        삭제 중...
                      </>
                    ) : '삭제'}
                  </button>
                  <button 
                    className="modal-btn primary" 
                    disabled={isDeletingEvent || isSavingEvent}
                    onClick={saveEventEdits}
                  >
                    {isSavingEvent ? (
                      <>
                        <LoadingSpinner size={16} color="#ffffff" />
                        저장 중...
                      </>
                    ) : '저장'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ──── WORK REPORT GENERATION MODAL (Printable & Fixed Floating Actions) ─────────────────── */}
      {isReportModalOpen && (
        <div className="modal-overlay" onClick={() => closeReportModal()}>
          <div 
            className="modal-content printable-report-modal" 
            style={{ 
              width: '100%', 
              maxWidth: '900px', 
              padding: 0, 
              maxHeight: '85vh', 
              display: 'flex', 
              flexDirection: 'column', 
              overflow: 'hidden', 
              position: 'relative' 
            }} 
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header (Fixed Top - All Text Centered) */}
            <div style={{ borderBottom: '2px solid var(--border-color)', padding: '23px 28px', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {/* Left: Title & Date Nav (Shifted down 5px) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', lineHeight: 1.2, transform: 'translateY(5px)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {timeViewTab === 'daily' && '📋 일일 업무 보고서'}
                  {timeViewTab === 'weekly' && '📋 주간 업무 보고서'}
                  {timeViewTab === 'monthly' && '📋 월간 업무 보고서'}
                  {timeViewTab === 'list' && `📋 ${currentMonth}월 업무 목록`}
                </span>

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginLeft: '6px', lineHeight: 1.2 }}>
                  <button 
                    onClick={handlePrevReportDate} 
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      cursor: 'pointer', 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      padding: '2px 4px', 
                      borderRadius: '4px', 
                      color: '#475569',
                      transition: 'background-color 0.15s'
                    }}
                    title="이전 날짜 이동"
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.06)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                  </button>

                  <span style={{ fontSize: '17px', fontWeight: '700', color: '#1e293b', padding: '0 4px', userSelect: 'none', lineHeight: 1.2, display: 'inline-flex', alignItems: 'center' }}>
                    {timeViewTab === 'daily' && `${currentYear}.${currentMonth < 10 ? '0' : ''}${currentMonth}.${selectedDate < 10 ? '0' : ''}${selectedDate}`}
                    {timeViewTab === 'weekly' && getWeekRangeStr(currentYear, currentMonth, selectedDate).str}
                    {(timeViewTab === 'monthly' || timeViewTab === 'list') && `${currentYear}.${currentMonth < 10 ? '0' : ''}${currentMonth}월`}
                  </span>

                  <button 
                    onClick={handleNextReportDate} 
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      cursor: 'pointer', 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      padding: '2px 4px', 
                      borderRadius: '4px', 
                      color: '#475569',
                      transition: 'background-color 0.15s'
                    }}
                    title="다음 날짜 이동"
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.06)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Right: Metadata + Close Button (Shifted down 5px together) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', lineHeight: 1.2, transform: 'translateY(5px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '13px', color: '#64748b', lineHeight: 1.2 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600' }}>작성자 / 부서: </span>
                    <span style={{ fontWeight: '700', color: '#0f172a', marginLeft: '4px' }}>{ME.name} ({ME.role || '팀원'})</span>
                  </div>
                  <div style={{ borderLeft: '1px solid #cbd5e1', paddingLeft: '14px', display: 'inline-flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600' }}>보고 일자: </span>
                    <span style={{ fontWeight: '700', color: '#0f172a', marginLeft: '4px' }}>{new Date().toLocaleDateString('ko-KR')}</span>
                  </div>
                </div>

                <button 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => closeReportModal()}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Scrollable Document Body (Editable when isEditingReport is true) */}
            <div 
              id="printable-report-area" 
              contentEditable={isEditingReport}
              suppressContentEditableWarning={true}
              style={{ 
                flex: 1, 
                overflowY: 'auto', 
                padding: '0px 28px 20px 28px', 
                fontFamily: 'sans-serif', 
                color: '#1e293b', 
                lineHeight: '1.6',
                outline: 'none'
              }}
            >

            {/* Project & Member Selection Bar (Light Gray BG, Dropdown & Toggle Chips) */}
            <div className="report-filter-bar" style={{ 
              padding: '10px 16px', 
              marginTop: '0px',
              marginBottom: '16px',
              backgroundColor: '#f8fafc', 
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              gap: '14px',
              flexWrap: 'wrap'
            }}>
              {/* Left: Custom Project Selector Pill & Dropdown Box */}
              <div ref={reportProjectMenuRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setIsReportProjectMenuOpen(prev => !prev)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    fontSize: '14px',
                    fontWeight: '700',
                    color: '#0f172a',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    outline: 'none',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#94a3b8'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
                >
                  <span>{selectedReportProject}</span>
                  <svg 
                    width="14" 
                    height="14" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="#475569" 
                    strokeWidth="2.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                    style={{
                      transform: isReportProjectMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease'
                    }}
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>

                {/* Custom Popover Menu Box on Dropdown Click */}
                {isReportProjectMenuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      zIndex: 100,
                      minWidth: '280px',
                      maxHeight: '280px',
                      overflowY: 'auto',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.06)',
                      padding: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px'
                    }}
                  >
                    {[
                      '대신증권 연금 경쟁력 강화',
                      '신영증권 외화표시펀드 매매 시스템 구축',
                      '삼성증권 연금 고객중심 서비스 개선',
                      'NH투자증권 퇴직연금시스템 운영',
                      '경찰공제회 시스템 유지보수',
                      '다음 D-RPS 고도화',
                      '전체 프로젝트'
                    ].map(proj => {
                      const isCurrent = selectedReportProject === proj;
                      return (
                        <button
                          key={proj}
                          type="button"
                          onClick={() => {
                            setSelectedReportProject(proj);
                            setIsReportProjectMenuOpen(false);
                          }}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 12px',
                            fontSize: '14px',
                            fontWeight: isCurrent ? '700' : '600',
                            color: isCurrent ? '#000000' : '#334155',
                            backgroundColor: isCurrent ? '#f1f5f9' : 'transparent',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            transition: 'background-color 0.15s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (!isCurrent) e.currentTarget.style.backgroundColor = '#f8fafc';
                          }}
                          onMouseLeave={(e) => {
                            if (!isCurrent) e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <span>{proj}</span>
                          {isCurrent && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right: Member Selection Chips */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {/* All Chip */}
                <button
                  type="button"
                  onClick={() => {
                    if (selectedReportMembers.length === activeTeam.length) {
                      setSelectedReportMembers([]);
                    } else {
                      setSelectedReportMembers(activeTeam.map(m => m.id));
                    }
                  }}
                  style={{
                    padding: '5px 13px',
                    fontSize: '12.5px',
                    fontWeight: '700',
                    borderRadius: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    border: selectedReportMembers.length === activeTeam.length ? '1.5px solid #000000' : '1px solid #cbd5e1',
                    backgroundColor: selectedReportMembers.length === activeTeam.length ? '#000000' : '#ffffff',
                    color: selectedReportMembers.length === activeTeam.length ? '#ffffff' : '#64748b',
                    boxShadow: 'none'
                  }}
                >
                  전체
                </button>

                {/* Individual Member Chips */}
                {activeTeam.map(m => {
                  const isSelected = selectedReportMembers.includes(m.id);
                  const isMe = m.id === ME.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedReportMembers(prev => prev.filter(id => id !== m.id));
                        } else {
                          setSelectedReportMembers(prev => [...prev, m.id]);
                        }
                      }}
                      style={{
                        padding: '5px 13px',
                        fontSize: '12.5px',
                        fontWeight: '700',
                        borderRadius: '16px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        border: isSelected ? '1.5px solid #000000' : '1px solid #cbd5e1',
                        backgroundColor: isSelected ? '#000000' : '#ffffff',
                        color: isSelected ? '#ffffff' : '#475569',
                        boxShadow: 'none'
                      }}
                    >
                      {m.name}
                      {isMe && ' (나)'}
                    </button>
                  );
                })}
              </div>
            </div>

            

              {/* Schedules Table / Section */}
              {(() => {
                const isScheduleForCurrentUser = (s) => {
                  if (!s) return false;
                  if (selectedReportMembers.length === 0) return false;
                  const selectedIds = selectedReportMembers;
                  const matchesSelected = id => selectedIds.some(uid => id === uid || (uid === 'sh' && id === 'yoonhee') || (uid === 'yoonhee' && id === 'sh') || (uid === 'sangmoo' && id === 'sangmu') || (uid === 'sangmu' && id === 'sangmoo'));
                  if (matchesSelected(s.memberId)) return true;
                  if (s.memberIds && Array.isArray(s.memberIds) && s.memberIds.some(matchesSelected)) return true;
                  if (s.requesterId && matchesSelected(s.requesterId)) return true;
                  return false;
                };

                const mySchedules = schedules.filter(isScheduleForCurrentUser);

                let filteredSchedules = [];
                if (timeViewTab === 'daily') {
                  filteredSchedules = mySchedules.filter(s => isScheduleInMonth(s, currentYear, currentMonth) && s.date === selectedDate);
                } else if (timeViewTab === 'weekly') {
                  const { monday, sunday } = getWeekRangeStr(currentYear, currentMonth, selectedDate);
                  filteredSchedules = mySchedules.filter(s => {
                    const sMonth = s.month || currentMonth;
                    const sYear = s.year || currentYear;
                    const sDate = new Date(sYear, sMonth - 1, s.date);
                    sDate.setHours(12, 0, 0, 0);
                    return sDate >= monday && sDate <= sunday;
                  });
                } else if (timeViewTab === 'monthly') {
                  filteredSchedules = mySchedules.filter(s => isScheduleInMonth(s, currentYear, currentMonth));
                } else {
                  filteredSchedules = [...mySchedules];
                }

                if (filteredSchedules.length === 0) {
                  return (
                    <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8', fontSize: '15px' }}>
                      해당 기간에 등록된 업무 일정이 없습니다.
                    </div>
                  );
                }

                if (timeViewTab === 'monthly') {
                  const lastDayInMonth = new Date(currentYear, currentMonth, 0).getDate();
                  const weekBuckets = [
                    { weekName: '1주차', label: `${currentMonth}.01 ~ ${currentMonth}.07`, min: 1, max: 7 },
                    { weekName: '2주차', label: `${currentMonth}.08 ~ ${currentMonth}.14`, min: 8, max: 14 },
                    { weekName: '3주차', label: `${currentMonth}.15 ~ ${currentMonth}.21`, min: 15, max: 21 },
                    { weekName: '4주차', label: `${currentMonth}.22 ~ ${currentMonth}.28`, min: 22, max: 28 },
                  ];
                  if (lastDayInMonth > 28) {
                    weekBuckets.push({
                      weekName: '5주차',
                      label: `${currentMonth}.29 ~ ${currentMonth}.${lastDayInMonth}`,
                      min: 29,
                      max: lastDayInMonth
                    });
                  }

                  const weeklySummaries = weekBuckets.map(wb => {
                    const weekSchedules = filteredSchedules.filter(s => s.date >= wb.min && s.date <= wb.max);

                    if (weekSchedules.length === 0) {
                      return {
                        weekName: wb.weekName,
                        label: wb.label,
                        scheduleCount: 0,
                        titles: '-',
                        descSummary: '- 해당 주차에 등록된 주요 업무가 없습니다.',
                        members: ['-']
                      };
                    }

                    // 1. Members consolidation
                    const memberSet = new Set();
                    weekSchedules.forEach(s => {
                      if (s.memberIds && s.memberIds.length > 0) {
                        s.memberIds.forEach(id => {
                          const m = activeTeam.find(teamM => teamM.id === id);
                          if (m) memberSet.add(m.name);
                        });
                      } else {
                        const m = activeTeam.find(teamM => teamM.id === s.memberId);
                        memberSet.add(m ? m.name : '전체');
                      }
                    });
                    const members = Array.from(memberSet);

                    // 2. Group schedules into business domain buckets
                    const buckets = {
                      planning: [],     // 화면설계서, 스토리보드, 기획, 와이어프레임, 피그마, 디자인
                      qa_testing: [],   // 테스트, 검수, QA, TC, API, 명세, 싱크
                      dev_ops: [],      // 개발, 정책, 이슈, 백로그, Jira, 인수인계, 배포
                      meetings: [],     // 회의, 미팅, 정례, 마일스톤, 리뷰, 스크럼
                      leave: []         // 연차, 휴가, 반차, 병가
                    };

                    const rawBullets = [];

                    weekSchedules.forEach(s => {
                      const t = (s.title || '').trim();
                      let d = (s.description || '')
                        .replace(/\[YM:\d{4}\.\d{2}\]/g, '')
                        .replace(/\[그룹 ID\]\s*g_\w+\s*\|?\s*/gi, '')
                        .replace(/\[상세\]\s*/gi, '')
                        .replace(/^[\s|]+/, '')
                        .trim();

                      if (/연차|휴가|반차|병가/.test(t)) {
                        buckets.leave.push(t);
                        return;
                      }

                      const fullText = (t + ' ' + d).toLowerCase();

                      if (/화면설계|스토리보드|기획|와이어프레임|피그마|디자인/.test(fullText)) {
                        buckets.planning.push({ title: t, desc: d });
                      } else if (/테스트|검수|qa|tc|api|명세|싱크/.test(fullText)) {
                        buckets.qa_testing.push({ title: t, desc: d });
                      } else if (/개발|정책|이슈|백로그|jira|인수인계|배포/.test(fullText)) {
                        buckets.dev_ops.push({ title: t, desc: d });
                      } else {
                        buckets.meetings.push({ title: t, desc: d });
                      }

                      if (d) {
                        d.split('\n').forEach(line => {
                          const clean = line.replace(/^[•\-\s]+/, '').trim();
                          if (clean && !rawBullets.includes(clean) && !/데일리 업무|주말 멘션/.test(clean)) {
                            rawBullets.push(clean);
                          }
                        });
                      }
                    });

                    // 3. Formulate Executive Titles (Column 2)
                    const execTitles = [];
                    if (buckets.planning.length > 0) {
                      execTitles.push('• 화면설계서 & 스토리보드 기획/디자인 확정');
                    }
                    if (buckets.qa_testing.length > 0) {
                      execTitles.push('• 테스트 서버 검수 및 QA/API 명세 동기화');
                    }
                    if (buckets.dev_ops.length > 0) {
                      execTitles.push('• 개발 정책 조율, 이슈 정리 및 배포 관리');
                    }
                    if (buckets.meetings.length > 0) {
                      const mainMeetings = Array.from(new Set(buckets.meetings.map(m => m.title).filter(t => !/데일리|스크럼/.test(t))));
                      if (mainMeetings.length > 0) {
                        execTitles.push(`• 정례 미팅 및 리뷰 (${mainMeetings.join(', ')})`);
                      } else {
                        execTitles.push('• 주간 정례 회의 및 리뷰 진행');
                      }
                    }

                    const titles = execTitles.length > 0 
                      ? execTitles.join('\n') 
                      : Array.from(new Set(weekSchedules.map(s => s.title))).join('\n');

                    // 4. Formulate Executive Accomplishment Bullets (Column 3)
                    const execDescs = [];
                    const filterTitle = (t) => !/데일리|스크럼|주말 멘션|업무 정리/.test(t);

                    if (buckets.planning.length > 0) {
                      const items = Array.from(new Set(buckets.planning.map(p => p.title).filter(filterTitle)));
                      const str = items.length > 0 ? items.join(', ') : '화면설계서 작성 및 기획 확정';
                      execDescs.push(`• [기획/디자인] ${str} 완료 및 사양 컨펌`);
                    }

                    if (buckets.qa_testing.length > 0) {
                      const items = Array.from(new Set(buckets.qa_testing.map(q => q.title).filter(filterTitle)));
                      const str = items.length > 0 ? items.join(', ') : '테스트 서버 검수 및 QA 명세';
                      execDescs.push(`• [검수/QA] ${str} 진행 및 품질 검증 완료`);
                    }

                    if (buckets.dev_ops.length > 0) {
                      const items = Array.from(new Set(buckets.dev_ops.map(d => d.title).filter(filterTitle)));
                      const str = items.length > 0 ? items.join(', ') : '개발 정책 조율 및 배포/인수인계';
                      execDescs.push(`• [개발/이슈] ${str} 대응 및 배포/인수인계 완료`);
                    }

                    if (buckets.meetings.length > 0) {
                      const items = Array.from(new Set(buckets.meetings.map(m => m.title).filter(filterTitle))).join(', ');
                      if (items) {
                        execDescs.push(`• [회의/리뷰] ${items} 수행`);
                      }
                    }

                    if (buckets.leave.length > 0) {
                      execDescs.push(`• [기타] 일정 내 연차 사용 포함 (${Array.from(new Set(buckets.leave)).join(', ')})`);
                    }

                    const descSummary = execDescs.length > 0 ? execDescs.join('\n') : '• 주요 업무 일정 수행 완료';

                    return {
                      weekName: wb.weekName,
                      label: wb.label,
                      scheduleCount: weekSchedules.length,
                      titles,
                      descSummary,
                      members: members.length > 0 ? members : ['-']
                    };
                  });

                  return (
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ fontSize: '15.5px', fontWeight: '800', marginBottom: '8px', color: '#0f172a' }}>
                        1. 월간 핵심 성과 (Executive Summary)
                      </div>
                      <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '14px 18px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #cbd5e1' }}>
                            <th style={{ padding: '8px 12px 5px 12px', textAlign: 'left', width: '10%' }}>주차</th>
                            <th style={{ padding: '8px 12px 5px 12px', textAlign: 'left', width: '14%' }}>기간</th>
                            <th style={{ padding: '8px 12px 5px 12px', textAlign: 'left', width: '25%' }}>주요 수행 업무 범주</th>
                            <th style={{ padding: '8px 12px 5px 12px', textAlign: 'left', width: '38%' }}>전반적 업무 및 추진 실적 요약</th>
                            <th style={{ padding: '8px 12px 5px 12px', textAlign: 'center', width: '13%' }}>담당자</th>
                          </tr>
                        </thead>
                        <tbody>
                          {weeklySummaries.map((ws, idx) => {
                            const hasData = ws.scheduleCount > 0;
                            const displayTitles = monthlySummaryEdits[idx]?.titles !== undefined ? monthlySummaryEdits[idx].titles : ws.titles;
                            const displayDescSummary = monthlySummaryEdits[idx]?.descSummary !== undefined ? monthlySummaryEdits[idx].descSummary : ws.descSummary;
                            const isLastRow = idx === weeklySummaries.length - 1;

                            return (
                              <tr key={idx} style={{ borderBottom: isLastRow ? 'none' : '1px solid #e2e8f0', backgroundColor: hasData ? '#ffffff' : '#fafafa' }}>
                                <td style={{ padding: '12px 10px', verticalAlign: 'top', color: '#0f172a', fontWeight: '700', fontSize: '13px', whiteSpace: 'nowrap' }}>
                                  {ws.weekName}
                                </td>
                                <td style={{ padding: '12px 10px', verticalAlign: 'top', color: '#64748b', fontWeight: '600', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                                  {ws.label}
                                </td>
                                <td style={{ padding: '12px 12px', verticalAlign: 'top', fontWeight: '700', color: hasData ? '#0f172a' : '#94a3b8', fontSize: '13px' }}>
                                  {isEditingReport ? (
                                    <textarea 
                                      defaultValue={displayTitles} 
                                      onChange={(e) => handleMonthlySummaryChange(idx, 'titles', e.target.value)} 
                                      style={{ 
                                        width: '100%', 
                                        minHeight: '80px', 
                                        padding: '6px 8px', 
                                        fontSize: '13px', 
                                        fontWeight: '700', 
                                        border: '1px solid #cbd5e1', 
                                        borderRadius: '4px', 
                                        lineHeight: '1.45', 
                                        backgroundColor: '#ffffff', 
                                        color: '#0f172a', 
                                        resize: 'vertical', 
                                        boxSizing: 'border-box' 
                                      }} 
                                    />
                                  ) : (
                                    displayTitles.split('\n').map((line, i) => {
                                      const isBullet = line.trim().startsWith('•') || line.trim().startsWith('-');
                                      return (
                                        <div 
                                          key={i} 
                                          style={{ 
                                            paddingLeft: isBullet ? '0.65em' : '0', 
                                            textIndent: isBullet ? '-0.65em' : '0', 
                                            marginBottom: '4px', 
                                            lineHeight: '1.45' 
                                          }}
                                        >
                                          {line}
                                        </div>
                                      );
                                    })
                                  )}
                                </td>
                                <td style={{ padding: '12px 12px', verticalAlign: 'top', color: hasData ? '#334155' : '#94a3b8', fontSize: '13px' }}>
                                  {isEditingReport ? (
                                    <textarea 
                                      defaultValue={displayDescSummary} 
                                      onChange={(e) => handleMonthlySummaryChange(idx, 'descSummary', e.target.value)} 
                                      style={{ 
                                        width: '100%', 
                                        minHeight: '110px', 
                                        padding: '6px 8px', 
                                        fontSize: '13px', 
                                        border: '1px solid #cbd5e1', 
                                        borderRadius: '4px', 
                                        lineHeight: '1.5', 
                                        backgroundColor: '#ffffff', 
                                        color: '#334155', 
                                        resize: 'vertical', 
                                        boxSizing: 'border-box' 
                                      }} 
                                    />
                                  ) : (
                                    displayDescSummary.split('\n').map((line, i) => {
                                      const isBullet = line.trim().startsWith('•') || line.trim().startsWith('-');
                                      return (
                                        <div 
                                          key={i} 
                                          style={{ 
                                            paddingLeft: isBullet ? '0.65em' : '0', 
                                            textIndent: isBullet ? '-0.65em' : '0', 
                                            marginBottom: '5px', 
                                            lineHeight: '1.5' 
                                          }}
                                        >
                                          {line}
                                        </div>
                                      );
                                    })
                                  )}
                                </td>
                                <td style={{ padding: '12px 12px', verticalAlign: 'top', textAlign: 'center', fontWeight: '600', color: '#475569', fontSize: '13px' }}>
                                  {ws.members.map((name, i) => (
                                    <div key={i} style={{ lineHeight: '1.45' }}>{name}</div>
                                  ))}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  );
                }

                const reportConsolidatedRows = (() => {
                  const rows = [];
                  const map = {};

                  filteredSchedules.forEach(s => {
                    const groupId = s.description && s.description.match(/\[그룹 ID\]\s*(g_\w+)/)?.[1];
                    const parsedDesc = parseScheduleDescription(s.description || '');
                    const cleanDesc = (parsedDesc.detail || (s.description || ''))
                      .replace(/\[YM:\d{4}\.\d{2}\]/g, '')
                      .replace(/\[그룹 ID\]\s*g_\w+\s*\|?\s*/gi, '')
                      .replace(/\[진척률\]\s*\d+%\s*\|?\s*/gi, '')
                      .replace(/\[상세\]\s*/gi, '')
                      .replace(/\[메모\]\s*/gi, '')
                      .replace(/^[\s|]+/, '')
                      .replace(/[\s|]+$/, '')
                      .trim();

                    const key = groupId 
                      ? `g_${groupId}`
                      : `t_${s.title}_${s.startHour}_${s.endHour}_${cleanDesc}_${(s.memberIds || [s.memberId]).join(',')}`;

                    if (!map[key]) {
                      map[key] = {
                        ...s,
                        key,
                        cleanDesc,
                        progress: s.progress !== undefined ? s.progress : parsedDesc.progress,
                        dates: [{ month: s.month || currentMonth, date: s.date }]
                      };
                      rows.push(map[key]);
                    } else {
                      if (!map[key].dates.some(d => d.month === (s.month || currentMonth) && d.date === s.date)) {
                        map[key].dates.push({ month: s.month || currentMonth, date: s.date });
                      }
                    }
                  });

                  rows.forEach(r => {
                    r.dates.sort((a, b) => (a.month !== b.month ? a.month - b.month : a.date - b.date));
                    const first = r.dates[0];
                    const last = r.dates[r.dates.length - 1];
                    if (r.dates.length === 1) {
                      r.dateRangeStr = `${first.month}/${first.date}`;
                    } else {
                      r.dateRangeStr = `${first.month}/${first.date}~${last.month}/${last.date}`;
                    }
                  });

                  return rows;
                })();

                return (
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '15.5px', fontWeight: '800', marginBottom: '8px', color: '#0f172a' }}>
                      {timeViewTab === 'daily' && '1. 금일 업무 실적 (Done)'}
                      {timeViewTab === 'weekly' && '1. 금주 주요 실적'}
                      {timeViewTab === 'list' && `📌 주요 수행 업무 및 일정 목록 (${reportConsolidatedRows.length}건)`}
                    </div>
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '14px 18px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #cbd5e1' }}>
                          {timeViewTab === 'daily' ? (
                            <>
                              <th style={{ padding: '7px 10px 4px 10px', textAlign: 'left', width: '32%' }}>시간 및 일정명</th>
                              <th style={{ padding: '7px 10px 4px 10px', textAlign: 'left', width: '53%' }}>상세내용</th>
                              <th style={{ padding: '7px 10px 4px 10px', textAlign: 'center', width: '15%' }}>담당자</th>
                            </>
                          ) : (
                            <>
                              <th style={{ padding: '7px 10px 4px 10px', textAlign: 'left', width: '14%' }}>날짜</th>
                              <th style={{ padding: '7px 10px 4px 10px', textAlign: 'left', width: '16%' }}>시간</th>
                              <th style={{ padding: '7px 10px 4px 10px', textAlign: 'left', width: '18%' }}>일정명</th>
                              <th style={{ padding: '7px 10px 4px 10px', textAlign: 'left', width: '39%' }}>상세내용</th>
                              <th style={{ padding: '7px 10px 4px 10px', textAlign: 'center', width: '13%' }}>담당자</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {reportConsolidatedRows.map((s, idx) => {
                          const memberList = s.memberIds && s.memberIds.length > 0
                            ? s.memberIds.map(id => activeTeam.find(m => m.id === id)?.name).filter(Boolean)
                            : [(activeTeam.find(m => m.id === s.memberId)?.name || '전체')];

                          const timeStr = `${s.startHour ? formatHour(s.startHour) : '09:00'} - ${s.endHour ? formatHour(s.endHour) : '18:00'}`;
                          const progress = s.progress;
                          const cleanDesc = s.cleanDesc;
                          const isLastRow = idx === reportConsolidatedRows.length - 1;

                          return (
                            <tr key={s.id || s.key || idx} style={{ borderBottom: isLastRow ? 'none' : '1px solid #e2e8f0' }}>
                              {timeViewTab === 'daily' ? (
                                <>
                                  <td style={{ padding: '7px 10px', verticalAlign: 'top' }}>
                                    <div style={{ fontSize: '12.5px', color: '#475569', fontWeight: '600', marginBottom: '2px' }}>
                                      {timeStr}
                                    </div>
                                    {isEditingReport ? (
                                      <input 
                                        type="text" 
                                        defaultValue={s.title} 
                                        onChange={(e) => handleReportScheduleChange(s.id, 'title', e.target.value)} 
                                        style={{ 
                                          width: '100%', 
                                          padding: '4px 8px', 
                                          fontSize: '13.5px', 
                                          fontWeight: '700', 
                                          border: '1px solid #cbd5e1', 
                                          borderRadius: '4px',
                                          backgroundColor: '#ffffff',
                                          color: '#0f172a',
                                          boxSizing: 'border-box'
                                        }} 
                                      />
                                    ) : (
                                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                                        {s.title}
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding: '7px 10px', verticalAlign: 'top', color: '#334155', fontSize: '13px' }}>
                                    {isEditingReport ? (
                                      <textarea 
                                        defaultValue={cleanDesc || ''} 
                                        onChange={(e) => handleReportScheduleChange(s.id, 'description', rebuildDescription(s.description, e.target.value))} 
                                        style={{ 
                                          width: '100%', 
                                          minHeight: '65px', 
                                          padding: '6px 8px', 
                                          fontSize: '13px', 
                                          border: '1px solid #cbd5e1', 
                                          borderRadius: '4px', 
                                          lineHeight: '1.4',
                                          backgroundColor: '#ffffff',
                                          color: '#334155',
                                          resize: 'vertical',
                                          boxSizing: 'border-box'
                                        }} 
                                      />
                                    ) : (
                                      <div>
                                        {(() => {
                                          const ids = s.memberIds && s.memberIds.length > 0 ? s.memberIds : [s.memberId || 'sh'];
                                          const isJointOrRequest = (s.status === 'requested' || s.status === 'accepted' || (s.status && s.status.startsWith('rejected'))) &&
                                            (s.approverId || ids.length > 1 || /반차|연차|휴가|병가|신청|승인/i.test(s.title || ''));

                                          let badgeEl = null;
                                          if (s.status === 'requested' && isJointOrRequest) {
                                            badgeEl = (
                                              <span style={{ fontSize: '11px', fontWeight: '800', color: '#b45309', backgroundColor: '#fffbeb', padding: '1px 6px', borderRadius: '4px', border: '1px solid #fde68a', marginLeft: '6px', display: 'inline-block', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                                [수락 대기]
                                              </span>
                                            );
                                          } else if (s.status === 'accepted' && isJointOrRequest && (s.approverId || ids.length > 1)) {
                                            badgeEl = (
                                              <span style={{ fontSize: '11px', fontWeight: '800', color: '#059669', backgroundColor: '#ecfdf5', padding: '1px 6px', borderRadius: '4px', border: '1px solid #a7f3d0', marginLeft: '6px', display: 'inline-block', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                                [수락 완료]
                                              </span>
                                            );
                                          } else if (s.status && (s.status === 'rejected' || s.status.startsWith('rejected_')) && isJointOrRequest) {
                                            badgeEl = (
                                              <span style={{ fontSize: '11px', fontWeight: '800', color: '#dc2626', backgroundColor: '#fef2f2', padding: '1px 6px', borderRadius: '4px', border: '1px solid #fca5a5', marginLeft: '6px', display: 'inline-block', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                                [거절됨]
                                              </span>
                                            );
                                          }

                                          const isDelegatedTask = s.memberId && s.memberId !== ME.id && (s.requesterId === ME.id || ME.id === 'sh');
                                          const delegatedMember = isDelegatedTask ? activeTeam.find(m => m.id === s.memberId) : null;
                                          const delegatedName = delegatedMember ? delegatedMember.name : (s.memberId === 'daum' ? '정다음' : s.memberId);

                                          let baseDescText = cleanDesc;
                                          if (isDelegatedTask) {
                                            if (!baseDescText || baseDescText === '-') {
                                              baseDescText = `• ${delegatedName} 사원에게 업무 지시`;
                                            } else {
                                              baseDescText = `• ${delegatedName} 사원에게 업무 지시 (${baseDescText.replace(/^[-•*\s]+/, '')})`;
                                            }
                                          } else if (!baseDescText || baseDescText === '-') {
                                            baseDescText = '-';
                                          }

                                          const lines = baseDescText.split('\n');
                                          return lines.map((line, i) => {
                                            const isBullet = line.trim().startsWith('•') || line.trim().startsWith('-');
                                            const isLastLine = i === lines.length - 1;
                                            return (
                                              <div 
                                                key={i} 
                                                style={{ 
                                                  paddingLeft: isBullet ? '0.65em' : '0', 
                                                  textIndent: isBullet ? '-0.65em' : '0', 
                                                  marginBottom: '3px', 
                                                  lineHeight: '1.4' 
                                                }}
                                              >
                                                <span>{line}</span>
                                                {isLastLine && badgeEl}
                                              </div>
                                            );
                                          });
                                        })()}
                                        {progress > 0 && (
                                          <div style={{ marginTop: '6px', paddingTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#000000', whiteSpace: 'nowrap' }}>
                                              진척률 {progress}%
                                            </span>
                                            <div style={{ 
                                              flex: 1, 
                                              maxWidth: '140px', 
                                              height: '8px', 
                                              backgroundColor: '#e2e8f0', 
                                              borderRadius: '4px', 
                                              overflow: 'hidden',
                                              WebkitPrintColorAdjust: 'exact',
                                              printColorAdjust: 'exact'
                                            }}>
                                              <div style={{ 
                                                width: `${progress}%`, 
                                                height: '100%', 
                                                backgroundColor: '#000000',
                                                background: '#000000', 
                                                borderRadius: '4px',
                                                WebkitPrintColorAdjust: 'exact',
                                                printColorAdjust: 'exact'
                                              }} />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding: '7px 10px', verticalAlign: 'top', textAlign: 'center', fontWeight: '600', color: '#0f172a', fontSize: '13px' }}>
                                     {memberList.map((name, i) => (
                                       <div key={i} style={{ lineHeight: '1.4' }}>{name}</div>
                                     ))}
                                   </td>
                                </>
                              ) : (
                                <>
                                  <td style={{ padding: '7px 10px', verticalAlign: 'top', color: '#0f172a', fontWeight: '700', fontSize: '13px', whiteSpace: 'nowrap' }}>
                                    {s.dateRangeStr}
                                  </td>
                                  <td style={{ padding: '7px 10px', verticalAlign: 'top', color: '#64748b', fontWeight: '600', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                                    {timeStr}
                                  </td>
                                  <td style={{ padding: '7px 10px', verticalAlign: 'top', fontWeight: '700', color: '#0f172a', fontSize: '14px' }}>
                                    {isEditingReport ? (
                                      <input 
                                        type="text" 
                                        defaultValue={s.title} 
                                        onChange={(e) => handleReportScheduleChange(s.id, 'title', e.target.value)} 
                                        style={{ 
                                          width: '100%', 
                                          padding: '4px 8px', 
                                          fontSize: '13.5px', 
                                          fontWeight: '700', 
                                          border: '1px solid #cbd5e1', 
                                          borderRadius: '4px',
                                          backgroundColor: '#ffffff',
                                          color: '#0f172a',
                                          boxSizing: 'border-box'
                                        }} 
                                      />
                                    ) : (
                                      s.title
                                    )}
                                  </td>
                                  <td style={{ padding: '7px 10px', verticalAlign: 'top', color: '#334155', fontSize: '13px' }}>
                                    {isEditingReport ? (
                                      <textarea 
                                        defaultValue={cleanDesc || ''} 
                                        onChange={(e) => handleReportScheduleChange(s.id, 'description', rebuildDescription(s.description, e.target.value))} 
                                        style={{ 
                                          width: '100%', 
                                          minHeight: '65px', 
                                          padding: '6px 8px', 
                                          fontSize: '13px', 
                                          border: '1px solid #cbd5e1', 
                                          borderRadius: '4px', 
                                          lineHeight: '1.4',
                                          backgroundColor: '#ffffff',
                                          color: '#334155',
                                          resize: 'vertical',
                                          boxSizing: 'border-box'
                                        }} 
                                      />
                                    ) : (
                                      <div>
                                        {(() => {
                                          const ids = s.memberIds && s.memberIds.length > 0 ? s.memberIds : [s.memberId || 'sh'];
                                          const isJointOrRequest = (s.status === 'requested' || s.status === 'accepted' || (s.status && s.status.startsWith('rejected'))) &&
                                            (s.approverId || ids.length > 1 || /반차|연차|휴가|병가|신청|승인/i.test(s.title || ''));

                                          let badgeEl = null;
                                          if (s.status === 'requested' && isJointOrRequest) {
                                            badgeEl = (
                                              <span style={{ fontSize: '11px', fontWeight: '800', color: '#b45309', backgroundColor: '#fffbeb', padding: '1px 6px', borderRadius: '4px', border: '1px solid #fde68a', marginLeft: '6px', display: 'inline-block', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                                [수락 대기]
                                              </span>
                                            );
                                          } else if (s.status === 'accepted' && isJointOrRequest && (s.approverId || ids.length > 1)) {
                                            badgeEl = (
                                              <span style={{ fontSize: '11px', fontWeight: '800', color: '#059669', backgroundColor: '#ecfdf5', padding: '1px 6px', borderRadius: '4px', border: '1px solid #a7f3d0', marginLeft: '6px', display: 'inline-block', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                                [수락 완료]
                                              </span>
                                            );
                                          } else if (s.status && (s.status === 'rejected' || s.status.startsWith('rejected_')) && isJointOrRequest) {
                                            badgeEl = (
                                              <span style={{ fontSize: '11px', fontWeight: '800', color: '#dc2626', backgroundColor: '#fef2f2', padding: '1px 6px', borderRadius: '4px', border: '1px solid #fca5a5', marginLeft: '6px', display: 'inline-block', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                                [거절됨]
                                              </span>
                                            );
                                          }

                                          const isDelegatedTask = s.memberId && s.memberId !== ME.id && (s.requesterId === ME.id || ME.id === 'sh');
                                          const delegatedMember = isDelegatedTask ? activeTeam.find(m => m.id === s.memberId) : null;
                                          const delegatedName = delegatedMember ? delegatedMember.name : (s.memberId === 'daum' ? '정다음' : s.memberId);

                                          let baseDescText = cleanDesc;
                                          if (isDelegatedTask) {
                                            if (!baseDescText || baseDescText === '-') {
                                              baseDescText = `• ${delegatedName} 사원에게 업무 지시`;
                                            } else {
                                              baseDescText = `• ${delegatedName} 사원에게 업무 지시 (${baseDescText.replace(/^[-•*\s]+/, '')})`;
                                            }
                                          } else if (!baseDescText || baseDescText === '-') {
                                            baseDescText = '-';
                                          }

                                          const lines = baseDescText.split('\n');
                                          return lines.map((line, i) => {
                                            const isBullet = line.trim().startsWith('•') || line.trim().startsWith('-');
                                            const isLastLine = i === lines.length - 1;
                                            return (
                                              <div 
                                                key={i} 
                                                style={{ 
                                                  paddingLeft: isBullet ? '0.65em' : '0', 
                                                  textIndent: isBullet ? '-0.65em' : '0', 
                                                  marginBottom: '3px', 
                                                  lineHeight: '1.4' 
                                                }}
                                              >
                                                <span>{line}</span>
                                                {isLastLine && badgeEl}
                                              </div>
                                            );
                                          });
                                        })()}
                                        {progress > 0 && (
                                          <div style={{ marginTop: '6px', paddingTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#000000', whiteSpace: 'nowrap' }}>
                                              진척률 {progress}%
                                            </span>
                                            <div style={{ 
                                              flex: 1, 
                                              maxWidth: '140px', 
                                              height: '8px', 
                                              backgroundColor: '#e2e8f0', 
                                              borderRadius: '4px', 
                                              overflow: 'hidden',
                                              WebkitPrintColorAdjust: 'exact',
                                              printColorAdjust: 'exact'
                                            }}>
                                              <div style={{ 
                                                width: `${progress}%`, 
                                                height: '100%', 
                                                backgroundColor: '#000000',
                                                background: '#000000', 
                                                borderRadius: '4px',
                                                WebkitPrintColorAdjust: 'exact',
                                                printColorAdjust: 'exact'
                                              }} />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding: '7px 10px', verticalAlign: 'top', textAlign: 'center', fontWeight: '600', color: '#0f172a', fontSize: '13px' }}>
                                     {memberList.map((name, i) => (
                                       <div key={i} style={{ lineHeight: '1.4' }}>{name}</div>
                                     ))}
                                   </td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
              })()}

              {/* Standardized 3-Section Additions (Section 2 & Section 3) */}
              {timeViewTab === 'daily' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <div style={{ fontSize: '15.5px', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
                      2. 익일 업무 계획 (To-Do)
                    </div>
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '14px 18px' }}>
                      {isEditingReport ? (
                        <textarea
                          value={dailyNextPlanText}
                          onChange={(e) => setDailyNextPlanText(e.target.value)}
                          placeholder="[프로젝트A] 최종 검수 및 배포 요청"
                          style={{ width: '100%', minHeight: '65px', padding: '8px 12px', fontSize: '13.5px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#fff', color: '#1e293b', boxSizing: 'border-box' }}
                        />
                      ) : (
                        <div style={{ fontSize: '13.5px', color: '#334155', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                          {getDailyNextPlanDefault()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '15.5px', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
                      3. 이슈 및 특이사항 (Issue/Blocker)
                    </div>
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '14px 18px' }}>
                      {isEditingReport ? (
                        <textarea
                          value={dailyIssueText}
                          onChange={(e) => setDailyIssueText(e.target.value)}
                          placeholder="특이사항 없음 (또는 이슈 내용 입력)"
                          style={{ width: '100%', minHeight: '65px', padding: '8px 12px', fontSize: '13.5px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#fff', color: '#1e293b', boxSizing: 'border-box' }}
                        />
                      ) : (
                        <div style={{ fontSize: '13.5px', color: '#334155', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                          {getDailyIssueDefault()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {timeViewTab === 'weekly' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <div style={{ fontSize: '15.5px', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
                      2. 차주 계획 및 마일스톤
                    </div>
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '14px 18px' }}>
                      {isEditingReport ? (
                        <textarea
                          value={weeklyNextPlanText}
                          onChange={(e) => setWeeklyNextPlanText(e.target.value)}
                          placeholder="결제 모듈 연동 테스트 완료 (담당: OOO)"
                          style={{ width: '100%', minHeight: '65px', padding: '8px 12px', fontSize: '13.5px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#fff', color: '#1e293b', boxSizing: 'border-box' }}
                        />
                      ) : (
                        <div style={{ fontSize: '13.5px', color: '#334155', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                          {getWeeklyNextPlanDefault()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '15.5px', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
                      3. 이슈 및 건의사항 (Risk & Action Plan)
                    </div>
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '14px 18px' }}>
                      {isEditingReport ? (
                        <textarea
                          value={weeklyRiskText}
                          onChange={(e) => setWeeklyRiskText(e.target.value)}
                          placeholder="결제 API 인증 지연 발생 → PG사 기술지원 요청 후 14일까지 해결 예정"
                          style={{ width: '100%', minHeight: '65px', padding: '8px 12px', fontSize: '13.5px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#fff', color: '#1e293b', boxSizing: 'border-box' }}
                        />
                      ) : (
                        <div style={{ fontSize: '13.5px', color: '#334155', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                          {getWeeklyRiskDefault()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {timeViewTab === 'monthly' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <div style={{ fontSize: '15.5px', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
                      2. 목표 대비 실적 분석 (성과 및 미흡점)
                    </div>
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '14px 18px' }}>
                      {isEditingReport ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <input
                            type="text"
                            value={monthlyGoodText}
                            onChange={(e) => setMonthlyGoodText(e.target.value)}
                            placeholder="Good: 프로모션 전환율 개선 (3.2% → 4.5%)"
                            style={{ width: '100%', padding: '8px 12px', fontSize: '13.5px', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#15803d', fontWeight: '600', boxSizing: 'border-box' }}
                          />
                          <input
                            type="text"
                            value={monthlyBadText}
                            onChange={(e) => setMonthlyBadText(e.target.value)}
                            placeholder="Bad: 3주차 서버 다운으로 인한 이탈 발생 → 모니터링 체계 보완 완료"
                            style={{ width: '100%', padding: '8px 12px', fontSize: '13.5px', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#b91c1c', fontWeight: '600', boxSizing: 'border-box' }}
                          />
                        </div>
                      ) : (
                        <div style={{ fontSize: '13.5px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ color: '#15803d', fontWeight: '600' }}>{monthlyGoodText || 'Good: 프로모션 전환율 개선 (3.2% → 4.5%)'}</div>
                          <div style={{ color: '#b91c1c', fontWeight: '600' }}>{monthlyBadText || 'Bad: 3주차 서버 다운으로 인한 이탈 발생 → 모니터링 체계 보완 완료'}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '15.5px', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
                      3. 익월 중점 추진 과제
                    </div>
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '14px 18px' }}>
                      {isEditingReport ? (
                        <textarea
                          value={monthlyNextTasksText}
                          onChange={(e) => setMonthlyNextTasksText(e.target.value)}
                          placeholder="대시보드 2.0 고도화 및 고객 유지율(Retention) 개선 캠페인 실행"
                          style={{ width: '100%', minHeight: '65px', padding: '8px 12px', fontSize: '13.5px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#fff', color: '#1e293b', boxSizing: 'border-box' }}
                        />
                      ) : (
                        <div style={{ fontSize: '13.5px', color: '#334155', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                          {monthlyNextTasksText.trim() || '대시보드 2.0 고도화 및 고객 유지율(Retention) 개선 캠페인 실행'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px dashed #cbd5e1', fontSize: '13px', color: '#94a3b8', textAlign: 'right' }}>
                ZAL:잘됨 업무관리 시스템 자동생성 보고서
              </div>
            </div>

            {/* Floating Actions Footer (Always Visible at Bottom) */}
            <div 
              className="modal-actions" 
              style={{ 
                padding: '16px 28px', 
                backgroundColor: '#ffffff', 
                borderTop: '1px solid #e2e8f0', 
                display: 'flex', 
                justifyContent: 'flex-end', 
                gap: '10px', 
                boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.05)',
                zIndex: 10,
                marginTop: 0
              }}
            >
              <button 
                className="modal-btn" 
                disabled={isSavingReport}
                style={{ 
                  padding: '9px 20px', 
                  fontSize: '15px', 
                  fontWeight: '700', 
                  backgroundColor: 'transparent', 
                  color: isEditingReport ? '#000000' : '#1e293b', 
                  border: isEditingReport ? '1.5px solid #000000' : '1px solid #475569', 
                  borderRadius: '6px', 
                  cursor: isSavingReport ? 'not-allowed' : 'pointer', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '6px',
                  opacity: isSavingReport ? 0.7 : 1,
                  transition: 'all 0.15s' 
                }} 
                onClick={() => isEditingReport ? handleSaveReportEdits() : setIsEditingReport(true)}
              >
                {isSavingReport ? (
                  <>
                    <LoadingSpinner size={16} color="#000000" />
                    저장 중...
                  </>
                ) : isEditingReport ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    수정 완료
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9"/>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                    </svg>
                    수정
                  </>
                )}
              </button>
              <button 
                className="modal-btn"
                style={{ 
                  padding: '9px 18px', 
                  fontSize: '14.5px', 
                  fontWeight: '700', 
                  backgroundColor: 'transparent', 
                  color: '#334155', 
                  border: '1px solid #475569', 
                  borderRadius: '6px', 
                  cursor: 'pointer', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '6px',
                  transition: 'all 0.15s' 
                }} 
                onClick={handleCopyReportText}
                title="슬랙, 메일 등에 붙여넣기 할 수 있는 텍스트 양식을 복사합니다."
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                텍스트 복사
              </button>
              <button 
                className="modal-btn primary" 
                style={{ padding: '9px 20px', fontSize: '15px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '6px' }} 
                onClick={() => window.print()}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"/>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg>
                인쇄 / PDF 출력
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──── CUSTOM LAYER DIALOG POPUP (Replaces native browser alert & confirm) ─────────────────── */}
      {layerDialog.isOpen && (
        <div 
          className="modal-overlay" 
          style={{ zIndex: 10000, backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)' }}
          onClick={() => closeLayerDialog(false)}
        >
          <div 
            className="modal-content" 
            style={{ 
              maxWidth: '420px', 
              width: '90%', 
              padding: '24px 28px', 
              borderRadius: '14px', 
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              textAlign: 'center',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              animation: 'fadeIn 0.15s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Line Icon (Checkmark inside circle for success) */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
              {layerDialog.type === 'success' && (
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="m9 12 2 2 4-4"/>
                </svg>
              )}
              {layerDialog.type === 'error' && (
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              )}
              {layerDialog.isConfirm && layerDialog.type !== 'error' && (
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              )}
            </div>

            <div style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a', marginBottom: '10px' }}>
              {layerDialog.title}
            </div>
            <div style={{ fontSize: '14px', color: '#475569', lineHeight: 1.55, whiteSpace: 'pre-line', marginBottom: layerDialog.hasInput ? '14px' : '22px' }}>
              {layerDialog.message}
            </div>

            {layerDialog.hasInput && (
              <div style={{ marginBottom: '18px', textAlign: 'left' }}>
                <textarea
                  value={layerDialog.inputValue}
                  onChange={(e) => setLayerDialog(prev => ({ ...prev, inputValue: e.target.value }))}
                  placeholder={layerDialog.inputPlaceholder}
                  autoFocus
                  style={{
                    width: '100%',
                    minHeight: '75px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '13.5px',
                    color: '#0f172a',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      closeLayerDialog(true);
                    }
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              {layerDialog.isConfirm && (
                <button
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    fontSize: '14.5px',
                    fontWeight: '600',
                    backgroundColor: '#f1f5f9',
                    color: '#334155',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onClick={() => closeLayerDialog(false)}
                >
                  {layerDialog.cancelText || '취소'}
                </button>
              )}
              <button
                style={{
                  flex: 1,
                  padding: '10px 0',
                  fontSize: '14.5px',
                  fontWeight: '700',
                  backgroundColor: layerDialog.type === 'error' ? '#ef4444' : '#000000',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.15s'
                }}
                onClick={() => closeLayerDialog(true)}
              >
                {layerDialog.confirmText || '확인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
