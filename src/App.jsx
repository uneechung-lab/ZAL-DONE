import { useState, useEffect, useRef } from 'react';
import './index.css';
import { appwriteService, isConfigured } from './appwrite';

// ─── Team data (Updated to match the screenshot "정윤희" and others) ───────────────────────────
const TEAM = [
  { id: 'sh', name: '정윤희', role: '웹 기획자', avatar: '윤희', color: '#6366f1', subtext: '웹간 일정' },
  { id: 'sm', name: '조성현', role: '상무', avatar: '성현', color: '#4f8ef7', subtext: '기획 일정' },
  { id: 'jh', name: '조진희', role: '차장 · 개발자', avatar: '진희', color: '#10b981', subtext: '개발 일정' },
  { id: 'jy', name: '손지영', role: '사원 · 개발자', avatar: '지영', color: '#f59e0b', subtext: '퍼블리싱 일정' },
];

const ME = TEAM[0]; // Set ME to 정윤희 to align with screenshot

// ─── Initial schedules ──────────────────────────────────────────────────────────
const INITIAL_SCHEDULES = [
  { id: 's1', memberId: 'sh', title: '2. 테스트', startHour: 8, endHour: 10, color: 'purple', date: 11 },
  { id: 's2', memberId: 'sm', title: 'B사 제안서 검토', startHour: 14, endHour: 16, color: 'blue', date: 11 },
  { id: 's3', memberId: 'jh', title: '가이드 문서 작성', startHour: 10, endHour: 12, color: 'green', date: 11 },
  { id: 's4', memberId: 'jy', title: '오후 반차 (병원)', startHour: 13, endHour: 18, color: 'orange', date: 11 },
];

// Helper to get mini-calendar days for June 2026
// June 2026 starts on Monday (1) and has 30 days.
function getJune2026Days() {
  const days = [];
  // Add padding days for Sunday (May 31)
  days.push({ dayNum: 31, isCurrentMonth: false });
  for (let i = 1; i <= 30; i++) {
    days.push({ dayNum: i, isCurrentMonth: true });
  }
  // Add padding days for July (1 to 4)
  for (let i = 1; i <= 4; i++) {
    days.push({ dayNum: i, isCurrentMonth: false });
  }
  return days;
}

// ─── Time slot helper ─────────────────────────────────────────────────────────
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
    morning:   `안녕하세요, ${name}님! 🌅 좋은 아침입니다.\n오늘 진행하실 업무나 일정을 채팅으로 입력하시면 타임라인에 등록해 드려요!`,
    afternoon: `${name}님, 점심은 맛있게 드셨나요? ☀️\n오후 업무 일정을 추가로 입력해주시면 실시간으로 채워드릴게요.`,
    evening:   `${name}님, 오늘 하루도 고생 많으셨습니다. ✨\n완료된 내역과 내일 일정 계획도 편하게 들려주세요.`,
    night:     `${name}님, 늦게까지 수고하셨어요 🌙\n오늘 작업하신 내용을 남겨주시면 자동으로 타임라인에 기록됩니다.`,
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

