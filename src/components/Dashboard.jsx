import React, { useState, useEffect, useRef } from 'react';

// Default initial feeds for realistic team morning sync on 2026.08.31 (Mon)
const INITIAL_FEEDS = [
  {
    id: 'feed_1',
    authorId: 'daum',
    authorName: '정다음',
    authorRole: '사원',
    authorAvatarPic: '/pic2_thumb.png',
    authorColor: '#10b981',
    createdAt: '2026-08-31T09:10:00.000Z',
    timeDisplay: '오전 09:10',
    type: 'issue', // 'all' | 'issue' | 'vacation' | 'meeting'
    content: '오전 9시부터 로그인 인증 세션 만료 에러 긴급 디버깅 진행 중입니다. 오후 2시까지 해결하고, 14시에 정부장님과 화면 퍼블리싱 리뷰 미팅 참석하겠습니다. 그리고 내일(9/1) 오전 반차 신청합니다!',
    aiBadges: [
      { id: 'b1', type: 'issue', label: '🚨 로그인 에러 디버깅 (09:00~14:00)', category: '이슈' },
      { id: 'b2', type: 'meeting', label: '🤝 화면 퍼블리싱 리뷰 (14:00~15:00, 참석: 정다음, 정윤희)', category: '미팅' },
      { id: 'b3', type: 'vacation', label: '🏖️ 9/1 오전 반차 신청', category: '휴가' }
    ],
    vacationInfo: {
      type: '오전 반차',
      date: '2026.09.01',
      status: 'pending', // 'pending' | 'approved' | 'rejected'
      approverName: '조상무 상무',
      approvedAt: null
    },
    likes: 4,
    hasLiked: false,
    cheers: 3,
    hasCheered: false,
    comments: [
      {
        id: 'c1',
        authorId: 'sh',
        authorName: '정윤희',
        authorRole: '부장',
        authorAvatarPic: '/pic1_thumb.png',
        text: '세션 토큰 만료 시간 관련해서 로그 확인 필요하면 말씀하세요! 2시 미팅 전에 슬랙으로 공유 부탁드립니다.',
        createdAt: '오전 09:18'
      }
    ]
  },
  {
    id: 'feed_2',
    authorId: 'sh',
    authorName: '정윤희',
    authorRole: '부장',
    authorAvatarPic: '/pic1_thumb.png',
    authorColor: '#000000',
    createdAt: '2026-08-31T08:50:00.000Z',
    timeDisplay: '오전 08:50',
    type: 'meeting',
    content: '오늘 10시 주간 기획 회의 및 오후 2시 화면 퍼블리싱 리뷰 진행 예정입니다. 4시에는 대신증권 시스템 연동 브리핑 자료 준비하겠습니다.',
    aiBadges: [
      { id: 'b4', type: 'meeting', label: '🤝 주간 기획 회의 (10:00~11:30, 참석: 정윤희, 조상무)', category: '미팅' },
      { id: 'b5', type: 'meeting', label: '🤝 화면 퍼블리싱 리뷰 (14:00~15:00)', category: '미팅' },
      { id: 'b6', type: 'work', label: '📄 대신증권 연동 브리핑 준비 (16:00~17:30)', category: '일반' }
    ],
    likes: 6,
    hasLiked: false,
    cheers: 2,
    hasCheered: false,
    comments: []
  },
  {
    id: 'feed_3',
    authorId: 'sangmoo',
    authorName: '조상무',
    authorRole: '상무',
    authorAvatarPic: '/pic2_thumb.png',
    authorColor: '#6366f1',
    createdAt: '2026-08-31T08:35:00.000Z',
    timeDisplay: '오전 08:35',
    type: 'meeting',
    content: '오전 기획 회의 참석 후 오후 3시에는 임원 주간 경영 회의 있습니다. 다음 사원 로그인 세션 이슈는 배포 전 원인 확실히 파악해 조치 바랍니다.',
    aiBadges: [
      { id: 'b7', type: 'meeting', label: '🤝 주간 기획 회의 (10:00~11:30)', category: '미팅' },
      { id: 'b8', type: 'work', label: '🏢 임원 주간 경영 회의 (15:00~17:00)', category: '일반' }
    ],
    likes: 8,
    hasLiked: false,
    cheers: 5,
    hasCheered: false,
    comments: [
      {
        id: 'c2',
        authorId: 'daum',
        authorName: '정다음',
        authorRole: '사원',
        authorAvatarPic: '/pic2_thumb.png',
        text: '네 상무님, 원인 분석 후 정오 전에 1차 보고 드리겠습니다!',
        createdAt: '오전 09:12'
      }
    ]
  }
];

