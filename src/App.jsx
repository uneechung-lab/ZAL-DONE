import { useState, useEffect, useRef } from 'react';
import './index.css';

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
  { id: 's1', memberId: 'sh', title: '2. 테스트', startHour: 8, endHour: 10, color: 'purple' },
  { id: 's2', memberId: 'sm', title: 'B사 제안서 검토', startHour: 14, endHour: 16, color: 'blue' },
  { id: 's3', memberId: 'jh', title: '가이드 문서 작성', startHour: 10, endHour: 12, color: 'green' },
  { id: 's4', memberId: 'jy', title: '오후 반차 (병원)', startHour: 13, endHour: 18, color: 'orange' },
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
    evening:   `${name}님, 오늘 하루도 고생 많으셨습니다. 🌆\n완료된 내역과 내일 일정 계획도 편하게 들려주세요.`,
    night:     `${name}님, 늦게까지 수고하셨어요 🌙\n오늘 작업하신 내용을 남겨주시면 자동으로 타임라인에 기록됩니다.`,
  };
  return greets[slot];
}

// ─── Mock AI parser ───────────────────────────────────────────────────────────
function parseMessageToSchedules(text) {
  const results = [];
  let temp = text.replace(/~/g, '-');
  
  const rangeRegex = /(오전|오후)?\s*(\d+)(?:시)?\s*-\s*(오전|오후)?\s*(\d+)\s*시/g;
  
  let match;
  const matches = [];
  while ((match = rangeRegex.exec(temp)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      ampm1: match[1],
      h1: parseInt(match[2]),
      ampm2: match[3],
      h2: parseInt(match[4]),
      text: match[0]
    });
  }
  
  if (matches.length === 0) {
    const singleRegex = /(오전|오후)?\s*(\d+)\s*시/g;
    while ((match = singleRegex.exec(temp)) !== null) {
      matches.push({
        index: match.index,
        length: match[0].length,
        ampm1: match[1],
        h1: parseInt(match[2]),
        ampm2: null,
        h2: null,
        text: match[0]
      });
    }
  }
  
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    
    let startHour = m.h1;
    let ampm = m.ampm1 || '';
    if (ampm === '오후' && startHour < 12) {
      startHour += 12;
    } else if (ampm === '오전' && startHour === 12) {
      startHour = 0;
    }
    
    let endHour;
    if (m.h2 !== null) {
      endHour = m.h2;
      let endAmpm = m.ampm2 || m.ampm1 || '';
      if (endAmpm === '오후' && endHour < 12) {
        endHour += 12;
      } else if (endAmpm === '오전' && endHour === 12) {
        endHour = 0;
      }
    } else {
      endHour = Math.min(startHour + 2, 19);
    }
    
    const startPos = m.index + m.length;
    const endPos = (i + 1 < matches.length) ? matches[i + 1].index : temp.length;
    let title = temp.substring(startPos, endPos)
      .replace(/까지/g, '')
      .replace(/부터/g, '')
      .replace(/에/g, '')
      .replace(/오늘/g, '')
      .trim();
    
    title = title.replace(/^[-~,\s]+/, '').replace(/[-~,\s]+$/, '').trim();
    
    if (!title) {
      title = '새로운 일정';
    }
    
    if (title.length > 20) {
      title = title.substring(0, 20) + '...';
    }
    
    let memberId = 'sh';
    for (const member of TEAM) {
      if (title.includes(member.name) || title.includes(member.avatar) || temp.includes(member.name) || temp.includes(member.avatar)) {
        memberId = member.id;
        break;
      }
    }

    results.push({
      title,
      startHour,
      endHour,
      memberId
    });
  }
  
  if (results.length === 0) {
    let memberId = 'sh';
    for (const member of TEAM) {
      if (text.includes(member.name) || text.includes(member.avatar)) {
        memberId = member.id;
        break;
      }
    }
    results.push({
      title: text.substring(0, 15),
      startHour: 9,
      endHour: 11,
      memberId
    });
  }
  
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

  const saveEventEdits = () => {
    if (!editTitle.trim()) return;
    if (editMemberIds.length === 0) {
      alert('최소 한 명 이상의 담당자를 지정해야 합니다.');
      return;
    }
    setSchedules(prev => prev.map(s => {
      if (s.id === selectedDetailEvent.id) {
        return {
          ...s,
          title: editTitle.trim(),
          memberIds: editMemberIds,
          memberId: editMemberIds[0], // fallback compatibility
          startHour: parseFloat(editStartHour),
          endHour: parseFloat(editEndHour),
          description: editDescription.trim(),
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
    localStorage.setItem('zal_schedules', JSON.stringify(schedules));
  }, [schedules]);

  useEffect(() => {
    localStorage.setItem('zal_messages', JSON.stringify(messages));
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;

    const userMsg = { id: msgId.current++, from: 'user', text, time: formatTime(new Date()) };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const parsedList = parseMessageToSchedules(text);
      
      const colors = ['purple', 'blue', 'green', 'orange'];
      const newSchedules = [];
      let replyDetails = '';

      parsedList.forEach((parsed, index) => {
        const randomColor = colors[(Math.floor(Math.random() * colors.length) + index) % colors.length];
        const assignedMember = TEAM.find(m => m.id === parsed.memberId) || ME;
        const isSelf = assignedMember.id === 'sh';
        const newSchedule = {
          id: `s_${Date.now()}_${index}`,
          memberId: assignedMember.id,
          memberIds: [assignedMember.id],
          title: parsed.title,
          startHour: parsed.startHour,
          endHour: parsed.endHour,
          color: randomColor,
          status: isSelf ? 'accepted' : 'requested',
        };
        newSchedules.push(newSchedule);
        replyDetails += `\n📅 일정 ${index + 1}: "${parsed.title}"\n👤 담당자: ${assignedMember.name}${isSelf ? '' : ' (요청됨)'}\n⏰ 시간: ${formatHour(parsed.startHour)} ~ ${formatHour(parsed.endHour)}\n`;
      });

      setSchedules(prev => [...prev, ...newSchedules]);

      const aiReply = `메시지를 분석하여 타임라인에 일정을 등록해 드렸습니다!\n${replyDetails}`;
      const aiMsg = { id: msgId.current++, from: 'ai', text: aiReply, time: formatTime(new Date()) };
      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
    }, 1000);
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

  const saveManualSchedule = () => {
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
    };

    setSchedules(prev => [...prev, newSchedule]);
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
                onClick={() => {
                  if (confirm('모든 대화 및 일정 데이터를 초기화하고 기본 샘플 데이터 상태로 되돌리시겠습니까?')) {
                    localStorage.removeItem('zal_schedules');
                    localStorage.removeItem('zal_messages');
                    setSchedules(INITIAL_SCHEDULES);
                    setMessages([{ id: 0, from: 'ai', text: getGreetingMsg(ME.name, getTimeSlot()), time: formatTime(new Date()) }]);
                    alert('데이터가 기본 상태로 초기화되었습니다.');
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
                const memberSchedules = schedules.filter(s => s.memberIds ? s.memberIds.includes(member.id) : s.memberId === member.id);
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
                      const currentEvent = memberSchedules.find(s => s.startHour === h);
                      const trackIndex = currentEvent ? (trackMap[currentEvent.id] ?? 0) : 0;
                      const topOffset = totalTracks === 1 ? 24 : trackIndex * 32 + 12;

                      return (
                        <td 
                          key={h} 
                          className="time-grid-cell"
                          onClick={() => openAddModal(member, h)}
                        >
                          {currentEvent && (() => {
                            const isRequested = currentEvent.status === 'requested' || (!currentEvent.status && currentEvent.memberId !== 'sh');
                            return (
                              <div 
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
                          })()}
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
                          onClick={() => {
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
                            if (confirm('요청을 거부하고 일정을 삭제하시겠습니까?')) {
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
                onClick={() => {
                  if (confirm(`"${selectedDetailEvent.title}" 일정을 정말 삭제하시겠습니까?`)) {
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