function parseMessageToSchedules(text, selectedDate) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];

  lines.forEach(line => {
    let temp = line;
    let matched = false;
    let startHour = 10;
    let endHour = 11;
    let matchedString = '';

    let date = selectedDate;
    if (line.includes('내일')) {
      date = selectedDate + 1;
    } else if (line.includes('모레')) {
      date = selectedDate + 2;
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
        .trim();
        
      return s;
    };

    // 1. Range match: HH:MM - HH:MM or HH:MM ~ HH:MM
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

    // 2. Range match: H시 (반/30분) ~ H시 (반/30분)
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

    // 3. Range match: 2-4시, 2~4시
    if (!matched) {
      const rangeSimpleRegex = /(오전|오후)?\s*(\d{1,2})\s*[-~]\s*(오전|오후)?\s*(\d{1,2})\s*시/;
      match = rangeSimpleRegex.exec(temp);
      if (match) {
        const h1 = parseInt(match[2]);
        const h2 = parseInt(match[4]);
        startHour = normalizeHour(h1, match[1]);
        endHour = normalizeHour(h2, match[3] || match[1]);
        matchedString = match[0];
        matched = true;
      }
    }

    // 3.5 Range match without '시': 9-11, 9~11, 13-15
    if (!matched) {
      const rangeNumRegex = /(오전|오후)?\s*(\d{1,2})\s*[-~]\s*(오전|오후)?\s*(\d{1,2})(?!\d)/;
      match = rangeNumRegex.exec(temp);
      if (match) {
        const h1 = parseInt(match[2]);
        const h2 = parseInt(match[4]);
        if (h1 >= 1 && h1 <= 24 && h2 >= 1 && h2 <= 24 && h1 < h2) {
          startHour = normalizeHour(h1, match[1]);
          endHour = normalizeHour(h2, match[3] || match[1]);
          matchedString = match[0];
          matched = true;
        }
      }
    }

    // 4. Single time with HH:MM
    if (!matched) {
      const singleTimeRegex = /(오전|오후)?\s*(\d{1,2}):(\d{2})/;
      match = singleTimeRegex.exec(temp);
      if (match) {
        const h = parseInt(match[2]);
        const m = parseInt(match[3]);
        startHour = normalizeHour(h, match[1]) + (m === 30 ? 0.5 : 0);
        
        const matchIndex = match.index;
        const afterMatch = temp.substring(matchIndex + match[0].length).trim();
        const hasTrailingTilde = afterMatch.startsWith('~') || afterMatch.startsWith('-');
        
        if (hasTrailingTilde) {
          endHour = 19.0;
        } else {
          endHour = Math.min(startHour + 1, 19.0);
        }
        matchedString = match[0];
        if (hasTrailingTilde) {
          matchedString = temp.substring(matchIndex, matchIndex + match[0].length + 1);
        }
        matched = true;
      }
    }

    // 5. Single time with H시 (반/30분)
    if (!matched) {
      const singleKoRegex = /(오전|오후)?\s*(\d{1,2})\s*시\s*(30분|반)?/;
      match = singleKoRegex.exec(temp);
      if (match) {
        const h = parseInt(match[2]);
        const m = match[3];
        startHour = normalizeHour(h, match[1]) + (m === '반' || m === '30분' ? 0.5 : 0);
        
        const matchIndex = match.index;
        const afterMatch = temp.substring(matchIndex + match[0].length).trim();
        const hasTrailingTilde = afterMatch.startsWith('~') || afterMatch.startsWith('-');
        
        if (hasTrailingTilde) {
          endHour = 19.0;
        } else {
          endHour = Math.min(startHour + 1, 19.0);
        }
        matchedString = match[0];
        if (hasTrailingTilde) {
          matchedString = temp.substring(matchIndex, matchIndex + match[0].length + 1);
        }
        matched = true;
      }
    }

    let title = '';
    if (matched) {
      title = clean(temp.replace(matchedString, ''));
      title = title.replace(/^[-~,\s]+/, '').replace(/[-~,\s]+$/, '').trim();
    } else {
      if (temp.includes('연차') || temp.includes('휴가') || temp.includes('반차')) {
        startHour = 9;
        endHour = 18;
      }
      title = clean(temp);
    }

    if (!title) title = '새로운 일정';
    if (title.length > 20) title = title.substring(0, 20) + '...';

    results.push({ title, startHour, endHour, line, date });
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
      for (const member of TEAM) {
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

export default function App() {
  const slot = getTimeSlot();
  const initMsg = { id: 0, from: 'ai', text: getGreetingMsg(ME.name, slot), time: formatTime(new Date()) };

  // UI States
  const [messages, setMessages] = useState(() => {
    if (isConfigured) return [];
    const saved = localStorage.getItem('zal_messages');
    return saved ? JSON.parse(saved) : [initMsg];
  });
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true); // Default to expanded/open

  // Scheduler States
  const [selectedDate, setSelectedDate] = useState(11); // June 11th default
  const [searchQuery, setSearchQuery] = useState('');
  const [includeSubOrg, setIncludeSubOrg] = useState(true);
  const [activeLeftTab, setActiveLeftTab] = useState('schedule'); // schedule | facility
  
  const [dashboardTab, setDashboardTab] = useState('members'); // members | personal
  const [timeViewTab, setTimeViewTab] = useState('daily'); // daily | weekly

  // Schedule Data
  const [schedules, setSchedules] = useState(() => {
    if (isConfigured) return [];
    const saved = localStorage.getItem('zal_schedules');
    return saved ? JSON.parse(saved) : INITIAL_SCHEDULES;
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

  const openDetailModal = (event) => {
    setSelectedDetailEvent(event);
    setEditTitle(event.title);
    setEditMemberIds(event.memberIds ? event.memberIds : [event.memberId]);
    setEditStartHour(event.startHour);
    setEditEndHour(event.endHour);
    setEditDescription(event.description || '');
    setIsDetailModalOpen(true);
  };

  const saveEventEdits = async () => {
    if (!editTitle.trim()) return;
    if (editMemberIds.length === 0) {
      alert('최소 한 명 이상의 담당자를 지정해야 합니다.');
      return;
    }

    const updatedFields = {
      title: editTitle.trim(),
      memberIds: editMemberIds,
      memberId: editMemberIds[0],
      startHour: parseFloat(editStartHour),
      endHour: parseFloat(editEndHour),
      description: editDescription.trim(),
    };

    if (isConfigured) {
      await appwriteService.updateSchedule(selectedDetailEvent.id, {
        ...selectedDetailEvent,
        ...updatedFields
      });
    }

    setSchedules(prev => prev.map(s => {
      if (s.id === selectedDetailEvent.id) {
        return {
          ...s,
          ...updatedFields,
          status: (s.status === 'requested' && editMemberIds.length === 1 && editMemberIds.includes('sh')) ? 'accepted' : s.status,
        };
      }
      return s;
    }));
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

  useEffect(() => {
    if (isConfigured) {
      async function initAppwrite() {
        const dbSchedules = await appwriteService.getSchedules();
        if (dbSchedules !== null) {
          setSchedules(dbSchedules);
        }
        const dbMessages = await appwriteService.getMessages();
        if (dbMessages !== null && dbMessages.length > 0) {
          setMessages(dbMessages);
        } else if (dbMessages !== null && dbMessages.length === 0) {
          const savedGreeting = await appwriteService.createMessage(initMsg);
          setMessages([savedGreeting || initMsg]);
        }
      }
      initAppwrite();
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) {
      localStorage.setItem('zal_schedules', JSON.stringify(schedules));
    }
  }, [schedules]);

  useEffect(() => {
    if (!isConfigured) {
      localStorage.setItem('zal_messages', JSON.stringify(messages));
    }
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;

    const userMsg = { id: msgId.current++, from: 'user', text, time: formatTime(new Date()) };
    
    setInput('');
    setIsTyping(true);

    const proceedWithAI = async (dbUserMsg) => {
      setMessages(prev => [...prev, dbUserMsg || userMsg]);
      
      const parsedList = parseMessageToSchedules(text, selectedDate);
      
      const colors = ['purple', 'blue', 'green', 'orange'];
      const newSchedules = [];
      let replyDetails = '';

      parsedList.forEach((parsed, index) => {
        const randomColor = colors[(Math.floor(Math.random() * colors.length) + index) % colors.length];
        
        let assignedMemberIds;
        let assignedMemberId;
        let isSelf;
        let displayAssigneeName;

        if (parsed.isAll) {
          assignedMemberIds = TEAM.map(m => m.id);
          assignedMemberId = 'sh';
          isSelf = false;
          displayAssigneeName = '전체 인원';
        } else {
          const assignedMember = TEAM.find(m => m.id === parsed.memberId) || ME;
          assignedMemberIds = [assignedMember.id];
          assignedMemberId = assignedMember.id;
          isSelf = assignedMember.id === 'sh';
          displayAssigneeName = assignedMember.name;
        }

        const newSchedule = {
          id: `s_${Date.now()}_${index}`,
          memberId: assignedMemberId,
          memberIds: assignedMemberIds,
          title: parsed.title,
          startHour: parsed.startHour,
          endHour: parsed.endHour,
          color: randomColor,
          status: isSelf ? 'accepted' : 'requested',
          date: parsed.date,
          requesterId: 'sh',
        };
        newSchedules.push(newSchedule);
        replyDetails += `\n📅 일정 ${index + 1}: "${parsed.title}"\n👤 담당자: ${displayAssigneeName}${isSelf ? '' : ' (요청됨)'}\n📅 날짜: 2026.06.${parsed.date < 10 ? '0' : ''}${parsed.date}\n⏰ 시간: ${formatHour(parsed.startHour)} ~ ${formatHour(parsed.endHour)}\n`;
      });

      const savedSchedules = [];
      for (const sched of newSchedules) {
        if (isConfigured) {
          const dbSched = await appwriteService.createSchedule(sched);
          savedSchedules.push(dbSched || sched);
        } else {
          savedSchedules.push(sched);
        }
      }

      setSchedules(prev => [...prev, ...savedSchedules]);

      const aiReply = `메시지를 분석하여 타임라인에 일정을 등록해 드렸습니다!\n${replyDetails}`;
      const aiMsg = { id: msgId.current++, from: 'ai', text: aiReply, time: formatTime(new Date()) };
      
      if (isConfigured) {
        const dbAiMsg = await appwriteService.createMessage(aiMsg);
        setMessages(prev => [...prev, dbAiMsg || aiMsg]);
      } else {
        setMessages(prev => [...prev, aiMsg]);
      }
      setIsTyping(false);
    };

    if (isConfigured) {
      appwriteService.createMessage(userMsg).then(proceedWithAI);
    } else {
      proceedWithAI(userMsg);
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
      memberId: modalMember.id,
      memberIds: [modalMember.id],
      title: newTitle.trim(),
      startHour: modalStartHour,
      endHour: Math.min(modalStartHour + 2, 19.5),
      color: randomColor,
      status: isSelf ? 'accepted' : 'requested',
      date: selectedDate,
      requesterId: 'sh',
    };

    if (isConfigured) {
      const dbSched = await appwriteService.createSchedule(newSchedule);
      setSchedules(prev => [...prev, dbSched || newSchedule]);
    } else {
      setSchedules(prev => [...prev, newSchedule]);
    }
    setIsModalOpen(false);
  };

  const filteredMembers = TEAM.filter(m => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return m.name.toLowerCase().includes(query) || m.role.toLowerCase().includes(query);
  });

  const hourSlots = [8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16, 16.5, 17, 17.5, 18, 18.5, 19];

  return (
    <div className="app-layout">
      {/* ──── LEFT COLLAPSIBLE AI DRAWER ─────────────────── */}
      <div className={`chat-drawer ${isDrawerOpen ? '' : 'closed'}`}>
        <div className="chat-header">
          <div className="chat-header-title">
            <span className="chat-header-logo">🤖</span>
            <span>ZAL : 잘됨</span>
          </div>
          <button className="close-drawer-btn" onClick={() => setIsDrawerOpen(false)}>×</button>
        </div>

        <div className="chat-messages">
          {messages.map(msg => (
            <div key={msg.id} className={`chat-bubble-wrap ${msg.from}`}>
              <div className="chat-sender">
                {msg.from === 'ai' ? 'AI 잘됨이' : ME.name}
              </div>
              <div className={`chat-bubble ${msg.from}`} style={{ whiteSpace: 'pre-line' }}>
                {msg.text}
              </div>
              <div className="chat-time">{msg.time}</div>
            </div>
          ))}

          {isTyping && (
            <div className="chat-bubble-wrap ai">
              <div className="chat-sender">AI 잘됨이</div>
              <div className="typing-indicator">
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
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
              <button className="nav-arrow-text" onClick={() => setSelectedDate(prev => Math.max(1, prev - 1))} title="이전 날짜">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span className="current-date-text">2026.06.{selectedDate < 10 ? `0${selectedDate}` : selectedDate}</span>
              <button className="nav-arrow-text" onClick={() => setSelectedDate(prev => Math.min(30, prev + 1))} title="다음 날짜">
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
                  일간
                </button>
                <button 
                  className={`toggle-item ${timeViewTab === 'weekly' ? 'active-blue' : ''}`} 
                  onClick={() => setTimeViewTab('weekly')}
                >
                  주간
                </button>
                <button 
                  className={`toggle-item ${timeViewTab === 'monthly' ? 'active-blue' : ''}`} 
                  onClick={() => setTimeViewTab('monthly')}
                >
                  월간
                </button>
                <button 
                  className={`toggle-item ${timeViewTab === 'list' ? 'active-blue' : ''}`} 
                  onClick={() => setTimeViewTab('list')}
                >
                  목록
                </button>
              </div>
            </div>
            
            {/* Reset Button (Right aligned) */}
            <div style={{ marginLeft: 'auto', zIndex: 10 }}>
              <button 
                className="modal-btn" 
                style={{ 
                  fontSize: '13.5px', 
                  fontWeight: '600', 
                  color: '#ef4444', 
                  borderColor: 'rgba(239, 68, 68, 0.2)',
                  backgroundColor: 'rgba(239, 68, 68, 0.05)',
                  padding: '6px 12px',
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
                    setMessages([{ id: 0, from: 'ai', text: getGreetingMsg(ME.name, getTimeSlot()), time: formatTime(new Date()) }]);
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

        {/* Timeline Grid Table */}
        <div className="timeline-container">
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
              {filteredMembers.map(member => {
                const memberSchedules = schedules.filter(s => {
                  const matchesMember = s.memberIds ? s.memberIds.includes(member.id) : s.memberId === member.id;
                  const matchesDate = s.date === selectedDate;
                  return matchesMember && matchesDate;
                });
                const { trackMap, totalTracks } = getSchedulesWithTracks(memberSchedules);
                const rowHeight = Math.max(totalTracks * 32 + 16, 74);

                return (
                  <tr key={member.id} style={{ height: `${rowHeight}px` }}>
                    {/* Column 1: Member profile info */}
                    <td className="col-member">
                      <div className="member-cell-content">
                        <div className="member-avatar-circle" style={{ backgroundColor: member.color, color: '#ffffff', fontWeight: '700', border: 'none' }}>
                          {member.avatar}
                        </div>
                      </div>
                    </td>

                    {/* Timeline cells */}
                    {hourSlots.map(h => {
                      const currentEvents = memberSchedules.filter(s => s.startHour === h);
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
                            return (
                              <div 
                                key={currentEvent.id}
                                className={`schedule-block ${currentEvent.color} ${isRequested ? 'status-requested' : ''}`}
                                style={{ 
                                  width: `calc(${(currentEvent.endHour - currentEvent.startHour) * 2 * 100}% - 8px)`,
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
                                {isRequested && '⏳ '}{currentEvent.title}
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
        </div>

        {/* Floating AI Panel Button */}
        <button 
          className="ai-toggle-floating-btn"
          onClick={() => setIsDrawerOpen(!isDrawerOpen)}
          title="AI 비서"
          style={{ left: '20px', right: 'auto' }} // Positioned 20px from the left edge of the main content
        >
          🤖
        </button>
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
          <div className="modal-content" style={{ width: '380px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">📅 일정 상세 및 수정</div>
            
            {(selectedDetailEvent.status === 'requested' || (!selectedDetailEvent.status && selectedDetailEvent.memberId !== 'sh')) && (() => {
              const isCurrentUserRequester = selectedDetailEvent.requesterId === ME.id;
              if (isCurrentUserRequester) return null;

              const isCurrentUserAssignee = selectedDetailEvent.memberIds 
                ? selectedDetailEvent.memberIds.includes(ME.id) 
                : selectedDetailEvent.memberId === ME.id;
              
              const assignedNames = selectedDetailEvent.memberIds 
                ? selectedDetailEvent.memberIds.map(id => TEAM.find(m => m.id === id)?.name).filter(Boolean).join(', ')
                : (TEAM.find(m => m.id === selectedDetailEvent.memberId)?.name || '');

              return (
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 'var(--radius-sm)', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
                  {isCurrentUserAssignee ? (
                    <>
                      <span style={{ fontSize: '13px', color: '#b45309', fontWeight: '700' }}>⚡ 요청 대기 중인 일정입니다</span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button 
                          className="modal-btn" 
                          style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: 'var(--accent-green)', color: '#fff', borderColor: 'var(--accent-green)', fontWeight: '700' }}
                          onClick={async () => {
                            if (isConfigured) {
                              await appwriteService.updateSchedule(selectedDetailEvent.id, {
                                ...selectedDetailEvent,
                                status: 'accepted'
                              });
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
                          onClick={async () => {
                            if (confirm('요청을 거부하고 일정을 삭제하시겠습니까?')) {
                              if (isConfigured) {
                                await appwriteService.deleteSchedule(selectedDetailEvent.id);
                              }
                              setSchedules(prev => prev.filter(s => s.id !== selectedDetailEvent.id));
                              setIsDetailModalOpen(false);
                            }
                          }}
                        >
                          거부
                        </button>
                      </div>
                    </>
                  ) : (
                    <span style={{ fontSize: '13.5px', color: '#b45309', fontWeight: '700', width: '100%', textAlign: 'center' }}>
                      ⏳ {assignedNames} 님의 수락 대기 중입니다
                    </span>
                  )}
                </div>
              );
            })()}
            
            <div className="modal-detail-body" style={{ margin: '12px 0', fontSize: '15px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-secondary)' }}>일정명</label>
                <input 
                  type="text" 
                  className="modal-input" 
                  value={editTitle} 
                  onChange={(e) => setEditTitle(e.target.value)} 
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-secondary)' }}>담당자 (복수 선택 가능)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '4px 0' }}>
                  {TEAM.map(m => {
                    const isChecked = editMemberIds.includes(m.id);
                    return (
                      <label 
                        key={m.id} 
                        style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '6px', 
                          cursor: 'pointer', 
                          background: isChecked ? 'rgba(99, 102, 241, 0.08)' : '#f8fafc', 
                          padding: '6px 12px', 
                          borderRadius: '20px', 
                          border: `1.5px solid ${isChecked ? 'var(--accent-purple)' : 'var(--border-light)'}`, 
                          fontSize: '13.5px', 
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
                              setEditMemberIds(prev => [...prev, m.id]);
                            } else {
                              setEditMemberIds(prev => prev.filter(id => id !== m.id));
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

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-secondary)' }}>시작 시간</label>
                  <select 
                    value={editStartHour} 
                    onChange={(e) => {
                      const newStart = parseFloat(e.target.value);
                      setEditStartHour(newStart);
                      if (editEndHour <= newStart) {
                        setEditEndHour(newStart + 1);
                      }
                    }}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: '#fff' }}
                  >
                    {hourSlots.map(h => (
                      <option key={h} value={h}>{formatHour(h)}</option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-secondary)' }}>종료 시간</label>
                  <select 
                    value={editEndHour} 
                    onChange={(e) => setEditEndHour(parseFloat(e.target.value))}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: '#fff' }}
                  >
                    {getEndHourOptions().map(h => (
                      <option key={h} value={h}>{formatHour(h)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-secondary)' }}>추가 내용 / 메모</label>
                <textarea 
                  placeholder="회의 안건, 준비물 등 상세 내용을 입력하세요" 
                  value={editDescription} 
                  onChange={(e) => setEditDescription(e.target.value)} 
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', resize: 'none', height: '60px', fontFamily: 'inherit' }}
                />
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '10px' }}>
              <button className="modal-btn" onClick={() => setIsDetailModalOpen(false)}>닫기</button>
              <button 
                className="modal-btn" 
                style={{ backgroundColor: 'var(--accent-red)', color: '#ffffff', borderColor: 'var(--accent-red)' }}
                onClick={async () => {
                  if (confirm(`"${selectedDetailEvent.title}" 일정을 정말 삭제하시겠습니까?`)) {
                    if (isConfigured) {
                      await appwriteService.deleteSchedule(selectedDetailEvent.id);
                    }
                    setSchedules(prev => prev.filter(s => s.id !== selectedDetailEvent.id));
                    setIsDetailModalOpen(false);
                  }
                }}
              >
                삭제
              </button>
              <button className="modal-btn primary" onClick={saveEventEdits}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