export default function Dashboard({
  currentUser,
  displayUser,
  parsedUser = {},
  teamMembers = [],
  headerSelectedProject = '전체',
  onSelectProject,
  schedules = [],
  onAddSchedule,
  onNavigateToSync,
  onSwitchUser,
  onLogout,
  onResetData
}) {
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'issue' | 'vacation' | 'meeting'
  const [composerText, setComposerText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [feeds, setFeeds] = useState(() => {
    const saved = localStorage.getItem('zal_feeds');
    return saved ? JSON.parse(saved) : INITIAL_FEEDS;
  });

  const [expandedCommentFeedIds, setExpandedCommentFeedIds] = useState({});
  const [commentInputs, setCommentInputs] = useState({});
  const [reportModalType, setReportModalType] = useState(null); // 'daily' | 'weekly' | null
  const [timelineDate, setTimelineDate] = useState(new Date(2026, 7, 31)); // 2026-08-31

  const timelineDayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const formattedTimelineDate = `${timelineDate.getMonth() + 1}월 ${timelineDate.getDate()}일 (${timelineDayNames[timelineDate.getDay()]})`;

  const handlePrevTimelineDate = () => {
    setTimelineDate(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 1));
  };

  const handleNextTimelineDate = () => {
    setTimelineDate(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1));
  };
  const [copiedReport, setCopiedReport] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  const projectMenuRef = useRef(null);
  const composerTextareaRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setIsUserMenuOpen(false);
      }
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target)) {
        setIsProjectMenuOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  // Sync feeds to localStorage
  useEffect(() => {
    localStorage.setItem('zal_feeds', JSON.stringify(feeds));
  }, [feeds]);

  // Current logged in user is executive approver (조상무)
  const isApprover = currentUser?.id === 'sangmoo' || currentUser?.name === '조상무' || currentUser?.role === '상무';

  // Handle Quick Composer Post
  const handleComposerSubmit = (e) => {
    e?.preventDefault();
    const text = composerText.trim();
    if (!text || isSubmitting) return;

    setIsSubmitting(true);

    const now = new Date();
    const timeDisplay = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

    // AI schedule parsing & badge extraction
    const hasIssue = /긴급|이슈|장애|오류|버그|지연|에러|디버깅/i.test(text);
    const hasVacation = /반차|연차|휴가|병가|조퇴/i.test(text);
    const hasMeeting = /회의|미팅|리뷰|브리핑|스탠드업|면담/i.test(text);

    let primaryType = 'all';
    if (hasIssue) primaryType = 'issue';
    else if (hasVacation) primaryType = 'vacation';
    else if (hasMeeting) primaryType = 'meeting';

    const badges = [];
    if (hasIssue) {
      const match = text.match(/(?:긴급|이슈|장애|오류|에러|디버깅)[^\n,.]*/i);
      badges.push({
        id: `b_${Date.now()}_1`,
        type: 'issue',
        label: `🚨 ${match ? match[0].trim() : '긴급 이슈 대응'}`,
        category: '이슈'
      });
    }
    if (hasMeeting) {
      const match = text.match(/(?:회의|미팅|리뷰|브리핑)[^\n,.]*/i);
      badges.push({
        id: `b_${Date.now()}_2`,
        type: 'meeting',
        label: `🤝 ${match ? match[0].trim() : '팀 미팅 일정'}`,
        category: '미팅'
      });
    }
    if (hasVacation) {
      const isMorning = /오전\s*반차/i.test(text);
      const isAfternoon = /오후\s*반차/i.test(text);
      const vacType = isMorning ? '오전 반차' : isAfternoon ? '오후 반차' : '연차 휴가';
      badges.push({
        id: `b_${Date.now()}_3`,
        type: 'vacation',
        label: `🏖️ ${vacType} 신청`,
        category: '휴가'
      });
    }
    if (badges.length === 0) {
      badges.push({
        id: `b_${Date.now()}_4`,
        type: 'work',
        label: '⚡ 오늘 업무 공유',
        category: '일반'
      });
    }

    let vacInfo = null;
    if (hasVacation) {
      vacInfo = {
        type: /오전/i.test(text) ? '오전 반차' : /오후/i.test(text) ? '오후 반차' : '휴가',
        date: '2026.08.31',
        status: isApprover ? 'approved' : 'pending',
        approverName: '조상무 상무',
        approvedAt: isApprover ? timeDisplay : null
      };
    }

    const newFeed = {
      id: `feed_${Date.now()}`,
      authorId: currentUser?.id || 'sh',
      authorName: currentUser?.name || '정윤희',
      authorRole: currentUser?.role || '부장',
      authorAvatarPic: currentUser?.avatarPic || '/pic1_thumb.png',
      authorColor: currentUser?.color || '#000000',
      createdAt: now.toISOString(),
      timeDisplay: timeDisplay,
      type: primaryType,
      content: text,
      aiBadges: badges,
      vacationInfo: vacInfo,
      likes: 0,
      hasLiked: false,
      cheers: 0,
      hasCheered: false,
      comments: []
    };

    setFeeds(prev => [newFeed, ...prev]);
    setComposerText('');
    setIsSubmitting(false);

    // Also trigger calendar schedule sync if parent handler provided
    if (onAddSchedule) {
      onAddSchedule(text, currentUser);
    }
  };

  // Toggle Like reaction
  const handleToggleLike = (feedId) => {
    setFeeds(prev => prev.map(f => {
      if (f.id === feedId) {
        const nextLiked = !f.hasLiked;
        return {
          ...f,
          hasLiked: nextLiked,
          likes: nextLiked ? f.likes + 1 : Math.max(0, f.likes - 1)
        };
      }
      return f;
    }));
  };

  // Toggle Cheer reaction
  const handleToggleCheer = (feedId) => {
    setFeeds(prev => prev.map(f => {
      if (f.id === feedId) {
        const nextCheered = !f.hasCheered;
        return {
          ...f,
          hasCheered: nextCheered,
          cheers: nextCheered ? f.cheers + 1 : Math.max(0, f.cheers - 1)
        };
      }
      return f;
    }));
  };

  // Vacation Approval Action
  const handleApproveVacation = (feedId, approve = true) => {
    setFeeds(prev => prev.map(f => {
      if (f.id === feedId && f.vacationInfo) {
        return {
          ...f,
          vacationInfo: {
            ...f.vacationInfo,
            status: approve ? 'approved' : 'rejected',
            approverName: `${currentUser?.name || '조상무'} ${currentUser?.role || '상무'}`.trim(),
            approvedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
          }
        };
      }
      return f;
    }));
  };

  // Add Comment to Feed
  const handleAddComment = (feedId) => {
    const text = (commentInputs[feedId] || '').trim();
    if (!text) return;

    const newComment = {
      id: `c_${Date.now()}`,
      authorId: currentUser?.id || 'sh',
      authorName: currentUser?.name || '정윤희',
      authorRole: currentUser?.role || '부장',
      authorAvatarPic: currentUser?.avatarPic || '/pic1_thumb.png',
      text: text,
      createdAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    };

    setFeeds(prev => prev.map(f => {
      if (f.id === feedId) {
        return {
          ...f,
          comments: [...f.comments, newComment]
        };
      }
      return f;
    }));

    setCommentInputs(prev => ({ ...prev, [feedId]: '' }));
    setExpandedCommentFeedIds(prev => ({ ...prev, [feedId]: true }));
  };

  // Filtered feeds
  const filteredFeeds = feeds.filter(feed => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'issue') {
      return feed.type === 'issue' || feed.aiBadges?.some(b => b.category === '이슈');
    }
    if (activeFilter === 'vacation') {
      return feed.type === 'vacation' || !!feed.vacationInfo || feed.aiBadges?.some(b => b.category === '휴가');
    }
    if (activeFilter === 'meeting') {
      return feed.type === 'meeting' || feed.aiBadges?.some(b => b.category === '미팅');
    }
    if (activeFilter === 'notice') {
      return feed.type === 'notice' || feed.aiBadges?.some(b => b.category === '공지' || b.category === '전사공지') || feed.authorId === 'sangmoo';
    }
    if (activeFilter === 'sync') {
      return feed.type === 'daily_sync' || !!feed.authorId;
    }
    return true;
  });

  // Calculate statistics for sidebar and header tabs
  const pendingApprovalsCount = feeds.filter(f => f.vacationInfo && f.vacationInfo.status === 'pending').length;
  const activeIssues = feeds.filter(f => f.type === 'issue' || f.aiBadges?.some(b => b.category === '이슈'));

  // Quick prompt tag helper
  const addTagToComposer = (tag) => {
    setComposerText(prev => (prev ? `${prev} ${tag} ` : `${tag} `));
  };

  // Mini Gantt Helper: Get timeline blocks for each member for today (08:00 ~ 19:00 = 11 hours)
  // Mini Gantt Helper: Get timeline blocks for each member for today (Soft pastel theme)
  const baseMemberScheduleMap = {
    sh: [
      { title: '주간 기획 회의', start: 10, end: 11.5, bg: '#eef2ff', border: '#c7d2fe', text: '#3730a3', accent: '#6366f1' },
      { title: '화면 퍼블리싱 리뷰', start: 14, end: 15, bg: '#f0f9ff', border: '#bae6fd', text: '#0369a1', accent: '#0ea5e9' },
      { title: '대신증권 브리핑 준비', start: 16, end: 17.5, bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46', accent: '#10b981' }
    ],
    sangmoo: [
      { title: '주간 기획 회의', start: 10, end: 11.5, bg: '#eef2ff', border: '#c7d2fe', text: '#3730a3', accent: '#6366f1' },
      { title: '임원 주간 경영 회의', start: 15, end: 17, bg: '#f5f3ff', border: '#ddd6fe', text: '#5b21b6', accent: '#7c3aed' }
    ],
    daum: [
      { title: '오전 반차', start: 9, end: 13, bg: '#fffbeb', border: '#fde68a', text: '#92400e', accent: '#f59e0b' },
      { title: '퍼블리싱 리뷰', start: 14, end: 15, bg: '#f0f9ff', border: '#bae6fd', text: '#0369a1', accent: '#0ea5e9' },
      { title: '로그인 핫픽스 배포', start: 16, end: 18, bg: '#fef2f2', border: '#fecaca', text: '#991b1b', accent: '#ef4444' }
    ]
  };

  const getEventsForMemberAndDate = (memberId, dateObj) => {
    const isBaseDemoDay = dateObj.getFullYear() === 2026 && dateObj.getMonth() === 7 && dateObj.getDate() === 31;
    const baseEvents = isBaseDemoDay ? (baseMemberScheduleMap[memberId] || []) : [];

    const dynamicEvents = (schedules || []).filter(s => {
      const matchesMember = s.memberIds ? s.memberIds.includes(memberId) : s.memberId === memberId;
      const matchesDate = s.date === dateObj.getDate();
      return matchesMember && matchesDate;
    }).map(s => {
      let bg = '#eef2ff', border = '#c7d2fe', text = '#3730a3', accent = '#6366f1';
      if (s.type === 'vacation' || s.title?.includes('반차') || s.title?.includes('휴가')) {
        bg = '#fffbeb'; border = '#fde68a'; text = '#92400e'; accent = '#f59e0b';
      } else if (s.type === 'issue' || s.title?.includes('에러') || s.title?.includes('장애')) {
        bg = '#fef2f2'; border = '#fecaca'; text = '#991b1b'; accent = '#ef4444';
      } else if (s.title?.includes('리뷰') || s.title?.includes('퍼블리싱')) {
        bg = '#f0f9ff'; border = '#bae6fd'; text = '#0369a1'; accent = '#0ea5e9';
      } else if (s.title?.includes('브리핑') || s.title?.includes('배포')) {
        bg = '#ecfdf5'; border = '#a7f3d0'; text = '#065f46'; accent = '#10b981';
      }
      return {
        title: s.title,
        start: s.startHour || 9,
        end: s.endHour || 11,
        bg, border, text, accent
      };
    });

    return [...baseEvents, ...dynamicEvents];
  };

  const totalTimelineEventsCount = ['sh', 'sangmoo', 'daum'].reduce((acc, mId) => {
    return acc + getEventsForMemberAndDate(mId, timelineDate).length;
  }, 0);

  // Generate Report Content
  const getDailyReportContent = () => {
    return `# 📋 [ZAL 모닝 데일리] 2026.08.31 (월) 팀 업무 보고서

**작성 일시:** 2026.08.31 10:15
**작성자:** ${currentUser?.name || '정윤희'} ${currentUser?.role || '부장'}

---

## 1. 🚨 긴급 이슈 및 장애 현황
- **로그인 인증 세션 만료 에러 디버깅** (담당: 정다음 사원 / 09:00 ~ 14:00)
  * 현상: 일부 사용자 로그인 세션 토큰이 10분 만에 만료되는 이슈
  * 조치 계획: 세션 리프레시 로직 핫픽스 배포 후 정오 1차 브리핑

## 2. 🤝 금일 주요 미팅 및 협업 일정
- **10:00 ~ 11:30** 주간 기획 회의 (참석: 정윤희 부장, 조상무 상무)
- **14:00 ~ 15:00** 화면 퍼블리싱 리뷰 (참석: 정윤희 부장, 정다음 사원)
- **15:00 ~ 17:00** 임원 주간 경영 회의 (참석: 조상무 상무)

## 3. 🏖️ 휴가 및 근태 신청 현황
- 정다음 사원: **9/1(화) 오전 반차** (${feeds.find(f => f.vacationInfo)?.vacationInfo?.status === 'approved' ? '✅ 조상무 상무 승인 완료' : '⏳ 결재 대기 중'})

## 4. 📌 중점 추진 업무
- 대신증권 연금 경쟁력 강화 시스템 연동 브리핑 자료 작성 (정윤희 부장)
- D-RPS 고도화 2차 기획 검토 (조상무 상무)
`;
  };

  const getWeeklyReportContent = () => {
    return `# 📊 [ZAL 위클리] 2026년 9월 1주차 주간 업무 계획 보고서

**작성 기준:** 2026.08.31 (월) ~ 2026.09.04 (금)
**보고 부서:** 디지털 기획 / 개발 본부

---

### [팀별 주간 마일스톤]
1. **대신증권 연금 경쟁력 강화 프로젝트**
   - 08.31(월): 시스템 인터페이스 브리핑
   - 09.02(수): 1차 개발 통합 테스트 및 QA 세션
2. **서비스 안정화 및 장애 제로화**
   - 로그인 인증 세션 핫픽스 적용 (08.31 완료 목표)
   - 모니터링 경보 체계 고도화
3. **팀 근태 및 휴가 계획**
   - 09.01(화): 정다음 사원 (오전 반차)

### [임원 지시 및 협조 사항]
- 배포 전 회귀 테스트 철저 검증 요망 (조상무 상무)
`;
  };

  const handleCopyReport = () => {
    const content = reportModalType === 'weekly' ? getWeeklyReportContent() : getDailyReportContent();
    navigator.clipboard.writeText(content);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  return (
    <div className="dashboard-root" style={{
      flex: 1,
      height: '100%',
      backgroundColor: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'scroll',
      scrollbarGutter: 'stable',
      paddingTop: '32px',
      boxSizing: 'border-box',
      color: '#0f172a'
    }}>
      

      {/* ──── TOP MORNING COMPOSER AREA (PEEKING BI CHARACTER) ──── */}
      <div style={{
        maxWidth: '1360px',
        width: '100%',
        margin: '36px auto 0 auto',
        padding: '0 32px',
        boxSizing: 'border-box',
        position: 'relative'
      }}>
        {/* Peeking BI Character (zIndex: 1 - behind input box) */}
        <img
          src="/bi2.png"
          alt="잘됨이 BI"
          style={{
            position: 'absolute',
            left: '48px',
            bottom: '36px',
            height: '110px',
            width: 'auto',
            objectFit: 'contain',
            display: 'block',
            filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.06))',
            userSelect: 'none',
            pointerEvents: 'none',
            zIndex: 1
          }}
        />

        {/* Greeting & Login Info Row (zIndex: 30 - above input box so dropdowns render in front) */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          paddingLeft: '112px',
          marginBottom: '-27px',
          position: 'relative',
          zIndex: 30
        }}>
          {/* Left: Date + Greeting & Chips */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', margin: '0 0 45px 0' }}>
            <span style={{
              fontSize: '13px',
              fontWeight: '600',
              color: '#64748b',
              letterSpacing: '-0.2px',
              lineHeight: '1.2'
            }}>
              2026년 8월 31일 월요일
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <h2 style={{
                fontSize: '19px',
                fontWeight: '800',
                color: '#0f172a',
                letterSpacing: '-0.4px',
                margin: 0,
                lineHeight: '1.25'
              }}>
                {(displayUser || currentUser)?.name || '정윤희'}님, 잘됨이와 잘되는 하루 :-)
              </h2>

              {/* Quick Hashtag Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { label: '#긴급이슈', tag: '긴급 이슈 대응' },
                  { label: '#회식공지', tag: '금일 부서 회식 안내' },
                  { label: '#오전반차', tag: '오전 반차 신청' },
                  { label: '#오후반차', tag: '오후 반차 신청' }
                ].map(item => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      addTagToComposer(item.tag);
                      composerTextareaRef.current?.focus();
                    }}
                    style={{
                      padding: '2px 6px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      transition: 'color 0.15s ease',
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#0f172a';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#94a3b8';
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: User Login Info & Project Controls (Lowered slightly with margin 0 0 38px 0, zIndex 30) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            margin: '0 0 38px 0',
            zIndex: 40
          }}>
            {/* 1. User Profile Trigger & Floating Dropdown */}
            <div ref={userMenuRef} style={{ position: 'relative' }}>
              <div
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsUserMenuOpen(prev => !prev);
                }}
                style={{
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  padding: '0 8px 0 4px',
                  borderRadius: '8px',
                  backgroundColor: isUserMenuOpen ? 'rgba(0, 0, 0, 0.04)' : 'transparent',
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isUserMenuOpen) e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)';
                }}
                onMouseLeave={(e) => {
                  if (!isUserMenuOpen) e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title="사용자 메뉴 열기"
              >
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: (currentUser || displayUser)?.color || '#000000',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: '600',
                  overflow: 'hidden',
                  padding: 0,
                  border: '1px solid #e2e8f0',
                  flexShrink: 0
                }}>
                  <img src={(currentUser || displayUser)?.avatarPic || '/pic1_thumb.png'} alt={(currentUser || displayUser)?.name || '정윤희'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.2px' }}>
                  {(currentUser || displayUser)?.name || parsedUser.name || '정윤희'} {(currentUser || displayUser)?.role || parsedUser.role || '부장'}
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
                  right: 0,
                  minWidth: '200px',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  border: '1.5px solid #e2e8f0',
                  boxShadow: '0 12px 30px rgba(15, 23, 42, 0.15), 0 4px 12px rgba(0, 0, 0, 0.05)',
                  zIndex: 9999,
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px'
                }}>
                  <div style={{ padding: '6px 10px 4px 10px', fontSize: '11px', fontWeight: '800', color: '#94a3b8' }}>
                    계정 / 멤버 전환
                  </div>
                  {teamMembers.map(tm => (
                    <div
                      key={tm.id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSwitchUser && onSwitchUser(tm);
                        setIsUserMenuOpen(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        fontSize: '12.5px',
                        fontWeight: (currentUser?.id || 'sh') === tm.id ? '800' : '600',
                        color: (currentUser?.id || 'sh') === tm.id ? '#6366f1' : '#334155',
                        backgroundColor: (currentUser?.id || 'sh') === tm.id ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        boxSizing: 'border-box'
                      }}
                    >
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: tm.color || '#6366f1' }}></span>
                      <span>{(currentUser?.id || 'sh') === tm.id ? `나 (${tm.role || '팀원'})` : `${tm.name} (${tm.role || '팀원'})`}</span>
                      {(currentUser?.id || 'sh') === tm.id && <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: '800' }}>✓</span>}
                    </div>
                  ))}

                  <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '4px 0' }}></div>

                  {/* Reset Data Option */}
                  {onResetData && (
                    <div
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsUserMenuOpen(false);
                        if (window.confirm('모든 대화 및 일정 데이터를 초기화하시겠습니까?')) {
                          onResetData();
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        fontSize: '12.5px',
                        fontWeight: '700',
                        color: '#ef4444',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                        transition: 'background-color 0.12s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                    >
                      <span>🔄</span>
                      <span>시연 데이터 초기화</span>
                    </div>
                  )}

                  {/* Logout Option */}
                  <div
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsUserMenuOpen(false);
                      onLogout && onLogout();
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      fontSize: '12.5px',
                      fontWeight: '700',
                      color: '#334155',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                      transition: 'background-color 0.12s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                  >
                    <span>🚪</span>
                    <span>로그아웃</span>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Custom Interactive Project Select Dropdown Card */}
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
                  maxWidth: '200px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  lineHeight: '1'
                }}>
                  {headerSelectedProject === '전체' ? (parsedUser?.project || '대신증권 연금 경쟁력 강화') : headerSelectedProject}
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
                    const isSelected = headerSelectedProject === projOption || (headerSelectedProject === '전체' && projOption === '대신증권 연금 경쟁력 강화');
                    return (
                      <div
                        key={projOption}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSelectProject && onSelectProject(projOption);
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

        {/* Input Box & Hashtags Area (zIndex: 2, background: #ffffff covers the lower half of the character) */}
        <div style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          {/* Middle: Integrated Quick Sync Input Box (Enlarged & Clear Placeholder) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#ffffff',
            borderRadius: '26px',
            border: isInputFocused ? '2px solid #0f172a' : '1.5px solid #cbd5e1',
            padding: isInputFocused ? '5.5px 7.5px 5.5px 21.5px' : '6px 8px 6px 22px',
            minHeight: '52px',
            transition: 'border-color 0.15s ease, border-width 0.15s ease',
            width: '100%',
            boxSizing: 'border-box'
          }}>
            <input
              ref={composerTextareaRef}
              type="text"
              value={composerText}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              onChange={(e) => setComposerText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleComposerSubmit(e);
                }
              }}
              placeholder="오늘 진행할 주요 업무, 미팅, 긴급 이슈나 휴가 일정을 공유해 주세요"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: '15.5px',
                fontWeight: '500',
                color: '#0f172a',
                backgroundColor: 'transparent'
              }}
            />
            {/* Clear (Delete) button when text is inputted */}
            {composerText.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setComposerText('');
                  composerTextareaRef.current?.focus();
                }}
                title="입력 내용 지우기"
                style={{
                  width: '28px',
                  height: '28px',
                  padding: '0',
                  backgroundColor: 'rgba(148, 163, 184, 0.15)',
                  color: '#64748b',
                  border: 'none',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                  marginRight: '6px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(148, 163, 184, 0.28)';
                  e.currentTarget.style.color = '#0f172a';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(148, 163, 184, 0.15)';
                  e.currentTarget.style.color = '#64748b';
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}

            <button
              type="button"
              onClick={handleComposerSubmit}
              disabled={!composerText.trim() || isSubmitting}
              title="등록 (Enter)"
              style={{
                width: '42px',
                height: '42px',
                padding: '0',
                backgroundColor: 'transparent',
                color: composerText.trim() ? '#000000' : '#cbd5e1',
                border: 'none',
                borderRadius: '50%',
                cursor: composerText.trim() ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                if (composerText.trim()) {
                  e.currentTarget.style.color = '#000000';
                  e.currentTarget.style.backgroundColor = '#f1f5f9';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = composerText.trim() ? '#000000' : '#cbd5e1';
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>

        </div>
      </div>

            {/* ──── FULL SCREEN WIDTH FILTER TABS DIVIDER (LEFT-ALIGNED, LARGER FONT) ──── */}
      <div style={{
        width: '100%',
        borderBottom: '1px solid #e2e8f0',
        margin: '28px 0 0 0',
        display: 'flex',
        justifyContent: 'center',
        boxSizing: 'border-box'
      }}>
        <div style={{
          maxWidth: '1360px',
          width: '100%',
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: '32px',
          boxSizing: 'border-box'
        }}>
          {[
            { key: 'all', label: '전체 피드' },
            { key: 'issue', label: '이슈' },
            { key: 'vacation', label: '요청' },
            { key: 'meeting', label: '미팅' },
            { key: 'notice', label: '공지' },
            { key: 'sync', label: '팀싱크' }
          ].map(tab => {
            const isActive = activeFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                className={`toggle-item ${isActive ? 'active-blue' : ''}`}
                onClick={() => setActiveFilter(tab.key)}
                style={{
                  position: 'relative',
                  padding: '8px 4px 14px 4px',
                  fontSize: '16px',
                  fontWeight: isActive ? '700' : '600',
                  color: isActive ? '#000000' : '#64748b',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  transition: 'color 0.15s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ──── MAIN DASHBOARD CONTAINER (LEFT 2-COLUMN MASONRY + RIGHT FIXED SIDEBAR) ──── */}
      <div className="dashboard-layout-container">
        
        {/* ════════ LEFT: 2-COLUMN FEED MASONRY GRID ════════ */}
        <section className="dashboard-feed-masonry">
          {filteredFeeds.length === 0 ? (
            <div className="masonry-card" style={{
              backgroundColor: '#ffffff',
              border: '1px dashed #cbd5e1',
              borderRadius: '16px',
              padding: '40px 20px',
              textAlign: 'center',
              color: '#94a3b8'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>💬</div>
              <div style={{ fontSize: '14.5px', fontWeight: '700', color: '#475569' }}>
                해당 카테고리의 피드가 없습니다.
              </div>
              <div style={{ fontSize: '12.5px', marginTop: '4px' }}>
                상단 입력창에 오늘의 첫 번째 일정을 등록해 보세요!
              </div>
            </div>
          ) : (
            filteredFeeds.map(feed => {
              const isCommentOpen = !!expandedCommentFeedIds[feed.id];
              const hasVacation = !!feed.vacationInfo;
              const isVacationPending = feed.vacationInfo?.status === 'pending';
              const isVacationApproved = feed.vacationInfo?.status === 'approved';
              const isVacationRejected = feed.vacationInfo?.status === 'rejected';

              return (
                <article
                  key={feed.id}
                  className="masonry-card"
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '16px',
                    border: '1.5px solid #e2e8f0',
                    boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
                    padding: '20px 22px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {/* Feed Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        overflow: 'hidden',
                        backgroundColor: feed.authorColor || '#000000',
                        border: '1.5px solid #e2e8f0'
                      }}>
                        <img
                          src={feed.authorAvatarPic || '/pic1_thumb.png'}
                          alt={feed.authorName}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '14.5px', fontWeight: '800', color: '#0f172a' }}>
                            {feed.authorId === (currentUser?.id || 'sh') ? '나' : feed.authorName}
                          </span>
                          <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#64748b' }}>
                            {feed.authorRole}
                          </span>
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '1px', fontWeight: '500' }}>
                          {feed.timeDisplay}
                        </div>
                      </div>
                    </div>

                    {/* Header Status Badge */}
                    <div>
                      {feed.type === 'issue' && (
                        <span style={{
                          padding: '4px 10px',
                          backgroundColor: '#fef2f2',
                          color: '#ef4444',
                          border: '1px solid #fecaca',
                          borderRadius: '12px',
                          fontSize: '11.5px',
                          fontWeight: '700'
                        }}>
                          🚨 이슈 발생
                        </span>
                      )}
                      {feed.type === 'vacation' && (
                        <span style={{
                          padding: '4px 10px',
                          backgroundColor: isVacationApproved ? '#ecfdf5' : '#fffbeb',
                          color: isVacationApproved ? '#10b981' : '#f59e0b',
                          border: `1px solid ${isVacationApproved ? '#a7f3d0' : '#fef08a'}`,
                          borderRadius: '12px',
                          fontSize: '11.5px',
                          fontWeight: '700'
                        }}>
                          {isVacationApproved ? '✅ 승인 완료' : '⏳ 결재 대기'}
                        </span>
                      )}
                      {feed.type === 'notice' && (
                        <span style={{
                          padding: '4px 10px',
                          backgroundColor: '#eff6ff',
                          color: '#3b82f6',
                          border: '1px solid #bfdbfe',
                          borderRadius: '12px',
                          fontSize: '11.5px',
                          fontWeight: '700'
                        }}>
                          📢 부서 공지
                        </span>
                      )}
                      {feed.type === 'daily_sync' && (
                        <span style={{
                          padding: '4px 10px',
                          backgroundColor: '#f8fafc',
                          color: '#64748b',
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          fontSize: '11.5px',
                          fontWeight: '700'
                        }}>
                          ☀️ 모닝 싱크
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Feed Content Text */}
                  <div style={{
                    fontSize: '14.5px',
                    color: '#1e293b',
                    lineHeight: '1.65',
                    whiteSpace: 'pre-wrap',
                    fontWeight: '500'
                  }}>
                    {feed.content}
                  </div>

                  {/* AI Automated Categorization Badges */}
                  {feed.aiBadges && feed.aiBadges.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '-4px' }}>
                      {feed.aiBadges.map((badge, idx) => (
                        <span
                          key={idx}
                          style={{
                            padding: '3px 9px',
                            backgroundColor: badge.color ? `${badge.color}15` : '#f1f5f9',
                            color: badge.color || '#475569',
                            borderRadius: '8px',
                            fontSize: '11.5px',
                            fontWeight: '700',
                            border: `1px solid ${badge.color ? `${badge.color}30` : '#e2e8f0'}`
                          }}
                        >
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Interactive Vacation Approval Action Box (If pending and user is approver) */}
                  {hasVacation && isVacationPending && isApprover && (
                    <div style={{
                      backgroundColor: '#fffbeb',
                      border: '1.5px solid #fef08a',
                      borderRadius: '12px',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '800', color: '#92400e' }}>
                          🏖️ {feed.vacationInfo.type} 신청 ({feed.vacationInfo.date})
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#b45309', marginTop: '2px' }}>
                          결재권자(조상무)의 승인이 필요합니다.
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleRejectVacation(feed.id)}
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
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#fee2e2';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#fef2f2';
                          }}
                        >
                          요청반려
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproveVacation(feed.id)}
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
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#d1fae5';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#ecfdf5';
                          }}
                        >
                          요청수락
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Approval Status Result Badge (If already processed) */}
                  {hasVacation && isVacationApproved && (
                    <div style={{
                      backgroundColor: '#ecfdf5',
                      border: '1px solid #a7f3d0',
                      borderRadius: '10px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: '700',
                      color: '#065f46',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <span>✅</span>
                      <span>조상무 상무 승인 완료 ({feed.vacationInfo.date} {feed.vacationInfo.type})</span>
                    </div>
                  )}

                  {/* Feed Action Bar (Likes, Cheers, Comments) */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '10px',
                    borderTop: '1px solid #f1f5f9',
                    marginTop: '2px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* Like Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleLike(feed.id)}
                        style={{
                          padding: '5px 10px',
                          backgroundColor: feed.hasLiked ? '#eff6ff' : '#f8fafc',
                          border: `1px solid ${feed.hasLiked ? '#bfdbfe' : '#e2e8f0'}`,
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '700',
                          color: feed.hasLiked ? '#2563eb' : '#64748b',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>👍</span>
                        <span>{feed.likes || 0}</span>
                      </button>

                      {/* Cheer Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleCheer(feed.id)}
                        style={{
                          padding: '5px 10px',
                          backgroundColor: feed.hasCheered ? '#fef2f2' : '#f8fafc',
                          border: `1px solid ${feed.hasCheered ? '#fecaca' : '#e2e8f0'}`,
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '700',
                          color: feed.hasCheered ? '#ef4444' : '#64748b',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>🔥 응원</span>
                        <span>{feed.cheers || 0}</span>
                      </button>
                    </div>

                    {/* Comment Toggle Button */}
                    <button
                      type="button"
                      onClick={() => handleToggleComments(feed.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#64748b',
                        fontSize: '12.5px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <span>💬 댓글</span>
                      <span style={{ fontWeight: '800', color: '#0f172a' }}>
                        {feed.comments ? feed.comments.length : 0}
                      </span>
                    </button>
                  </div>

                  {/* Comment Section (Expanded) */}
                  {isCommentOpen && (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      paddingTop: '10px',
                      borderTop: '1px dashed #e2e8f0'
                    }}>
                      {/* Existing Comments List */}
                      {feed.comments && feed.comments.map(c => (
                        <div
                          key={c.id}
                          style={{
                            backgroundColor: '#f8fafc',
                            borderRadius: '10px',
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{
                                width: '18px',
                                height: '18px',
                                borderRadius: '50%',
                                overflow: 'hidden',
                                backgroundColor: '#6366f1'
                              }}>
                                <img src={c.authorAvatarPic || '/pic2_thumb.png'} alt={c.authorName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                              <span style={{ fontSize: '12px', fontWeight: '800', color: '#0f172a' }}>
                                {c.authorId === (currentUser?.id || 'sh') ? '나' : c.authorName}
                              </span>
                              <span style={{ fontSize: '11px', color: '#64748b' }}>
                                {c.authorRole}
                              </span>
                            </div>
                            <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                              {c.createdAt}
                            </span>
                          </div>
                          <p style={{ fontSize: '12.5px', color: '#334155', margin: 0, lineHeight: '1.45' }}>
                            {c.text}
                          </p>
                        </div>
                      ))}

                      {/* Inline Comment Input Box */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                        <input
                          type="text"
                          value={commentInputs[feed.id] || ''}
                          onChange={(e) => handleCommentInputChange(feed.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSubmitComment(feed.id);
                            }
                          }}
                          placeholder="동료에게 응원이나 피드백 댓글을 남겨보세요..."
                          style={{
                            flex: 1,
                            padding: '7px 12px',
                            backgroundColor: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            borderRadius: '10px',
                            fontSize: '12.5px',
                            outline: 'none',
                            color: '#0f172a'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleSubmitComment(feed.id)}
                          disabled={!commentInputs[feed.id]?.trim()}
                          style={{
                            padding: '7px 12px',
                            backgroundColor: commentInputs[feed.id]?.trim() ? '#6366f1' : '#e2e8f0',
                            color: commentInputs[feed.id]?.trim() ? '#ffffff' : '#94a3b8',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '12px',
                            fontWeight: '700',
                            cursor: commentInputs[feed.id]?.trim() ? 'pointer' : 'not-allowed'
                          }}
                        >
                          등록
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>

        {/* ════════ RIGHT: EXPANDED VERTICAL TEAM TIMELINE (SYNC WEEKLY/DAILY STYLE) ════════ */}
        <aside className="dashboard-sidebar-column" style={{ width: '100%' }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1.5px solid #e2e8f0',
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header: Title, Date, Live Badge & Link to Sync */}
            <div style={{
              padding: '16px 18px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#ffffff'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                    e.currentTarget.style.color = '#0f172a';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#64748b';
                  }}
                  onClick={handlePrevTimelineDate}
                  title="이전 날짜"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>

                <span style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.2px', padding: '0 2px' }}>
                  {formattedTimelineDate}
                </span>

                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                    e.currentTarget.style.color = '#0f172a';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#64748b';
                  }}
                  onClick={handleNextTimelineDate}
                  title="다음 날짜"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              </div>

              <button
                type="button"
                onClick={onNavigateToSync}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6366f1',
                  fontSize: '12.5px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  transition: 'color 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#4338ca'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#6366f1'}
                title="상세 싱크 간트 화면으로 이동"
              >
                <span>총 {totalTimelineEventsCount}개 일정 등록됨</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </div>

            {/* Vertical Timeline Table Grid */}
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '56px' }} />
                  <col style={{ width: 'calc((100% - 56px) / 3)' }} />
                  <col style={{ width: 'calc((100% - 56px) / 3)' }} />
                  <col style={{ width: 'calc((100% - 56px) / 3)' }} />
                </colgroup>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                    <th style={{
                      padding: '10px 4px',
                      fontSize: '11px',
                      fontWeight: '700',
                      color: '#64748b',
                      textAlign: 'center',
                      borderRight: '1px solid #e2e8f0'
                    }}>
                      시간
                    </th>
                    {[
                      { id: 'sh', name: '정윤희', role: '부장', color: '#000000', avatar: '/pic1_thumb.png' },
                      { id: 'sangmoo', name: '조상무', role: '상무', color: '#6366f1', avatar: '/pic2_thumb.png' },
                      { id: 'daum', name: '정다음', role: '사원', color: '#10b981', avatar: '/pic2_thumb.png' }
                    ].map((m, idx) => (
                      <th key={m.id} style={{
                        padding: '8px 4px',
                        textAlign: 'center',
                        borderRight: idx < 2 ? '1px solid #e2e8f0' : 'none'
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                          <div style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            overflow: 'hidden',
                            backgroundColor: m.color,
                            border: '1px solid #cbd5e1'
                          }}>
                            <img src={m.avatar} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                          <span style={{ fontSize: '11.5px', fontWeight: '800', color: '#1e293b' }}>
                            {m.id === (currentUser?.id || 'sh') ? '나' : m.name}{' '}
                            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>{m.role}</span>
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((hour) => {
                    const membersList = [
                      { id: 'sh', name: '정윤희' },
                      { id: 'sangmoo', name: '조상무' },
                      { id: 'daum', name: '정다음' }
                    ];

                    const isNoon = hour === 12;

                    return (
                      <tr key={hour} style={{ height: '48px', borderBottom: '1px solid #f1f5f9' }}>
                        {/* Time Slot Label */}
                        <td style={{
                          padding: '0 4px',
                          textAlign: 'center',
                          fontSize: '11px',
                          fontWeight: '700',
                          color: '#64748b',
                          backgroundColor: '#fbfcfd',
                          borderRight: '1px solid #e2e8f0',
                          verticalAlign: 'top',
                          paddingTop: '6px'
                        }}>
                          {String(hour).padStart(2, '0')}:00
                        </td>

                        {/* 3 Members Hour Grid Cells */}
                        {membersList.map((m, mIdx) => {
                          // Find any event starting at this exact hour for this member
                          const events = getEventsForMemberAndDate(m.id, timelineDate);
                          const startingEvt = events.find(e => Math.floor(e.start) === hour);

                          return (
                            <td
                              key={m.id}
                              style={{
                                padding: '0',
                                position: 'relative',
                                verticalAlign: 'top',
                                borderRight: mIdx < 2 ? '1px solid #f1f5f9' : 'none',
                                backgroundColor: isNoon ? 'rgba(241, 245, 249, 0.4)' : 'transparent'
                              }}
                            >
                              {startingEvt && (() => {
                                const duration = startingEvt.end - startingEvt.start;
                                const heightPx = duration * 48 - 4;
                                const topOffset = (startingEvt.start - hour) * 48 + 2;

                                return (
                                  <div
                                    onClick={onNavigateToSync}
                                    style={{
                                      position: 'absolute',
                                      top: `${topOffset}px`,
                                      left: '3px',
                                      right: '3px',
                                      height: `${heightPx}px`,
                                      backgroundColor: startingEvt.bg || '#f1f5f9',
                                      border: `1px solid ${startingEvt.border || '#cbd5e1'}`,
                                      borderLeft: `3.5px solid ${startingEvt.accent || startingEvt.text || '#6366f1'}`,
                                      color: startingEvt.text || '#0f172a',
                                      borderRadius: '6px',
                                      padding: '4px 6px',
                                      boxSizing: 'border-box',
                                      zIndex: 10,
                                      cursor: 'pointer',
                                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                                      overflow: 'hidden',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      justifyContent: 'flex-start',
                                      gap: '2px',
                                      transition: 'all 0.15s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.08)';
                                      e.currentTarget.style.transform = 'translateY(-1px)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)';
                                      e.currentTarget.style.transform = 'none';
                                    }}
                                    title={`${startingEvt.title} (${startingEvt.start}:00 ~ ${startingEvt.end}:00)`}
                                  >
                                    <div style={{
                                      fontSize: '11px',
                                      fontWeight: '800',
                                      lineHeight: '1.25',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      color: startingEvt.text || '#0f172a'
                                    }}>
                                      {startingEvt.title}
                                    </div>
                                    {duration >= 1 && (
                                      <div style={{
                                        fontSize: '9.5px',
                                        fontWeight: '700',
                                        opacity: 0.85,
                                        lineHeight: '1',
                                        color: startingEvt.text || '#64748b'
                                      }}>
                                        {String(Math.floor(startingEvt.start)).padStart(2, '0')}:00~{String(Math.ceil(startingEvt.end)).padStart(2, '0')}:00
                                      </div>
                                    )}
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
          </div>
        </aside>

      </div>

      {/* ──── REPORT PREVIEW MODAL DIALOG ──── */}
      {reportModalType && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(4px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            width: '680px',
            maxWidth: '100%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            overflow: 'hidden',
            border: '1.5px solid #e2e8f0'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📋</span>
                <span style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
                  {reportModalType === 'weekly' ? '주간 업무 보고서 미리보기' : '일일 업무 보고서 미리보기'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReportModalType(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{
              padding: '24px',
              overflowY: 'auto',
              flex: 1,
              backgroundColor: '#ffffff'
            }}>
              <pre style={{
                fontFamily: 'Pretendard, -apple-system, sans-serif',
                fontSize: '13.5px',
                lineHeight: '1.7',
                color: '#1e293b',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
                backgroundColor: '#f8fafc',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0'
              }}>
                {reportModalType === 'weekly' ? getWeeklyReportContent() : getDailyReportContent()}
              </pre>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f8fafc'
            }}>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {copiedReport ? '✅ 클립보드에 복사되었습니다!' : '클릭하여 클립보드에 복사 후 슬랙/메일에 공유하세요.'}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setReportModalType(null)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={handleCopyReport}
                  style={{
                    padding: '8px 18px',
                    backgroundColor: copiedReport ? '#10b981' : '#6366f1',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>{copiedReport ? '✓ 복사 완료' : '📋 클립보드 복사'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
